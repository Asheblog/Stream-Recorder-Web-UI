import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";

import type { PrismaClient, SystemSetting } from "@prisma/client";

const DEFAULT_SETTINGS: Record<string, { value: unknown; description: string }> = {
  "engine.n_m3u8dl_path": {
    value: process.platform === "win32" ? "C:\\Tools\\N_m3u8DL-RE.exe" : "/usr/local/bin/N_m3u8DL-RE",
    description: "N_m3u8DL-RE 可执行文件路径"
  },
  "engine.ffmpeg_path": {
    value: process.platform === "win32" ? "C:\\ffmpeg\\bin\\ffmpeg.exe" : "/usr/bin/ffmpeg",
    description: "ffmpeg 可执行文件路径"
  },
  "storage.save_dir": {
    value: process.platform === "win32" ? "C:\\stream-recorder\\videos" : "./data/videos",
    description: "默认视频保存目录"
  },
  "task.max_concurrent": {
    value: 3,
    description: "最大并发任务数"
  },
  "task.default_threads": {
    value: 16,
    description: "默认线程数"
  },
  "task.auto_retry": {
    value: false,
    description: "是否自动重试失败任务"
  },
  "task.max_retry_count": {
    value: 3,
    description: "最大重试次数"
  },
  "engine.mode": {
    value: process.env.ENGINE_MODE ?? "mock",
    description: "引擎模式: mock | real"
  }
};

export class SettingService {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureDefaults(): Promise<void> {
    await Promise.all(
      Object.entries(DEFAULT_SETTINGS).map(async ([key, meta]) => {
        await this.prisma.systemSetting.upsert({
          where: { key },
          update: {},
          create: {
            key,
            value: JSON.stringify(meta.value),
            description: meta.description
          }
        });
      })
    );
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.systemSetting.findMany({
      orderBy: { key: "asc" }
    });

    return rows.reduce<Record<string, unknown>>((acc, row) => {
      acc[row.key] = parseJsonValue(row.value);
      return acc;
    }, {});
  }

  async getRawRows(): Promise<SystemSetting[]> {
    return this.prisma.systemSetting.findMany({
      orderBy: { key: "asc" }
    });
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!row) {
      return fallback;
    }

    const value = parseJsonValue(row.value);
    return (value as T) ?? fallback;
  }

  async updateMany(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const entries = Object.entries(payload);
    if (entries.length === 0) {
      return this.getAll();
    }

    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          update: { value: JSON.stringify(value) },
          create: { key, value: JSON.stringify(value) }
        })
      )
    );

    return this.getAll();
  }

  async validatePath(options: {
    pathValue: string;
    expect: "file" | "directory";
    executable?: boolean;
  }): Promise<{
    ok: boolean;
    exists: boolean;
    isExecutable: boolean;
    resolvedPath: string;
    message: string;
  }> {
    const resolvedPath = path.resolve(options.pathValue.trim());
    let stat = await fs
      .stat(resolvedPath)
      .then((value) => value)
      .catch(() => null);

    if (!stat && options.expect === "directory") {
      await fs.mkdir(resolvedPath, { recursive: true }).catch(() => undefined);
      stat = await fs
        .stat(resolvedPath)
        .then((value) => value)
        .catch(() => null);
    }

    if (!stat) {
      return {
        ok: false,
        exists: false,
        isExecutable: false,
        resolvedPath,
        message: "路径不存在"
      };
    }

    if (options.expect === "directory" && !stat.isDirectory()) {
      return {
        ok: false,
        exists: true,
        isExecutable: false,
        resolvedPath,
        message: "路径存在，但不是目录"
      };
    }

    if (options.expect === "file" && !stat.isFile()) {
      return {
        ok: false,
        exists: true,
        isExecutable: false,
        resolvedPath,
        message: "路径存在，但不是文件"
      };
    }

    if (!options.executable) {
      return {
        ok: true,
        exists: true,
        isExecutable: true,
        resolvedPath,
        message: "路径可用"
      };
    }

    const isExecutable = await checkExecutable(resolvedPath);
    return {
      ok: isExecutable,
      exists: true,
      isExecutable,
      resolvedPath,
      message: isExecutable ? "可执行文件可用" : "文件存在，但不可执行"
    };
  }
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function checkExecutable(targetPath: string): Promise<boolean> {
  if (process.platform === "win32") {
    const ext = path.extname(targetPath).toLowerCase();
    return [".exe", ".bat", ".cmd", ".ps1"].includes(ext);
  }

  try {
    await fs.access(targetPath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
