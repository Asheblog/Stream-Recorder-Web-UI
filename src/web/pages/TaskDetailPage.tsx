import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Pause, Play, Trash2 } from "lucide-react";

import { api } from "../api/client.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { useSocketTasks } from "../hooks/useSocketTasks.js";
import type { Task } from "../types/index.js";

export function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id ?? "";

  const [task, setTask] = useState<Task | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"info" | "config" | "history">("info");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      return;
    }

    let active = true;
    const load = async () => {
      const detail = await api.getTask(taskId);
      if (!active) {
        return;
      }

      setTask(detail.data);
      setLogs(detail.logs ?? []);
    };

    load()
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));

    const timer = setInterval(load, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [taskId]);

  useSocketTasks({
    onProgress(update) {
      if (!task || update.taskId !== task.id) {
        return;
      }
      setTask((previous) =>
        previous
          ? {
              ...previous,
              progress: update.progress,
              speed: update.speed,
              fileSize: update.fileSize
            }
          : previous
      );
      setLogs((prev) => [...prev.slice(-398), `${new Date().toISOString()} [DL] ${update.progress.toFixed(1)}% ${update.speed}`]);
    },
    onStatus(update) {
      if (!task || update.taskId !== task.id) {
        return;
      }
      setTask((previous) =>
        previous
          ? {
              ...previous,
              status: update.status,
              errorMessage: update.errorMessage ?? null
            }
          : previous
      );
      setLogs((prev) => [...prev.slice(-398), `${new Date().toISOString()} [INFO] 状态变更: ${update.status}`]);
    }
  });

  const stats = useMemo(() => {
    if (!task) {
      return [];
    }

    return [
      { label: "进度", value: `${task.progress.toFixed(1)}%` },
      { label: "速度", value: task.speed ?? "--" },
      { label: "已下载", value: task.fileSize ?? "--" },
      { label: "重试", value: `${task.retryCount}` },
      { label: "PID", value: task.processId ? String(task.processId) : "--" }
    ];
  }, [task]);

  if (!taskId) {
    return <div className="card">任务ID不存在</div>;
  }

  if (loading) {
    return <div className="card">加载中...</div>;
  }

  if (error || !task) {
    return <div className="card">加载失败：{error ?? "任务不存在"}</div>;
  }

  return (
    <div className="page-shell task-detail-shell">
      <section className="card detail-header">
        <div>
          <Link to="/tasks" className="back-link">
            ← 返回任务列表
          </Link>
          <h2>{task.name}</h2>
          <p className="muted">{task.url}</p>
        </div>

        <div className="header-actions">
          <StatusBadge status={task.status} />
          <button className="secondary-btn" onClick={() => api.startTask(task.id)}>
            <Play size={16} /> 启动
          </button>
          <button className="secondary-btn" onClick={() => api.stopTask(task.id)}>
            <Pause size={16} /> 暂停
          </button>
          <button className="danger-btn" onClick={() => api.deleteTask(task.id)}>
            <Trash2 size={16} /> 删除
          </button>
        </div>
      </section>

      <section className="stats-grid detail-stats">
        {stats.map((item) => (
          <article className="stat-card plain" key={item.label}>
            <p>{item.label}</p>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="detail-columns">
        <article className="card preview-panel">
          <h3>视频预览</h3>
          {task.mediaFile?.id ? (
            <video
              className="detail-video-player"
              controls
              preload="metadata"
              src={`/api/files/${task.mediaFile.id}/stream`}
            >
              你的浏览器不支持视频播放
            </video>
          ) : (
            <div className="preview-box">
              <div className="live-dot" />
              <p>实时预览占位区域</p>
              <strong>{task.progress.toFixed(1)}%</strong>
            </div>
          )}
        </article>

        <article className="card terminal-panel">
          <h3>引擎输出</h3>
          <pre className="terminal-output">
            {logs.length === 0 ? "暂无日志输出" : logs.slice(-160).join("\n")}
          </pre>
        </article>
      </section>

      <section className="card task-meta">
        <div className="tab-header">
          <button
            type="button"
            className={activeTab === "info" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("info")}
          >
            任务信息
          </button>
          <button
            type="button"
            className={activeTab === "config" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("config")}
          >
            高级配置
          </button>
          <button
            type="button"
            className={activeTab === "history" ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab("history")}
          >
            历史日志
          </button>
        </div>

        {activeTab === "info" && (
          <dl>
            <dt>任务 ID</dt>
            <dd className="mono">{task.id}</dd>

            <dt>保存路径</dt>
            <dd className="mono">{task.outputPath ?? "--"}</dd>

            <dt>创建时间</dt>
            <dd>{new Date(task.createdAt).toLocaleString("zh-CN", { hour12: false })}</dd>

            <dt>错误信息</dt>
            <dd>{task.errorMessage ?? "--"}</dd>
          </dl>
        )}

        {activeTab === "config" && (
          <dl>
            <dt>线程数</dt>
            <dd>{task.config?.threads ?? "--"}</dd>

            <dt>User-Agent</dt>
            <dd className="mono">{task.config?.userAgent ?? "--"}</dd>

            <dt>Headers</dt>
            <dd className="mono">{task.config?.headers ?? "--"}</dd>

            <dt>代理</dt>
            <dd className="mono">{task.config?.proxy ?? "--"}</dd>

            <dt>直播模式</dt>
            <dd>{task.config?.isLiveStream ? "开启" : "关闭"}</dd>
          </dl>
        )}

        {activeTab === "history" && (
          <pre className="history-log">{logs.length === 0 ? "暂无历史日志" : logs.join("\n")}</pre>
        )}
      </section>
    </div>
  );
}
