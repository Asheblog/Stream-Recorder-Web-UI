import { PrismaClient } from "@prisma/client";
import path from "node:path";

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  const normalized = normalizeDatabaseUrl(databaseUrl);

  return new PrismaClient(
    normalized
      ? {
          datasources: {
            db: {
              url: normalized
            }
          }
        }
      : undefined
  );
}

function normalizeDatabaseUrl(databaseUrl?: string): string | undefined {
  if (!databaseUrl || !databaseUrl.startsWith("file:")) {
    return databaseUrl;
  }

  const rawPath = databaseUrl.slice("file:".length);
  if (rawPath.startsWith("/")) {
    return databaseUrl;
  }

  if (/^[A-Za-z]:[\\/]/.test(rawPath)) {
    return `file:${rawPath}`;
  }

  return `file:${path.resolve(rawPath)}`;
}
