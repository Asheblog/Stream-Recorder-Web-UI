import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getSetting } from '../db.js';

/**
 * Resolve the path to the N_m3u8DL-RE engine binary.
 * Priority: SystemSetting → local bin/ → system PATH
 */
export async function resolveEnginePath(): Promise<string> {
    // 1. Check SystemSetting
    const configPath = await getSetting('engine.n_m3u8dl_path');
    if (configPath && configPath.trim() && fs.existsSync(configPath)) {
        return configPath;
    }

    // 2. Check local bin/ directory
    const exeName = process.platform === 'win32' ? 'N_m3u8DL-RE.exe' : 'N_m3u8DL-RE';
    const localBin = path.join(process.cwd(), 'bin', exeName);
    if (fs.existsSync(localBin)) {
        return localBin;
    }

    // 3. Check system PATH
    try {
        const cmd = process.platform === 'win32' ? 'where N_m3u8DL-RE' : 'which N_m3u8DL-RE';
        const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
        if (result) return result.split('\n')[0].trim();
    } catch {
        // Not found in PATH
    }

    throw new Error(
        'N_m3u8DL-RE engine not found. Please run "npm run setup:engine" or configure the path in Settings.'
    );
}

/**
 * Resolve the path to ffmpeg.
 * Priority: SystemSetting → system PATH
 */
export async function resolveFfmpegPath(): Promise<string> {
    const configPath = await getSetting('engine.ffmpeg_path');
    if (configPath && configPath.trim() && fs.existsSync(configPath)) {
        return configPath;
    }

    // Check system PATH
    try {
        const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
        const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
        if (result) return result.split('\n')[0].trim();
    } catch {
        // Not found
    }

    return 'ffmpeg'; // fallback to PATH
}

/**
 * Check if engine binary is accessible and working
 */
export async function testEngine(enginePath?: string): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
        const ep = enginePath || await resolveEnginePath();
        const output = execSync(`"${ep}" --version`, { encoding: 'utf-8', timeout: 10000 }).trim();
        return { ok: true, version: output.split('\n')[0] };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

/**
 * Check if ffmpeg is accessible
 */
export async function testFfmpeg(ffmpegPath?: string): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
        const fp = ffmpegPath || await resolveFfmpegPath();
        const output = execSync(`"${fp}" -version`, { encoding: 'utf-8', timeout: 10000 }).trim();
        const firstLine = output.split('\n')[0];
        return { ok: true, version: firstLine };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}
