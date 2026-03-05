import { Router, Request, Response } from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { getSetting } from '../db.js';

const router = Router();

// GET /api/system/info - Get system info
router.get('/info', async (_req: Request, res: Response) => {
    try {
        // CPU usage
        const cpus = os.cpus();
        const cpuTotal = cpus.reduce((acc, cpu) => {
            const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
            const idle = cpu.times.idle;
            return { total: acc.total + total, idle: acc.idle + idle };
        }, { total: 0, idle: 0 });
        const cpuUsage = Math.round(((cpuTotal.total - cpuTotal.idle) / cpuTotal.total) * 100);

        // Memory
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsage = Math.round((usedMem / totalMem) * 100);

        // Disk (for save directory)
        const saveDir = await getSetting('storage.save_dir') || './data/videos';
        let disk = { total: 0, free: 0, used: 0, usagePercent: 0 };

        try {
            const resolvedSaveDir = path.resolve(saveDir);
            // Create dir if not exists for disk check
            if (!fs.existsSync(resolvedSaveDir)) {
                fs.mkdirSync(resolvedSaveDir, { recursive: true });
            }

            // Use different methods based on platform
            if (process.platform === 'win32') {
                const { execSync } = await import('child_process');
                const drive = path.parse(resolvedSaveDir).root;
                const output = execSync(`wmic logicaldisk where "DeviceID='${drive.replace('\\', '')}'" get FreeSpace,Size /format:csv`, {
                    encoding: 'utf-8', timeout: 5000,
                });
                const lines = output.trim().split('\n').filter(l => l.trim());
                if (lines.length >= 2) {
                    const parts = lines[lines.length - 1].split(',');
                    if (parts.length >= 3) {
                        disk.free = parseInt(parts[1]) || 0;
                        disk.total = parseInt(parts[2]) || 0;
                        disk.used = disk.total - disk.free;
                        disk.usagePercent = disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0;
                    }
                }
            } else {
                const { execSync } = await import('child_process');
                const output = execSync(`df -B1 "${resolvedSaveDir}" | tail -1`, {
                    encoding: 'utf-8', timeout: 5000,
                });
                const parts = output.trim().split(/\s+/);
                if (parts.length >= 4) {
                    disk.total = parseInt(parts[1]) || 0;
                    disk.used = parseInt(parts[2]) || 0;
                    disk.free = parseInt(parts[3]) || 0;
                    disk.usagePercent = disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0;
                }
            }
        } catch {
            // Disk info not available
        }

        res.json({
            cpu: {
                usage: cpuUsage,
                cores: cpus.length,
                model: cpus[0]?.model || 'Unknown',
            },
            memory: {
                total: totalMem,
                used: usedMem,
                free: freeMem,
                usage: memUsage,
            },
            disk: {
                total: disk.total,
                used: disk.used,
                free: disk.free,
                usage: disk.usagePercent,
            },
            platform: process.platform,
            arch: os.arch(),
            hostname: os.hostname(),
            uptime: os.uptime(),
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
