import { useEffect, useMemo, useState } from "react";

import { api } from "../api/client.js";

interface FormState {
  enginePath: string;
  ffmpegPath: string;
  saveDir: string;
  maxConcurrent: number;
  defaultThreads: number;
  autoRetry: boolean;
  maxRetry: number;
  mode: string;
}

const INITIAL_FORM: FormState = {
  enginePath: "",
  ffmpegPath: "",
  saveDir: "",
  maxConcurrent: 3,
  defaultThreads: 16,
  autoRetry: false,
  maxRetry: 3,
  mode: "mock"
};

export function SettingsPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [savedSnapshot, setSavedSnapshot] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pathCheck, setPathCheck] = useState<{
    engine?: string;
    ffmpeg?: string;
    saveDir?: string;
  }>({});

  useEffect(() => {
    let active = true;
    api.getSettings().then((data) => {
      if (!active) {
        return;
      }

      const next: FormState = {
        enginePath: String(data["engine.n_m3u8dl_path"] ?? ""),
        ffmpegPath: String(data["engine.ffmpeg_path"] ?? ""),
        saveDir: String(data["storage.save_dir"] ?? ""),
        maxConcurrent: Number(data["task.max_concurrent"] ?? 3),
        defaultThreads: Number(data["task.default_threads"] ?? 16),
        autoRetry: Boolean(data["task.auto_retry"] ?? false),
        maxRetry: Number(data["task.max_retry_count"] ?? 3),
        mode: String(data["engine.mode"] ?? "mock")
      };

      setForm(next);
      setSavedSnapshot(next);
    });

    return () => {
      active = false;
    };
  }, []);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedSnapshot), [form, savedSnapshot]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validatePath = async (
    target: "engine" | "ffmpeg" | "saveDir",
    payload: {
      key: "engine.n_m3u8dl_path" | "engine.ffmpeg_path" | "storage.save_dir";
      path: string;
    }
  ) => {
    const result = await api.validateSettingPath(payload);
    setPathCheck((prev) => ({
      ...prev,
      [target]: `${result.ok ? "✓" : "✗"} ${result.message} (${result.resolvedPath})`
    }));
  };

  return (
    <div className="page-shell settings-shell">
      <section className="card">
        <h2>引擎配置</h2>
        <div className="settings-grid">
          <label className="field">
            <span>N_m3u8DL-RE 路径</span>
            <div className="inline-input-row">
              <input className="mono" value={form.enginePath} onChange={(event) => update("enginePath", event.target.value)} />
              <button
                className="secondary-btn"
                type="button"
                onClick={() =>
                  validatePath("engine", {
                    key: "engine.n_m3u8dl_path",
                    path: form.enginePath
                  })
                }
              >
                测试
              </button>
            </div>
            {pathCheck.engine && <small className="path-check-msg">{pathCheck.engine}</small>}
          </label>

          <label className="field">
            <span>FFmpeg 路径</span>
            <div className="inline-input-row">
              <input className="mono" value={form.ffmpegPath} onChange={(event) => update("ffmpegPath", event.target.value)} />
              <button
                className="secondary-btn"
                type="button"
                onClick={() =>
                  validatePath("ffmpeg", {
                    key: "engine.ffmpeg_path",
                    path: form.ffmpegPath
                  })
                }
              >
                测试
              </button>
            </div>
            {pathCheck.ffmpeg && <small className="path-check-msg">{pathCheck.ffmpeg}</small>}
          </label>

          <label className="field">
            <span>引擎模式</span>
            <select value={form.mode} onChange={(event) => update("mode", event.target.value)}>
              <option value="mock">mock（开发/测试）</option>
              <option value="real">real（真实执行）</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>存储配置</h2>
        <label className="field">
          <span>默认保存目录</span>
          <div className="inline-input-row">
            <input className="mono" value={form.saveDir} onChange={(event) => update("saveDir", event.target.value)} />
            <button
              className="secondary-btn"
              type="button"
              onClick={() =>
                validatePath("saveDir", {
                  key: "storage.save_dir",
                  path: form.saveDir
                })
              }
            >
              测试
            </button>
          </div>
          {pathCheck.saveDir && <small className="path-check-msg">{pathCheck.saveDir}</small>}
        </label>
      </section>

      <section className="card">
        <h2>任务配置</h2>
        <div className="settings-grid">
          <label className="field">
            <span>最大并发任务数</span>
            <input
              type="number"
              min={1}
              max={20}
              value={form.maxConcurrent}
              onChange={(event) => update("maxConcurrent", Number(event.target.value))}
            />
          </label>

          <label className="field">
            <span>默认下载线程数</span>
            <input
              type="number"
              min={1}
              max={64}
              value={form.defaultThreads}
              onChange={(event) => update("defaultThreads", Number(event.target.value))}
            />
          </label>

          <label className="field checkbox-line">
            <input
              type="checkbox"
              checked={form.autoRetry}
              onChange={(event) => update("autoRetry", event.target.checked)}
            />
            自动重试失败任务
          </label>

          <label className="field">
            <span>最大重试次数</span>
            <input
              type="number"
              min={0}
              max={10}
              value={form.maxRetry}
              onChange={(event) => update("maxRetry", Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      {dirty && (
        <section className="save-bar">
          <p>检测到未保存的配置修改</p>
          <div>
            <button
              className="secondary-btn"
              type="button"
              onClick={() => {
                setForm(savedSnapshot);
                setMessage("已恢复到上次保存状态");
              }}
            >
              重置
            </button>
            <button
              className="primary-btn"
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setMessage(null);
                try {
                  const payload = {
                    "engine.n_m3u8dl_path": form.enginePath,
                    "engine.ffmpeg_path": form.ffmpegPath,
                    "storage.save_dir": form.saveDir,
                    "task.max_concurrent": form.maxConcurrent,
                    "task.default_threads": form.defaultThreads,
                    "task.auto_retry": form.autoRetry,
                    "task.max_retry_count": form.maxRetry,
                    "engine.mode": form.mode
                  };
                  const updated = await api.updateSettings(payload);

                  const snapshot: FormState = {
                    enginePath: String(updated["engine.n_m3u8dl_path"] ?? form.enginePath),
                    ffmpegPath: String(updated["engine.ffmpeg_path"] ?? form.ffmpegPath),
                    saveDir: String(updated["storage.save_dir"] ?? form.saveDir),
                    maxConcurrent: Number(updated["task.max_concurrent"] ?? form.maxConcurrent),
                    defaultThreads: Number(updated["task.default_threads"] ?? form.defaultThreads),
                    autoRetry: Boolean(updated["task.auto_retry"] ?? form.autoRetry),
                    maxRetry: Number(updated["task.max_retry_count"] ?? form.maxRetry),
                    mode: String(updated["engine.mode"] ?? form.mode)
                  };

                  setForm(snapshot);
                  setSavedSnapshot(snapshot);
                  setMessage("设置已保存");
                } catch (err) {
                  setMessage(`保存失败: ${(err as Error).message}`);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "保存中..." : "保存设置"}
            </button>
          </div>
        </section>
      )}

      {message && <p className="toast-msg">{message}</p>}
    </div>
  );
}
