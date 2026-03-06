import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { taskApi, fileApi } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { message, Tabs } from 'antd';
import {
    ArrowLeftOutlined,
    PauseOutlined,
    CaretRightOutlined,
    DeleteOutlined,
    ReloadOutlined,
    CodeOutlined,
    InfoCircleOutlined,
    SettingOutlined,
    VideoCameraOutlined,
    FileTextOutlined,
    ClearOutlined,
    CopyOutlined,
} from '@ant-design/icons';

const STATUS_LABELS: Record<string, string> = {
    DOWNLOADING: '下载中', QUEUED: '排队中', COMPLETED: '已完成',
    ERROR: '错误', STOPPED: '已停止', MERGING: '合并中', RETRYING: '重试中',
};

const CIRCUMFERENCE = 2 * Math.PI * 52;

function formatDuration(seconds?: number | null): string {
    if (!seconds || seconds <= 0) return '--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${m}:${String(s).padStart(2, '0')}`;
}

export default function TaskDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [task, setTask] = useState<any>(null);
    const [output, setOutput] = useState<string[]>([]);
    const [autoScroll, setAutoScroll] = useState(true);
    const [historyLogs, setHistoryLogs] = useState<string[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const termRef = useRef<HTMLDivElement>(null);

    const loadTask = useCallback(async () => {
        if (!id) return;
        try {
            const data = await taskApi.get(id);
            setTask(data);
            if (Array.isArray(data.output)) {
                setOutput(data.output);
            }
        } catch {
            navigate('/tasks');
        }
    }, [id, navigate]);

    const loadHistoryLogs = useCallback(async () => {
        if (!id) return;
        setHistoryLoading(true);
        try {
            const res = await taskApi.logs(id, 2000);
            setHistoryLogs(res.lines || []);
        } catch (err: any) {
            message.error(err.message || '加载历史日志失败');
        } finally {
            setHistoryLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadTask();
    }, [loadTask]);

    const { subscribeTask, unsubscribeTask } = useWebSocket({
        onProgress: (data) => {
            if (data.taskId === id) {
                setTask((prev: any) => prev ? {
                    ...prev,
                    progress: data.progress ?? prev.progress,
                    speed: data.speed ?? prev.speed,
                    fileSize: data.fileSize ?? prev.fileSize,
                } : prev);
            }
        },
        onStatusChange: (data) => {
            if (data.taskId === id) {
                loadTask();
            }
        },
        onTaskOutput: (data) => {
            if (data.taskId === id) {
                setOutput(data.lines || []);
            }
        },
        onTaskOutputAppend: (data) => {
            if (data.taskId === id) {
                setOutput((prev) => {
                    const next = [...prev, data.line];
                    if (next.length > 1200) {
                        return next.slice(next.length - 1200);
                    }
                    return next;
                });
            }
        },
    });

    useEffect(() => {
        if (id) {
            subscribeTask(id);
            return () => unsubscribeTask(id);
        }
    }, [id, subscribeTask, unsubscribeTask]);

    useEffect(() => {
        if (autoScroll && termRef.current) {
            termRef.current.scrollTop = termRef.current.scrollHeight;
        }
    }, [output, autoScroll]);

    if (!task) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>加载中...</div>;

    const elapsed = task.createdAt ? Math.floor((Date.now() - new Date(task.createdAt).getTime()) / 1000) : 0;
    const hours = Math.floor(elapsed / 3600);
    const mins = Math.floor((elapsed % 3600) / 60);
    const secs = elapsed % 60;
    const elapsedStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const progressOffset = CIRCUMFERENCE - (task.progress || 0) / 100 * CIRCUMFERENCE;
    const progressColor = task.status === 'ERROR' ? 'var(--danger)' : task.status === 'COMPLETED' ? 'var(--success)' : 'var(--info)';

    const handleAction = async (action: string) => {
        try {
            if (action === 'stop') await taskApi.stop(task.id);
            else if (action === 'start') await taskApi.start(task.id);
            else if (action === 'retry') await taskApi.retry(task.id);
            else if (action === 'delete') {
                await taskApi.delete(task.id);
                navigate('/tasks');
                return;
            }
            loadTask();
        } catch (err: any) {
            message.error(err.message);
        }
    };

    const getLineClass = (line: string) => {
        if (/\[ERROR\]/i.test(line)) return 'terminal-line terminal-error';
        if (/\[WARN\]/i.test(line)) return 'terminal-line terminal-warn';
        if (/\[INFO\]/i.test(line)) return 'terminal-line terminal-info';
        if (/\[DL\]/i.test(line) || /\d+%/.test(line)) return 'terminal-line terminal-dl';
        return 'terminal-line';
    };

    const clearCurrentOutput = () => {
        setOutput([]);
    };

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" onClick={() => navigate('/tasks')}>
                    <ArrowLeftOutlined /> 返回
                </button>
                <h1 style={{ fontSize: 20, fontWeight: 600, flex: 1 }}>{task.name}</h1>
                <span className={`status-badge status-${task.status.toLowerCase()}`}>
                    <span className="dot" />{STATUS_LABELS[task.status] || task.status}
                </span>
                {(task.status === 'DOWNLOADING' || task.status === 'MERGING') && (
                    <button className="btn btn-ghost" onClick={() => handleAction('stop')}><PauseOutlined /> 暂停</button>
                )}
                {(task.status === 'QUEUED' || task.status === 'STOPPED') && (
                    <button className="btn btn-primary" onClick={() => handleAction('start')}><CaretRightOutlined /> 启动</button>
                )}
                {task.status === 'ERROR' && (
                    <button className="btn btn-primary" onClick={() => handleAction('retry')}><ReloadOutlined /> 重试</button>
                )}
                <button className="btn btn-danger" onClick={() => handleAction('delete')}><DeleteOutlined /> 删除</button>
            </div>

            <div className="detail-stats">
                <div className="detail-stat-card">
                    <div className="detail-stat-value" style={{ color: progressColor }}>{(task.progress || 0).toFixed(1)}%</div>
                    <div className="detail-stat-label">进度</div>
                </div>
                <div className="detail-stat-card">
                    <div className="detail-stat-value">{task.speed || '--'}</div>
                    <div className="detail-stat-label">速度</div>
                </div>
                <div className="detail-stat-card">
                    <div className="detail-stat-value">{task.fileSize || '--'}</div>
                    <div className="detail-stat-label">已下载</div>
                </div>
                <div className="detail-stat-card">
                    <div className="detail-stat-value">{elapsedStr}</div>
                    <div className="detail-stat-label">耗时</div>
                </div>
                <div className="detail-stat-card">
                    <div className="detail-stat-value">{task.processId || '--'}</div>
                    <div className="detail-stat-label">PID</div>
                </div>
            </div>

            <div className="detail-content">
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="card-title" style={{ marginBottom: 12 }}>
                        <span className="icon"><VideoCameraOutlined /></span> 视频预览
                    </div>
                    <div className="video-preview-panel">
                        {task.mediaFile?.id ? (
                            <video
                                controls
                                style={{ width: '100%', borderRadius: 8, background: '#000' }}
                                src={fileApi.streamUrl(task.mediaFile.id)}
                            />
                        ) : (
                            <div className="video-placeholder">
                                <VideoCameraOutlined style={{ fontSize: 42, color: 'var(--text-tertiary)' }} />
                                <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>录制进行中，等待可预览片段</div>
                            </div>
                        )}
                    </div>
                    <div style={{ marginTop: 16 }}>
                        <div className="progress-bar-bg" style={{ height: 10 }}>
                            <div className={task.status === 'ERROR' ? 'progress-bar-fill error' : task.status === 'MERGING' ? 'progress-bar-fill merging' : 'progress-bar-fill downloading'} style={{ width: `${task.progress || 0}%` }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                            <div className="speed-cell">分辨率: {task.mediaFile?.resolution || '--'}</div>
                            <div className="speed-cell">时长: {formatDuration(task.mediaFile?.duration)}</div>
                        </div>
                    </div>
                </div>

                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="card-title" style={{ marginBottom: 12 }}>
                        <span className="icon"><CodeOutlined /></span> 引擎输出
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setAutoScroll(!autoScroll)}>
                                自动滚动: {autoScroll ? 'ON' : 'OFF'}
                            </button>
                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={clearCurrentOutput} aria-label="清空当前日志窗口">
                                <ClearOutlined /> 清空
                            </button>
                            <button
                                className="btn btn-ghost"
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => navigator.clipboard.writeText(output.join('\n')).then(() => message.success('已复制'))}
                            >
                                <CopyOutlined /> 复制日志
                            </button>
                        </div>
                    </div>
                    <div className="terminal" ref={termRef} style={{ flex: 1, minHeight: 300 }}>
                        {output.length === 0 ? (
                            <div style={{ color: '#484f58', textAlign: 'center', padding: 40 }}>等待引擎输出...</div>
                        ) : (
                            output.map((line, i) => (
                                <div key={`${i}-${line.slice(0, 10)}`} className={getLineClass(line)}>{line}</div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div className="card">
                <Tabs
                    defaultActiveKey="info"
                    onChange={(active) => {
                        if (active === 'history') {
                            loadHistoryLogs();
                        }
                    }}
                    items={[
                        {
                            key: 'info',
                            label: <><InfoCircleOutlined /> 任务信息</>,
                            children: (
                                <div className="detail-info-grid">
                                    <div className="detail-info-item">
                                        <div className="detail-info-label">任务 ID</div>
                                        <div className="detail-info-value">{task.id}</div>
                                    </div>
                                    <div className="detail-info-item">
                                        <div className="detail-info-label">流媒体地址</div>
                                        <div className="detail-info-value">{task.url}</div>
                                    </div>
                                    <div className="detail-info-item">
                                        <div className="detail-info-label">保存路径</div>
                                        <div className="detail-info-value">{task.outputPath || task.saveDir || '--'}</div>
                                    </div>
                                    <div className="detail-info-item">
                                        <div className="detail-info-label">创建时间</div>
                                        <div className="detail-info-value">{new Date(task.createdAt).toLocaleString()}</div>
                                    </div>
                                    {task.completedAt && (
                                        <div className="detail-info-item">
                                            <div className="detail-info-label">完成时间</div>
                                            <div className="detail-info-value">{new Date(task.completedAt).toLocaleString()}</div>
                                        </div>
                                    )}
                                    {task.errorMessage && (
                                        <div className="detail-info-item" style={{ gridColumn: 'span 2' }}>
                                            <div className="detail-info-label">错误信息</div>
                                            <div className="detail-info-value" style={{ color: 'var(--danger)' }}>{task.errorMessage}</div>
                                        </div>
                                    )}
                                </div>
                            ),
                        },
                        {
                            key: 'config',
                            label: <><SettingOutlined /> 高级配置</>,
                            children: task.config ? (
                                <div className="detail-info-grid">
                                    <div className="detail-info-item">
                                        <div className="detail-info-label">User-Agent</div>
                                        <div className="detail-info-value">{task.config.userAgent || '默认'}</div>
                                    </div>
                                    <div className="detail-info-item">
                                        <div className="detail-info-label">代理地址</div>
                                        <div className="detail-info-value">{task.config.proxy || '无'}</div>
                                    </div>
                                    <div className="detail-info-item">
                                        <div className="detail-info-label">并发线程数</div>
                                        <div className="detail-info-value">{task.config.threads}</div>
                                    </div>
                                    <div className="detail-info-item">
                                        <div className="detail-info-label">直播流</div>
                                        <div className="detail-info-value">{task.config.isLiveStream ? '是' : '否'}</div>
                                    </div>
                                </div>
                            ) : <div style={{ color: 'var(--text-tertiary)', padding: 20 }}>无高级配置</div>,
                        },
                        {
                            key: 'history',
                            label: <><FileTextOutlined /> 历史日志</>,
                            children: historyLoading ? (
                                <div style={{ color: 'var(--text-secondary)', padding: 20 }}>加载中...</div>
                            ) : historyLogs.length === 0 ? (
                                <div style={{ color: 'var(--text-tertiary)', padding: 20 }}>暂无历史日志</div>
                            ) : (
                                <div className="terminal" style={{ maxHeight: 320 }}>
                                    {historyLogs.map((line, i) => (
                                        <div key={`h-${i}-${line.slice(0, 10)}`} className={getLineClass(line)}>{line}</div>
                                    ))}
                                </div>
                            ),
                        },
                    ]}
                />
            </div>
        </>
    );
}
