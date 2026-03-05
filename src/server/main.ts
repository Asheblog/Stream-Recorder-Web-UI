import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";
import { createPrismaClient } from "./prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  const port = Number(process.env.PORT ?? 3000);
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? "file:./data/app.db");

  const appBundlePath = path.resolve(__dirname, "../web");
  const hasWebBundle = await exists(appBundlePath);

  const { httpServer } = await createApp({
    prisma,
    staticDir: hasWebBundle ? appBundlePath : undefined
  });

  httpServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Stream Recorder server running at http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});

async function exists(target: string): Promise<boolean> {
  try {
    const fs = await import("node:fs/promises");
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
