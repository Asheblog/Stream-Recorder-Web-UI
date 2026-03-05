import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketEvents {
    onProgress?: (data: { taskId: string; progress?: number; speed?: string; fileSize?: string }) => void;
    onStatusChange?: (data: { taskId: string; status: string; errorMessage?: string }) => void;
    onSystemStats?: (data: { cpu: number; memory: number; memTotal: number; memUsed: number }) => void;
    onTaskOutput?: (data: { taskId: string; lines: string[] }) => void;
}

export function useWebSocket(events: SocketEvents) {
    const socketRef = useRef<Socket | null>(null);
    const eventsRef = useRef(events);
    eventsRef.current = events;

    useEffect(() => {
        const socket = io(window.location.origin, {
            transports: ['websocket', 'polling'],
        });

        socketRef.current = socket;

        socket.on('task:progress', (data) => {
            eventsRef.current.onProgress?.(data);
        });

        socket.on('task:statusChange', (data) => {
            eventsRef.current.onStatusChange?.(data);
        });

        socket.on('system:stats', (data) => {
            eventsRef.current.onSystemStats?.(data);
        });

        socket.on('task:output', (data) => {
            eventsRef.current.onTaskOutput?.(data);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const subscribeTask = useCallback((taskId: string) => {
        socketRef.current?.emit('task:subscribe', taskId);
    }, []);

    const unsubscribeTask = useCallback((taskId: string) => {
        socketRef.current?.emit('task:unsubscribe', taskId);
    }, []);

    return { subscribeTask, unsubscribeTask };
}
