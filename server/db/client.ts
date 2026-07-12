import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { serverEnv } from '../env.js';
import * as schema from './schema.js';

/**
 * Drizzle client over Neon's HTTP driver — stateless, ideal for serverless
 * functions (no connection pool to manage). One instance per module load.
 */
const sql = neon(serverEnv().DATABASE_URL);
export const db = drizzle(sql, { schema });
export { schema };
