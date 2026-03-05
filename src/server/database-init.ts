import type { PrismaClient } from "@prisma/client";

const SQL_STATEMENTS = [
  "PRAGMA foreign_keys = ON;",
  `CREATE TABLE IF NOT EXISTS "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" REAL NOT NULL DEFAULT 0,
    "speed" TEXT,
    "fileSize" TEXT,
    "outputPath" TEXT,
    "saveName" TEXT,
    "saveDir" TEXT,
    "processId" INTEGER,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
  );`,
  `CREATE TABLE IF NOT EXISTS "TaskConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL UNIQUE,
    "userAgent" TEXT,
    "headers" TEXT,
    "proxy" TEXT,
    "threads" INTEGER NOT NULL DEFAULT 16,
    "isLiveStream" BOOLEAN NOT NULL DEFAULT false,
    "extraArgs" TEXT,
    CONSTRAINT "TaskConfig_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "MediaFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT UNIQUE,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL UNIQUE,
    "fileSize" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'video/mp4',
    "duration" INTEGER,
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS "SystemSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");`,
  `CREATE INDEX IF NOT EXISTS "Task_createdAt_idx" ON "Task"("createdAt");`,
  `CREATE INDEX IF NOT EXISTS "Task_status_createdAt_idx" ON "Task"("status", "createdAt");`
];

export async function initializeDatabase(prisma: PrismaClient): Promise<void> {
  for (const statement of SQL_STATEMENTS) {
    await prisma.$executeRawUnsafe(statement);
  }
}
