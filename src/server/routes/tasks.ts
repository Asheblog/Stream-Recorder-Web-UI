import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import prisma, { getSetting } from '../db.js';
import { taskScheduler } from '../engine/task-scheduler.js';
import { processManager } from '../engine/process-manager.js';

const router = Router();

const writeRateBucket = new Map<string, number[]>();
const WRITE_RATE_WINDOW_MS = 10_000;
const WRITE_RATE_LIMIT = 40;

function withWriteRateLimit(req: Request, res: Response): boolean {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const now = Date.now();
    const list = (writeRateBucket.get(ip) || []).filter((ts) => now - ts <= WRITE_RATE_WINDOW_MS);

    if (list.length >= WRITE_RATE_LIMIT) {
        res.status(429).json({ error: '操作过于频繁，请稍后再试' });
        return false;
    }

    list.push(now);
    writeRateBucket.set(ip, list);
    return true;
}

function isValidHttpUrl(raw: string): boolean {
    try {
        const url = new URL(raw);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isSubPath(baseDir: string, targetPath: string): boolean {
    const relative = path.relative(baseDir, targetPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveSaveDir(input?: string | null): Promise<string | null> {
    if (!input || !input.trim()) {
        return null;
    }

    const saveRoot = path.resolve(await getSetting('storage.save_dir') || './data/videos');
    const inputPath = input.trim();
    const resolved = path.resolve(saveRoot, inputPath);

    if (!isSubPath(saveRoot, resolved)) {
        throw new Error('保存目录必须位于默认存储根目录内');
    }

    return resolved;
}

function normalizeHeaders(headers: unknown): string | null {
    if (!headers) {
        return null;
    }

    if (typeof headers === 'string') {
        return headers.trim() ? headers : null;
    }

    if (typeof headers === 'object' && !Array.isArray(headers)) {
        return JSON.stringify(headers);
    }

    return null;
}

// POST /api/tasks - Create task(s)
router.post('/', async (req: Request, res: Response) => {
    try {
        if (!withWriteRateLimit(req, res)) return;

        const { urls, name, saveName, saveDir, config } = req.body;

        const urlList: string[] = Array.isArray(urls) ? urls : [req.body.url || urls];
        const normalizedUrls = urlList.map((u) => String(u || '').trim()).filter(Boolean);

        if (normalizedUrls.length === 0) {
            return res.status(400).json({ error: '至少需要一个 URL' });
        }

        const invalid = normalizedUrls.find((u) => !isValidHttpUrl(u));
        if (invalid) {
            return res.status(400).json({ error: `URL 非法或协议不支持: ${invalid}` });
        }

        const resolvedSaveDir = await resolveSaveDir(saveDir || null);
        const created = [];

        for (let i = 0; i < normalizedUrls.length; i++) {
            const url = normalizedUrls[i];
            const taskName = normalizedUrls.length > 1
                ? `${name || 'Task'}_${i + 1}`
                : (name || 'Untitled');

            const task = await prisma.task.create({
                data: {
                    id: uuidv4(),
                    name: taskName,
                    url,
                    saveName: saveName || null,
                    saveDir: resolvedSaveDir,
                    config: config ? {
                        create: {
                            id: uuidv4(),
                            userAgent: config.userAgent || null,
                            headers: normalizeHeaders(config.headers),
                            proxy: config.proxy || null,
                            threads: config.threads || 16,
                            isLiveStream: config.isLiveStream || false,
                            extraArgs: config.extraArgs || null,
                        },
                    } : undefined,
                },
                include: { config: true },
            });

            created.push(task);
        }

        await taskScheduler.triggerCheck();

        res.status(201).json({ tasks: created });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

// GET /api/tasks - List tasks with pagination and filtering
router.get('/', async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string, 10) || 20));
        const status = req.query.status as string;
        const search = req.query.search as string;

        const where: any = {};
        if (status && status !== 'ALL') {
            where.status = status;
        }
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { url: { contains: search } },
            ];
        }

        const [tasks, total] = await Promise.all([
            prisma.task.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: { config: true },
            }),
            prisma.task.count({ where }),
        ]);

        res.json({
            tasks,
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/tasks/:id/logs - Get persisted history logs
router.get('/:id/logs', async (req: Request, res: Response) => {
    try {
        const taskId = String(req.params.id);
        const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const limit = Math.min(5000, Math.max(1, parseInt((req.query.limit as string) || '2000', 10)));
        const lines = processManager.getLogHistory(task.id, limit);
        res.json({ taskId: task.id, lines });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/tasks/:id - Get task detail
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const taskId = String(req.params.id);
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: { config: true, mediaFile: true },
        });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        const output = processManager.getOutput(task.id);
        const historyCount = processManager.getLogHistory(task.id, 1).length;

        res.json({
            ...task,
            output,
            historyLogAvailable: historyCount > 0,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        if (!withWriteRateLimit(req, res)) return;
        const taskId = String(req.params.id);

        if (processManager.isRunning(taskId)) {
            await processManager.stopTask(taskId);
        }

        await prisma.task.delete({ where: { id: taskId } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tasks/:id/start - Start task
router.post('/:id/start', async (req: Request, res: Response) => {
    try {
        if (!withWriteRateLimit(req, res)) return;
        const taskId = String(req.params.id);

        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        await prisma.task.update({
            where: { id: task.id },
            data: {
                status: 'QUEUED',
                progress: 0,
                speed: null,
                fileSize: null,
                errorMessage: null,
                processId: null,
            },
        });

        await taskScheduler.triggerCheck();
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tasks/:id/stop - Stop task
router.post('/:id/stop', async (req: Request, res: Response) => {
    try {
        if (!withWriteRateLimit(req, res)) return;
        const taskId = String(req.params.id);

        if (processManager.isRunning(taskId)) {
            await processManager.stopTask(taskId);
        } else {
            await prisma.task.update({
                where: { id: taskId },
                data: { status: 'STOPPED', processId: null, speed: null },
            });
        }

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tasks/:id/retry - Retry task
router.post('/:id/retry', async (req: Request, res: Response) => {
    try {
        if (!withWriteRateLimit(req, res)) return;
        const taskId = String(req.params.id);

        const task = await prisma.task.findUnique({ where: { id: taskId } });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        await prisma.task.update({
            where: { id: task.id },
            data: {
                status: 'RETRYING',
                progress: 0,
                speed: null,
                fileSize: null,
                errorMessage: null,
                processId: null,
                retryCount: { increment: 1 },
            },
        });

        await prisma.task.update({
            where: { id: task.id },
            data: { status: 'QUEUED' },
        });

        await taskScheduler.triggerCheck();
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tasks/batch - Batch operations
router.post('/batch', async (req: Request, res: Response) => {
    try {
        if (!withWriteRateLimit(req, res)) return;

        const { action, taskIds } = req.body;
        if (!Array.isArray(taskIds) || taskIds.length === 0) {
            return res.status(400).json({ error: 'taskIds required' });
        }

        switch (action) {
            case 'start':
                await prisma.task.updateMany({
                    where: { id: { in: taskIds } },
                    data: {
                        status: 'QUEUED',
                        progress: 0,
                        speed: null,
                        fileSize: null,
                        errorMessage: null,
                        processId: null,
                    },
                });
                await taskScheduler.triggerCheck();
                break;

            case 'retry':
                await prisma.task.updateMany({
                    where: { id: { in: taskIds } },
                    data: {
                        status: 'RETRYING',
                        progress: 0,
                        speed: null,
                        fileSize: null,
                        errorMessage: null,
                        processId: null,
                    },
                });
                await prisma.task.updateMany({
                    where: { id: { in: taskIds } },
                    data: { status: 'QUEUED' },
                });
                for (const id of taskIds) {
                    await prisma.task.update({
                        where: { id },
                        data: { retryCount: { increment: 1 } },
                    });
                }
                await taskScheduler.triggerCheck();
                break;

            case 'stop':
                for (const id of taskIds) {
                    try {
                        if (processManager.isRunning(id)) {
                            await processManager.stopTask(id);
                        } else {
                            await prisma.task.update({
                                where: { id },
                                data: { status: 'STOPPED', processId: null, speed: null },
                            });
                        }
                    } catch {
                        // skip failed item
                    }
                }
                break;

            case 'delete':
                for (const id of taskIds) {
                    try {
                        if (processManager.isRunning(id)) {
                            await processManager.stopTask(id);
                        }
                    } catch {
                        // skip
                    }
                }
                await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
                break;

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
