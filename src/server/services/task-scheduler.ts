import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomInt } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { PrismaClient, Task, TaskStatus } from "@prisma/client";
import { TaskStatus as TaskStatusEnum } from "@prisma/client";
import type { Server as SocketServer } from "socket.io";

import { buildEngineCommand } from "../engine/command-builder.js";
import { parseStdoutLine } from "../engine/stdout-parser.js";
import type { TaskSchedulerLike } from "../types.js";
import { SettingService } from "./settings.js";

interface RuntimeTask {
  mode: "mock" | "real";
  speed: string;
  timer?: NodeJS.Timeout;
  child?: ChildProcessWithoutNullStreams;
  stopRequested?: boolean;
  lineBuffer?: string;
}

export class TaskScheduler implements TaskSchedulerLike {
  private readonly running = new Map<string, RuntimeTask>();
  private readonly logs = new Map<string, string[]>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly io: SocketServer,
    private readonly settings: SettingService,
    private readonly mockTickMs = Number(process.env.MOCK_TICK_MS ?? 900),
    private readonly mergeDelayMs = Number(process.env.MOCK_MERGE_DELAY_MS ?? 1200)
  ) {}

  async requestStart(taskId: string): Promise<Task> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new Error("TASK_NOT_FOUND");
    }

    if (this.running.has(taskId)) {
      return task;
    }

    if (task.status === TaskStatusEnum.DOWNLOADING || task.status === TaskStatusEnum.MERGING) {
      return task;
    }

    if (task.status === TaskStatusEnum.COMPLETED) {
      return task;
    }

    const maxConcurrent = await this.settings.get<number>("task.max_concurrent", 3);
    if (this.running.size >= maxConcurrent) {
      const queued = await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatusEnum.QUEUED,
          processId: null,
          speed: null,
          errorMessage: null
        }
      });
      this.emitStatus(queued.id, queued.status);
      return queued;
    }

    return this.startByMode(task);
  }

  async stopTask(taskId: string): Promise<Task> {
    const runtime = this.running.get(taskId);
    if (runtime?.mode === "mock") {
      if (runtime.timer) {
        clearInterval(runtime.timer);
      }
      this.running.delete(taskId);
    }

    if (runtime?.mode === "real" && runtime.child) {
      runtime.stopRequested = true;
      this.running.set(taskId, runtime);
      try {
        runtime.child.kill("SIGINT");
      } catch {
        runtime.child.kill();
      }
    }

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatusEnum.STOPPED,
        processId: null,
        speed: null
      }
    });

    this.appendLog(taskId, "[INFO] Task stopped by user.");
    this.emitStatus(taskId, TaskStatusEnum.STOPPED);
    await this.enqueuePending();
    return task;
  }

  async retryTask(taskId: string): Promise<Task> {
    const current = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        retryCount: { increment: 1 },
        status: TaskStatusEnum.RETRYING,
        errorMessage: null
      }
    });

    this.emitStatus(taskId, TaskStatusEnum.RETRYING);
    this.appendLog(taskId, "[INFO] Retry requested.");
    return this.requestStart(current.id);
  }

  async removeTask(taskId: string): Promise<void> {
    const runtime = this.running.get(taskId);
    if (runtime?.timer) {
      clearInterval(runtime.timer);
    }
    if (runtime?.child && !runtime.child.killed) {
      runtime.stopRequested = true;
      runtime.child.kill();
    }
    this.running.delete(taskId);

    await this.prisma.$transaction([
      this.prisma.taskConfig.deleteMany({ where: { taskId } }),
      this.prisma.mediaFile.deleteMany({ where: { taskId } }),
      this.prisma.task.delete({ where: { id: taskId } })
    ]);

    this.logs.delete(taskId);
    await this.enqueuePending();
  }

  async enqueuePending(): Promise<void> {
    const maxConcurrent = await this.settings.get<number>("task.max_concurrent", 3);
    const available = Math.max(maxConcurrent - this.running.size, 0);
    if (available <= 0) {
      return;
    }

    const candidates = await this.prisma.task.findMany({
      where: {
        status: {
          in: [TaskStatusEnum.QUEUED, TaskStatusEnum.RETRYING]
        }
      },
      orderBy: { createdAt: "asc" },
      take: available
    });

    for (const task of candidates) {
      await this.startByMode(task);
    }
  }

  getTaskLogs(taskId: string): string[] {
    return this.logs.get(taskId) ?? [];
  }

  getDownloadSpeedSummary(): string {
    const speeds = [...this.running.values()].map((item) => parseSpeed(item.speed));
    const sum = speeds.reduce((acc, value) => acc + value, 0);
    return `${sum.toFixed(1)} MB/s`;
  }

  async shutdown(): Promise<void> {
    for (const runtime of this.running.values()) {
      if (runtime.timer) {
        clearInterval(runtime.timer);
      }
      if (runtime.child && !runtime.child.killed) {
        runtime.stopRequested = true;
        runtime.child.kill();
      }
    }
    this.running.clear();
  }

  private async startByMode(task: Task): Promise<Task> {
    const mode = await this.settings.get<string>("engine.mode", "mock");
    if (mode === "real") {
      return this.startReal(task);
    }
    return this.startMock(task);
  }

  private async startMock(task: Task): Promise<Task> {
    if (this.running.has(task.id)) {
      return this.prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    }

    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatusEnum.DOWNLOADING,
        processId: randomInt(1000, 60000),
        speed: "0 MB/s",
        errorMessage: null
      }
    });

    this.emitStatus(task.id, TaskStatusEnum.DOWNLOADING);
    this.appendLog(task.id, `[INFO] Start task (mock): ${updated.name}`);

    const timer = setInterval(async () => {
      try {
        await this.tickTask(task.id);
      } catch (error) {
        this.running.delete(task.id);
        await this.markAsFailed(task.id, (error as Error).message);
      }
    }, this.mockTickMs);

    this.running.set(task.id, {
      mode: "mock",
      timer,
      speed: "0 MB/s"
    });

    return updated;
  }

  private async startReal(task: Task): Promise<Task> {
    if (this.running.has(task.id)) {
      return this.prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    }

    const enginePath = await this.settings.get<string>(
      "engine.n_m3u8dl_path",
      process.platform === "win32" ? "C:\\Tools\\N_m3u8DL-RE.exe" : "/usr/local/bin/N_m3u8DL-RE"
    );
    const ffmpegPath = await this.settings.get<string>(
      "engine.ffmpeg_path",
      process.platform === "win32" ? "C:\\ffmpeg\\bin\\ffmpeg.exe" : "/usr/bin/ffmpeg"
    );
    const saveRoot = await this.settings.get<string>(
      "storage.save_dir",
      process.platform === "win32" ? "C:\\stream-recorder\\videos" : "./data/videos"
    );

    const config = await this.prisma.taskConfig.findUnique({ where: { taskId: task.id } });
    const command = buildEngineCommand({
      enginePath,
      ffmpegPath,
      saveRoot,
      task,
      config
    });

    const child = spawn(command.command, command.args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatusEnum.DOWNLOADING,
        processId: child.pid ?? null,
        speed: "0 MB/s",
        errorMessage: null
      }
    });

    this.emitStatus(task.id, TaskStatusEnum.DOWNLOADING);
    this.appendLog(task.id, `[INFO] Start task (real): ${command.command} ${command.args.join(" ")}`);

    this.running.set(task.id, {
      mode: "real",
      speed: "0 MB/s",
      child,
      stopRequested: false,
      lineBuffer: ""
    });

    child.stdout.on("data", (chunk) => {
      this.consumeRealOutput(task.id, chunk.toString("utf8"), "stdout");
    });

    child.stderr.on("data", (chunk) => {
      this.consumeRealOutput(task.id, chunk.toString("utf8"), "stderr");
    });

    child.on("error", async (error) => {
      this.running.delete(task.id);
      await this.markAsFailed(task.id, `Engine process error: ${error.message}`);
    });

    child.on("close", async (code, signal) => {
      const runtime = this.running.get(task.id);
      const stopRequested = runtime?.stopRequested ?? false;
      this.running.delete(task.id);

      const latest = await this.prisma.task.findUnique({ where: { id: task.id } });
      if (!latest) {
        return;
      }

      if (stopRequested || latest.status === TaskStatusEnum.STOPPED) {
        this.appendLog(task.id, `[INFO] Engine exited after stop. code=${String(code)} signal=${String(signal)}`);
        await this.enqueuePending();
        return;
      }

      if (code === 0) {
        await this.completeRealTask(latest);
        return;
      }

      await this.markAsFailed(
        task.id,
        `Engine exited unexpectedly (code=${String(code)} signal=${String(signal)})`
      );
    });

    return updated;
  }

  private consumeRealOutput(taskId: string, rawChunk: string, source: "stdout" | "stderr"): void {
    const runtime = this.running.get(taskId);
    if (!runtime || runtime.mode !== "real") {
      return;
    }

    const combined = `${runtime.lineBuffer ?? ""}${rawChunk}`;
    const lines = combined.split(/\r?\n/);
    const tail = lines.pop() ?? "";

    runtime.lineBuffer = tail;
    this.running.set(taskId, runtime);

    for (const line of lines) {
      const cleaned = line.trim();
      if (!cleaned) {
        continue;
      }

      const prefix = source === "stderr" ? "[WARN]" : "[INFO]";
      this.appendLog(taskId, `${prefix} ${cleaned}`);

      const parsed = parseStdoutLine(cleaned);
      if (parsed) {
        void this.updateProgressFromReal(taskId, parsed.progress, parsed.speed, parsed.fileSize);
      }
    }
  }

  private async updateProgressFromReal(
    taskId: string,
    progress: number,
    speed: string,
    fileSize: string
  ): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.status === TaskStatusEnum.STOPPED || task.status === TaskStatusEnum.ERROR) {
      return;
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        progress: Math.max(task.progress, Math.min(100, progress)),
        speed,
        fileSize
      }
    });

    const runtime = this.running.get(taskId);
    if (runtime) {
      runtime.speed = speed;
      this.running.set(taskId, runtime);
    }

    this.emitProgress(taskId, progress, speed, fileSize);
  }

  private async tickTask(taskId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      this.clearRuntime(taskId);
      return;
    }

    if (task.status !== TaskStatusEnum.DOWNLOADING) {
      this.clearRuntime(taskId);
      return;
    }

    const increment = randomInt(8, 21) / 10;
    const progress = Math.min(100, Number((task.progress + increment).toFixed(1)));
    const speed = `${(randomInt(80, 340) / 10).toFixed(1)} MB/s`;
    const fileSize = `${(progress * 0.07).toFixed(2)} GB`;

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        progress,
        speed,
        fileSize
      }
    });

    const runtime = this.running.get(taskId);
    if (runtime) {
      runtime.speed = speed;
      this.running.set(taskId, runtime);
    }

    this.appendLog(taskId, `[DL] ${progress.toFixed(1)}% ${speed} ${fileSize}`);
    this.emitProgress(taskId, progress, speed, fileSize);

    if (progress >= 100) {
      await this.finishMockTask(updated);
    }
  }

  private async finishMockTask(task: Task): Promise<void> {
    this.clearRuntime(task.id);

    await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatusEnum.MERGING,
        speed: null,
        processId: null
      }
    });
    this.appendLog(task.id, "[INFO] Download complete, merging segments...");
    this.emitStatus(task.id, TaskStatusEnum.MERGING);

    await wait(this.mergeDelayMs);

    const saveRoot = await this.settings.get<string>(
      "storage.save_dir",
      process.platform === "win32" ? "C:\\stream-recorder\\videos" : "./data/videos"
    );
    const resolvedRoot = path.resolve(saveRoot);
    const outputDir = task.saveDir ? path.join(resolvedRoot, task.saveDir) : resolvedRoot;
    await fs.mkdir(outputDir, { recursive: true });

    const fileName = `${task.saveName ?? task.name}.mp4`;
    const outputPath = path.join(outputDir, fileName);

    await fs.writeFile(outputPath, `Mock video for task ${task.id}\n`, "utf8");
    const stat = await fs.stat(outputPath);

    await this.persistCompletedTask(task.id, {
      outputPath,
      fileName,
      fileSizeBytes: stat.size,
      displaySize: `${(stat.size / 1024 / 1024).toFixed(2)} MB`
    });

    this.appendLog(task.id, "[INFO] Merge completed.");
    this.emitStatus(task.id, TaskStatusEnum.COMPLETED);
    await this.enqueuePending();
  }

  private async completeRealTask(task: Task): Promise<void> {
    const saveRoot = await this.settings.get<string>(
      "storage.save_dir",
      process.platform === "win32" ? "C:\\stream-recorder\\videos" : "./data/videos"
    );
    const resolvedRoot = path.resolve(saveRoot);
    const outputDir = task.saveDir ? path.join(resolvedRoot, task.saveDir) : resolvedRoot;

    const resolvedFile = await resolveOutputFile(outputDir, task.saveName ?? task.name);
    if (!resolvedFile) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatusEnum.COMPLETED,
          progress: 100,
          speed: null,
          processId: null,
          completedAt: new Date()
        }
      });
      this.appendLog(task.id, "[WARN] Engine exited 0 but output file not found.");
      this.emitStatus(task.id, TaskStatusEnum.COMPLETED);
      await this.enqueuePending();
      return;
    }

    await this.persistCompletedTask(task.id, {
      outputPath: resolvedFile.path,
      fileName: resolvedFile.fileName,
      fileSizeBytes: resolvedFile.size,
      displaySize: `${(resolvedFile.size / 1024 / 1024).toFixed(2)} MB`
    });

    this.appendLog(task.id, "[INFO] Task completed by engine.");
    this.emitStatus(task.id, TaskStatusEnum.COMPLETED);
    await this.enqueuePending();
  }

  private async persistCompletedTask(
    taskId: string,
    payload: {
      outputPath: string;
      fileName: string;
      fileSizeBytes: number;
      displaySize: string;
    }
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatusEnum.COMPLETED,
          progress: 100,
          speed: null,
          processId: null,
          outputPath: payload.outputPath,
          fileSize: payload.displaySize,
          completedAt: new Date()
        }
      }),
      this.prisma.mediaFile.upsert({
        where: { taskId },
        update: {
          fileName: payload.fileName,
          filePath: payload.outputPath,
          fileSize: BigInt(payload.fileSizeBytes),
          mimeType: guessMimeType(payload.fileName)
        },
        create: {
          taskId,
          fileName: payload.fileName,
          filePath: payload.outputPath,
          fileSize: BigInt(payload.fileSizeBytes),
          mimeType: guessMimeType(payload.fileName)
        }
      })
    ]);
  }

  private clearRuntime(taskId: string): void {
    const runtime = this.running.get(taskId);
    if (!runtime) {
      return;
    }

    if (runtime.timer) {
      clearInterval(runtime.timer);
    }
    this.running.delete(taskId);
  }

  private async markAsFailed(taskId: string, errorMessage: string): Promise<void> {
    this.appendLog(taskId, `[ERROR] ${errorMessage}`);

    const maxRetry = await this.settings.get<number>("task.max_retry_count", 3);
    const autoRetry = await this.settings.get<boolean>("task.auto_retry", false);
    const current = await this.prisma.task.findUnique({ where: { id: taskId } });

    if (current && autoRetry && current.retryCount < maxRetry) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatusEnum.RETRYING,
          processId: null,
          speed: null,
          errorMessage,
          retryCount: { increment: 1 }
        }
      });
      this.emitStatus(taskId, TaskStatusEnum.RETRYING, errorMessage);
      this.appendLog(taskId, `[INFO] Auto retry scheduled (${current.retryCount + 1}/${maxRetry}).`);

      setTimeout(() => {
        void this.requestStart(taskId);
      }, 600);

      return;
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatusEnum.ERROR,
        processId: null,
        speed: null,
        errorMessage
      }
    });
    this.emitStatus(taskId, TaskStatusEnum.ERROR, errorMessage);
    await this.enqueuePending();
  }

  private emitProgress(taskId: string, progress: number, speed: string, fileSize: string): void {
    this.io.emit("task:progress", {
      taskId,
      progress,
      speed,
      fileSize
    });
  }

  private emitStatus(taskId: string, status: TaskStatus, errorMessage?: string): void {
    this.io.emit("task:statusChange", {
      taskId,
      status,
      errorMessage
    });
  }

  private appendLog(taskId: string, line: string): void {
    const now = new Date().toISOString();
    const existing = this.logs.get(taskId) ?? [];
    existing.push(`${now} ${line}`);
    if (existing.length > 500) {
      existing.shift();
    }
    this.logs.set(taskId, existing);
  }
}

async function resolveOutputFile(
  dirPath: string,
  baseName: string
): Promise<{ path: string; fileName: string; size: number } | null> {
  await fs.mkdir(dirPath, { recursive: true });

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.startsWith(baseName))
    .filter((entry) => /\.(mp4|mkv|mov|webm)$/i.test(entry.name));

  if (candidates.length === 0) {
    return null;
  }

  let best: { path: string; fileName: string; size: number; mtimeMs: number } | null = null;

  for (const candidate of candidates) {
    const target = path.join(dirPath, candidate.name);
    const stat = await fs.stat(target);
    if (!best || stat.mtimeMs > best.mtimeMs) {
      best = {
        path: target,
        fileName: candidate.name,
        size: stat.size,
        mtimeMs: stat.mtimeMs
      };
    }
  }

  if (!best) {
    return null;
  }

  return {
    path: best.path,
    fileName: best.fileName,
    size: best.size
  };
}

function guessMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".mkv")) {
    return "video/x-matroska";
  }
  if (lower.endsWith(".webm")) {
    return "video/webm";
  }
  if (lower.endsWith(".mov")) {
    return "video/quicktime";
  }
  return "video/mp4";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSpeed(raw: string): number {
  const match = /(\d+(?:\.\d+)?)\s*(KB|MB|GB)\/s/i.exec(raw);
  if (!match) {
    return 0;
  }

  const value = Number(match[1]);
  const unit = match[2].toUpperCase();

  if (Number.isNaN(value)) {
    return 0;
  }

  if (unit === "KB") {
    return value / 1024;
  }
  if (unit === "GB") {
    return value * 1024;
  }
  return value;
}
