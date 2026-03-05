import type { MediaFile, SystemInfo, Task, TaskListResponse } from "../types/index.js";

interface ApiResponse<T> {
  data: T;
}

interface TaskDetailResponse {
  data: Task;
  logs: string[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ message: "Request failed" }))) as {
      message?: string;
    };
    throw new Error(payload.message ?? `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

export const api = {
  getTasks(params?: {
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.status) {
      query.set("status", params.status);
    }
    if (params?.keyword) {
      query.set("keyword", params.keyword);
    }
    if (params?.page) {
      query.set("page", String(params.page));
    }
    if (params?.pageSize) {
      query.set("pageSize", String(params.pageSize));
    }

    const suffix = query.toString();
    return request<TaskListResponse>(`/api/tasks${suffix ? `?${suffix}` : ""}`);
  },

  getTask(id: string) {
    return fetch(`/api/tasks/${id}`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({ message: "Request failed" }))) as {
            message?: string;
          };
          throw new Error(payload.message ?? `HTTP ${response.status}`);
        }

        return response.json() as Promise<TaskDetailResponse>;
      });
  },

  createTasks(payload: unknown) {
    return request<Task[]>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  startTask(id: string) {
    return request<Task>(`/api/tasks/${id}/start`, {
      method: "POST"
    });
  },

  stopTask(id: string) {
    return request<Task>(`/api/tasks/${id}/stop`, {
      method: "POST"
    });
  },

  retryTask(id: string) {
    return request<Task>(`/api/tasks/${id}/retry`, {
      method: "POST"
    });
  },

  deleteTask(id: string) {
    return request<void>(`/api/tasks/${id}`, {
      method: "DELETE"
    });
  },

  batchTask(payload: { ids: string[]; action: "start" | "stop" | "delete" }) {
    return request<{ message: string }>("/api/tasks/batch", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  getSettings() {
    return request<Record<string, unknown>>("/api/settings");
  },

  updateSettings(payload: Record<string, unknown>) {
    return request<Record<string, unknown>>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  },

  validateSettingPath(payload: {
    key: "engine.n_m3u8dl_path" | "engine.ffmpeg_path" | "storage.save_dir";
    path?: string;
  }) {
    return request<{
      ok: boolean;
      exists: boolean;
      isExecutable: boolean;
      resolvedPath: string;
      message: string;
    }>("/api/settings/validate-path", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  getSystemInfo() {
    return request<SystemInfo>("/api/system/info");
  },

  getFiles() {
    return request<MediaFile[]>("/api/files");
  },

  deleteFile(id: string) {
    return request<void>(`/api/files/${id}`, {
      method: "DELETE"
    });
  }
};
