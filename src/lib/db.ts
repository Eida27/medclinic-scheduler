import { Pool } from "pg";

declare global {
  // Reuse the same pool during Next.js dev reloads.
  var medclinicPool: Pool | undefined;
}

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!globalThis.medclinicPool) {
    globalThis.medclinicPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 2000,
    });
  }

  return globalThis.medclinicPool;
}
