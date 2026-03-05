import { useEffect } from "react";
import { io } from "socket.io-client";

import type { TaskStatus } from "../types/index.js";

const socket = io({
  autoConnect: true,
  transports: ["websocket"]
});

interface UseSocketTaskOptions {
  onProgress?: (payload: { taskId: string; progress: number; speed: string; fileSize: string }) => void;
  onStatus?: (payload: { taskId: string; status: TaskStatus; errorMessage?: string }) => void;
  onSystemStats?: (payload: unknown) => void;
}

export function useSocketTasks(options: UseSocketTaskOptions) {
  useEffect(() => {
    if (options.onProgress) {
      socket.on("task:progress", options.onProgress);
    }
    if (options.onStatus) {
      socket.on("task:statusChange", options.onStatus);
    }
    if (options.onSystemStats) {
      socket.on("system:stats", options.onSystemStats);
    }

    return () => {
      if (options.onProgress) {
        socket.off("task:progress", options.onProgress);
      }
      if (options.onStatus) {
        socket.off("task:statusChange", options.onStatus);
      }
      if (options.onSystemStats) {
        socket.off("system:stats", options.onSystemStats);
      }
    };
  }, [options]);
}
