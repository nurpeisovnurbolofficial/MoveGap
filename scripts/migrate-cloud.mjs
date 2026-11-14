import { loadEnvFile } from 'node:process';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

try { loadEnvFile('.env.local'); } catch { /* CI can supply the server environment. */ }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is missing.'); process.exit(1); }
const url = new URL(process.env.DATABASE_URL);
for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
const pool = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: true }, max: 1, connectionTimeoutMillis: 8000 });
try {
  const sql = await readFile(new URL('../db/001_cloud_plans.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('MoveGap cloud schema is ready. No credentials were printed.');
} catch { console.error('Cloud migration failed. Check server configuration and database access.'); process.exitCode = 1; }
finally { await pool.end(); }
