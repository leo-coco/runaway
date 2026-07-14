import { describe, expect, it, vi } from 'vitest';

// Fixed 32-byte key so the module under test needs no real server env.
vi.mock('../env.js', () => ({
  serverEnv: () => ({ DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }),
}));

const { encrypt, decrypt, encryptJson, decryptJson, isEnvelope } = await import('./dataCrypto.js');

describe('dataCrypto', () => {
  it('round-trips a string', () => {
    const env = encrypt('John 401k rollover');
    expect(env.v).toBe(1);
    expect(env.ct).not.toContain('401k'); // ciphertext, not plaintext
    expect(decrypt(env)).toBe('John 401k rollover');
  });

  it('round-trips a JSON object', () => {
    const plan = { id: 'p1', netWorth: 1234567, holdings: [{ symbol: 'VTI', qty: 10 }] };
    expect(decryptJson(encryptJson(plan))).toEqual(plan);
  });

  it('uses a fresh IV per encryption (ciphertexts differ)', () => {
    expect(encrypt('same').ct).not.toBe(encrypt('same').ct);
  });

  it('rejects a tampered ciphertext via the auth tag', () => {
    const env = encrypt('secret');
    const tampered = { ...env, ct: Buffer.from('evil').toString('base64') };
    expect(() => decrypt(tampered)).toThrow();
  });

  it('isEnvelope distinguishes envelopes from plaintext plans', () => {
    expect(isEnvelope(encrypt('x'))).toBe(true);
    expect(isEnvelope({ id: 'p1', holdings: [] })).toBe(false);
    expect(isEnvelope('plain')).toBe(false);
    expect(isEnvelope(null)).toBe(false);
  });
});
