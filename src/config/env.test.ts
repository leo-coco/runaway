import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('accepts a fully configured environment', () => {
    const r = parseEnv({
      VITE_COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.env.coinGeckoBaseUrl).toBe('https://api.coingecko.com/api/v3');
  });

  it('defaults the CoinGecko base URL when omitted', () => {
    const r = parseEnv({});
    expect(r.ok && r.env.coinGeckoBaseUrl).toContain('coingecko');
  });

  it('rejects a malformed CoinGecko base URL', () => {
    const r = parseEnv({ VITE_COINGECKO_BASE_URL: 'not-a-url' });
    expect(r.ok).toBe(false);
  });
});
