/**
 * Parse N_m3u8DL-RE stdout output to extract progress information.
 * 
 * N_m3u8DL-RE outputs progress in various formats. Common patterns:
 * - [DL] 45.2% 12.5MB/s 1.2GB
 * - Vid 45.20% 12.5MB/s | Aud 67.30% 1.2MB/s
 * - [Mux] Muxing...  
 * - [Done] Done!
 * - [ERROR] ...error message...
 */

export interface ParsedProgress {
    progress?: number;      // 0-100
    speed?: string;         // e.g., "12.5MB/s"
    fileSize?: string;      // e.g., "1.2GB"
    status?: 'downloading' | 'merging' | 'completed' | 'error';
    errorMessage?: string;
    raw: string;
}

// Patterns for N_m3u8DL-RE output
const PATTERNS = {
    // Match percentage + speed: "45.20% 12.5MB/s" or "45.2%"
    progressWithSpeed: /(\d+\.?\d*)%\s+([\d.]+\s*[KkMmGg]?[Bb]\/s)/,
    // Match just percentage
    progressOnly: /(\d+\.?\d*)%/,
    // Match file size patterns: "1.2GB" or "456MB" or "1.2 GB"
    fileSize: /([\d.]+)\s*([KkMmGg][Bb])/,
    // Match download speed: "12.5MB/s" or "1.2 GB/s"
    speed: /([\d.]+)\s*([KkMmGg]?[Bb]\/s)/,
    // Merging/Muxing indicators
    merging: /\[(?:Mux|Mix|Merge|mux|mix|merge)\]|[Mm]uxing|[Mm]erging|混流/i,
    // Completion indicators
    completed: /\[(?:Done|done|DONE)\]|[Dd]one!|完成|Successfully/i,
    // Error indicators
    error: /\[(?:ERROR|Error|error)\]|(?:异常|失败|错误)|Exception|failed/i,
    // Video + Audio progress: "Vid 45.20% 12.5MB/s | Aud 67.30% 1.2MB/s"
    vidAudProgress: /[Vv]id\s+(\d+\.?\d*)%.*?[Aa]ud\s+(\d+\.?\d*)%/,
};

export function parseStdoutLine(line: string): ParsedProgress {
    const result: ParsedProgress = { raw: line };
    const trimmed = line.trim();

    if (!trimmed) return result;

    // Check for error first
    if (PATTERNS.error.test(trimmed)) {
        result.status = 'error';
        result.errorMessage = trimmed.replace(/\[(?:ERROR|Error|error)\]\s*/, '');
        return result;
    }

    // Check for completion
    if (PATTERNS.completed.test(trimmed)) {
        result.status = 'completed';
        result.progress = 100;
        return result;
    }

    // Check for merging
    if (PATTERNS.merging.test(trimmed)) {
        result.status = 'merging';
        return result;
    }

    // Try to extract Vid/Aud combined progress
    const vidAudMatch = trimmed.match(PATTERNS.vidAudProgress);
    if (vidAudMatch) {
        const vidProgress = parseFloat(vidAudMatch[1]);
        const audProgress = parseFloat(vidAudMatch[2]);
        // Use the lower progress as overall
        result.progress = Math.min(vidProgress, audProgress);
        result.status = 'downloading';
    }

    // Try to extract progress + speed
    if (result.progress === undefined) {
        const pwsMatch = trimmed.match(PATTERNS.progressWithSpeed);
        if (pwsMatch) {
            result.progress = parseFloat(pwsMatch[1]);
            result.speed = pwsMatch[2];
            result.status = 'downloading';
        } else {
            const pMatch = trimmed.match(PATTERNS.progressOnly);
            if (pMatch) {
                result.progress = parseFloat(pMatch[1]);
                result.status = 'downloading';
            }
        }
    }

    // Try to extract speed if not already found
    if (!result.speed) {
        const speedMatch = trimmed.match(PATTERNS.speed);
        if (speedMatch) {
            result.speed = speedMatch[0];
        }
    }

    // Try to extract file size
    const sizeMatch = trimmed.match(PATTERNS.fileSize);
    if (sizeMatch) {
        result.fileSize = sizeMatch[0];
    }

    // Clamp progress
    if (result.progress !== undefined) {
        result.progress = Math.max(0, Math.min(100, result.progress));
    }

    return result;
}
