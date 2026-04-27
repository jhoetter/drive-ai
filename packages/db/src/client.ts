import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema>;

export function createDb(connectionString: string): { sql: ReturnType<typeof postgres>; db: Db } {
  const sql = postgres(connectionString, { max: 20 });
  const db = drizzle(sql, { schema });
  return { sql, db };
}
