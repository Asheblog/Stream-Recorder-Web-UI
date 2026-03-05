import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { taskApi, systemApi } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import {
    DownloadOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    DesktopOutlined,
    DatabaseOutlined,
    UnorderedListOutlined,
    PauseOutlined,
    DeleteOutlined,
    CaretRightOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { message } from 'antd';

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const CIRCUMFERENCE = 2 * Math.PI * 52; // r=52

export default function Dashboard() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ running: 0, queued: 0, completed: 0, failed: 0 });
    const [system, setSystem] = useState<any>({ cpu: { usage: 0 }, memory: { usage: 0, total: 0, used: 0 }, disk: { total: 0, used: 0, free: 0, usage: 0 } });
    const [recentTasks, setRecentTasks] = useState<any[]>([]);

    const loadData = useCallback(async () => {
        try {
            const [tasksRes, sysInfo] = await Promise.all([
                taskApi.list({ pageSize: 100 }),
                systemApi.info(),
            ]);
            const tasks = tasksRes.tasks || [];
            setStats({
                running: tasks.filter((t: any) => t.status === 'DOWNLOADING' || t.status === 'MERGING').length,
                queued: tasks.filter((t: any) => t.status === 'QUEUED').length,
                completed: tasks.filter((t: any) => t.status === 'COMPLETED').length,
                failed: tasks.filter((t: any) => t.status === 'ERROR').length,
            });
            // Recent: get first 5 non-completed or recently active
            const recent = tasks
                .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .slice(0, 5);
            setRecentTasks(recent);
            setSystem(sysInfo);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    useWebSocket({
        onProgress: (data) => {
            setRecentTasks(prev => prev.map(t =>
                t.id === data.taskId ? { ...t, progress: data.progress ?? t.progress, speed: data.speed ?? t.speed, fileSize: data.fileSize ?? t.fileSize } : t
            ));
        },
        onStatusChange: (data) => {
            loadData();
        },
        onSystemStats: (data) => {
            setSystem((prev: any) => ({
                ...prev,
                cpu: { ...prev.cpu, usage: data.cpu },
                memory: { ...prev.memory, usage: data.memory, used: data.memUsed, total: data.memTotal },
            }));
        },
    });

    const getStatusClass = (status: string) => `status-badge status-${status.toLowerCase()}`;
    const getProgressClass = (status: string) => `progress-bar-fill ${status.toLowerCase()}`;

    const cpuOffset = CIRCUMFERENCE - (system.cpu?.usage || 0) / 100 * CIRCUMFERENCE;
    const memOffset = CIRCUMFERENCE - (system.memory?.usage || 0) / 100 * CIRCUMFERENCE;
    const cpuColor = (system.cpu?.usage || 0) > 80 ? 'var(--danger)' : (system.cpu?.usage || 0) > 50 ? 'var(--warning)' : 'var(--success)';
    const memColor = (system.memory?.usage || 0) > 80 ? 'var(--danger)' : (system.memory?.usage || 0) > 50 ? 'var(--warning)' : 'var(--info)';

    const diskUsage = system.disk?.usage || 0;
    const diskTotal = system.disk?.total || 0;
    const diskUsed = system.disk?.used || 0;
    const diskFree = system.disk?.free || 0;

    const handleAction = async (action: string, taskId: string) => {
        try {
            if (action === 'stop') await taskApi.stop(taskId);
            else if (action === 'start') await taskApi.start(taskId);
            else if (action === 'retry') await taskApi.retry(taskId);
            else if (action === 'delete') {
                await taskApi.delete(taskId);
                message.success('任务已删除');
            }
            loadData();
        } catch (err: any) {
            message.error(err.message);
        }
    };

    return (
        <>
            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card running">
                    <div className="stat-icon"><DownloadOutlined /></div>
                    <div className="stat-label">运行中任务</div>
                    <div className="stat-value">{stats.running}</div>
                    <div className="stat-trend" style={{ color: 'var(--info)' }}>● 正在录制</div>
                </div>
                <div className="stat-card queued">
                    <div className="stat-icon"><ClockCircleOutlined /></div>
                    <div className="stat-label">排队中任务</div>
                    <div className="stat-value">{stats.queued}</div>
                    <div className="stat-trend" style={{ color: 'var(--text-tertiary)' }}>等待空闲槽位</div>
                </div>
                <div className="stat-card completed">
                    <div className="stat-icon"><CheckCircleOutlined /></div>
                    <div className="stat-label">已完成</div>
                    <div className="stat-value">{stats.completed}</div>
                    <div className="stat-trend" style={{ color: 'var(--success)' }}>全部任务累计</div>
                </div>
                <div className="stat-card failed">
                    <div className="stat-icon"><CloseCircleOutlined /></div>
                    <div className="stat-label">失败任务</div>
                    <div className="stat-value">{stats.failed}</div>
                    <div className="stat-trend" style={{ color: stats.failed > 0 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                        {stats.failed > 0 ? '需要处理' : '无异常'}
                    </div>
                </div>
            </div>

            {/* Monitor Row */}
            <div className="monitor-grid">
                {/* System Load */}
                <div className="card">
                    <div className="card-title"><span className="icon"><DesktopOutlined /></span> 系统负载监控</div>
                    <div className="gauge-row">
                        <div className="gauge">
                            <div className="gauge-circle">
                                <svg viewBox="0 0 120 120">
                                    <circle className="bg" cx="60" cy="60" r="52" />
                                    <circle className="fg" cx="60" cy="60" r="52" stroke={cpuColor}
                                        strokeDasharray={CIRCUMFERENCE} strokeDashoffset={cpuOffset} />
                                </svg>
                                <div className="gauge-value" style={{ color: cpuColor }}>{system.cpu?.usage || 0}%</div>
                            </div>
                            <div className="gauge-label">CPU 使用率</div>
                        </div>
                        <div className="gauge">
                            <div className="gauge-circle">
                                <svg viewBox="0 0 120 120">
                                    <circle className="bg" cx="60" cy="60" r="52" />
                                    <circle className="fg" cx="60" cy="60" r="52" stroke={memColor}
                                        strokeDasharray={CIRCUMFERENCE} strokeDashoffset={memOffset} />
                                </svg>
                                <div className="gauge-value" style={{ color: memColor }}>{system.memory?.usage || 0}%</div>
                            </div>
                            <div className="gauge-label">内存使用率</div>
                        </div>
                    </div>
                </div>

                {/* Storage */}
                <div className="card">
                    <div className="card-title"><span className="icon"><DatabaseOutlined /></span> 存储空间监控</div>
                    <div className="storage-info">
                        <div className="storage-bar-bg">
                            <div className="storage-bar-fill" style={{ width: `${diskUsage}%` }} />
                        </div>
                        <div className="storage-details">
                            <span>已使用 {formatBytes(diskUsed)}</span>
                            <span>总计 {formatBytes(diskTotal)}</span>
                        </div>
                    </div>
                    <div className="storage-breakdown">
                        <div className="storage-item">
                            <div className="label">已使用</div>
                            <div className="value">{formatBytes(diskUsed)}</div>
                        </div>
                        <div className="storage-item">
                            <div className="label">可用空间</div>
                            <div className="value" style={{ color: diskFree < 10 * 1024 * 1024 * 1024 ? 'var(--danger)' : 'var(--success)' }}>
                                {formatBytes(diskFree)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Tasks */}
            <div className="card">
                <div className="card-title"><span className="icon"><UnorderedListOutlined /></span> 最近任务活动</div>
                <table className="task-table">
                    <thead>
                        <tr>
                            <th>任务名称</th>
                            <th>状态</th>
                            <th>进度</th>
                            <th>速度</th>
                            <th>大小</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recentTasks.map((task) => (
                            <tr key={task.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tasks/${task.id}`)}>
                                <td>
                                    <div className="task-name">{task.name}</div>
                                    <div className="task-url">{task.url}</div>
                                </td>
                                <td>
                                    <span className={getStatusClass(task.status)}>
                                        <span className="dot" />
                                        {task.status === 'DOWNLOADING' ? '下载中' :
                                            task.status === 'QUEUED' ? '排队中' :
                                                task.status === 'COMPLETED' ? '已完成' :
                                                    task.status === 'ERROR' ? '错误' :
                                                        task.status === 'MERGING' ? '合并中' :
                                                            task.status === 'STOPPED' ? '已停止' : task.status}
                                    </span>
                                </td>
                                <td style={{ minWidth: 160 }}>
                                    <div className="progress-bar-bg">
                                        <div className={getProgressClass(task.status)} style={{ width: `${task.progress || 0}%` }} />
                                    </div>
                                    <span className="progress-text">{(task.progress || 0).toFixed(1)}%</span>
                                </td>
                                <td className="speed-cell">{task.speed || '--'}</td>
                                <td className="speed-cell">{task.fileSize || '--'}</td>
                                <td onClick={e => e.stopPropagation()}>
                                    {(task.status === 'DOWNLOADING' || task.status === 'MERGING') && (
                                        <button className="action-btn" title="暂停" onClick={() => handleAction('stop', task.id)}>
                                            <PauseOutlined />
                                        </button>
                                    )}
                                    {(task.status === 'QUEUED' || task.status === 'STOPPED') && (
                                        <button className="action-btn" title="开始" onClick={() => handleAction('start', task.id)}>
                                            <CaretRightOutlined />
                                        </button>
                                    )}
                                    {task.status === 'ERROR' && (
                                        <button className="action-btn" title="重试" onClick={() => handleAction('retry', task.id)}>
                                            <ReloadOutlined />
                                        </button>
                                    )}
                                    <button className="action-btn danger" title="删除" onClick={() => handleAction('delete', task.id)}>
                                        <DeleteOutlined />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {recentTasks.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 40 }}>
                                    暂无任务
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
