import { promises as fs } from "node:fs";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

import { SettingService } from "./settings.js";

const VIDEO_EXT = new Set([".mp4", ".mkv", ".webm", ".mov"]);

export class FileService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingService
  ) {}

  async listFiles() {
    await this.syncDirectoryToDb();

    return this.prisma.mediaFile.findMany({
      orderBy: { createdAt: "desc" }
    });
  }

  async getFileById(id: string) {
    const media = await this.prisma.mediaFile.findUnique({ where: { id } });
    if (!media) {
      return null;
    }

    const safe = await this.isPathInSaveRoot(media.filePath);
    if (!safe) {
      return null;
    }

    return media;
  }

  async deleteFile(id: string): Promise<void> {
    const media = await this.prisma.mediaFile.findUnique({ where: { id } });
    if (!media) {
      return;
    }

    const safe = await this.isPathInSaveRoot(media.filePath);
    if (!safe) {
      throw new Error("拒绝删除保存目录之外的文件");
    }

    try {
      await fs.unlink(media.filePath);
    } catch {
      // ignore missing file
    }

    await this.prisma.mediaFile.delete({ where: { id } });
  }

  private async syncDirectoryToDb(): Promise<void> {
    const root = await this.getSaveRoot();

    for await (const filePath of walkFiles(root)) {
      const ext = path.extname(filePath).toLowerCase();
      if (!VIDEO_EXT.has(ext)) {
        continue;
      }

      const safe = await this.isPathInSaveRoot(filePath);
      if (!safe) {
        continue;
      }

      const existing = await this.prisma.mediaFile.findUnique({ where: { filePath } });
      if (existing) {
        continue;
      }

      const stat = await fs.stat(filePath);
      await this.prisma.mediaFile.create({
        data: {
          fileName: path.basename(filePath),
          filePath,
          fileSize: BigInt(stat.size),
          mimeType: ext === ".mkv" ? "video/x-matroska" : "video/mp4"
        }
      });
    }
  }

  private async getSaveRoot(): Promise<string> {
    const saveDir = await this.settings.get<string>(
      "storage.save_dir",
      process.platform === "win32" ? "C:\\stream-recorder\\videos" : "./data/videos"
    );

    const root = path.resolve(saveDir);
    await fs.mkdir(root, { recursive: true });
    return root;
  }

  private async isPathInSaveRoot(targetPath: string): Promise<boolean> {
    const root = await this.getSaveRoot();
    const absolute = path.resolve(targetPath);
    const relative = path.relative(root, absolute);

    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  }
}

async function* walkFiles(root: string): AsyncGenerator<string> {
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(absolute);
    } else if (entry.isFile()) {
      yield absolute;
    }
  }
}
