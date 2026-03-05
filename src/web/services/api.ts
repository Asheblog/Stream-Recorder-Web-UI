const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${url}`, {
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

// ── Tasks API ──
export const taskApi = {
    list: (params?: { page?: number; pageSize?: number; status?: string; search?: string }) => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set('page', String(params.page));
        if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
        if (params?.status) qs.set('status', params.status);
        if (params?.search) qs.set('search', params.search);
        return request<any>(`/tasks?${qs}`);
    },
    get: (id: string) => request<any>(`/tasks/${id}`),
    create: (data: any) => request<any>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request<any>(`/tasks/${id}`, { method: 'DELETE' }),
    start: (id: string) => request<any>(`/tasks/${id}/start`, { method: 'POST' }),
    stop: (id: string) => request<any>(`/tasks/${id}/stop`, { method: 'POST' }),
    retry: (id: string) => request<any>(`/tasks/${id}/retry`, { method: 'POST' }),
    batch: (action: string, taskIds: string[]) =>
        request<any>('/tasks/batch', { method: 'POST', body: JSON.stringify({ action, taskIds }) }),
};

// ── Files API ──
export const fileApi = {
    list: (params?: { page?: number; pageSize?: number; search?: string }) => {
        const qs = new URLSearchParams();
        if (params?.page) qs.set('page', String(params.page));
        if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
        if (params?.search) qs.set('search', params.search);
        return request<any>(`/files?${qs}`);
    },
    delete: (id: string) => request<any>(`/files/${id}`, { method: 'DELETE' }),
    streamUrl: (id: string) => `${API_BASE}/files/${id}/stream`,
    downloadUrl: (id: string) => `${API_BASE}/files/${id}/download`,
};

// ── Settings API ──
export const settingsApi = {
    getAll: () => request<any>('/settings'),
    update: (data: Record<string, string>) =>
        request<any>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
    testEngine: (path?: string) =>
        request<any>('/settings/test-engine', { method: 'POST', body: JSON.stringify({ path }) }),
    testFfmpeg: (path?: string) =>
        request<any>('/settings/test-ffmpeg', { method: 'POST', body: JSON.stringify({ path }) }),
};

// ── System API ──
export const systemApi = {
    info: () => request<any>('/system/info'),
};
