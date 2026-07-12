import type { Plan } from '@/domain/plan';
import type { Holding, Instrument } from '@/domain/asset';
import type { Account } from '@/domain/account';
import type { CurrencyCode } from '@/domain/money';
import type { AssetClass } from '@/domain/assetClass';
import { DEFAULT_RETIREMENT_SETTINGS } from '@/domain/retirementSettings';
import { DEFAULT_SCENARIO_CONFIG } from '@/domain/scenario';
import { newId } from '@/lib/id';

interface SeedSpec {
  id: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange: string;
  price: number;
  qty: number;
  cagr: number;
  /** Monthly contribution in the asset's native currency (accumulation phase). */
  contribution?: number;
}

const SEED_HOLDINGS: readonly SeedSpec[] = [
  {
    id: 'alphavantage:NVDA.TO',
    symbol: 'NVDA.TO',
    name: 'NVIDIA Corporation',
    assetClass: 'ca_equity',
    exchange: 'TSX',
    price: 36.98,
    qty: 258,
    cagr: 3,
  },
  {
    id: 'alphavantage:XEQT.TO',
    symbol: 'XEQT.TO',
    name: 'iShares Core Equity ETF Portfolio',
    assetClass: 'ca_equity',
    exchange: 'TSX',
    contribution: 500,
    price: 31.43,
    qty: 495,
    cagr: 7,
  },
  {
    id: 'alphavantage:VFV.TO',
    symbol: 'VFV.TO',
    name: 'Vanguard S&P 500 Index ETF',
    assetClass: 'ca_equity',
    exchange: 'TSX',
    contribution: 500,
    price: 95,
    qty: 226,
    cagr: 8,
  },
  {
    id: 'alphavantage:FBTC.TO',
    symbol: 'FBTC.TO',
    name: 'Fidelity Advantage Bitcoin ETF',
    assetClass: 'ca_equity',
    exchange: 'TSX',
    price: 26.08,
    qty: 2656,
    cagr: 15,
  },
  {
    id: 'alphavantage:TSLA.TO',
    symbol: 'TSLA.TO',
    name: 'Tesla, Inc.',
    assetClass: 'ca_equity',
    exchange: 'TSX',
    price: 26.94,
    qty: 2359,
    cagr: 8,
  },
  {
    id: 'coingecko:solana',
    symbol: 'SOL',
    name: 'Solana',
    assetClass: 'crypto',
    exchange: 'Crypto',
    price: 84.5,
    qty: 25,
    cagr: 2,
  },
  {
    id: 'coingecko:bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    assetClass: 'crypto',
    exchange: 'Crypto',
    contribution: 200,
    price: 76809,
    qty: 1,
    cagr: 15,
  },
];

const toHolding = (s: SeedSpec, accountId: string | null): Holding => {
  // Origin currency follows the market: TSX listings trade in CAD, crypto in USD.
  const nativeCurrency: CurrencyCode = s.exchange === 'TSX' ? 'CAD' : 'USD';
  const instrument: Instrument = {
    id: s.id,
    symbol: s.symbol,
    name: s.name,
    assetClass: s.assetClass,
    exchange: s.exchange,
    nativeCurrency,
  };
  return {
    id: newId(),
    instrument,
    quantity: s.qty,
    pricePerUnit: s.price,
    expectedCagrPct: s.cagr,
    monthlyContribution: s.contribution ?? 0,
    accountId,
  };
};

/** Which seed envelope a holding belongs to. */
const seedAccountKey = (s: SeedSpec): 'tfsa' | 'rrsp' | 'nonreg' => {
  if (s.assetClass === 'crypto') return 'nonreg';
  if (s.symbol === 'XEQT.TO' || s.symbol === 'VFV.TO') return 'tfsa';
  return 'rrsp';
};

/** The demo plan that reproduces the reference screenshots ($258.31K, 2033 retirement). */
export const createSeedPlan = (): Plan => {
  const now = new Date().toISOString();

  const accounts: Account[] = [
    { id: newId(), name: 'TFSA / CELI', taxRatePct: 0, taxableBasePct: 0 },
    { id: newId(), name: 'RRSP / REER', taxRatePct: 40, taxableBasePct: 100 },
    { id: newId(), name: 'Non-Registered', taxRatePct: 40, taxableBasePct: 50 },
  ];
  const idByKey: Record<'tfsa' | 'rrsp' | 'nonreg', string> = {
    tfsa: accounts[0]!.id,
    rrsp: accounts[1]!.id,
    nonreg: accounts[2]!.id,
  };

  return {
    id: newId(),
    name: 'My plan',
    description: 'My planffefef',
    currency: 'USD',
    holdings: SEED_HOLDINGS.map((s) => toHolding(s, idByKey[seedAccountKey(s)])),
    accounts,
    withdrawalOrder: accounts.map((a) => a.id),
    settings: { ...DEFAULT_RETIREMENT_SETTINGS, retirementYear: 2033 },
    scenario: { ...DEFAULT_SCENARIO_CONFIG },
    createdAt: now,
    updatedAt: now,
  };
};
