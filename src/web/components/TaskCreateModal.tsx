import { useMemo, useState } from "react";

interface TaskCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: {
    tasks?: Array<{
      url: string;
      name?: string;
      saveName?: string;
      saveDir?: string;
      config?: {
        userAgent?: string;
        headers?: string;
        proxy?: string;
        threads?: number;
        isLiveStream?: boolean;
        extraArgs?: string;
      };
    }>;
    urlText?: string;
    defaultSaveDir?: string;
  }) => Promise<void>;
}

export function TaskCreateModal({ open, onClose, onCreate }: TaskCreateModalProps) {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [url, setUrl] = useState("");
  const [urlText, setUrlText] = useState("");
  const [name, setName] = useState("");
  const [saveDir, setSaveDir] = useState("");
  const [threads, setThreads] = useState(16);
  const [userAgent, setUserAgent] = useState("");
  const [headers, setHeaders] = useState("");
  const [proxy, setProxy] = useState("");
  const [extraArgs, setExtraArgs] = useState("");
  const [liveStream, setLiveStream] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (mode === "single") {
      return /^https?:\/\//i.test(url.trim());
    }
    return urlText.trim().length > 0;
  }, [mode, url, urlText]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <h3>新建录制任务</h3>
          <button className="ghost-btn" type="button" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="radio-row">
          <label>
            <input
              type="radio"
              checked={mode === "single"}
              onChange={() => setMode("single")}
            />
            单条录制
          </label>
          <label>
            <input
              type="radio"
              checked={mode === "batch"}
              onChange={() => setMode("batch")}
            />
            批量导入
          </label>
        </div>

        {mode === "single" ? (
          <label className="field">
            <span>流媒体 URL</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
          </label>
        ) : (
          <label className="field">
            <span>批量 URL（每行一条）</span>
            <textarea
              value={urlText}
              onChange={(event) => setUrlText(event.target.value)}
              rows={6}
              placeholder="https://a.m3u8"
            />
          </label>
        )}

        <div className="two-column">
          <label className="field">
            <span>保存名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="可选" />
          </label>
          <label className="field">
            <span>保存子目录</span>
            <input value={saveDir} onChange={(event) => setSaveDir(event.target.value)} placeholder="movies" />
          </label>
        </div>

        <details className="advanced-panel">
          <summary>高级参数</summary>
          <div className="two-column">
            <label className="field">
              <span>线程数</span>
              <input
                type="number"
                min={1}
                max={64}
                value={threads}
                onChange={(event) => setThreads(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>代理</span>
              <input value={proxy} onChange={(event) => setProxy(event.target.value)} placeholder="http://127.0.0.1:7890" />
            </label>
          </div>

          <label className="field">
            <span>User-Agent</span>
            <input value={userAgent} onChange={(event) => setUserAgent(event.target.value)} />
          </label>

          <label className="field">
            <span>Headers(JSON字符串)</span>
            <input value={headers} onChange={(event) => setHeaders(event.target.value)} />
          </label>

          <label className="field">
            <span>额外参数</span>
            <input value={extraArgs} onChange={(event) => setExtraArgs(event.target.value)} />
          </label>

          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={liveStream}
              onChange={(event) => setLiveStream(event.target.checked)}
            />
            直播流实时录制
          </label>
        </details>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="secondary-btn" type="button" onClick={onClose}>
            取消
          </button>
          <button
            className="primary-btn"
            type="button"
            disabled={!canSubmit || saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                if (mode === "single") {
                  await onCreate({
                    tasks: [
                      {
                        url: url.trim(),
                        name: name.trim() || undefined,
                        saveName: name.trim() || undefined,
                        saveDir: saveDir.trim() || undefined,
                        config: {
                          threads,
                          userAgent: userAgent.trim() || undefined,
                          headers: headers.trim() || undefined,
                          proxy: proxy.trim() || undefined,
                          extraArgs: extraArgs.trim() || undefined,
                          isLiveStream: liveStream
                        }
                      }
                    ]
                  });
                } else {
                  await onCreate({
                    urlText,
                    ...(saveDir.trim() ? { defaultSaveDir: saveDir.trim() } : {})
                  });
                }

                onClose();
                setUrl("");
                setUrlText("");
                setName("");
                setSaveDir("");
                setUserAgent("");
                setHeaders("");
                setProxy("");
                setExtraArgs("");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "提交中..." : "开始录制"}
          </button>
        </div>
      </div>
    </div>
  );
}
