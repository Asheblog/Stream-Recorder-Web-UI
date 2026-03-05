import { ChildProcess, spawn } from 'child_process';
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

class ProcessManager {
    private processes: Map<string, ChildProcess> = new Map();
    private outputBuffers: Map<string, string[]> = new Map();
    private onProgress: ProgressCallback | null = null;
    private onStatusChange: StatusCallback | null = null;
    private lastProgressUpdate: Map<string, number> = new Map();
    private readonly THROTTLE_MS = 300;

    setProgressCallback(cb: ProgressCallback) {
        this.onProgress = cb;
    }

    setStatusCallback(cb: StatusCallback) {
        this.onStatusChange = cb;
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

    async startTask(task: TaskWithConfig): Promise<void> {
        if (this.processes.has(task.id)) {
            throw new Error(`Task ${task.id} is already running`);
        }

        const enginePath = await resolveEnginePath();
        const args = await this.buildArgs(task);

        console.log(`[Engine] Starting task ${task.id}: ${enginePath} ${args.join(' ')}`);

        // Ensure save directory exists
        const saveDir = task.saveDir || await getSetting('storage.save_dir') || './data/videos';
        const fullSaveDir = path.resolve(saveDir);
        if (!fs.existsSync(fullSaveDir)) {
            fs.mkdirSync(fullSaveDir, { recursive: true });
        }

        const child = spawn(enginePath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd(),
        });

        this.processes.set(task.id, child);
        this.outputBuffers.set(task.id, []);

        // Update task with PID
        await prisma.task.update({
            where: { id: task.id },
            data: {
                status: 'DOWNLOADING',
                processId: child.pid || null,
            },
        });

        this.onStatusChange?.call(null, task.id, 'DOWNLOADING');

        // Handle stdout
        child.stdout?.on('data', (data: Buffer) => {
            const lines = data.toString().split(/\r?\n/).filter(Boolean);
            for (const line of lines) {
                this.handleOutputLine(task.id, line);
            }
        });

        // Handle stderr (N_m3u8DL-RE also outputs progress to stderr)
        child.stderr?.on('data', (data: Buffer) => {
            const lines = data.toString().split(/\r?\n/).filter(Boolean);
            for (const line of lines) {
                this.handleOutputLine(task.id, line);
            }
        });

        // Handle process exit
        child.on('close', async (code) => {
            this.processes.delete(task.id);
            this.lastProgressUpdate.delete(task.id);

            console.log(`[Engine] Task ${task.id} exited with code ${code}`);

            try {
                const currentTask = await prisma.task.findUnique({ where: { id: task.id } });
                if (!currentTask) return;

                // If already marked as STOPPED by user, don't change
                if (currentTask.status === 'STOPPED') return;

                if (code === 0) {
                    // Find the output file
                    const outputPath = await this.findOutputFile(task);

                    await prisma.task.update({
                        where: { id: task.id },
                        data: {
                            status: 'COMPLETED',
                            progress: 100,
                            processId: null,
                            completedAt: new Date(),
                            outputPath,
                        },
                    });

                    // Create MediaFile record if output exists
                    if (outputPath && fs.existsSync(outputPath)) {
                        const stats = fs.statSync(outputPath);
                        await prisma.mediaFile.upsert({
                            where: { filePath: outputPath },
                            update: { fileSize: stats.size },
                            create: {
                                taskId: task.id,
                                fileName: path.basename(outputPath),
                                filePath: outputPath,
                                fileSize: stats.size,
                                mimeType: outputPath.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4',
                            },
                        });
                    }

                    this.onStatusChange?.call(null, task.id, 'COMPLETED');
                } else {
                    const errorMsg = `Process exited with code ${code}`;
                    await prisma.task.update({
                        where: { id: task.id },
                        data: {
                            status: 'ERROR',
                            processId: null,
                            errorMessage: errorMsg,
                        },
                    });
                    this.onStatusChange?.call(null, task.id, 'ERROR', errorMsg);
                }
            } catch (err) {
                console.error(`[Engine] Error updating task status for ${task.id}:`, err);
            }
        });

        child.on('error', async (err) => {
            console.error(`[Engine] Process error for task ${task.id}:`, err);
            this.processes.delete(task.id);

            try {
                await prisma.task.update({
                    where: { id: task.id },
                    data: {
                        status: 'ERROR',
                        processId: null,
                        errorMessage: err.message,
                    },
                });
                this.onStatusChange?.call(null, task.id, 'ERROR', err.message);
            } catch (dbErr) {
                console.error(`[Engine] DB error:`, dbErr);
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
            // On Windows, use taskkill with tree flag for graceful stop
            try {
                spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            } catch {
                child.kill('SIGTERM');
            }
        } else {
            // On Linux/macOS, send SIGINT for graceful shutdown
            child.kill('SIGINT');
        }

        // Wait briefly then force kill if still running
        setTimeout(() => {
            if (this.processes.has(taskId)) {
                child.kill('SIGKILL');
            }
        }, 10000);

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
    }

    stopAll(): void {
        for (const [taskId] of this.processes) {
            this.stopTask(taskId).catch(console.error);
        }
    }

    private handleOutputLine(taskId: string, line: string) {
        // Store in buffer (keep last 500 lines)
        const buffer = this.outputBuffers.get(taskId) || [];
        buffer.push(line);
        if (buffer.length > 500) buffer.shift();
        this.outputBuffers.set(taskId, buffer);

        // Parse progress
        const parsed = parseStdoutLine(line);

        // Throttle progress updates
        const now = Date.now();
        const lastUpdate = this.lastProgressUpdate.get(taskId) || 0;
        if (now - lastUpdate < this.THROTTLE_MS && !parsed.status) {
            return;
        }
        this.lastProgressUpdate.set(taskId, now);

        // Update database (fire and forget)
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

        // Emit progress event
        if (parsed.progress !== undefined || parsed.speed || parsed.status) {
            this.onProgress?.call(null, taskId, parsed);
        }

        // Handle status changes from parser
        if (parsed.status === 'merging') {
            this.onStatusChange?.call(null, taskId, 'MERGING');
        }
    }

    private async buildArgs(task: TaskWithConfig): Promise<string[]> {
        const args: string[] = [task.url];

        // Save name
        const saveName = task.saveName || task.name;
        if (saveName) {
            args.push('--save-name', saveName);
        }

        // Save directory
        const saveDir = task.saveDir || await getSetting('storage.save_dir') || './data/videos';
        args.push('--save-dir', path.resolve(saveDir));

        // Thread count
        const defaultThreads = await getSetting('task.default_threads') || '16';
        const threads = task.config?.threads || parseInt(defaultThreads);
        args.push('--thread-count', String(threads));

        // FFmpeg path - let N_m3u8DL-RE know where ffmpeg is
        try {
            const ffmpegPath = await resolveFfmpegPath();
            if (ffmpegPath !== 'ffmpeg') {
                args.push('--ffmpeg-binary-path', ffmpegPath);
            }
        } catch { /* use system default */ }

        // Advanced config
        if (task.config) {
            if (task.config.userAgent) {
                args.push('--custom-hls-key', `User-Agent:${task.config.userAgent}`);
            }
            if (task.config.headers) {
                try {
                    const headers = JSON.parse(task.config.headers);
                    for (const [key, value] of Object.entries(headers)) {
                        args.push('--header', `${key}:${value}`);
                    }
                } catch { /* invalid JSON, skip */ }
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

        // Auto-merge
        args.push('--auto-select');
        args.push('--no-log');

        return args;
    }

    private async findOutputFile(task: TaskWithConfig): Promise<string | null> {
        const saveDir = task.saveDir || await getSetting('storage.save_dir') || './data/videos';
        const fullSaveDir = path.resolve(saveDir);
        const saveName = task.saveName || task.name;

        if (!fs.existsSync(fullSaveDir)) return null;

        // Look for common video extensions
        const extensions = ['.mp4', '.mkv', '.ts'];
        for (const ext of extensions) {
            const filePath = path.join(fullSaveDir, `${saveName}${ext}`);
            if (fs.existsSync(filePath)) return filePath;
        }

        // Try to find any recently created file
        try {
            const files = fs.readdirSync(fullSaveDir)
                .filter(f => extensions.some(ext => f.endsWith(ext)))
                .map(f => ({
                    name: f,
                    path: path.join(fullSaveDir, f),
                    mtime: fs.statSync(path.join(fullSaveDir, f)).mtimeMs,
                }))
                .sort((a, b) => b.mtime - a.mtime);

            if (files.length > 0 && Date.now() - files[0].mtime < 60000) {
                return files[0].path;
            }
        } catch { /* ignore */ }

        return null;
    }
}

export const processManager = new ProcessManager();
