import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";
import { Server as SocketIOServer } from "socket.io";

import { createFileRouter } from "./routes/files.js";
import { createSettingRouter } from "./routes/settings.js";
import { createSystemRouter } from "./routes/system.js";
import { createTaskRouter } from "./routes/tasks.js";
import { initializeDatabase } from "./database-init.js";
import { FileService } from "./services/files.js";
import { SettingService } from "./services/settings.js";
import { SystemService } from "./services/system.js";
import { TaskScheduler } from "./services/task-scheduler.js";
import { TaskService } from "./services/tasks.js";
import type { AppContext } from "./types.js";

export interface CreateAppOptions {
  prisma: PrismaClient;
  staticDir?: string;
}

export async function createApp(options: CreateAppOptions) {
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*"
    }
  });

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );

  const settings = new SettingService(options.prisma);
  await initializeDatabase(options.prisma);
  await settings.ensureDefaults();

  const scheduler = new TaskScheduler(options.prisma, io, settings);
  const taskService = new TaskService(options.prisma, settings);
  const fileService = new FileService(options.prisma, settings);
  const systemService = new SystemService(settings);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/tasks", createTaskRouter(taskService, scheduler));
  app.use("/api/settings", createSettingRouter(settings, scheduler));
  app.use("/api/files", createFileRouter(fileService));
  app.use("/api/system", createSystemRouter(systemService, scheduler));

  if (options.staticDir) {
    const staticDir = path.resolve(options.staticDir);
    app.use(express.static(staticDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") || message.includes("TASK_NOT_FOUND") ? 404 : 400;
    res.status(status).json({ message });
  });

  io.on("connection", (socket) => {
    socket.emit("connected", { at: Date.now() });
  });

  const systemTicker = setInterval(async () => {
    const stats = await systemService.getSystemInfo(scheduler.getDownloadSpeedSummary());
    io.emit("system:stats", stats);
  }, 5000);

  const context: AppContext = {
    prisma: options.prisma,
    scheduler,
    io,
    systemTicker
  };

  return {
    app,
    httpServer,
    context,
    close: async () => {
      clearInterval(systemTicker);
      await scheduler.shutdown();
      await options.prisma.$disconnect();
      io.removeAllListeners();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}
