import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { plans } from '../db/schema.js';
import { encrypt, encryptJson, isEnvelope } from '../crypto/dataCrypto.js';
import type { Plan } from '../../src/domain/plan';

/**
 * One-off backfill: encrypt any plan rows still stored in plaintext.
 *
 * Idempotent — rows whose `data` is already an EncryptedEnvelope are skipped, so
 * this is safe to re-run. Run once after deploying DATA_ENCRYPTION_KEY:
 *   tsx server/scripts/encrypt-plans.ts
 */
const main = async (): Promise<void> => {
  const rows = await db.select().from(plans);
  let updated = 0;

  for (const row of rows) {
    if (isEnvelope(row.data)) continue; // already encrypted

    await db
      .update(plans)
      .set({
        name: JSON.stringify(encrypt(row.name)),
        data: encryptJson(row.data as Plan),
      })
      .where(eq(plans.id, row.id));
    updated += 1;
  }

  console.log(
    `Backfill complete: ${updated} row(s) encrypted, ${rows.length - updated} already encrypted.`,
  );
};

main().then(
  () => process.exit(0),
  (err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  },
);
