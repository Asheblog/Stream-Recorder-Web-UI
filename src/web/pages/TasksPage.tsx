import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2
} from "lucide-react";

import { api } from "../api/client.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { TaskCreateModal } from "../components/TaskCreateModal.js";
import { useSocketTasks } from "../hooks/useSocketTasks.js";
import type { Task } from "../types/index.js";
import { formatDateTime } from "../utils/format.js";

const STATUS_OPTIONS = [
  { label: "全部状态", value: "ALL" },
  { label: "排队中", value: "QUEUED" },
  { label: "下载中", value: "DOWNLOADING" },
  { label: "合并中", value: "MERGING" },
  { label: "已完成", value: "COMPLETED" },
  { label: "错误", value: "ERROR" },
  { label: "已停止", value: "STOPPED" },
  { label: "重试中", value: "RETRYING" }
] as const;

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("ALL");
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const payload = await api.getTasks({
      status: status === "ALL" ? undefined : status,
      keyword: search.trim() || undefined,
      page,
      pageSize
    });

    setTasks(payload.items);
    setTotal(payload.total);
    setLoading(false);
  }, [page, pageSize, search, status]);

  useEffect(() => {
    loadTasks().catch((err) => {
      setError((err as Error).message);
      setLoading(false);
    });
  }, [loadTasks]);

  useSocketTasks({
    onProgress(update) {
      setTasks((prev) =>
        prev.map((item) =>
          item.id === update.taskId
            ? { ...item, progress: update.progress, speed: update.speed, fileSize: update.fileSize }
            : item
        )
      );
    },
    onStatus(update) {
      setTasks((prev) =>
        prev.map((item) =>
          item.id === update.taskId
            ? {
                ...item,
                status: update.status,
                errorMessage: update.errorMessage ?? null,
                speed: update.status === "DOWNLOADING" ? item.speed : null
              }
            : item
        )
      );
    }
  });

  const allSelected = tasks.length > 0 && tasks.every((task) => selected.includes(task.id));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSelect = (taskId: string) => {
    setSelected((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const bulkAction = async (action: "start" | "stop" | "delete") => {
    if (selected.length === 0) {
      return;
    }

    await api.batchTask({ ids: selected, action });
    setSelected([]);
    await loadTasks();
  };

  const noData = useMemo(() => !loading && tasks.length === 0, [loading, tasks.length]);

  return (
    <div className="page-shell">
      <section className="toolbar">
        <div className="toolbar-left">
          <button className="primary-btn" type="button" onClick={() => setShowModal(true)}>
            <Plus size={16} /> 新建任务
          </button>
          <button className="secondary-btn" type="button" onClick={() => bulkAction("start")}>
            <Play size={16} /> 批量启动
          </button>
          <button className="secondary-btn" type="button" onClick={() => bulkAction("stop")}>
            <Pause size={16} /> 批量停止
          </button>
          <button className="danger-btn" type="button" onClick={() => bulkAction("delete")}>
            <Trash2 size={16} /> 批量删除
          </button>
        </div>

        <div className="toolbar-right">
          <select
            className="status-filter"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as (typeof STATUS_OPTIONS)[number]["value"]);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label className="search-box">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="搜索任务名称/URL"
            />
          </label>
        </div>
      </section>

      {error && <p className="error-text">{error}</p>}

      <section className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      if (allSelected) {
                        setSelected([]);
                      } else {
                        setSelected(tasks.map((task) => task.id));
                      }
                    }}
                  />
                </th>
                <th>名称</th>
                <th>状态</th>
                <th>进度</th>
                <th>速度</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    加载中...
                  </td>
                </tr>
              ) : noData ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    暂无任务
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(task.id)}
                        onChange={() => toggleSelect(task.id)}
                      />
                    </td>
                    <td>
                      <Link className="task-name-link" to={`/tasks/${task.id}`}>
                        {task.name}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={task.status} />
                    </td>
                    <td>
                      <ProgressBar progress={task.progress} />
                    </td>
                    <td className="mono">{task.speed ?? "--"}</td>
                    <td>{formatDateTime(task.createdAt)}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="icon-btn"
                          onClick={async () => {
                            await api.startTask(task.id);
                            await loadTasks();
                          }}
                          title="开始/恢复"
                        >
                          <Play size={15} />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={async () => {
                            await api.stopTask(task.id);
                            await loadTasks();
                          }}
                          title="停止"
                        >
                          <Pause size={15} />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={async () => {
                            await api.retryTask(task.id);
                            await loadTasks();
                          }}
                          title="重试"
                        >
                          <RefreshCw size={15} />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={async () => {
                            await api.deleteTask(task.id);
                            await loadTasks();
                          }}
                          title="删除"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="footer-row">
          <button className="ghost-btn" type="button" onClick={loadTasks}>
            <RotateCcw size={14} /> 刷新
          </button>

          <div className="paging-row">
            <span>
              第 {page}/{totalPages} 页 · 共 {total} 条
            </span>
            <select
              className="page-size-select"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10 / 页</option>
              <option value={20}>20 / 页</option>
              <option value={50}>50 / 页</option>
            </select>
            <button
              className="ghost-btn"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((previous) => Math.max(1, previous - 1))}
            >
              上一页
            </button>
            <button
              className="ghost-btn"
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
            >
              下一页
            </button>
          </div>
        </div>
      </section>

      <TaskCreateModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreate={async (payload) => {
          await api.createTasks(payload);
          await loadTasks();
        }}
      />
    </div>
  );
}
