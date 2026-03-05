import prisma, { getSetting } from '../db.js';
import { processManager, TaskWithConfig } from './process-manager.js';

class TaskScheduler {
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    private isChecking = false;

    start() {
        // Check every 2 seconds
        this.checkInterval = setInterval(() => this.checkAndDispatch(), 2000);
        console.log('[Scheduler] Started');
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        console.log('[Scheduler] Stopped');
    }

    async checkAndDispatch(): Promise<void> {
        if (this.isChecking) return;
        this.isChecking = true;

        try {
            const maxConcurrentStr = await getSetting('task.max_concurrent') || '3';
            const maxConcurrent = parseInt(maxConcurrentStr, 10);

            // Count currently running tasks
            const runningCount = await prisma.task.count({
                where: { status: { in: ['DOWNLOADING', 'MERGING'] } },
            });

            const availableSlots = maxConcurrent - runningCount;
            if (availableSlots <= 0) return;

            // Get queued tasks, ordered by creation time
            const queuedTasks = await prisma.task.findMany({
                where: { status: 'QUEUED' },
                orderBy: { createdAt: 'asc' },
                take: availableSlots,
                include: { config: true },
            });

            for (const task of queuedTasks) {
                try {
                    const taskWithConfig: TaskWithConfig = {
                        id: task.id,
                        name: task.name,
                        url: task.url,
                        saveName: task.saveName,
                        saveDir: task.saveDir,
                        config: task.config ? {
                            userAgent: task.config.userAgent,
                            headers: task.config.headers,
                            proxy: task.config.proxy,
                            threads: task.config.threads,
                            isLiveStream: task.config.isLiveStream,
                            extraArgs: task.config.extraArgs,
                        } : null,
                    };

                    await processManager.startTask(taskWithConfig);
                    console.log(`[Scheduler] Dispatched task: ${task.name} (${task.id})`);
                } catch (err: any) {
                    console.error(`[Scheduler] Failed to start task ${task.id}:`, err.message);
                    await prisma.task.update({
                        where: { id: task.id },
                        data: {
                            status: 'ERROR',
                            errorMessage: `Failed to start: ${err.message}`,
                        },
                    });
                }
            }
        } catch (err) {
            console.error('[Scheduler] Error during dispatch check:', err);
        } finally {
            this.isChecking = false;
        }
    }

    /**
     * Trigger an immediate check (e.g., after task creation or completion)
     */
    async triggerCheck(): Promise<void> {
        await this.checkAndDispatch();
    }
}

export const taskScheduler = new TaskScheduler();
