import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import os from 'os';
import { processManager } from './engine/process-manager.js';
import prisma from './db.js';

let io: SocketIOServer;

function parseSpeedToBytes(speed?: string | null): number {
    if (!speed) {
        return 0;
    }

    const match = speed.trim().match(/([\d.]+)\s*([KMGTP]?B)\s*\/\s*s/i);
    if (!match) {
        return 0;
    }

    const value = Number(match[1]);
    if (!Number.isFinite(value)) {
        return 0;
    }

    const unit = match[2].toUpperCase();
    const unitMap: Record<string, number> = {
        B: 1,
        KB: 1024,
        MB: 1024 ** 2,
        GB: 1024 ** 3,
        TB: 1024 ** 4,
        PB: 1024 ** 5,
    };

    return value * (unitMap[unit] || 1);
}

export function setupWebSocket(server: HttpServer) {
    io = new SocketIOServer(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    // Setup progress callback from engine
    processManager.setProgressCallback((taskId, data) => {
        io.emit('task:progress', {
            taskId,
            progress: data.progress,
            speed: data.speed,
            fileSize: data.fileSize,
        });
    });

    // Setup status callback from engine
    processManager.setStatusCallback((taskId, status, errorMessage) => {
        io.emit('task:statusChange', {
            taskId,
            status,
            errorMessage,
        });
    });

    processManager.setOutputCallback((taskId, line) => {
        io.to(`task:${taskId}`).emit('task:output:append', {
            taskId,
            line,
            ts: Date.now(),
        });
    });

    // System stats push every 5 seconds
    setInterval(async () => {
        const cpus = os.cpus();
        const cpuTotal = cpus.reduce((acc, cpu) => {
            const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
            const idle = cpu.times.idle;
            return { total: acc.total + total, idle: acc.idle + idle };
        }, { total: 0, idle: 0 });
        const cpuUsage = Math.round(((cpuTotal.total - cpuTotal.idle) / cpuTotal.total) * 100);

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);

        let downloadSpeedTotal = 0;
        try {
            const runningTasks = await prisma.task.findMany({
                where: { status: { in: ['DOWNLOADING', 'MERGING'] } },
                select: { speed: true },
            });
            downloadSpeedTotal = runningTasks.reduce((sum, task) => sum + parseSpeedToBytes(task.speed), 0);
        } catch {
            downloadSpeedTotal = 0;
        }

        io.emit('system:stats', {
            cpu: cpuUsage,
            memory: memUsage,
            memTotal: totalMem,
            memUsed: totalMem - freeMem,
            downloadSpeedTotal,
        });
    }, 5000);

    io.on('connection', (socket) => {
        console.log(`[WS] Client connected: ${socket.id}`);

        socket.on('disconnect', () => {
            console.log(`[WS] Client disconnected: ${socket.id}`);
        });

        // Allow client to subscribe to specific task output
        socket.on('task:subscribe', (taskId: string) => {
            socket.join(`task:${taskId}`);
            // Send current output buffer
            const output = processManager.getOutput(taskId);
            const history = processManager.getLogHistory(taskId, 500);
            socket.emit('task:output', { taskId, lines: output });
            if (output.length === 0 && history.length > 0) {
                socket.emit('task:output', { taskId, lines: history });
            }
        });

        socket.on('task:unsubscribe', (taskId: string) => {
            socket.leave(`task:${taskId}`);
        });
    });

    return io;
}

export function getIO(): SocketIOServer {
    return io;
}
