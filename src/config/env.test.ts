import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('accepts a configured environment', () => {
    const r = parseEnv({
      VITE_COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.env.coinGeckoBaseUrl).toBe('https://api.coingecko.com/api/v3');
  });

  it('reports a malformed base URL as an actionable issue', () => {
    const r = parseEnv({ VITE_COINGECKO_BASE_URL: 'not-a-url' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.includes('VITE_COINGECKO_BASE_URL'))).toBe(true);
    }
  });

  it('defaults the CoinGecko base URL when omitted', () => {
    const r = parseEnv({});
    expect(r.ok && r.env.coinGeckoBaseUrl).toContain('coingecko');
  });
});
