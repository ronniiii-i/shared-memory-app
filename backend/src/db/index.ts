import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required. Check your .env file.');
}

/**
 * Neon is reached over plain HTTP rather than a WebSocket connection pool.
 *
 * Serverless hosts (Vercel functions, Lambda) freeze the process between and
 * during invocations, so a long-lived WebSocket pool has no reliable lifetime.
 * The HTTP driver opens a fresh short-lived request per query instead, which is
 * exactly what the platform is built for. The only trade-off is interactive
 * transactions (`db.transaction(async (tx) => ...)`) are unavailable — this
 * codebase does not use them, so nothing is lost.
 */
export const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });

export type Database = typeof db;
