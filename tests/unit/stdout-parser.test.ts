import { describe, it, expect } from 'vitest';
import { parseStdoutLine } from '../../src/server/engine/stdout-parser';

describe('stdout-parser', () => {
    describe('parseStdoutLine', () => {
        it('should parse progress with speed', () => {
            const result = parseStdoutLine('[DL] 45.2% 12.5MB/s');
            expect(result.progress).toBeCloseTo(45.2);
            expect(result.speed).toBe('12.5MB/s');
            expect(result.status).toBe('downloading');
        });

        it('should parse progress only', () => {
            const result = parseStdoutLine('Progress: 78.5%');
            expect(result.progress).toBeCloseTo(78.5);
            expect(result.status).toBe('downloading');
        });

        it('should parse Vid/Aud combined progress', () => {
            const result = parseStdoutLine('Vid 45.20% 12.5MB/s | Aud 67.30% 1.2MB/s');
            expect(result.progress).toBeCloseTo(45.2); // uses lower
            expect(result.status).toBe('downloading');
        });

        it('should detect merging status', () => {
            const result = parseStdoutLine('[Mux] Muxing video and audio...');
            expect(result.status).toBe('merging');
        });

        it('should detect completion', () => {
            const result = parseStdoutLine('[Done] Done!');
            expect(result.status).toBe('completed');
            expect(result.progress).toBe(100);
        });

        it('should detect error', () => {
            const result = parseStdoutLine('[ERROR] Connection timeout after 30s');
            expect(result.status).toBe('error');
            expect(result.errorMessage).toContain('Connection timeout');
        });

        it('should parse file size', () => {
            const result = parseStdoutLine('[DL] 50% 1.2GB downloaded');
            expect(result.fileSize).toBe('1.2GB');
        });

        it('should clamp progress to 0-100', () => {
            const result = parseStdoutLine('Progress: 150%');
            expect(result.progress).toBe(100);
        });

        it('should handle empty line', () => {
            const result = parseStdoutLine('');
            expect(result.progress).toBeUndefined();
            expect(result.status).toBeUndefined();
        });

        it('should preserve raw line', () => {
            const result = parseStdoutLine('some random output');
            expect(result.raw).toBe('some random output');
        });

        it('should parse speed with space', () => {
            const result = parseStdoutLine('45% 12.5 MB/s');
            expect(result.progress).toBeCloseTo(45);
        });
    });
});
