import { describe, expect, it } from 'vitest';
import { pickReleaseAsset, resolveReleaseTarget } from '../../src/server/engine/engine-installer';

const assets = [
    {
        name: 'N_m3u8DL-RE_v0.5.1-beta_linux-x64_20251029.tar.gz',
        browser_download_url: 'https://example.com/linux-x64.tar.gz',
    },
    {
        name: 'N_m3u8DL-RE_v0.5.1-beta_linux-musl-x64_20251029.tar.gz',
        browser_download_url: 'https://example.com/linux-musl-x64.tar.gz',
    },
    {
        name: 'N_m3u8DL-RE_v0.5.1-beta_linux-arm64_20251029.tar.gz',
        browser_download_url: 'https://example.com/linux-arm64.tar.gz',
    },
    {
        name: 'N_m3u8DL-RE_v0.5.1-beta_osx-arm64_20251029.tar.gz',
        browser_download_url: 'https://example.com/osx-arm64.tar.gz',
    },
    {
        name: 'N_m3u8DL-RE_v0.5.1-beta_win-x64_20251029.zip',
        browser_download_url: 'https://example.com/win-x64.zip',
    },
    {
        name: 'N_m3u8DL-RE_v0.5.1-beta_win-arm64_20251029.zip',
        browser_download_url: 'https://example.com/win-arm64.zip',
    },
];

describe('engine-installer', () => {
    describe('resolveReleaseTarget', () => {
        it('resolves linux glibc x64 to linux-x64', () => {
            const target = resolveReleaseTarget({
                platform: 'linux',
                arch: 'x64',
                isMusl: false,
            });
            expect(target.assetToken).toBe('linux-x64');
            expect(target.localBinaryName).toBe('N_m3u8DL-RE');
        });

        it('resolves linux musl x64 to linux-musl-x64', () => {
            const target = resolveReleaseTarget({
                platform: 'linux',
                arch: 'x64',
                isMusl: true,
            });
            expect(target.assetToken).toBe('linux-musl-x64');
            expect(target.localBinaryName).toBe('N_m3u8DL-RE');
        });

        it('resolves windows arm64 to win-arm64', () => {
            const target = resolveReleaseTarget({
                platform: 'win32',
                arch: 'arm64',
                isMusl: false,
            });
            expect(target.assetToken).toBe('win-arm64');
            expect(target.localBinaryName).toBe('N_m3u8DL-RE.exe');
        });
    });

    describe('pickReleaseAsset', () => {
        it('selects musl asset when token is linux-musl-x64', () => {
            const asset = pickReleaseAsset(assets, 'linux-musl-x64');
            expect(asset.name).toContain('_linux-musl-x64_');
            expect(asset.browser_download_url).toBe('https://example.com/linux-musl-x64.tar.gz');
        });

        it('selects windows x64 zip asset', () => {
            const asset = pickReleaseAsset(assets, 'win-x64');
            expect(asset.name).toContain('_win-x64_');
            expect(asset.browser_download_url).toBe('https://example.com/win-x64.zip');
        });

        it('throws when target asset is missing', () => {
            expect(() => pickReleaseAsset(assets, 'osx-x64')).toThrowError(/No release asset matched target "osx-x64"/);
        });
    });
});
