import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { postgresDatabase, type Database, type SqlClient } from './database';

/** Each suite owns an isolated, randomly named schema, even on a real test server. */
export async function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const schema = `movegap_test_${randomBytes(8).toString('hex')}`;
  const sql = (value: string) => value.replaceAll('movegap_cloud', schema);
  const migration = sql(await readFile(new URL('../../db/001_cloud_plans.sql', import.meta.url), 'utf8'));
  if (process.env.CLOUD_LIVE_TEST === '1') {
    if (!process.env.DATABASE_URL) throw new Error('Live cloud tests require DATABASE_URL.');
    const url = new URL(process.env.DATABASE_URL);
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
    const pool = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: true }, max: 5, connectionTimeoutMillis: 8000 });
    await pool.query(migration);
    const original = postgresDatabase(pool);
    const adapt = (client: SqlClient): SqlClient => ({ query: (query, values) => client.query(sql(query), values) });
    return {
      db: { ...adapt(original), transaction: run => original.transaction(client => run(adapt(client))) },
      close: async () => {
        if (!/^movegap_test_[a-f0-9]{16}$/.test(schema)) throw new Error('Unsafe test schema');
        try { await pool.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await pool.end(); }
      },
    };
  }
  const pg = await PGlite.create();
  await pg.exec(migration);
  return {
    db: {
      async query<T>(query: string, values?: unknown[]) { return { rows: (await pg.query<T>(sql(query), values)).rows }; },
      transaction: run => pg.transaction(tx => run({ async query<T>(query: string, values?: unknown[]) {
        return { rows: (await tx.query<T>(sql(query), values)).rows };
      } })),
    },
    close: () => pg.close(),
  };
}
