import type { Prisma, PrismaClient, Task } from "@prisma/client";
import { TaskStatus } from "@prisma/client";
import { z } from "zod";

import { SettingService } from "./settings.js";

const taskInputSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "仅支持 HTTP(S) 协议 URL"),
  name: z.string().trim().min(1).optional(),
  saveName: z.string().trim().min(1).optional(),
  saveDir: z.string().trim().min(1).optional(),
  config: z
    .object({
      userAgent: z.string().trim().min(1).optional(),
      headers: z.string().trim().min(1).optional(),
      proxy: z.string().trim().min(1).optional(),
      threads: z.number().int().min(1).max(64).optional(),
      isLiveStream: z.boolean().optional(),
      extraArgs: z.string().trim().min(1).optional()
    })
    .optional()
});

const createTasksSchema = z
  .object({
    tasks: z.array(taskInputSchema).min(1).optional(),
    urlText: z.string().optional(),
    defaultSaveDir: z.string().trim().min(1).optional(),
    defaultThreads: z.number().int().min(1).max(64).optional()
  })
  .refine((value) => (value.tasks?.length ?? 0) > 0 || Boolean(value.urlText?.trim()), {
    message: "至少提供 tasks 或 urlText"
  });

const batchActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(["start", "stop", "delete"])
});

export class TaskService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingService
  ) {}

  async createMany(raw: unknown): Promise<Task[]> {
    const payload = createTasksSchema.parse(raw);
    const tasksFromText = parseUrlText(payload.urlText);

    const taskInputs: Array<{
      url: string;
      name?: string;
      saveName?: string;
      saveDir?: string;
      config?: {
        userAgent?: string;
        headers?: string;
        proxy?: string;
        threads?: number;
        isLiveStream?: boolean;
        extraArgs?: string;
      };
    }> = [
      ...(payload.tasks ?? []),
      ...tasksFromText.map((url, index) => ({
        url,
        name: `任务_${Date.now()}_${index + 1}`,
        saveName: undefined,
        saveDir: undefined,
        config: undefined
      }))
    ];

    if (taskInputs.length === 0) {
      throw new Error("未解析到有效的 HTTP(S) URL");
    }

    const defaultThreads =
      payload.defaultThreads ?? (await this.settings.get<number>("task.default_threads", 16));

    return this.prisma.$transaction(async (tx) => {
      const created: Task[] = [];

      for (const item of taskInputs) {
        const task = await tx.task.create({
          data: {
            name: item.name ?? deriveTaskName(item.url),
            saveName: item.saveName,
            saveDir: item.saveDir ?? payload.defaultSaveDir,
            url: item.url,
            status: TaskStatus.QUEUED,
            progress: 0,
            speed: null,
            retryCount: 0
          }
        });

        await tx.taskConfig.create({
          data: {
            taskId: task.id,
            userAgent: item.config?.userAgent,
            headers: item.config?.headers,
            proxy: item.config?.proxy,
            threads: item.config?.threads ?? defaultThreads,
            isLiveStream: item.config?.isLiveStream ?? false,
            extraArgs: item.config?.extraArgs
          }
        });

        created.push(task);
      }

      return created;
    });
  }

  async list(options?: {
    status?: TaskStatus;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, options?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, options?.pageSize ?? 20));
    const keyword = options?.keyword?.trim();

    const where: Prisma.TaskWhereInput = {};

    if (options?.status) {
      where.status = options.status;
    }

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { url: { contains: keyword } },
        { saveName: { contains: keyword } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        include: { config: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    return {
      items,
      total,
      page,
      pageSize
    };
  }

  async detail(id: string) {
    return this.prisma.task.findUnique({
      where: { id },
      include: { config: true, mediaFile: true }
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.taskConfig.deleteMany({ where: { taskId: id } }),
      this.prisma.mediaFile.deleteMany({ where: { taskId: id } }),
      this.prisma.task.delete({ where: { id } })
    ]);
  }

  parseBatchAction(raw: unknown) {
    return batchActionSchema.parse(raw);
  }
}

function deriveTaskName(url: string): string {
  const sanitized = url.split("?")[0].split("/").filter(Boolean).pop();
  if (!sanitized) {
    return `task_${Date.now()}`;
  }

  return sanitized.replace(/\.[A-Za-z0-9]+$/, "") || `task_${Date.now()}`;
}

function parseUrlText(urlText?: string): string[] {
  if (!urlText) {
    return [];
  }

  return urlText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => /^https?:\/\//i.test(line));
}
