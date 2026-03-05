import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { testEngine, testFfmpeg } from '../engine/engine-resolver.js';

const router = Router();

// GET /api/settings - Get all settings
router.get('/', async (_req: Request, res: Response) => {
    try {
        const settings = await prisma.systemSetting.findMany();
        const result: Record<string, { value: string; description: string | null }> = {};
        for (const s of settings) {
            result[s.key] = { value: s.value, description: s.description };
        }
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/settings - Batch update settings
router.put('/', async (req: Request, res: Response) => {
    try {
        const updates: Record<string, string> = req.body;

        for (const [key, value] of Object.entries(updates)) {
            await prisma.systemSetting.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) },
            });
        }

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/settings/test-engine - Test engine path
router.post('/test-engine', async (req: Request, res: Response) => {
    try {
        const { path: enginePath } = req.body;
        const result = await testEngine(enginePath || undefined);
        res.json(result);
    } catch (err: any) {
        res.json({ ok: false, error: err.message });
    }
});

// POST /api/settings/test-ffmpeg - Test ffmpeg path
router.post('/test-ffmpeg', async (req: Request, res: Response) => {
    try {
        const { path: ffmpegPath } = req.body;
        const result = await testFfmpeg(ffmpegPath || undefined);
        res.json(result);
    } catch (err: any) {
        res.json({ ok: false, error: err.message });
    }
});

export default router;
