const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const GITHUB_RELEASE_URL = 'https://github.com/nilaoda/N_m3u8DL-RE/releases/latest/download/';

function getPlatformInfo() {
    const platform = os.platform();   // 'linux' | 'darwin' | 'win32'
    const arch = os.arch();           // 'x64' | 'arm64'

    const map = {
        'linux-x64': 'N_m3u8DL-RE_linux-x64',
        'linux-arm64': 'N_m3u8DL-RE_linux-arm64',
        'darwin-x64': 'N_m3u8DL-RE_osx-x64',
        'darwin-arm64': 'N_m3u8DL-RE_osx-arm64',
        'win32-x64': 'N_m3u8DL-RE_win-x64.exe',
    };

    const key = `${platform}-${arch}`;
    const fileName = map[key];
    if (!fileName) {
        throw new Error(`Unsupported platform: ${key}. Supported: ${Object.keys(map).join(', ')}`);
    }

    const localName = platform === 'win32' ? 'N_m3u8DL-RE.exe' : 'N_m3u8DL-RE';
    return { fileName, localName, platform };
}

function downloadFile(url, dest, redirectCount = 0) {
    if (redirectCount > 10) {
        return Promise.reject(new Error('Too many redirects'));
    }

    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const request = client.get(url, {
            headers: { 'User-Agent': 'stream-recorder/1.0' }
        }, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                const redirectUrl = res.headers.location;
                if (!redirectUrl) {
                    return reject(new Error('Redirect without location header'));
                }
                console.log(`  ↳ Redirecting to: ${redirectUrl.substring(0, 80)}...`);
                return downloadFile(redirectUrl, dest, redirectCount + 1).then(resolve).catch(reject);
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            }

            const totalSize = parseInt(res.headers['content-length'] || '0', 10);
            let downloadedSize = 0;

            const file = fs.createWriteStream(dest);
            res.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (totalSize > 0) {
                    const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
                    process.stdout.write(`\r  ↳ Progress: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)} MB)`);
                }
            });
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log('');
                resolve();
            });
            file.on('error', (err) => {
                fs.unlink(dest, () => { });
                reject(err);
            });
        });

        request.on('error', reject);
        request.setTimeout(60000, () => {
            request.destroy();
            reject(new Error('Download timeout (60s)'));
        });
    });
}

async function main() {
    const { fileName, localName, platform } = getPlatformInfo();

    const binDir = path.join(__dirname, '..', 'bin');
    const dest = path.join(binDir, localName);

    // Check if already exists
    if (fs.existsSync(dest)) {
        console.log(`✓ Engine already exists: ${dest}`);
        return;
    }

    // Create bin directory
    fs.mkdirSync(binDir, { recursive: true });

    const url = `${GITHUB_RELEASE_URL}${fileName}`;
    console.log(`⬇ Downloading N_m3u8DL-RE engine...`);
    console.log(`  Platform: ${platform} / ${os.arch()}`);
    console.log(`  File: ${fileName}`);
    console.log(`  URL: ${url}`);

    try {
        await downloadFile(url, dest);

        // Set executable permission on non-Windows platforms
        if (platform !== 'win32') {
            fs.chmodSync(dest, 0o755);
            console.log('  ↳ Set executable permission (755)');
        }

        console.log(`✓ Engine downloaded to: ${dest}`);
    } catch (err) {
        // Clean up partial download
        if (fs.existsSync(dest)) {
            fs.unlinkSync(dest);
        }
        throw err;
    }
}

main().catch((err) => {
    console.error(`✗ Engine download failed: ${err.message}`);
    console.error('');
    console.error('You can manually download N_m3u8DL-RE from:');
    console.error('  https://github.com/nilaoda/N_m3u8DL-RE/releases');
    console.error(`Place the binary in the "bin/" directory as "${getPlatformInfo().localName}"`);
    process.exit(1);
});
