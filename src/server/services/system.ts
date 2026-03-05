import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { SettingService } from "./settings.js";
import type { SystemStats } from "../types.js";

export class SystemService {
  constructor(private readonly settings: SettingService) {}

  async getSystemInfo(downloadSpeed = "0 MB/s"): Promise<SystemStats> {
    const cpu = await this.getCpuUsage();
    const memory = this.getMemoryUsage();
    const disk = await this.getDiskUsage();

    return {
      cpu,
      memory,
      disk,
      downloadSpeed
    };
  }

  private async getCpuUsage(): Promise<number> {
    const first = os.cpus();
    await wait(120);
    const second = os.cpus();

    const aggregate = first.reduce(
      (acc, cpu, index) => {
        const next = second[index];
        const idle = next.times.idle - cpu.times.idle;
        const total =
          (next.times.user - cpu.times.user) +
          (next.times.nice - cpu.times.nice) +
          (next.times.sys - cpu.times.sys) +
          (next.times.irq - cpu.times.irq) +
          idle;

        acc.idle += idle;
        acc.total += total;
        return acc;
      },
      { idle: 0, total: 0 }
    );

    if (aggregate.total <= 0) {
      return 0;
    }

    const ratio = 1 - aggregate.idle / aggregate.total;
    return round(ratio * 100, 1);
  }

  private getMemoryUsage(): number {
    const total = os.totalmem();
    const free = os.freemem();
    if (total <= 0) {
      return 0;
    }
    return round(((total - free) / total) * 100, 1);
  }

  private async getDiskUsage(): Promise<SystemStats["disk"]> {
    const saveDir = await this.settings.get<string>(
      "storage.save_dir",
      process.platform === "win32" ? "C:\\stream-recorder\\videos" : "./data/videos"
    );
    const absolute = path.resolve(saveDir);

    await fs.mkdir(absolute, { recursive: true });

    try {
      const stat = await fs.statfs(absolute);
      const total = Number(stat.blocks) * Number(stat.bsize);
      const free = Number(stat.bavail) * Number(stat.bsize);
      const used = Math.max(total - free, 0);

      return { used, total, free };
    } catch {
      return { used: 0, total: 0, free: 0 };
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value: number, digits: number): number {
  const base = Math.pow(10, digits);
  return Math.round(value * base) / base;
}
