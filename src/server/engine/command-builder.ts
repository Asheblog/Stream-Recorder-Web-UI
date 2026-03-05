import type { Task, TaskConfig } from "@prisma/client";
import path from "node:path";

export interface BuildCommandInput {
  enginePath: string;
  ffmpegPath: string;
  saveRoot: string;
  task: Task;
  config: TaskConfig | null;
}

export function buildEngineCommand(input: BuildCommandInput): { command: string; args: string[] } {
  const args: string[] = [input.task.url];

  const saveName = input.task.saveName ?? input.task.name;
  const saveDir = input.task.saveDir ? path.join(input.saveRoot, input.task.saveDir) : input.saveRoot;

  args.push("--save-name", saveName);
  args.push("--save-dir", saveDir);
  args.push("--ffmpeg-binary-path", input.ffmpegPath);

  if (input.config?.threads) {
    args.push("--thread-count", String(input.config.threads));
  }
  if (input.config?.userAgent) {
    args.push("--user-agent", input.config.userAgent);
  }
  if (input.config?.proxy) {
    args.push("--custom-proxy", input.config.proxy);
  }
  if (input.config?.headers) {
    args.push("--headers", input.config.headers);
  }
  if (input.config?.isLiveStream) {
    args.push("--live-real-time-merge");
  }
  if (input.config?.extraArgs) {
    args.push(...tokenizeExtraArgs(input.config.extraArgs));
  }

  return { command: input.enginePath, args };
}

function tokenizeExtraArgs(value: string): string[] {
  return value
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean);
}
