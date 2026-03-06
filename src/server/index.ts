import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import prisma, { initializeDatabase } from './db.js';
import { setupWebSocket } from './websocket.js';
import { taskScheduler } from './engine/task-scheduler.js';
import { ensureEngine } from './engine/auto-setup.js';
import taskRoutes from './routes/tasks.js';
import fileRoutes from './routes/files.js';
import settingRoutes from './routes/settings.js';
import systemRoutes from './routes/system.js';

const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/tasks', taskRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/system', systemRoutes);

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistPath = path.join(__dirname, '..', 'web');
const webDistPathAlt = path.join(process.cwd(), 'dist', 'web');

const staticPath = fs.existsSync(webDistPath) ? webDistPath : webDistPathAlt;
if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
    // SPA fallback
    app.get('*', (_req, res) => {
        res.sendFile(path.join(staticPath, 'index.html'));
    });
}

// Setup WebSocket
setupWebSocket(server);

// Start server
const PORT = parseInt(process.env.PORT || '3000');

async function start() {
    try {
        // Ensure data directory exists
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Ensure videos directory exists
        const videosDir = path.join(process.cwd(), 'data', 'videos');
        if (!fs.existsSync(videosDir)) {
            fs.mkdirSync(videosDir, { recursive: true });
        }

        // Ensure temp and logs directories exist
        const tempDir = path.join(process.cwd(), 'data', 'tmp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const logsDir = path.join(process.cwd(), 'data', 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        // Initialize database
        await initializeDatabase();

        // Check & auto-download engine
        await ensureEngine();

        // Start task scheduler
        taskScheduler.start();

        // Start HTTP server
        server.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log('╔═══════════════════════════════════════════╗');
            console.log('║    🎬 Stream Recorder Web UI              ║');
            console.log(`║    Server running on port ${PORT}             ║`);
            console.log(`║    http://localhost:${PORT}                    ║`);
            console.log('╚═══════════════════════════════════════════╝');
            console.log('');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n[Server] Shutting down...');
            taskScheduler.stop();
            await prisma.$disconnect();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('\n[Server] Shutting down...');
            taskScheduler.stop();
            await prisma.$disconnect();
            process.exit(0);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();
