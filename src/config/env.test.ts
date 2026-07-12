import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('accepts a fully configured environment', () => {
    const r = parseEnv({
      VITE_ALPHA_VANTAGE_API_KEY: 'av-key',
      VITE_EXCHANGERATE_API_KEY: 'fx-key',
      VITE_COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.env.alphaVantageApiKey).toBe('av-key');
  });

  it('reports missing keys as actionable issues', () => {
    const r = parseEnv({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.includes('ALPHA_VANTAGE'))).toBe(true);
      expect(r.issues.some((i) => i.includes('EXCHANGERATE'))).toBe(true);
    }
  });

  it('defaults the CoinGecko base URL when omitted', () => {
    const r = parseEnv({
      VITE_ALPHA_VANTAGE_API_KEY: 'av',
      VITE_EXCHANGERATE_API_KEY: 'fx',
    });
    expect(r.ok && r.env.coinGeckoBaseUrl).toContain('coingecko');
  });
});
