import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;

export const DEFAULT_SETTINGS = [
    { key: 'engine.n_m3u8dl_path', value: '', description: 'N_m3u8DL-RE 可执行文件路径（空则自动查找）' },
    { key: 'engine.ffmpeg_path', value: '', description: 'FFmpeg 可执行文件路径（空则使用系统 PATH）' },
    { key: 'storage.save_dir', value: './data/videos', description: '全局默认视频保存根目录' },
    { key: 'storage.temp_dir', value: './data/tmp', description: '临时文件目录（切片与中间文件）' },
    { key: 'storage.cleanup_temp_files', value: 'true', description: '任务完成后自动清理临时文件' },
    { key: 'task.max_concurrent', value: '3', description: '最大同时运行任务数' },
    { key: 'task.default_threads', value: '16', description: '默认下载线程数' },
    { key: 'task.default_output_format', value: 'mp4', description: '默认输出封装格式（mp4/mkv/ts）' },
    { key: 'task.auto_retry', value: 'false', description: '是否自动重试失败任务' },
    { key: 'task.max_retry_count', value: '3', description: '最大自动重试次数' },
];

export async function initializeDatabase() {
    // Create default settings if they don't exist
    for (const setting of DEFAULT_SETTINGS) {
        await prisma.systemSetting.upsert({
            where: { key: setting.key },
            update: {},
            create: setting,
        });
    }
    console.log('✓ Database initialized with default settings');
}

export async function getSetting(key: string): Promise<string | null> {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    return setting?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
    await prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
    });
}
