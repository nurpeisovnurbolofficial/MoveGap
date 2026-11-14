import { Pool } from 'pg';

export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends SqlClient {
  transaction<T>(run: (client: SqlClient) => Promise<T>): Promise<T>;
}

export function postgresDatabase(pool: Pool): Database {
  return {
    async query<T>(sql: string, values?: unknown[]) { return { rows: (await pool.query(sql, values)).rows as T[] }; },
    async transaction<T>(run: (client: SqlClient) => Promise<T>) {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query("SET LOCAL statement_timeout = '8s'");
        await connection.query("SET LOCAL lock_timeout = '5s'");
        const value = await run({ async query<R>(sql: string, values?: unknown[]) {
          return { rows: (await connection.query(sql, values)).rows as R[] };
        } });
        await connection.query('COMMIT');
        return value;
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      } finally { connection.release(); }
    },
  };
}

let database: Database | undefined;
export function productionDatabase(): Database {
  if (database) return database;
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_NOT_CONFIGURED');
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('INVALID_DATABASE_CONFIGURATION');
  // URL sslmode options must not override certificate verification.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const pool = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: true },
    max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, allowExitOnIdle: true,
    application_name: 'movegap-cloud',
  });
  pool.on('error', () => { /* Never log database URLs, credentials or financial payloads. */ });
  database = postgresDatabase(pool);
  return database;
}
