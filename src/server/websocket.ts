import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import os from 'os';
import { processManager } from './engine/process-manager.js';

let io: SocketIOServer;

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

    // System stats push every 5 seconds
    setInterval(() => {
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

        io.emit('system:stats', {
            cpu: cpuUsage,
            memory: memUsage,
            memTotal: totalMem,
            memUsed: totalMem - freeMem,
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
            socket.emit('task:output', { taskId, lines: output });
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
