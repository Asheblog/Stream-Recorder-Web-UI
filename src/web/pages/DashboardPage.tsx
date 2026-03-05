import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock3, HardDrive, XCircle } from "lucide-react";

import { api } from "../api/client.js";
import { ProgressBar } from "../components/ProgressBar.js";
import { StatusBadge } from "../components/StatusBadge.js";
import type { SystemInfo, Task } from "../types/index.js";
import { formatBytes, formatDateTime } from "../utils/format.js";

const SYSTEM_DEFAULT: SystemInfo = {
  cpu: 0,
  memory: 0,
  disk: { used: 0, free: 0, total: 0 },
  downloadSpeed: "0 MB/s"
};

export function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [system, setSystem] = useState<SystemInfo>(SYSTEM_DEFAULT);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const [taskList, systemInfo] = await Promise.all([
        api.getTasks({ page: 1, pageSize: 200 }),
        api.getSystemInfo()
      ]);
      if (active) {
        setTasks(taskList.items);
        setSystem(systemInfo);
      }
    };

    load();
    const timer = setInterval(load, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const counters = useMemo(() => {
    return {
      running: tasks.filter((task) => task.status === "DOWNLOADING").length,
      queued: tasks.filter((task) => task.status === "QUEUED").length,
      completed: tasks.filter((task) => task.status === "COMPLETED").length,
      failed: tasks.filter((task) => task.status === "ERROR").length
    };
  }, [tasks]);

  const recent = tasks.slice(0, 5);

  const diskPercent =
    system.disk.total <= 0 ? 0 : Math.min(100, (system.disk.used / system.disk.total) * 100);

  return (
    <div className="page-shell">
      <section className="stats-grid">
        <article className="stat-card running">
          <Activity size={20} />
          <p>运行中</p>
          <strong>{counters.running}</strong>
        </article>
        <article className="stat-card queued">
          <Clock3 size={20} />
          <p>排队中</p>
          <strong>{counters.queued}</strong>
        </article>
        <article className="stat-card completed">
          <CheckCircle2 size={20} />
          <p>已完成</p>
          <strong>{counters.completed}</strong>
        </article>
        <article className="stat-card failed">
          <XCircle size={20} />
          <p>失败任务</p>
          <strong>{counters.failed}</strong>
        </article>
      </section>

      <section className="two-panel">
        <article className="card">
          <h2>系统负载</h2>
          <div className="gauge-list">
            <div className="gauge-item">
              <span>CPU</span>
              <strong>{system.cpu.toFixed(1)}%</strong>
            </div>
            <div className="gauge-item">
              <span>内存</span>
              <strong>{system.memory.toFixed(1)}%</strong>
            </div>
            <div className="gauge-item">
              <span>总速率</span>
              <strong>{system.downloadSpeed}</strong>
            </div>
          </div>
        </article>

        <article className="card">
          <h2>存储空间</h2>
          <div className="storage-head">
            <HardDrive size={18} />
            <span>{formatBytes(system.disk.used)} / {formatBytes(system.disk.total || 1)}</span>
          </div>
          <div className="storage-track">
            <div className="storage-fill" style={{ width: `${diskPercent}%` }} />
          </div>
          <small>剩余空间：{formatBytes(system.disk.free)}</small>
        </article>
      </section>

      <section className="card">
        <h2>最近任务活动</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>状态</th>
                <th>进度</th>
                <th>速度</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((task) => (
                <tr key={task.id}>
                  <td>{task.name}</td>
                  <td>
                    <StatusBadge status={task.status} />
                  </td>
                  <td>
                    <ProgressBar progress={task.progress} />
                  </td>
                  <td className="mono">{task.speed ?? "--"}</td>
                  <td>{formatDateTime(task.createdAt)}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    暂无任务
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
