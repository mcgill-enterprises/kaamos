import postgres from 'postgres';

// CockroachDB is Postgres-wire-compatible. postgres.js works without changes.
// Connection string can be overridden via TORAKKA_DB_URL for production.
const DB_URL = process.env.TORAKKA_DB_URL
  ?? 'postgresql://root@localhost:26257/torakka?sslmode=disable';

export const sql = postgres(DB_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {}, // suppress NOTICE messages from CockroachDB
});

export async function checkConnection(): Promise<void> {
  await sql`SELECT 1`;
}
