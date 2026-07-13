import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Drizzle client so the helper's read/upsert can be driven without a DB.
// Mocking the whole module also skips db/client.ts's serverEnv() import side effect.
const selectWhere = vi.fn();
const upsert = vi.fn().mockResolvedValue(undefined);

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: selectWhere }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: upsert }) }),
  },
}));

// Imported after vi.mock so the mocked db is wired in.
const { getCached } = await import('./cachedFetch.js');

const row = (payload: unknown, expiresAt: Date) => [
  { key: 'k', payload, expiresAt, updatedAt: new Date() },
];

beforeEach(() => {
  selectWhere.mockReset();
  upsert.mockClear();
});

describe('getCached', () => {
  it('returns a fresh row without calling the fetcher (hit)', async () => {
    selectWhere.mockResolvedValue(row({ v: 1 }, new Date(Date.now() + 60_000)));
    const fetcher = vi.fn();

    const res = await getCached('k', 1000, fetcher);

    expect(res).toEqual({ value: { v: 1 }, status: 'hit' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('fetches and upserts when there is no row (miss)', async () => {
    selectWhere.mockResolvedValue([]);
    const fetcher = vi.fn().mockResolvedValue({ v: 2 });

    const res = await getCached('k', 1000, fetcher);

    expect(res).toEqual({ value: { v: 2 }, status: 'miss' });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('fetches again when the row is expired (miss)', async () => {
    selectWhere.mockResolvedValue(row({ v: 'old' }, new Date(Date.now() - 1)));
    const fetcher = vi.fn().mockResolvedValue({ v: 'new' });

    const res = await getCached('k', 1000, fetcher);

    expect(res.status).toBe('miss');
    expect(res.value).toEqual({ v: 'new' });
  });

  it('serves an expired row when the fetcher throws (stale)', async () => {
    selectWhere.mockResolvedValue(row({ v: 'old' }, new Date(Date.now() - 1)));
    const fetcher = vi.fn().mockRejectedValue(new Error('upstream down'));

    const res = await getCached('k', 1000, fetcher);

    expect(res).toEqual({ value: { v: 'old' }, status: 'stale' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rethrows when the fetcher fails and there is no cached row', async () => {
    selectWhere.mockResolvedValue([]);
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(getCached('k', 1000, fetcher)).rejects.toThrow('boom');
  });
});
