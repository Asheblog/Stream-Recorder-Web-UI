import fs from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { installEngineForCurrentPlatform, resolveReleaseTarget } from '../src/server/engine/engine-installer.js';

async function main(): Promise<void> {
    const forceInstall = process.argv.includes('--force');
    const target = resolveReleaseTarget();
    const binaryPath = path.join(process.cwd(), 'bin', target.localBinaryName);

    if (!forceInstall && fs.existsSync(binaryPath)) {
        try {
            const existingVersion = execFileSync(binaryPath, ['--version'], {
                encoding: 'utf-8',
                timeout: 10_000,
            }).trim().split('\n')[0];

            console.log('Engine already installed and executable.');
            console.log(`  Target: ${target.assetToken}`);
            console.log(`  Path: ${binaryPath}`);
            console.log(`  Version: ${existingVersion}`);
            console.log('Use "npm run setup:engine -- --force" to reinstall latest release.');
            return;
        } catch {
            console.log('Existing engine is not executable, reinstalling...');
        }
    }

    console.log('Downloading N_m3u8DL-RE engine...');
    console.log(`  Target: ${target.assetToken}`);

    const result = await installEngineForCurrentPlatform({
        binDir: path.join(process.cwd(), 'bin'),
        verbose: true,
    });

    const version = execFileSync(result.binaryPath, ['--version'], {
        encoding: 'utf-8',
        timeout: 10_000,
    }).trim().split('\n')[0];

    console.log(`✓ Release: ${result.releaseTag}`);
    console.log(`✓ Asset: ${result.assetName}`);
    console.log(`✓ Installed: ${result.binaryPath}`);
    console.log(`✓ Version: ${version}`);
}

main().catch((error: any) => {
    console.error(`✗ Engine download failed: ${error.message}`);
    console.error('You can manually download N_m3u8DL-RE from:');
    console.error('  https://github.com/nilaoda/N_m3u8DL-RE/releases');
    process.exit(1);
});
