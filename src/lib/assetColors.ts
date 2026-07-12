/** Deterministic chart colours, with overrides for the reference tickers. */
const PALETTE = [
  '#f7931a',
  '#ec4899',
  '#22c55e',
  '#eab308',
  '#f43f5e',
  '#a855f7',
  '#38bdf8',
  '#14b8a6',
  '#fb923c',
  '#818cf8',
];

const KNOWN: Record<string, string> = {
  BTC: '#f7931a',
  'FBTC.TO': '#ec4899',
  'NVDA.TO': '#22c55e',
  SOL: '#eab308',
  'TSLA.TO': '#f43f5e',
  'VFV.TO': '#a855f7',
  'XEQT.TO': '#38bdf8',
};

export const colorForSymbol = (symbol: string, index: number): string =>
  KNOWN[symbol] ?? PALETTE[index % PALETTE.length] ?? '#38bdf8';
