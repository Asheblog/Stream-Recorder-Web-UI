import os from 'os';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { resolveEnginePath, testEngine } from './engine-resolver.js';

const GITHUB_RELEASE_URL = 'https://github.com/nilaoda/N_m3u8DL-RE/releases/latest/download/';

function getPlatformInfo() {
    const platform = os.platform();
    const arch = os.arch();

    const map: Record<string, string> = {
        'linux-x64': 'N_m3u8DL-RE_linux-x64',
        'linux-arm64': 'N_m3u8DL-RE_linux-arm64',
        'darwin-x64': 'N_m3u8DL-RE_osx-x64',
        'darwin-arm64': 'N_m3u8DL-RE_osx-arm64',
        'win32-x64': 'N_m3u8DL-RE_win-x64.exe',
    };

    const key = `${platform}-${arch}`;
    const fileName = map[key];
    if (!fileName) {
        throw new Error(`Unsupported platform: ${key}`);
    }

    const localName = platform === 'win32' ? 'N_m3u8DL-RE.exe' : 'N_m3u8DL-RE';
    return { fileName, localName, platform };
}

function downloadFile(url: string, dest: string, redirectCount = 0): Promise<void> {
    if (redirectCount > 10) {
        return Promise.reject(new Error('Too many redirects'));
    }

    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const request = client.get(url, {
            headers: { 'User-Agent': 'stream-recorder/1.0' },
        }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode || 0)) {
                const redirectUrl = res.headers.location;
                if (!redirectUrl) return reject(new Error('Redirect without location'));
                console.log(`  ↳ Redirecting...`);
                return downloadFile(redirectUrl, dest, redirectCount + 1).then(resolve).catch(reject);
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            }

            const totalSize = parseInt(res.headers['content-length'] || '0', 10);
            let downloadedSize = 0;

            const file = fs.createWriteStream(dest);
            res.on('data', (chunk: Buffer) => {
                downloadedSize += chunk.length;
                if (totalSize > 0) {
                    const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
                    process.stdout.write(`\r  ↳ Downloading: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)} MB)`);
                }
            });
            res.pipe(file);
            file.on('finish', () => { file.close(); console.log(''); resolve(); });
            file.on('error', (err) => { fs.unlink(dest, () => { }); reject(err); });
        });

        request.on('error', reject);
        request.setTimeout(120000, () => { request.destroy(); reject(new Error('Download timeout')); });
    });
}

/**
 * Check if the engine is available, and auto-download if not found.
 * Called during server startup.
 */
export async function ensureEngine(): Promise<void> {
    console.log('[Engine] Checking N_m3u8DL-RE engine...');

    // First try to find an existing engine
    try {
        const enginePath = await resolveEnginePath();
        const result = await testEngine(enginePath);
        if (result.ok) {
            console.log(`✓ Engine found: ${enginePath}`);
            if (result.version) console.log(`  Version: ${result.version}`);
            return;
        }
    } catch {
        // Engine not found, proceed to download
    }

    console.log('[Engine] Engine not found, starting auto-download...');

    try {
        const { fileName, localName, platform } = getPlatformInfo();
        const binDir = path.join(process.cwd(), 'bin');
        const dest = path.join(binDir, localName);

        // Create bin directory
        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        }

        // Check if binary already exists but failed test (maybe permissions issue)
        if (fs.existsSync(dest)) {
            console.log(`  Binary exists at ${dest} but failed test, re-downloading...`);
            fs.unlinkSync(dest);
        }

        const url = `${GITHUB_RELEASE_URL}${fileName}`;
        console.log(`  Platform: ${platform} / ${os.arch()}`);
        console.log(`  File: ${fileName}`);
        console.log(`  Downloading from GitHub...`);

        await downloadFile(url, dest);

        // Set executable permission on non-Windows
        if (platform !== 'win32') {
            fs.chmodSync(dest, 0o755);
            console.log('  ↳ Set executable permission');
        }

        // Verify the downloaded binary works
        const verifyResult = await testEngine(dest);
        if (verifyResult.ok) {
            console.log(`✓ Engine downloaded and verified: ${dest}`);
            if (verifyResult.version) console.log(`  Version: ${verifyResult.version}`);
        } else {
            console.warn(`⚠ Engine downloaded but verification failed: ${verifyResult.error}`);
            console.warn('  The engine may still work for downloading. Proceeding...');
        }
    } catch (err: any) {
        console.error(`✗ Auto-download failed: ${err.message}`);
        console.error('  You can manually download N_m3u8DL-RE from:');
        console.error('  https://github.com/nilaoda/N_m3u8DL-RE/releases');
        console.error('  Place the binary in the "bin/" directory');
        console.error('  ⚠ Server will continue without engine — tasks will fail until engine is available.');
    }
}
