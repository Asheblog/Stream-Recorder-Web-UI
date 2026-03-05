export function ProgressBar({ progress }: { progress: number }) {
  const safe = Math.max(0, Math.min(100, progress));

  return (
    <div className="progress-track" aria-label="下载进度">
      <div className="progress-fill" style={{ width: `${safe}%` }} />
      <span className="progress-text">{safe.toFixed(1)}%</span>
    </div>
  );
}
