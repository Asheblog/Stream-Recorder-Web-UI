import type { PrismaClient, Task, TaskStatus } from "@prisma/client";
import type { Server as SocketServer } from "socket.io";

export interface SystemStats {
  cpu: number;
  memory: number;
  disk: {
    used: number;
    total: number;
    free: number;
  };
  downloadSpeed: string;
}

export interface TaskProgressPayload {
  taskId: string;
  progress: number;
  speed: string;
  fileSize: string;
}

export interface TaskStatusPayload {
  taskId: string;
  status: TaskStatus;
  errorMessage?: string;
}

export interface SchedulerOptions {
  prisma: PrismaClient;
  io: SocketServer;
  mockTickMs?: number;
  mergeDelayMs?: number;
}

export interface AppContext {
  prisma: PrismaClient;
  scheduler: TaskSchedulerLike;
  io: SocketServer;
  systemTicker: NodeJS.Timeout;
}

export interface TaskSchedulerLike {
  requestStart(taskId: string): Promise<Task>;
  stopTask(taskId: string): Promise<Task>;
  retryTask(taskId: string): Promise<Task>;
  removeTask(taskId: string): Promise<void>;
  enqueuePending(): Promise<void>;
  getTaskLogs(taskId: string): string[];
  shutdown(): Promise<void>;
}
