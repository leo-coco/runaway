/**
 * In-memory stand-in for the Drizzle db used by route tests. Unlike a
 * queue-of-results mock, it stores rows per table and actually evaluates the
 * `where` conditions handlers build, so an owner-scoping bug (a missing
 * `eq(userId)`) fails the test instead of being replayed past it.
 *
 * Works together with a partial vi.mock of 'drizzle-orm' that swaps `eq`,
 * `and`, `desc` and `count` for the fake descriptor builders below; the fake db
 * then interprets those descriptors against its own rows. Only the operators
 * the routes use are implemented.
 */

export type Row = Record<string, unknown>;

interface EqCond {
  readonly kind: 'eq';
  readonly col: unknown;
  readonly val: unknown;
}
interface AndCond {
  readonly kind: 'and';
  readonly parts: readonly Condition[];
}
type Condition = EqCond | AndCond;

interface DescOrder {
  readonly kind: 'desc';
  readonly col: unknown;
}
interface CountAgg {
  readonly kind: 'count';
}

export const fakeEq = (col: unknown, val: unknown): EqCond => ({ kind: 'eq', col, val });
export const fakeAnd = (...parts: Condition[]): AndCond => ({ kind: 'and', parts });
export const fakeDesc = (col: unknown): DescOrder => ({ kind: 'desc', col });
export const fakeCount = (): CountAgg => ({ kind: 'count' });

/** Resolve a Drizzle column object back to its TS key on the table object. */
const keyOf = (table: object, col: unknown): string => {
  for (const [key, value] of Object.entries(table)) if (value === col) return key;
  throw new Error('fakeDb: condition references a column of another table');
};

const matches = (table: object, row: Row, cond: Condition | undefined): boolean => {
  if (!cond) return true;
  if (cond.kind === 'eq') return row[keyOf(table, cond.col)] === cond.val;
  return cond.parts.every((part) => matches(table, row, part));
};

const rank = (v: unknown): number | string =>
  v instanceof Date ? v.getTime() : typeof v === 'number' ? v : String(v);

const sortRows = (table: object, rows: Row[], orders: readonly DescOrder[]): Row[] => {
  const sorted = [...rows];
  for (const order of [...orders].reverse()) {
    const key = keyOf(table, order.col);
    sorted.sort((a, b) => {
      const [x, y] = [rank(a[key]), rank(b[key])];
      return x < y ? 1 : x > y ? -1 : 0;
    });
  }
  return sorted;
};

type Projection = Record<string, unknown>;

const isCount = (field: unknown): field is CountAgg =>
  typeof field === 'object' && field !== null && (field as CountAgg).kind === 'count';

const project = (table: object, rows: Row[], fields: Projection | undefined): Row[] => {
  if (!fields) return rows.map((row) => ({ ...row }));
  if (Object.values(fields).some(isCount)) {
    const out: Row = {};
    for (const [alias, field] of Object.entries(fields)) {
      out[alias] = isCount(field) ? rows.length : undefined;
    }
    return [out];
  }
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(fields).map(([alias, col]) => [alias, row[keyOf(table, col)]]),
    ),
  );
};

/** Make any lazily-computed result awaitable, like Drizzle's query builders. */
const thenable = <T>(run: () => T) => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then: (resolve?: (v: T) => any, reject?: (e: unknown) => any) =>
    Promise.resolve().then(run).then(resolve, reject),
});

export const createFakeDb = () => {
  const tables = new Map<object, Row[]>();

  const rowsOf = (table: object): Row[] => {
    let rows = tables.get(table);
    if (!rows) {
      rows = [];
      tables.set(table, rows);
    }
    return rows;
  };

  /** Fill timestamp defaults the schema declares as defaultNow(). */
  const withDefaults = (table: object, row: Row): Row => {
    const out = { ...row };
    for (const key of ['createdAt', 'updatedAt']) {
      if (key in table && out[key] === undefined) out[key] = new Date();
    }
    return out;
  };

  const selectStage = (table: object, fields: Projection | undefined, cond?: Condition) => {
    const run = (orders: readonly DescOrder[] = []) =>
      project(
        table,
        sortRows(
          table,
          rowsOf(table).filter((row) => matches(table, row, cond)),
          orders,
        ),
        fields,
      );
    return {
      where: (next: Condition) => selectStage(table, fields, next),
      orderBy: (...orders: DescOrder[]) => thenable(() => run(orders)),
      ...thenable(() => run()),
    };
  };

  const db = {
    select: (fields?: Projection) => ({
      from: (table: object) => selectStage(table, fields),
    }),

    insert: (table: object) => ({
      values: (values: Row) => {
        const insertRow = () => {
          const row = withDefaults(table, values);
          rowsOf(table).push(row);
          return row;
        };
        const conflictingWith = (target: unknown): Row | undefined => {
          const key = keyOf(table, target);
          return rowsOf(table).find((row) => row[key] === values[key]);
        };
        return {
          onConflictDoNothing: () =>
            thenable(() => {
              // Conflicts in this app are always on the primary key `id`.
              if (!rowsOf(table).some((row) => row.id === values.id)) insertRow();
            }),
          onConflictDoUpdate: (cfg: { target: unknown; setWhere?: Condition; set: Row }) => ({
            returning: () =>
              thenable(() => {
                const existing = conflictingWith(cfg.target);
                if (!existing) return [insertRow()];
                if (cfg.setWhere && !matches(table, existing, cfg.setWhere)) return [];
                Object.assign(existing, cfg.set);
                return [{ ...existing }];
              }),
          }),
        };
      },
    }),

    update: (table: object) => ({
      set: (patch: Row) => ({
        where: (cond: Condition) => ({
          returning: (fields?: Projection) =>
            thenable(() => {
              const hits = rowsOf(table).filter((row) => matches(table, row, cond));
              for (const row of hits) Object.assign(row, patch);
              return project(table, hits, fields);
            }),
        }),
      }),
    }),

    delete: (table: object) => ({
      where: (cond: Condition) =>
        thenable(() => {
          const kept = rowsOf(table).filter((row) => !matches(table, row, cond));
          tables.set(table, kept);
        }),
    }),
  };

  return {
    db,
    seed: (table: object, rows: Row[]) =>
      tables.set(
        table,
        rows.map((row) => ({ ...row })),
      ),
    rows: (table: object): Row[] => rowsOf(table),
    reset: () => tables.clear(),
  };
};

/** Shared instance: test files mock '../db/client.js' with `fakeDb.db`. */
export const fakeDb = createFakeDb();
