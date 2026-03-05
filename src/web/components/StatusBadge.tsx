import type { TaskStatus } from "../types/index.js";

const STATUS_LABEL: Record<TaskStatus, string> = {
  QUEUED: "排队中",
  DOWNLOADING: "下载中",
  MERGING: "合并中",
  COMPLETED: "已完成",
  ERROR: "错误",
  STOPPED: "已停止",
  RETRYING: "重试中"
};

const STATUS_CLASS: Record<TaskStatus, string> = {
  QUEUED: "status status-warning",
  DOWNLOADING: "status status-info",
  MERGING: "status status-accent",
  COMPLETED: "status status-success",
  ERROR: "status status-danger",
  STOPPED: "status status-muted",
  RETRYING: "status status-accent"
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span>;
}
