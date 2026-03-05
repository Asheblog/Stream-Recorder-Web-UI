import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db.js';
import { taskScheduler } from '../engine/task-scheduler.js';
import { processManager } from '../engine/process-manager.js';

const router = Router();

// POST /api/tasks - Create task(s)
router.post('/', async (req: Request, res: Response) => {
    try {
        const { urls, name, saveName, saveDir, config } = req.body;

        // Support both single and batch creation
        const urlList: string[] = Array.isArray(urls) ? urls : [req.body.url || urls];
        const created = [];

        for (let i = 0; i < urlList.length; i++) {
            const url = urlList[i]?.trim();
            if (!url) continue;

            const taskName = urlList.length > 1 ? `${name || 'Task'}_${i + 1}` : (name || 'Untitled');

            const task = await prisma.task.create({
                data: {
                    id: uuidv4(),
                    name: taskName,
                    url,
                    saveName: saveName || null,
                    saveDir: saveDir || null,
                    config: config ? {
                        create: {
                            id: uuidv4(),
                            userAgent: config.userAgent || null,
                            headers: config.headers ? JSON.stringify(config.headers) : null,
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

        // Trigger scheduler
        taskScheduler.triggerCheck();

        res.status(201).json({ tasks: created });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

// GET /api/tasks - List tasks with pagination and filtering
router.get('/', async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
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

// GET /api/tasks/:id - Get task detail
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const task = await prisma.task.findUnique({
            where: { id: req.params.id },
            include: { config: true, mediaFile: true },
        });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        // Include engine output if running
        const output = processManager.getOutput(task.id);
        res.json({ ...task, output });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        // Stop if running
        if (processManager.isRunning(req.params.id)) {
            await processManager.stopTask(req.params.id);
        }
        await prisma.task.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tasks/:id/start - Start task
router.post('/:id/start', async (req: Request, res: Response) => {
    try {
        const task = await prisma.task.findUnique({
            where: { id: req.params.id },
            include: { config: true },
        });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        await prisma.task.update({
            where: { id: task.id },
            data: { status: 'QUEUED', progress: 0, errorMessage: null },
        });

        taskScheduler.triggerCheck();
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tasks/:id/stop - Stop task
router.post('/:id/stop', async (req: Request, res: Response) => {
    try {
        if (processManager.isRunning(req.params.id)) {
            await processManager.stopTask(req.params.id);
        } else {
            await prisma.task.update({
                where: { id: req.params.id },
                data: { status: 'STOPPED' },
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
        const task = await prisma.task.findUnique({ where: { id: req.params.id } });
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
                retryCount: { increment: 1 },
            },
        });

        taskScheduler.triggerCheck();
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/tasks/batch - Batch operations
router.post('/batch', async (req: Request, res: Response) => {
    try {
        const { action, taskIds } = req.body;
        if (!Array.isArray(taskIds) || taskIds.length === 0) {
            return res.status(400).json({ error: 'taskIds required' });
        }

        let results: any[] = [];

        switch (action) {
            case 'start':
                await prisma.task.updateMany({
                    where: { id: { in: taskIds } },
                    data: { status: 'QUEUED', progress: 0, errorMessage: null },
                });
                taskScheduler.triggerCheck();
                break;

            case 'stop':
                for (const id of taskIds) {
                    try {
                        if (processManager.isRunning(id)) {
                            await processManager.stopTask(id);
                        } else {
                            await prisma.task.update({
                                where: { id },
                                data: { status: 'STOPPED' },
                            });
                        }
                    } catch { /* skip */ }
                }
                break;

            case 'delete':
                for (const id of taskIds) {
                    try {
                        if (processManager.isRunning(id)) {
                            await processManager.stopTask(id);
                        }
                    } catch { /* skip */ }
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
