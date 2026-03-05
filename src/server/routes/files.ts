import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../db.js';

const router = Router();

// GET /api/files - List media files
router.get('/', async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
        const search = req.query.search as string;

        const where: any = {};
        if (search) {
            where.fileName = { contains: search };
        }

        const [files, total] = await Promise.all([
            prisma.mediaFile.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            prisma.mediaFile.count({ where }),
        ]);

        // Convert BigInt to string for JSON serialization
        const serializedFiles = files.map(f => ({
            ...f,
            fileSize: f.fileSize.toString(),
        }));

        res.json({
            files: serializedFiles,
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/files/:id/stream - Stream video (supports Range requests)
router.get('/:id/stream', async (req: Request, res: Response) => {
    try {
        const file = await prisma.mediaFile.findUnique({ where: { id: req.params.id } });
        if (!file) return res.status(404).json({ error: 'File not found' });

        if (!fs.existsSync(file.filePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        const stat = fs.statSync(file.filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;

            const stream = fs.createReadStream(file.filePath, { start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': file.mimeType,
            });
            stream.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': file.mimeType,
            });
            fs.createReadStream(file.filePath).pipe(res);
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/files/:id/download - Download file
router.get('/:id/download', async (req: Request, res: Response) => {
    try {
        const file = await prisma.mediaFile.findUnique({ where: { id: req.params.id } });
        if (!file) return res.status(404).json({ error: 'File not found' });

        if (!fs.existsSync(file.filePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        fs.createReadStream(file.filePath).pipe(res);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/files/:id - Delete file
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const file = await prisma.mediaFile.findUnique({ where: { id: req.params.id } });
        if (!file) return res.status(404).json({ error: 'File not found' });

        // Delete from disk
        if (fs.existsSync(file.filePath)) {
            fs.unlinkSync(file.filePath);
        }

        // Delete from database
        await prisma.mediaFile.delete({ where: { id: req.params.id } });

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
