import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { serverEnv } from '../env.js';

/**
 * Application-level encryption at rest for plan data.
 *
 * Sensitive plan fields (the whole financial blob and the plan name) are encrypted
 * with AES-256-GCM before they reach Postgres and decrypted on read. The key lives
 * only in server env (`DATA_ENCRYPTION_KEY`), never in the database, so a leaked
 * DATABASE_URL, a stolen backup, or Neon-side access yields ciphertext only.
 *
 * This is NOT zero-knowledge: the running server holds the key and can decrypt.
 * The honest guarantee is "encrypted at rest, not readable from the database".
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce length
/** Recorded in every envelope so a key rotation can be added later without a format change. */
const ACTIVE_KID = 'k1';

/** AES-GCM envelope. All binary fields are base64. `v` versions the format. */
export interface EncryptedEnvelope {
  v: 1;
  kid: string;
  iv: string;
  ct: string;
  tag: string;
}

let cachedKey: Buffer | null = null;

const key = (): Buffer => {
  if (cachedKey) return cachedKey;
  cachedKey = Buffer.from(serverEnv().DATA_ENCRYPTION_KEY, 'base64');
  return cachedKey;
};

/** True if `x` looks like an EncryptedEnvelope (vs. a plaintext value from before rollout). */
export const isEnvelope = (x: unknown): x is EncryptedEnvelope =>
  typeof x === 'object' &&
  x !== null &&
  (x as EncryptedEnvelope).v === 1 &&
  typeof (x as EncryptedEnvelope).ct === 'string';

export const encrypt = (plaintext: string): EncryptedEnvelope => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    kid: ACTIVE_KID,
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
  };
};

/** Decrypt an envelope. Throws if the ciphertext or tag has been tampered with. */
export const decrypt = (env: EncryptedEnvelope): string => {
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(env.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(env.ct, 'base64')), decipher.final()]);
  return pt.toString('utf8');
};

export const encryptJson = (obj: unknown): EncryptedEnvelope => encrypt(JSON.stringify(obj));

export const decryptJson = <T>(env: EncryptedEnvelope): T => JSON.parse(decrypt(env)) as T;
