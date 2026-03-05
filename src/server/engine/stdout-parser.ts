export interface ParsedProgress {
  progress: number;
  speed: string;
  fileSize: string;
}

const PROGRESS_REGEX = /(?<progress>\d{1,3}(?:\.\d+)?)%\s+(?<speed>\d+(?:\.\d+)?\s*[KMG]B\/s)\s+(?<size>\d+(?:\.\d+)?\s*[KMG]B)/i;

export function parseStdoutLine(line: string): ParsedProgress | null {
  const matched = PROGRESS_REGEX.exec(line);
  if (!matched || !matched.groups) {
    return null;
  }

  const progress = Number(matched.groups.progress);
  if (Number.isNaN(progress)) {
    return null;
  }

  return {
    progress: Math.min(100, Math.max(0, progress)),
    speed: matched.groups.speed.trim(),
    fileSize: matched.groups.size.trim()
  };
}
