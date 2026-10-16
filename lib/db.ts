import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
const globalDb = globalThis as unknown as { db?: PrismaClient };
export const db =
  globalDb.db ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      max: 5,
    }),
    log: [],
  });
if (process.env.NODE_ENV !== "production") globalDb.db = db;
