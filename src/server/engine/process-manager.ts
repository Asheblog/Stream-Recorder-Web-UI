import { ChildProcess, spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import prisma, { getSetting } from '../db.js';
import { resolveEnginePath, resolveFfmpegPath } from './engine-resolver.js';
import { parseStdoutLine, ParsedProgress } from './stdout-parser.js';

export interface TaskWithConfig {
    id: string;
    name: string;
    url: string;
    saveName?: string | null;
    saveDir?: string | null;
    config?: {
        userAgent?: string | null;
        headers?: string | null;
        proxy?: string | null;
        threads?: number;
        isLiveStream?: boolean;
        extraArgs?: string | null;
    } | null;
}

export type ProgressCallback = (taskId: string, data: ParsedProgress) => void;
export type StatusCallback = (taskId: string, status: string, errorMessage?: string) => void;
export type OutputCallback = (taskId: string, line: string) => void;

const DEFAULT_LOG_LIMIT = 2000;

function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function normalizeOutputFormat(value: string | null): 'mp4' | 'mkv' | 'ts' {
    const format = (value || '').trim().toLowerCase();
    if (format === 'mkv' || format === 'ts') {
        return format;
    }
    return 'mp4';
}

function hasExtension(name: string): boolean {
    return /\.[a-z0-9]+$/i.test(name);
}

function parseHeaders(raw: string): Array<[string, string]> {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return [];
    }
    return Object.entries(data)
        .filter(([k, v]) => typeof k === 'string' && typeof v === 'string') as Array<[string, string]>;
}

class ProcessManager {
    private processes: Map<string, ChildProcess> = new Map();
    private outputBuffers: Map<string, string[]> = new Map();
    private onProgress: ProgressCallback | null = null;
    private onStatusChange: StatusCallback | null = null;
    private onOutputLine: OutputCallback | null = null;
    private lastProgressUpdate: Map<string, number> = new Map();
    private readonly THROTTLE_MS = 300;
    private readonly logsDir = path.join(process.cwd(), 'data', 'logs');

    setProgressCallback(cb: ProgressCallback) {
        this.onProgress = cb;
    }

    setStatusCallback(cb: StatusCallback) {
        this.onStatusChange = cb;
    }

    setOutputCallback(cb: OutputCallback) {
        this.onOutputLine = cb;
    }

    getRunningCount(): number {
        return this.processes.size;
    }

    isRunning(taskId: string): boolean {
        return this.processes.has(taskId);
    }

    getOutput(taskId: string): string[] {
        return this.outputBuffers.get(taskId) || [];
    }

    getLogFilePath(taskId: string): string {
        return path.join(this.logsDir, `${taskId}.log`);
    }

    getTaskTempDir(taskId: string, tempRoot?: string): string {
        const root = tempRoot ? path.resolve(tempRoot) : path.resolve(path.join(process.cwd(), 'data', 'tmp'));
        return path.join(root, taskId);
    }

    getLogHistory(taskId: string, limit = DEFAULT_LOG_LIMIT): string[] {
        const logPath = this.getLogFilePath(taskId);
        if (!fs.existsSync(logPath)) {
            return [];
        }

        const text = fs.readFileSync(logPath, 'utf-8');
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length <= limit) {
            return lines;
        }
        return lines.slice(lines.length - limit);
    }

    async startTask(task: TaskWithConfig): Promise<void> {
        if (this.processes.has(task.id)) {
            throw new Error(`Task ${task.id} is already running`);
        }

        const enginePath = await resolveEnginePath();
        const args = await this.buildArgs(task);

        console.log(`[Engine] Starting task ${task.id}: ${enginePath} ${args.join(' ')}`);

        const saveDir = task.saveDir || await getSetting('storage.save_dir') || './data/videos';
        const fullSaveDir = path.resolve(saveDir);
        const tempRoot = path.resolve(await getSetting('storage.temp_dir') || './data/tmp');
        const taskTempDir = this.getTaskTempDir(task.id, tempRoot);

        ensureDir(fullSaveDir);
        ensureDir(taskTempDir);
        ensureDir(this.logsDir);

        const logPath = this.getLogFilePath(task.id);
        if (!fs.existsSync(logPath)) {
            fs.writeFileSync(logPath, '', 'utf-8');
        }

        const child = spawn(enginePath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd(),
            windowsHide: true,
        });

        this.processes.set(task.id, child);
        this.outputBuffers.set(task.id, []);

        await prisma.task.update({
            where: { id: task.id },
            data: {
                status: 'DOWNLOADING',
                processId: child.pid || null,
                errorMessage: null,
            },
        });

        this.onStatusChange?.call(null, task.id, 'DOWNLOADING');

        child.stdout?.on('data', (data: Buffer) => {
            const lines = data.toString().split(/\r?\n/).filter(Boolean);
            for (const line of lines) {
                this.handleOutputLine(task.id, line);
            }
        });

        child.stderr?.on('data', (data: Buffer) => {
            const lines = data.toString().split(/\r?\n/).filter(Boolean);
            for (const line of lines) {
                this.handleOutputLine(task.id, line);
            }
        });

        child.on('close', async (code) => {
            this.processes.delete(task.id);
            this.lastProgressUpdate.delete(task.id);

            console.log(`[Engine] Task ${task.id} exited with code ${code}`);

            try {
                const currentTask = await prisma.task.findUnique({ where: { id: task.id } });
                if (!currentTask) return;

                if (currentTask.status === 'STOPPED') return;

                if (code === 0) {
                    const outputPath = await this.findOutputFile(task);
                    const metadata = outputPath ? await this.getMediaMetadata(outputPath) : null;

                    await prisma.task.update({
                        where: { id: task.id },
                        data: {
                            status: 'COMPLETED',
                            progress: 100,
                            processId: null,
                            speed: null,
                            completedAt: new Date(),
                            outputPath,
                        },
                    });

                    if (outputPath && fs.existsSync(outputPath)) {
                        const stats = fs.statSync(outputPath);
                        await prisma.mediaFile.upsert({
                            where: { filePath: outputPath },
                            update: {
                                fileSize: BigInt(stats.size),
                                mimeType: metadata?.mimeType || this.guessMimeType(outputPath),
                                duration: metadata?.duration ?? null,
                                resolution: metadata?.resolution ?? null,
                            },
                            create: {
                                taskId: task.id,
                                fileName: path.basename(outputPath),
                                filePath: outputPath,
                                fileSize: BigInt(stats.size),
                                mimeType: metadata?.mimeType || this.guessMimeType(outputPath),
                                duration: metadata?.duration ?? null,
                                resolution: metadata?.resolution ?? null,
                            },
                        });
                    }

                    this.onStatusChange?.call(null, task.id, 'COMPLETED');
                    await this.cleanupTaskTempDir(task.id);
                    return;
                }

                await this.handleTaskFailure(task.id, currentTask.retryCount, `Process exited with code ${code}`);
                await this.cleanupTaskTempDir(task.id);
            } catch (err) {
                console.error(`[Engine] Error updating task status for ${task.id}:`, err);
            }
        });

        child.on('error', async (err) => {
            console.error(`[Engine] Process error for task ${task.id}:`, err);
            this.processes.delete(task.id);

            try {
                const currentTask = await prisma.task.findUnique({ where: { id: task.id } });
                if (!currentTask) return;
                await this.handleTaskFailure(task.id, currentTask.retryCount, err.message);
                await this.cleanupTaskTempDir(task.id);
            } catch (dbErr) {
                console.error('[Engine] DB error:', dbErr);
            }
        });
    }

    async stopTask(taskId: string): Promise<void> {
        const child = this.processes.get(taskId);
        if (!child) {
            throw new Error(`No running process for task ${taskId}`);
        }

        console.log(`[Engine] Stopping task ${taskId} (PID: ${child.pid})`);

        if (process.platform === 'win32') {
            try {
                spawn('taskkill', ['/PID', String(child.pid), '/T'], { stdio: 'ignore', windowsHide: true });
            } catch {
                child.kill('SIGTERM');
            }
        } else {
            child.kill('SIGINT');
        }

        setTimeout(() => {
            if (!this.processes.has(taskId)) {
                return;
            }

            if (process.platform === 'win32') {
                try {
                    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
                } catch {
                    child.kill('SIGKILL');
                }
            } else {
                child.kill('SIGKILL');
            }
        }, 8000);

        await prisma.task.update({
            where: { id: taskId },
            data: {
                status: 'STOPPED',
                processId: null,
                speed: null,
            },
        });

        this.processes.delete(taskId);
        this.onStatusChange?.call(null, taskId, 'STOPPED');
        setTimeout(() => {
            this.cleanupTaskTempDir(taskId).catch(() => { });
        }, 10_000);
    }

    stopAll(): void {
        for (const [taskId] of this.processes) {
            this.stopTask(taskId).catch(console.error);
        }
    }

    private async handleTaskFailure(taskId: string, currentRetryCount: number, errorMessage: string): Promise<void> {
        const autoRetry = (await getSetting('task.auto_retry')) === 'true';
        const maxRetryCount = parseInt(await getSetting('task.max_retry_count') || '3', 10);

        if (autoRetry && currentRetryCount < maxRetryCount) {
            await prisma.task.update({
                where: { id: taskId },
                data: {
                    status: 'RETRYING',
                    processId: null,
                    speed: null,
                    errorMessage,
                    retryCount: { increment: 1 },
                },
            });

            this.onStatusChange?.call(null, taskId, 'RETRYING', errorMessage);

            setTimeout(async () => {
                try {
                    await prisma.task.update({
                        where: { id: taskId },
                        data: {
                            status: 'QUEUED',
                            progress: 0,
                            speed: null,
                            fileSize: null,
                            processId: null,
                        },
                    });

                    const { taskScheduler } = await import('./task-scheduler.js');
                    await taskScheduler.triggerCheck();
                } catch (err) {
                    console.error(`[Engine] Failed to enqueue retry task ${taskId}:`, err);
                }
            }, 1200);

            return;
        }

        await prisma.task.update({
            where: { id: taskId },
            data: {
                status: 'ERROR',
                processId: null,
                errorMessage,
            },
        });

        this.onStatusChange?.call(null, taskId, 'ERROR', errorMessage);
    }

    private handleOutputLine(taskId: string, line: string): void {
        const buffer = this.outputBuffers.get(taskId) || [];
        buffer.push(line);
        if (buffer.length > 500) {
            buffer.shift();
        }
        this.outputBuffers.set(taskId, buffer);

        const logPath = this.getLogFilePath(taskId);
        try {
            ensureDir(this.logsDir);
            fs.appendFileSync(logPath, `${line}\n`, 'utf-8');
        } catch {
            // ignore log write errors
        }

        this.onOutputLine?.call(null, taskId, line);

        const parsed = parseStdoutLine(line);

        const now = Date.now();
        const lastUpdate = this.lastProgressUpdate.get(taskId) || 0;
        if (now - lastUpdate < this.THROTTLE_MS && !parsed.status) {
            return;
        }
        this.lastProgressUpdate.set(taskId, now);

        if (parsed.progress !== undefined || parsed.speed || parsed.fileSize) {
            const updateData: any = {};
            if (parsed.progress !== undefined) updateData.progress = parsed.progress;
            if (parsed.speed) updateData.speed = parsed.speed;
            if (parsed.fileSize) updateData.fileSize = parsed.fileSize;
            if (parsed.status === 'merging') updateData.status = 'MERGING';

            prisma.task.update({
                where: { id: taskId },
                data: updateData,
            }).catch(() => { });
        }

        if (parsed.progress !== undefined || parsed.speed || parsed.status) {
            this.onProgress?.call(null, taskId, parsed);
        }

        if (parsed.status === 'merging') {
            this.onStatusChange?.call(null, taskId, 'MERGING');
        }
    }

    private async buildArgs(task: TaskWithConfig): Promise<string[]> {
        const args: string[] = [task.url];

        const outputFormat = normalizeOutputFormat(await getSetting('task.default_output_format'));
        const saveNameRaw = (task.saveName || task.name || '').trim();
        const saveName = hasExtension(saveNameRaw) ? saveNameRaw : `${saveNameRaw}.${outputFormat}`;

        if (saveName) {
            args.push('--save-name', saveName);
        }

        const saveDir = task.saveDir || await getSetting('storage.save_dir') || './data/videos';
        args.push('--save-dir', path.resolve(saveDir));

        const tempDir = await getSetting('storage.temp_dir') || './data/tmp';
        args.push('--tmp-dir', this.getTaskTempDir(task.id, tempDir));

        const defaultThreads = await getSetting('task.default_threads') || '16';
        const threads = task.config?.threads || parseInt(defaultThreads, 10);
        args.push('--thread-count', String(threads));

        try {
            const ffmpegPath = await resolveFfmpegPath();
            if (ffmpegPath !== 'ffmpeg') {
                args.push('--ffmpeg-binary-path', ffmpegPath);
            }
        } catch {
            // keep default ffmpeg in PATH
        }

        if (task.config) {
            if (task.config.userAgent) {
                args.push('--header', `User-Agent:${task.config.userAgent}`);
            }

            if (task.config.headers) {
                try {
                    const headers = parseHeaders(task.config.headers);
                    for (const [key, value] of headers) {
                        args.push('--header', `${key}:${value}`);
                    }
                } catch {
                    // ignore invalid headers json
                }
            }

            if (task.config.proxy) {
                args.push('--custom-proxy', task.config.proxy);
            }

            if (task.config.isLiveStream) {
                args.push('--live-perform-as-vod');
            }

            if (task.config.extraArgs) {
                args.push(...task.config.extraArgs.split(/\s+/).filter(Boolean));
            }
        }

        args.push('--auto-select');

        return args;
    }

    private async findOutputFile(task: TaskWithConfig): Promise<string | null> {
        const saveDir = task.saveDir || await getSetting('storage.save_dir') || './data/videos';
        const fullSaveDir = path.resolve(saveDir);
        const outputFormat = normalizeOutputFormat(await getSetting('task.default_output_format'));

        const saveNameRaw = (task.saveName || task.name || '').trim();
        const saveName = hasExtension(saveNameRaw) ? saveNameRaw : `${saveNameRaw}.${outputFormat}`;

        if (!fs.existsSync(fullSaveDir)) {
            return null;
        }

        const directPath = path.join(fullSaveDir, saveName);
        if (fs.existsSync(directPath)) {
            return directPath;
        }

        const preferredExtOrder = [`.${outputFormat}`, '.mp4', '.mkv', '.ts'];
        const uniqueExtOrder = Array.from(new Set(preferredExtOrder));

        for (const ext of uniqueExtOrder) {
            const filePath = path.join(fullSaveDir, `${saveNameRaw}${ext}`);
            if (fs.existsSync(filePath)) {
                return filePath;
            }
        }

        try {
            const files = fs.readdirSync(fullSaveDir)
                .filter((f) => uniqueExtOrder.some((ext) => f.toLowerCase().endsWith(ext)))
                .map((f) => {
                    const filePath = path.join(fullSaveDir, f);
                    return {
                        name: f,
                        path: filePath,
                        mtime: fs.statSync(filePath).mtimeMs,
                    };
                })
                .sort((a, b) => b.mtime - a.mtime);

            if (files.length > 0 && Date.now() - files[0].mtime < 60_000) {
                return files[0].path;
            }
        } catch {
            // ignore
        }

        return null;
    }

    private guessMimeType(filePath: string): string {
        if (filePath.toLowerCase().endsWith('.mkv')) return 'video/x-matroska';
        if (filePath.toLowerCase().endsWith('.ts')) return 'video/mp2t';
        return 'video/mp4';
    }

    private async resolveFfprobePath(): Promise<string> {
        const ffmpegPath = await resolveFfmpegPath();
        if (ffmpegPath === 'ffmpeg') {
            return 'ffprobe';
        }

        const candidate = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, (_m, ext) => `ffprobe${ext || ''}`);
        if (fs.existsSync(candidate)) {
            return candidate;
        }

        return 'ffprobe';
    }

    private async getMediaMetadata(filePath: string): Promise<{ duration: number | null; resolution: string | null; mimeType: string }> {
        const ffprobePath = await this.resolveFfprobePath();
        const result = spawnSync(
            ffprobePath,
            ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', filePath],
            { encoding: 'utf-8', timeout: 10_000, windowsHide: true }
        );

        if (result.status !== 0 || !result.stdout) {
            return {
                duration: null,
                resolution: null,
                mimeType: this.guessMimeType(filePath),
            };
        }

        try {
            const parsed = JSON.parse(result.stdout);
            const stream = parsed?.streams?.[0];
            const width = Number(stream?.width || 0);
            const height = Number(stream?.height || 0);
            const durationRaw = parsed?.format?.duration;
            const duration = durationRaw ? Math.round(Number(durationRaw)) : null;

            return {
                duration: Number.isFinite(duration || 0) ? duration : null,
                resolution: width > 0 && height > 0 ? `${width}x${height}` : null,
                mimeType: this.guessMimeType(filePath),
            };
        } catch {
            return {
                duration: null,
                resolution: null,
                mimeType: this.guessMimeType(filePath),
            };
        }
    }

    private async cleanupTaskTempDir(taskId: string): Promise<void> {
        const shouldCleanup = (await getSetting('storage.cleanup_temp_files')) !== 'false';
        if (!shouldCleanup) {
            return;
        }

        const tempRoot = await getSetting('storage.temp_dir') || './data/tmp';
        const taskTempDir = this.getTaskTempDir(taskId, tempRoot);
        if (fs.existsSync(taskTempDir)) {
            fs.rmSync(taskTempDir, { recursive: true, force: true });
        }
    }
}

export const processManager = new ProcessManager();
