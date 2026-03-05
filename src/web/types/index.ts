export type TaskStatus =
  | "QUEUED"
  | "DOWNLOADING"
  | "MERGING"
  | "COMPLETED"
  | "ERROR"
  | "STOPPED"
  | "RETRYING";

export interface TaskConfig {
  id: string;
  taskId: string;
  userAgent: string | null;
  headers: string | null;
  proxy: string | null;
  threads: number;
  isLiveStream: boolean;
  extraArgs: string | null;
}

export interface Task {
  id: string;
  name: string;
  url: string;
  status: TaskStatus;
  progress: number;
  speed: string | null;
  fileSize: string | null;
  outputPath: string | null;
  saveName: string | null;
  saveDir: string | null;
  processId: number | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  config?: TaskConfig;
  mediaFile?: {
    id: string;
    fileName: string;
    filePath: string;
    mimeType: string;
  } | null;
}

export interface TaskListResponse {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MediaFile {
  id: string;
  taskId: string | null;
  fileName: string;
  filePath: string;
  fileSize: string;
  mimeType: string;
  duration: number | null;
  resolution: string | null;
  createdAt: string;
}

export interface SystemInfo {
  cpu: number;
  memory: number;
  disk: {
    used: number;
    total: number;
    free: number;
  };
  downloadSpeed: string;
}
