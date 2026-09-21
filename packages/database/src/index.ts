import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema.ts";

export { schema } from "./schema.ts";
export * from "./schema.ts";

export function createDb(url: string) {
  const client = postgres(url, { max: 8 });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
