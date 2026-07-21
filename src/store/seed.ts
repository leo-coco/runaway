import type { Plan } from '@/domain/plan';
import type { Holding, Instrument } from '@/domain/asset';
import type { Account } from '@/domain/account';
import type { CurrencyCode } from '@/domain/money';
import type { AssetClass } from '@/domain/assetClass';
import { DEFAULT_RETIREMENT_SETTINGS } from '@/domain/retirementSettings';
import { DEFAULT_SCENARIO_CONFIG } from '@/domain/scenario';
import { newId } from '@/lib/id';
import { accountFromPreset, defaultFreeAccount, type AccountPreset } from '@/domain/account';

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
    id: 'equity:NVDA.TO',
    symbol: 'NVDA.TO',
    name: 'NVIDIA Corporation',
    assetClass: 'ca_equity',
    exchange: 'TSX',
    price: 36.98,
    qty: 258,
    cagr: 3,
  },
  {
    id: 'equity:XEQT.TO',
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
    id: 'equity:VFV.TO',
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
    id: 'equity:FBTC.TO',
    symbol: 'FBTC.TO',
    name: 'Fidelity Advantage Bitcoin ETF',
    assetClass: 'ca_equity',
    exchange: 'TSX',
    price: 26.08,
    qty: 2656,
    cagr: 15,
  },
  {
    id: 'equity:TSLA.TO',
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
    description: '',
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

export const SANDBOX_PROFILE_IDS = [
  'young_crypto',
  'young_no_crypto',
  'midlife_balanced',
  'retired_protective',
] as const;

export type SandboxProfileId = (typeof SANDBOX_PROFILE_IDS)[number];

export const asSandboxProfileId = (
  value: string | null | undefined,
): SandboxProfileId | undefined =>
  SANDBOX_PROFILE_IDS.includes(value as SandboxProfileId) ? (value as SandboxProfileId) : undefined;

const currentYear = (): number => new Date().getFullYear();

const yearAtAge = (currentAge: number, age: number): number => currentYear() + (age - currentAge);

const sandboxAccount = (preset: AccountPreset): Account => accountFromPreset(preset);

const sandboxHolding = (accountId: string, spec: Omit<Holding, 'id' | 'accountId'>): Holding => ({
  ...spec,
  id: newId(),
  accountId,
});

const createYoungSandboxPlan = (lang: 'en' | 'fr', withCrypto: boolean): Plan => {
  const now = new Date().toISOString();
  const account = sandboxAccount({
    name: lang === 'fr' ? 'CTO sandbox' : 'Sandbox brokerage',
    kind: 'taxable',
    sourceCountry: 'FR',
    costBasisPct: 60,
  });
  const currentAge = 30;
  const retirementYear = yearAtAge(currentAge, 55);
  const endYear = yearAtAge(currentAge, 95);

  const holdings: Holding[] = [
    sandboxHolding(account.id, {
      instrument: {
        id: 'equity:CW8.PA',
        symbol: 'CW8.PA',
        name: 'Amundi MSCI World ETF',
        assetClass: 'eu_equity',
        exchange: 'Euronext Paris',
        nativeCurrency: 'EUR',
      },
      quantity: 70,
      pricePerUnit: 500,
      costBasis: 300,
      expectedCagrPct: 6.4,
      volatilityPct: 17,
      monthlyContribution: 840,
    }),
    withCrypto
      ? sandboxHolding(account.id, {
          instrument: {
            id: 'coingecko:bitcoin',
            symbol: 'BTC',
            name: 'Bitcoin',
            assetClass: 'crypto',
            exchange: 'Crypto',
            nativeCurrency: 'EUR',
          },
          quantity: 0.3,
          pricePerUnit: 50_000,
          costBasis: 30_000,
          expectedCagrPct: 8,
          volatilityPct: 70,
          monthlyContribution: 360,
        })
      : sandboxHolding(account.id, {
          instrument: {
            id: 'equity:VAGF.DE',
            symbol: 'VAGF.DE',
            name: 'Vanguard Global Aggregate Bond ETF',
            assetClass: 'other',
            exchange: 'Xetra',
            nativeCurrency: 'EUR',
          },
          quantity: 600,
          pricePerUnit: 25,
          costBasis: 20,
          expectedCagrPct: 3.2,
          volatilityPct: 8,
          monthlyContribution: 360,
        }),
  ];

  return {
    id: newId(),
    name:
      lang === 'fr'
        ? withCrypto
          ? 'Léa · Jeune avec crypto'
          : 'Léa · Jeune sans crypto'
        : withCrypto
          ? 'Lea · Young with crypto'
          : 'Lea · Young without crypto',
    description:
      lang === 'fr'
        ? 'Départ anticipé à 55 ans, avec une pension qui commence à 65 ans.'
        : 'Early retirement at 55, with a pension starting at 65.',
    currency: 'EUR',
    holdings,
    accounts: [account],
    withdrawalOrder: [account.id],
    residenceCountry: 'FR',
    settings: {
      ...DEFAULT_RETIREMENT_SETTINGS,
      currentAge,
      retirementYear,
      lifeExpectancyAge: 95,
      annualSpending: 36_000,
      expensePeriod: 'yearly',
      spendingMode: 'linear',
      inflationPct: 2.1,
      rmdEnabled: false,
      monteCarloModel: 'bootstrap',
      monteCarloIterations: 5_000,
      btcHalvingCycle: false,
      expensesIncomes: [
        {
          id: newId(),
          name: lang === 'fr' ? 'Pension française nette' : 'Net French pension',
          amount: 22_000,
          year: yearAtAge(currentAge, 65),
          endYear,
          kind: 'income',
          category: 'pension',
          frequency: 'recurring',
          inflate: true,
          taxable: false,
        },
      ],
    },
    scenario: { ...DEFAULT_SCENARIO_CONFIG },
    createdAt: now,
    updatedAt: now,
  };
};

const createMidlifeBalancedSandboxPlan = (lang: 'en' | 'fr'): Plan => {
  const now = new Date().toISOString();
  const account = sandboxAccount({
    name: 'RRSP / REER',
    kind: 'tax_deferred',
    sourceCountry: 'CA',
  });
  const currentAge = 48;
  const retirementYear = yearAtAge(currentAge, 65);
  const endYear = yearAtAge(currentAge, 95);
  const holdings: Holding[] = [
    sandboxHolding(account.id, {
      instrument: {
        id: 'equity:XEQT.TO',
        symbol: 'XEQT.TO',
        name: 'iShares Core Equity ETF Portfolio',
        assetClass: 'ca_equity',
        exchange: 'TSX',
        nativeCurrency: 'CAD',
      },
      quantity: 6_000,
      pricePerUnit: 35,
      costBasis: 28,
      expectedCagrPct: 6.3,
      volatilityPct: 16,
      monthlyContribution: 900,
    }),
    sandboxHolding(account.id, {
      instrument: {
        id: 'equity:XBB.TO',
        symbol: 'XBB.TO',
        name: 'iShares Core Canadian Universe Bond ETF',
        assetClass: 'other',
        exchange: 'TSX',
        nativeCurrency: 'CAD',
      },
      quantity: 140_000 / 30,
      pricePerUnit: 30,
      costBasis: 28,
      expectedCagrPct: 3.2,
      volatilityPct: 8,
      monthlyContribution: 600,
    }),
  ];

  return {
    id: newId(),
    name: lang === 'fr' ? 'Sophie · Mi-carrière modérée' : 'Sophie · Balanced mid-career',
    description:
      lang === 'fr'
        ? 'Une allocation 60/40, une retraite à 65 ans et des revenus publics récurrents.'
        : 'A 60/40 allocation, retirement at 65, and recurring public benefits.',
    currency: 'CAD',
    holdings,
    accounts: [account],
    withdrawalOrder: [account.id],
    residenceCountry: 'CA',
    residenceProvince: 'ON',
    settings: {
      ...DEFAULT_RETIREMENT_SETTINGS,
      currentAge,
      retirementYear,
      lifeExpectancyAge: 95,
      annualSpending: 54_000,
      expensePeriod: 'yearly',
      spendingMode: 'linear',
      inflationPct: 2.1,
      rmdEnabled: true,
      monteCarloModel: 'bootstrap',
      monteCarloIterations: 5_000,
      btcHalvingCycle: false,
      expensesIncomes: [
        {
          id: newId(),
          name: lang === 'fr' ? 'RPC + SV nets' : 'Net CPP + OAS',
          amount: 26_000,
          year: retirementYear,
          endYear,
          kind: 'income',
          category: 'pension',
          frequency: 'recurring',
          inflate: true,
          taxable: false,
        },
        {
          id: newId(),
          name: lang === 'fr' ? 'Grand voyage de retraite' : 'Retirement trip',
          amount: 20_000,
          year: yearAtAge(currentAge, 67),
          kind: 'expense',
          category: 'travel',
          frequency: 'once',
          inflate: true,
        },
      ],
    },
    scenario: { ...DEFAULT_SCENARIO_CONFIG },
    createdAt: now,
    updatedAt: now,
  };
};

const createRetiredProtectiveSandboxPlan = (lang: 'en' | 'fr'): Plan => {
  const now = new Date().toISOString();
  const account = sandboxAccount({
    name: '401(k) / IRA',
    kind: 'tax_deferred',
    sourceCountry: 'US',
  });
  const currentAge = 68;
  const endYear = yearAtAge(currentAge, 95);
  const holdings: Holding[] = [
    sandboxHolding(account.id, {
      instrument: {
        id: 'equity:VOO',
        symbol: 'VOO',
        name: 'Vanguard S&P 500 ETF',
        assetClass: 'us_equity',
        exchange: 'NYSE Arca',
        nativeCurrency: 'USD',
      },
      quantity: 250,
      pricePerUnit: 600,
      costBasis: 450,
      expectedCagrPct: 6.4,
      volatilityPct: 16,
      monthlyContribution: 0,
    }),
    sandboxHolding(account.id, {
      instrument: {
        id: 'equity:BND',
        symbol: 'BND',
        name: 'Vanguard Total Bond Market ETF',
        assetClass: 'other',
        exchange: 'NASDAQ',
        nativeCurrency: 'USD',
      },
      quantity: 350_000 / 75,
      pricePerUnit: 75,
      costBasis: 70,
      expectedCagrPct: 3.2,
      volatilityPct: 8,
      monthlyContribution: 0,
    }),
  ];

  return {
    id: newId(),
    name: lang === 'fr' ? 'Robert · Retraité protecteur' : 'Robert · Protective retiree',
    description:
      lang === 'fr'
        ? 'Une retraite déjà commencée, financée par une pension et un portefeuille défensif.'
        : 'A retirement already underway, funded by Social Security and a defensive portfolio.',
    currency: 'USD',
    holdings,
    accounts: [account],
    withdrawalOrder: [account.id],
    residenceCountry: 'US',
    settings: {
      ...DEFAULT_RETIREMENT_SETTINGS,
      currentAge,
      retirementYear: currentYear(),
      lifeExpectancyAge: 95,
      annualSpending: 52_000,
      expensePeriod: 'yearly',
      spendingMode: 'linear',
      inflationPct: 2.1,
      rmdEnabled: true,
      monteCarloModel: 'bootstrap',
      monteCarloIterations: 5_000,
      btcHalvingCycle: false,
      expensesIncomes: [
        {
          id: newId(),
          name: lang === 'fr' ? 'Social Security nette' : 'Net Social Security',
          amount: 32_000,
          year: currentYear(),
          endYear,
          kind: 'income',
          category: 'pension',
          frequency: 'recurring',
          inflate: true,
          taxable: false,
        },
        {
          id: newId(),
          name: lang === 'fr' ? 'Frais de santé exceptionnels' : 'Exceptional healthcare costs',
          amount: 25_000,
          year: yearAtAge(currentAge, 82),
          kind: 'expense',
          category: 'health',
          frequency: 'once',
          inflate: true,
        },
      ],
    },
    scenario: { ...DEFAULT_SCENARIO_CONFIG },
    createdAt: now,
    updatedAt: now,
  };
};

/** Minimal guest plan shown when someone opens the isolated Sandbox directly. */
const createDefaultSandboxPlan = (lang: 'en' | 'fr'): Plan => {
  const now = new Date().toISOString();
  const account = {
    ...defaultFreeAccount(),
    name: lang === 'fr' ? 'Mon compte' : 'My account',
  };
  const holdings: Holding[] = [
    {
      id: newId(),
      instrument: {
        id: 'equity:VOO',
        symbol: 'VOO',
        name: 'Vanguard S&P 500 ETF',
        assetClass: 'us_equity',
        exchange: 'NYSE Arca',
        nativeCurrency: 'USD',
      },
      quantity: 100,
      pricePerUnit: 500,
      costBasis: 95,
      expectedCagrPct: 5,
      monthlyContribution: 100,
      accountId: account.id,
    },
    {
      id: newId(),
      instrument: {
        id: 'coingecko:bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        assetClass: 'crypto',
        exchange: 'Crypto',
        nativeCurrency: 'USD',
      },
      quantity: 2,
      pricePerUnit: 50_000,
      costBasis: 45_000,
      expectedCagrPct: 6,
      monthlyContribution: 0,
      accountId: account.id,
    },
  ];

  return {
    id: newId(),
    name: lang === 'fr' ? 'Ma retraite' : 'My retirement',
    description: '',
    currency: 'USD',
    holdings,
    accounts: [account],
    withdrawalOrder: [account.id],
    residenceCountry: 'US',
    settings: {
      ...DEFAULT_RETIREMENT_SETTINGS,
      retirementYear: new Date().getFullYear() + 20,
      lifeExpectancyAge: 85,
      annualSpending: 2_500 * 12,
    },
    scenario: { ...DEFAULT_SCENARIO_CONFIG },
    createdAt: now,
    updatedAt: now,
  };
};

/** Blank guest plan chosen explicitly from the public examples page. */
export const createEmptySandboxPlan = (lang: 'en' | 'fr'): Plan => {
  const now = new Date().toISOString();
  const account = {
    ...defaultFreeAccount(),
    name: lang === 'fr' ? 'Mon compte' : 'My account',
  };

  return {
    id: newId(),
    name: lang === 'fr' ? 'Mon plan vide' : 'My blank plan',
    description: '',
    currency: lang === 'fr' ? 'EUR' : 'USD',
    holdings: [],
    accounts: [account],
    withdrawalOrder: [account.id],
    residenceCountry: lang === 'fr' ? 'FR' : 'US',
    settings: { ...DEFAULT_RETIREMENT_SETTINGS },
    scenario: { ...DEFAULT_SCENARIO_CONFIG },
    createdAt: now,
    updatedAt: now,
  };
};

export const createSandboxPlan = (lang: 'en' | 'fr', profileId?: SandboxProfileId): Plan => {
  switch (profileId) {
    case 'young_crypto':
      return createYoungSandboxPlan(lang, true);
    case 'young_no_crypto':
      return createYoungSandboxPlan(lang, false);
    case 'midlife_balanced':
      return createMidlifeBalancedSandboxPlan(lang);
    case 'retired_protective':
      return createRetiredProtectiveSandboxPlan(lang);
    default:
      return createDefaultSandboxPlan(lang);
  }
};
