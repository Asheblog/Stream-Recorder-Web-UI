import { initializeDatabase } from "../database-init.js";
import { createPrismaClient } from "../prisma.js";

async function main() {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? "file:./data/app.db");
  await initializeDatabase(prisma);
  await prisma.$disconnect();
  // eslint-disable-next-line no-console
  console.log("Database initialized.");
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
