import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { taskApi } from '../services/api';
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
} from '@ant-design/icons';

const STATUS_LABELS: Record<string, string> = {
    DOWNLOADING: '下载中', QUEUED: '排队中', COMPLETED: '已完成',
    ERROR: '错误', STOPPED: '已停止', MERGING: '合并中', RETRYING: '重试中',
};

const CIRCUMFERENCE = 2 * Math.PI * 52;

export default function TaskDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [task, setTask] = useState<any>(null);
    const [output, setOutput] = useState<string[]>([]);
    const [autoScroll, setAutoScroll] = useState(true);
    const termRef = useRef<HTMLDivElement>(null);
    const startTime = useRef<number>(Date.now());

    const loadTask = useCallback(async () => {
        if (!id) return;
        try {
            const data = await taskApi.get(id);
            setTask(data);
            if (data.output) setOutput(data.output);
        } catch { navigate('/tasks'); }
    }, [id, navigate]);

    useEffect(() => { loadTask(); }, [loadTask]);

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
            if (data.taskId === id) { loadTask(); }
        },
        onTaskOutput: (data) => {
            if (data.taskId === id) setOutput(data.lines);
        },
    });

    useEffect(() => {
        if (id) { subscribeTask(id); return () => unsubscribeTask(id); }
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
            else if (action === 'delete') { await taskApi.delete(task.id); navigate('/tasks'); return; }
            loadTask();
        } catch (err: any) { message.error(err.message); }
    };

    const getLineClass = (line: string) => {
        if (/\[ERROR\]/i.test(line)) return 'terminal-line terminal-error';
        if (/\[WARN\]/i.test(line)) return 'terminal-line terminal-warn';
        if (/\[INFO\]/i.test(line)) return 'terminal-line terminal-info';
        if (/\[DL\]/i.test(line) || /\d+%/.test(line)) return 'terminal-line terminal-dl';
        return 'terminal-line';
    };

    return (
        <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
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

            {/* Quick Stats */}
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

            {/* Content: Progress Ring + Terminal */}
            <div className="detail-content">
                {/* Left: Progress */}
                <div className="card">
                    <div className="card-title"><span className="icon">📊</span> 下载进度</div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
                        <div className="gauge-circle" style={{ width: 160, height: 160, marginBottom: 20 }}>
                            <svg viewBox="0 0 120 120" style={{ width: 160, height: 160 }}>
                                <circle className="bg" cx="60" cy="60" r="52" />
                                <circle className="fg" cx="60" cy="60" r="52" stroke={progressColor}
                                    strokeDasharray={CIRCUMFERENCE} strokeDashoffset={progressOffset} />
                            </svg>
                            <div className="gauge-value" style={{ color: progressColor, fontSize: 28 }}>
                                {(task.progress || 0).toFixed(0)}%
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, width: '100%' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>状态</div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{STATUS_LABELS[task.status]}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>重试次数</div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{task.retryCount}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Terminal */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="card-title" style={{ marginBottom: 12 }}>
                        <span className="icon"><CodeOutlined /></span> 引擎输出
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => setAutoScroll(!autoScroll)}>
                                自动滚动: {autoScroll ? 'ON' : 'OFF'}
                            </button>
                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }}
                                onClick={() => navigator.clipboard.writeText(output.join('\n')).then(() => message.success('已复制'))}>
                                复制日志
                            </button>
                        </div>
                    </div>
                    <div className="terminal" ref={termRef} style={{ flex: 1, minHeight: 300 }}>
                        {output.length === 0 ? (
                            <div style={{ color: '#484f58', textAlign: 'center', padding: 40 }}>等待引擎输出...</div>
                        ) : (
                            output.map((line, i) => (
                                <div key={i} className={getLineClass(line)}>{line}</div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Task Info Tabs */}
            <div className="card">
                <Tabs defaultActiveKey="info" items={[
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
                ]} />
            </div>
        </>
    );
}
