import { Pool, type PoolConfig } from "pg";

export function createPostgresPool(connectionString: string, overrides: PoolConfig = {}): Pool {
  if (
    !connectionString.startsWith("postgresql://") &&
    !connectionString.startsWith("postgres://")
  ) {
    throw new Error("A PostgreSQL connection string is required.");
  }
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ...overrides,
  });
}
