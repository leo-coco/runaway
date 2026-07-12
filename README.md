# Retire on Model — Retirement Planner

A senior-grade retirement planning web app built with **React + Vite + TypeScript** (strict, no `any`, no `as unknown`). It models a multi-asset portfolio (crypto + US/Canadian equities), projects growth and retirement drawdown year by year, and visualises the results — reproducing the reference UI exactly.

The projection engine reproduces the reference numbers to the dollar (with all assets in one currency): opening balance **$258,310**, 2026 appreciation **$30,131**, closing **$288,441**, and a projected depletion year of **2057** — verified by a unit test. See _Multi-currency & live conversion_ below for how FX affects the demo's displayed total.

---

## Quick start

```bash
npm install
cp .env.example .env   # then fill in your API keys (see below)
npm run dev
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`) + production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint, **zero warnings tolerated** (`--max-warnings 0`) |
| `npm run typecheck` | `tsc --noEmit` against the strict config |
| `npm run format` / `format:check` | Prettier write / check |
| `npm run test` / `test:watch` | Vitest run / watch |
| `npm run coverage` | Vitest with V8 coverage (services, hooks, domain) |

### Environment / API keys

All keys are parsed and validated with Zod at boot in `src/config/env.ts`. **If a required key is missing or malformed, the app does not silently proceed** — it renders an actionable configuration screen (`BootError`) listing exactly what to fix.

| Variable | Used for | Key required |
| --- | --- | --- |
| `VITE_ALPHA_VANTAGE_API_KEY` | US/Canadian stock & ETF quotes/search | Yes — free at [alphavantage.co](https://www.alphavantage.co/support/#api-key) |
| `VITE_EXCHANGERATE_API_KEY` | Live FX rates | Yes — free at [exchangerate-api.com](https://www.exchangerate-api.com/) |
| `VITE_COINGECKO_BASE_URL` | Crypto prices & search | No key (public CoinGecko API); defaulted |

There are **zero hard-coded price fallbacks**. When a provider is unavailable, the UI shows an explicit, actionable error (per-row on the table, or a banner) and the manually-entered values continue to drive projections.

---

## Architecture

The codebase enforces a strict, unidirectional data flow and a clean separation between **domain**, **infrastructure**, **services**, and **UI**.

```
API response  →  Zod parse  →  domain entity  →  store / hooks  →  UI
```

No raw API response ever reaches a component.

### Layers

```
src/
  domain/          Pure entities & types. No React, no TanStack Query, no Zustand.
                   Plan, Holding, Instrument, Money, Scenario, RetirementSettings,
                   Projection, and the Result<T,E> / AppError types.
  schemas/         Zod schemas. api/* validate provider responses; the rest validate forms.
  infrastructure/  Raw HTTP clients (CoinGecko, Alpha Vantage, ExchangeRate-API).
                   getJson() is the only place fetch is called; it returns Result<T, AppError>.
  services/        Framework-free business logic. retirementCalculator, currencyService,
                   priceService, searchService, portfolioService. Unit-testable without React/DOM.
  config/          env.ts — Zod-validated environment, evaluated once at boot.
  store/           Zustand store split into slices (plansSlice, uiSlice) with persist.
  providers/       DI via React context (ServicesProvider) + TanStack Query client & keys.
  hooks/           React glue: useProjection, usePortfolioValue, useExchangeRate,
                   useAssetSearch, usePriceFetcher, useCurrencyFormatter, …
  components/      Shared UI primitives (Button, Card, Modal, Stepper, Toggle), icons,
                   ErrorBoundary, layout.
  features/        Screen-level features: plans, portfolio, projections, settings.
```

### Critical rules (and where they live)

1. **Unidirectional data flow** — `infrastructure` validates with Zod → `services` map DTOs to domain numbers → `hooks`/`store` → UI. Components never see raw responses.
2. **Domain / infrastructure separation** — nothing in `domain/` imports React or any library client; a `services/` module never imports a component.
3. **`Result<T, E>` everywhere in services** — no inline `try/catch` in components. Errors are typed (`AppError` with a discriminated `kind`) and surface through the UI as `InlineError` / `BootError`.
4. **Env validation at boot** — `src/config/env.ts` parses keys with Zod; failure renders a clear configuration screen instead of crashing.
5. **Centralised money formatting** — `useCurrencyFormatter(currency)` is the only way money is rendered. No inline `toFixed()` / `Intl.NumberFormat` in components.
6. **Per-feature error boundaries** — `plans`, `portfolio`, `projections`, etc. each wrap in `ErrorBoundary`, so one feature's crash doesn't take down the app.
7. **Justified performance** — heavy projection reduces run in `useMemo` keyed on the inputs that affect them; price fetches are deduplicated through the TanStack Query cache.

### State & data fetching

- **Zustand** (`persist` → localStorage) holds the plans. UI-only state (which modal is open) is intentionally excluded from persistence via `partialize`. Slices: `plansSlice`, `uiSlice`.
- **TanStack Query v5** handles all async data with typed query keys (`providers/queryKeys.ts`) and per-category `staleTime`:
  - Crypto prices (CoinGecko): **30s**
  - Stock prices (Alpha Vantage): **60s**
  - FX rates (ExchangeRate-API): **5min**
- **React Hook Form v7** (uncontrolled) + **Zod** resolvers drive every form; each form has its schema in `src/schemas/` with explicit, actionable messages, and types inferred via `z.infer<>`.

### Multi-currency & live conversion

The planner is natively multi-currency:

- **Master (reference) currency** — chosen per plan from **USD / CAD / EUR / GBP** via the selector in the portfolio header (`setPlanCurrency`). Every global figure — the portfolio total, all charts, and the multi-year projection table — is computed and displayed in this currency. Changing it re-keys the FX query (`useExchangeRate(plan.currency)`) and recomputes projections.
- **Asset origin currency** — each holding stores the currency of its market (TSX listings in CAD, NYSE/NASDAQ in USD, European ETFs in EUR). It is set from the market when an asset is added and is editable inline in the breakdown table.
- **Converted Price column** — the Investment Breakdown shows the native **Asset Price** and, immediately beside it, a live **Converted Price** in the master currency, using real-time rates from ExchangeRate-API (`currencyService.convert`). Conversion happens at the boundary; the domain calculator only ever sees plan-currency values.

> The bundled demo plan reflects this: its TSX holdings (`*.TO`) are denominated in **CAD** and crypto in **USD**, so with a USD master currency the headline total reflects live CAD→USD conversion. Switch the master currency to **CAD** to value the plan in Canadian dollars (where the TSX holdings show natively). The screenshot's all-USD `$258.31K` corresponds to every asset sharing the master currency.

### Savings capacity (accumulation phase)

Each holding has a **monthly contribution** (in its native currency), edited via the **Savings Capacity** card and modal in the overview row. During the accumulation phase — every year before the retirement year — contributions are invested and **compounded intra-year** at the asset's monthly-equivalent CAGR, so a contribution earns growth in the same year it is made (not only from the next year). Contributions stop once withdrawals begin.

The savings modal shows, per asset, the annual contribution **without CAGR** (raw cash) and the **projected value at the retirement year with CAGR** (`contributionFutureValue`), plus the same totals in the plan currency. In the year-by-year projection table, the **Savings Contributions (with CAGR)** row shows each year's contribution including its intra-year growth, while the **Asset Appreciation** row carries growth on the existing balance — so the two stay additive and the CAGR earned on contributions is visible rather than hidden.

### Risk analysis — Safe Withdrawal Rate

The Retirement Settings modal shows a live **Safe Withdrawal Rate (SWR)** indicator: the first-year retirement spending as a percentage of the projected portfolio value at the retirement year (e.g. $60K on a projected $638K = 9.4%). It is colour-coded against the industry-standard 4% rule (`domain/withdrawalRate.ts`): green at or below 4% (safe), amber between 4% and 5% (caution), red above 5% (high depletion risk). The rate updates as you edit the spending field.

### Tax envelopes & withdrawal strategy

Holdings can be grouped into **tax envelopes / accounts** (TFSA/CELI, RRSP/REER, Non-Registered, PER, PEA…) via the **Accounts & Tax** card and modal. Each account has an editable name and two manual tax parameters: a **tax rate** and a **taxable base** (inclusion rate). Their product is the **effective tax rate** on withdrawals (`domain/account.ts`): e.g. RRSP 40% × 100% = 40%, a taxable account 40% × 50% = 20%, TFSA 0%.

Spending is configured as the **net** lifestyle amount. The projection engine grosses it up per account so the after-tax cash matches the target: it splits the net across accounts by weight, grosses each up at its effective rate, covers any shortfall cheapest-tax-first, and withdraws the **gross** amount from the portfolio. The projection table therefore shows **Lifestyle Spending (net)**, **Tax on Withdrawal**, and **Gross Withdrawal** once tax applies.

The dedicated **Withdrawal Strategy** view (`allocateNetWithdrawal`) lets you simulate the decumulation: per-account effective tax, editable weights, net drawn, gross needed, tax, and the blended tax rate. Shifting weight toward lower-tax envelopes reduces the gross (and tax) needed to fund the same net — and the chosen weights feed the projection.

### The projection model

`services/retirementCalculator.ts` is pure and fully unit-tested. For each year:

1. **Opening** = previous year's closing (or initial `price × quantity` for the first year).
2. **Appreciation**: each asset compounds at its **effective CAGR = base CAGR + active scenario adjustment** (the scenario adjustment is applied globally; Expected = 0).
3. **Withdrawal** (from the retirement year onward): annual lifestyle spending, taken at its base figure in the retirement year and **inflated each subsequent year**, withdrawn **pro-rata** across holdings by post-appreciation weight.
4. **Closing** = balance after appreciation − spending (floored at 0).

The **depletion year** is the first year the balance reaches zero; **years of survival** = depletion year − retirement year. Asset prices are quoted in each instrument's native currency and converted to the plan currency with live FX (`currencyService`); all displayed balances are in the plan currency.

This methodology is also surfaced to the user in the "How these numbers are calculated" block beneath the charts.

---

## Screens

- **`/plans`** — plan library (Zustand persist): create, duplicate, delete; each card shows name, normalised value, currency.
- **`/plan/:id/portfolio`** — the main planner:
  - Overview cards (portfolio value, retirement year, retirement settings, scenario) with edit modals.
  - **Investment Breakdown** table — editable price / quantity / CAGR steppers, per-row live price fetch, live-FX value in the plan currency, and a normalised total.
  - **Portfolio Projections** chart with five views: Composition (stacked area, with retirement & depletion markers), Growth, Allocation (pie), Post-retirement survival, and Scenarios (optimistic/expected/conservative).
  - **Yearly Retirement Journey** table with an expandable per-asset breakdown.
  - **Calculation details** explaining the assumptions.
- **Modals** — Edit Plan Name, Edit Retirement Year, Edit Retirement Settings, Edit Price Projection Scenario, Add New Asset (unified crypto + equity search).

---

## Testing

- **Vitest + React Testing Library**, jsdom environment.
- Business services are tested **without React or the DOM** — `retirementCalculator` (reproduces the reference figures and depletion year), `currencyService`, and `parseEnv`.
- A render smoke test mounts the full `PortfolioPage` with injected mock services and asserts the seeded `$258.31K` and asset rows render.
- MSW (`msw`) is installed for mocking provider HTTP at the network layer in future API-integration tests, without touching production code.

Run `npm run test` (15 tests) or `npm run coverage`.

---

## Conventions

- **ESLint** with `typescript-eslint` — `no-explicit-any` is an **error**, type-only imports enforced, and `--max-warnings 0` in CI/scripts.
- **Prettier** for formatting (`npm run format`).
- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `test:`).

> Husky + lint-staged pre-commit hooks are the one remaining tooling item, intentionally deferred to a follow-up pass (the lint/format/test scripts they would run are already in place).

---

## Disclaimer

Hypothetical projections based on user inputs. For educational purposes only. Not financial, investment, tax, or legal advice. No guarantee of results.
