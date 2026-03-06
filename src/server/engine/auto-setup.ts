import path from 'path';
import { resolveEnginePath, testEngine } from './engine-resolver.js';
import { installEngineForCurrentPlatform, resolveReleaseTarget } from './engine-installer.js';

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
        const target = resolveReleaseTarget();
        console.log(`  Target: ${target.assetToken}`);
        console.log('  Downloading from GitHub release assets...');
        const installed = await installEngineForCurrentPlatform({
            binDir: path.join(process.cwd(), 'bin'),
        });
        console.log(`  Asset: ${installed.assetName}`);
        console.log(`  Release: ${installed.releaseTag}`);
        console.log(`  Installed: ${installed.binaryPath}`);

        // Verify the downloaded binary works
        const verifyResult = await testEngine(installed.binaryPath);
        if (verifyResult.ok) {
            console.log(`✓ Engine downloaded and verified: ${installed.binaryPath}`);
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
