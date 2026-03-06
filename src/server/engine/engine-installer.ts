import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import http from 'http';
import { spawnSync } from 'child_process';

const GITHUB_RELEASE_API = 'https://api.github.com/repos/nilaoda/N_m3u8DL-RE/releases/latest';
const MAX_REDIRECTS = 10;
const DEFAULT_TIMEOUT_MS = 300_000;

export interface ReleaseAsset {
    name: string;
    browser_download_url: string;
}

export interface ReleaseTarget {
    platform: NodeJS.Platform;
    arch: string;
    isMusl: boolean;
    assetToken: string;
    localBinaryName: string;
    archiveType: 'tar.gz' | 'zip';
}

interface ReleaseApiResponse {
    tag_name: string;
    assets: ReleaseAsset[];
}

export interface InstallEngineOptions {
    binDir?: string;
    platform?: NodeJS.Platform;
    arch?: string;
    isMusl?: boolean;
    timeoutMs?: number;
    verbose?: boolean;
}

export interface InstallEngineResult {
    binaryPath: string;
    assetName: string;
    releaseTag: string;
    downloadUrl: string;
    target: ReleaseTarget;
}

function getLocalBinaryName(platform: NodeJS.Platform): string {
    return platform === 'win32' ? 'N_m3u8DL-RE.exe' : 'N_m3u8DL-RE';
}

function detectMuslRuntime(): boolean {
    if (process.platform !== 'linux') {
        return false;
    }

    if (typeof process.report?.getReport === 'function') {
        const report = process.report.getReport();
        const glibcVersion = (report as any)?.header?.glibcVersionRuntime;
        if (glibcVersion) {
            return false;
        }
        return true;
    }

    return fs.existsSync('/etc/alpine-release');
}

export function resolveReleaseTarget(input?: {
    platform?: NodeJS.Platform;
    arch?: string;
    isMusl?: boolean;
}): ReleaseTarget {
    const platform = input?.platform ?? process.platform;
    const arch = input?.arch ?? os.arch();
    const isMusl = input?.isMusl ?? detectMuslRuntime();

    if (platform === 'linux') {
        if (arch === 'x64') {
            return {
                platform,
                arch,
                isMusl,
                assetToken: isMusl ? 'linux-musl-x64' : 'linux-x64',
                localBinaryName: getLocalBinaryName(platform),
                archiveType: 'tar.gz',
            };
        }

        if (arch === 'arm64') {
            return {
                platform,
                arch,
                isMusl,
                assetToken: isMusl ? 'linux-musl-arm64' : 'linux-arm64',
                localBinaryName: getLocalBinaryName(platform),
                archiveType: 'tar.gz',
            };
        }
    }

    if (platform === 'darwin') {
        if (arch === 'x64' || arch === 'arm64') {
            return {
                platform,
                arch,
                isMusl: false,
                assetToken: `osx-${arch}`,
                localBinaryName: getLocalBinaryName(platform),
                archiveType: 'tar.gz',
            };
        }
    }

    if (platform === 'win32') {
        if (arch === 'x64' || arch === 'arm64') {
            return {
                platform,
                arch,
                isMusl: false,
                assetToken: `win-${arch}`,
                localBinaryName: getLocalBinaryName(platform),
                archiveType: 'zip',
            };
        }
    }

    throw new Error(
        `Unsupported runtime target: platform=${platform}, arch=${arch}. ` +
        'Supported targets: linux(x64/arm64), darwin(x64/arm64), win32(x64/arm64).'
    );
}

export function pickReleaseAsset(assets: ReleaseAsset[], assetToken: string): ReleaseAsset {
    const marker = `_${assetToken}_`;
    const matched = assets.find((asset) => asset.name.includes(marker));
    if (!matched) {
        const available = assets.map((asset) => asset.name).join(', ');
        throw new Error(
            `No release asset matched target "${assetToken}". Available assets: ${available}`
        );
    }
    return matched;
}

function readResponseBody(res: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
    });
}

function requestJson<T>(url: string, timeoutMs: number, redirectCount = 0): Promise<T> {
    if (redirectCount > MAX_REDIRECTS) {
        return Promise.reject(new Error('Too many redirects'));
    }

    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(
            url,
            {
                headers: {
                    'User-Agent': 'stream-recorder/1.0',
                    Accept: 'application/vnd.github+json',
                },
            },
            async (res) => {
                const statusCode = res.statusCode ?? 0;
                const location = res.headers.location;

                if ([301, 302, 307, 308].includes(statusCode) && location) {
                    const nextUrl = new URL(location, url).toString();
                    try {
                        const data = await requestJson<T>(nextUrl, timeoutMs, redirectCount + 1);
                        resolve(data);
                    } catch (error) {
                        reject(error);
                    }
                    return;
                }

                if (statusCode !== 200) {
                    const body = await readResponseBody(res);
                    reject(new Error(`HTTP ${statusCode} while requesting ${url}. Response: ${body.slice(0, 200)}`));
                    return;
                }

                try {
                    const body = await readResponseBody(res);
                    resolve(JSON.parse(body) as T);
                } catch (error: any) {
                    reject(new Error(`Failed to parse JSON from ${url}: ${error.message}`));
                }
            }
        );

        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Request timeout (${timeoutMs}ms)`));
        });
    });
}

function downloadFile(url: string, dest: string, timeoutMs: number, redirectCount = 0): Promise<void> {
    if (redirectCount > MAX_REDIRECTS) {
        return Promise.reject(new Error('Too many redirects'));
    }

    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(
            url,
            {
                headers: {
                    'User-Agent': 'stream-recorder/1.0',
                    Accept: 'application/octet-stream',
                },
            },
            (res) => {
                const statusCode = res.statusCode ?? 0;
                const location = res.headers.location;

                if ([301, 302, 307, 308].includes(statusCode) && location) {
                    const nextUrl = new URL(location, url).toString();
                    downloadFile(nextUrl, dest, timeoutMs, redirectCount + 1).then(resolve).catch(reject);
                    return;
                }

                if (statusCode !== 200) {
                    reject(new Error(`HTTP ${statusCode} while downloading ${url}`));
                    return;
                }

                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
                file.on('error', (error) => {
                    fs.unlink(dest, () => { });
                    reject(error);
                });
            }
        );

        req.on('error', reject);
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Download timeout (${timeoutMs}ms)`));
        });
    });
}

function downloadFileWithNativeTool(url: string, dest: string): void {
    if (process.platform === 'win32') {
        const escapedUrl = url.replace(/'/g, "''");
        const escapedDest = dest.replace(/'/g, "''");
        const command = `Invoke-WebRequest -Uri '${escapedUrl}' -OutFile '${escapedDest}'`;
        const result = spawnSync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', command],
            { encoding: 'utf-8' }
        );
        if (result.status !== 0) {
            throw new Error(
                `PowerShell download failed. stderr=${result.stderr?.trim() || 'n/a'} stdout=${result.stdout?.trim() || 'n/a'}`
            );
        }
        return;
    }

    const result = spawnSync(
        'curl',
        ['-L', '--fail', '--retry', '3', '--connect-timeout', '20', '-o', dest, url],
        { encoding: 'utf-8' }
    );
    if (result.status !== 0) {
        throw new Error(
            `curl download failed. stderr=${result.stderr?.trim() || 'n/a'} stdout=${result.stdout?.trim() || 'n/a'}`
        );
    }
}

function extractTarGz(archivePath: string, outputDir: string): void {
    const result = spawnSync('tar', ['-xzf', archivePath, '-C', outputDir], { encoding: 'utf-8' });
    if (result.status !== 0) {
        throw new Error(
            `Failed to extract tar.gz archive. stderr=${result.stderr?.trim() || 'n/a'} stdout=${result.stdout?.trim() || 'n/a'}`
        );
    }
}

function extractZip(archivePath: string, outputDir: string): void {
    if (process.platform === 'win32') {
        const escapedArchive = archivePath.replace(/'/g, "''");
        const escapedOutput = outputDir.replace(/'/g, "''");
        const command = `Expand-Archive -LiteralPath '${escapedArchive}' -DestinationPath '${escapedOutput}' -Force`;
        const result = spawnSync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', command],
            { encoding: 'utf-8' }
        );
        if (result.status !== 0) {
            throw new Error(
                `Failed to extract zip archive with PowerShell. stderr=${result.stderr?.trim() || 'n/a'} stdout=${result.stdout?.trim() || 'n/a'}`
            );
        }
        return;
    }

    const unzipResult = spawnSync('unzip', ['-o', archivePath, '-d', outputDir], { encoding: 'utf-8' });
    if (unzipResult.status !== 0) {
        throw new Error(
            `Failed to extract zip archive. stderr=${unzipResult.stderr?.trim() || 'n/a'} stdout=${unzipResult.stdout?.trim() || 'n/a'}`
        );
    }
}

function findFileRecursively(rootDir: string, fileName: string): string | null {
    const stack = [rootDir];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const entryPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(entryPath);
                continue;
            }
            if (entry.isFile() && entry.name === fileName) {
                return entryPath;
            }
        }
    }

    return null;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLatestRelease(timeoutMs: number): Promise<{ tagName: string; assets: ReleaseAsset[] }> {
    const json = await requestJson<ReleaseApiResponse>(GITHUB_RELEASE_API, timeoutMs);
    return {
        tagName: json.tag_name,
        assets: json.assets || [],
    };
}

export async function installEngineForCurrentPlatform(options: InstallEngineOptions = {}): Promise<InstallEngineResult> {
    const log = (message: string): void => {
        if (options.verbose) {
            console.log(message);
        }
    };

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const target = resolveReleaseTarget({
        platform: options.platform,
        arch: options.arch,
        isMusl: options.isMusl,
    });
    const binDir = options.binDir ?? path.join(process.cwd(), 'bin');
    const binaryPath = path.join(binDir, target.localBinaryName);

    log('  [installer] Fetching latest release metadata...');
    const { tagName, assets } = await fetchLatestRelease(timeoutMs);
    log(`  [installer] Release: ${tagName}, assets: ${assets.length}`);
    const asset = pickReleaseAsset(assets, target.assetToken);
    log(`  [installer] Matched asset: ${asset.name}`);

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-recorder-engine-'));
    const archiveExt = asset.name.endsWith('.zip') ? '.zip' : '.tar.gz';
    const archivePath = path.join(tempRoot, `engine${archiveExt}`);
    const extractDir = path.join(tempRoot, 'extract');

    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        let lastDownloadError: Error | null = null;
        const maxAttempts = 2;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                log(`  [installer] Downloading archive (attempt ${attempt}/${maxAttempts})...`);
                await downloadFile(asset.browser_download_url, archivePath, timeoutMs);
                lastDownloadError = null;
                break;
            } catch (error: any) {
                lastDownloadError = error instanceof Error ? error : new Error(String(error));
                if (fs.existsSync(archivePath)) {
                    fs.unlinkSync(archivePath);
                }
                if (attempt === maxAttempts) {
                    break;
                }
                log(`  [installer] Download failed: ${lastDownloadError.message}`);
                log('  [installer] Retrying with node downloader...');
                await sleep(800 * attempt);
            }
        }

        if (lastDownloadError) {
            log(`  [installer] Node downloader failed: ${lastDownloadError.message}`);
            log('  [installer] Falling back to native downloader...');
            downloadFileWithNativeTool(asset.browser_download_url, archivePath);
        }

        log(`  [installer] Archive downloaded: ${archivePath}`);

        if (archiveExt === '.zip') {
            log('  [installer] Extracting zip...');
            extractZip(archivePath, extractDir);
        } else {
            log('  [installer] Extracting tar.gz...');
            extractTarGz(archivePath, extractDir);
        }
        log('  [installer] Extracted archive, locating binary...');

        const sourceBinary = findFileRecursively(extractDir, target.localBinaryName);
        if (!sourceBinary) {
            throw new Error(
                `Installed archive did not contain "${target.localBinaryName}". asset=${asset.name}`
            );
        }

        log(`  [installer] Copying binary from ${sourceBinary} to ${binaryPath}`);
        fs.copyFileSync(sourceBinary, binaryPath);
        if (target.platform !== 'win32') {
            fs.chmodSync(binaryPath, 0o755);
        }
        log('  [installer] Install completed');

        return {
            binaryPath,
            assetName: asset.name,
            releaseTag: tagName,
            downloadUrl: asset.browser_download_url,
            target,
        };
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}
