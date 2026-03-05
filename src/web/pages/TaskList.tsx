import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { taskApi } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import TaskCreateModal from '../components/TaskCreateModal';
import { message, Pagination, Select } from 'antd';
import {
    PlusOutlined,
    SearchOutlined,
    PauseOutlined,
    DeleteOutlined,
    CaretRightOutlined,
    ReloadOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';

const STATUS_OPTIONS = [
    { value: 'ALL', label: '全部状态' },
    { value: 'DOWNLOADING', label: '下载中' },
    { value: 'QUEUED', label: '排队中' },
    { value: 'COMPLETED', label: '已完成' },
    { value: 'ERROR', label: '错误' },
    { value: 'STOPPED', label: '已停止' },
    { value: 'MERGING', label: '合并中' },
];

const STATUS_LABELS: Record<string, string> = {
    DOWNLOADING: '下载中', QUEUED: '排队中', COMPLETED: '已完成',
    ERROR: '错误', STOPPED: '已停止', MERGING: '合并中', RETRYING: '重试中',
};

export default function TaskList() {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState<any[]>([]);
    const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showCreate, setShowCreate] = useState(false);

    const loadTasks = useCallback(async () => {
        try {
            const res = await taskApi.list({
                page: pagination.page,
                pageSize: pagination.pageSize,
                status: statusFilter !== 'ALL' ? statusFilter : undefined,
                search: search || undefined,
            });
            setTasks(res.tasks);
            setPagination(prev => ({ ...prev, total: res.pagination.total }));
        } catch { /* ignore */ }
    }, [pagination.page, pagination.pageSize, statusFilter, search]);

    useEffect(() => { loadTasks(); }, [loadTasks]);

    useWebSocket({
        onProgress: (data) => {
            setTasks(prev => prev.map(t =>
                t.id === data.taskId ? { ...t, progress: data.progress ?? t.progress, speed: data.speed ?? t.speed, fileSize: data.fileSize ?? t.fileSize } : t
            ));
        },
        onStatusChange: () => { loadTasks(); },
    });

    const handleAction = async (action: string, taskId: string) => {
        try {
            if (action === 'stop') await taskApi.stop(taskId);
            else if (action === 'start') await taskApi.start(taskId);
            else if (action === 'retry') await taskApi.retry(taskId);
            else if (action === 'delete') { await taskApi.delete(taskId); message.success('已删除'); }
            loadTasks();
        } catch (err: any) { message.error(err.message); }
    };

    const handleBatch = async (action: string) => {
        if (selected.size === 0) return message.warning('请先选择任务');
        try {
            await taskApi.batch(action, Array.from(selected));
            message.success(`批量${action === 'start' ? '启动' : action === 'stop' ? '停止' : '删除'}成功`);
            setSelected(new Set());
            loadTasks();
        } catch (err: any) { message.error(err.message); }
    };

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === tasks.length) setSelected(new Set());
        else setSelected(new Set(tasks.map(t => t.id)));
    };

    const getStatusClass = (status: string) => `status-badge status-${status.toLowerCase()}`;
    const getProgressClass = (status: string) => `progress-bar-fill ${status.toLowerCase()}`;

    return (
        <>
            {/* Toolbar */}
            <div className="toolbar">
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                    <PlusOutlined /> 新建任务
                </button>
                {selected.size > 0 && (
                    <>
                        <button className="btn btn-ghost" onClick={() => handleBatch('start')}>
                            <CaretRightOutlined /> 批量启动
                        </button>
                        <button className="btn btn-ghost" onClick={() => handleBatch('stop')}>
                            <PauseOutlined /> 批量停止
                        </button>
                        <button className="btn btn-ghost" onClick={() => handleBatch('delete')}>
                            <DeleteOutlined /> 批量删除
                        </button>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>已选 {selected.size} 项</span>
                    </>
                )}
                <div className="spacer" />
                <Select
                    value={statusFilter}
                    onChange={v => { setStatusFilter(v); setPagination(p => ({ ...p, page: 1 })); }}
                    options={STATUS_OPTIONS}
                    style={{ width: 140 }}
                    size="small"
                />
                <div style={{ position: 'relative' }}>
                    <SearchOutlined style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-tertiary)', zIndex: 1 }} />
                    <input
                        className="search-input"
                        placeholder="搜索任务..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                    />
                </div>
            </div>

            {/* Task Table */}
            <div className="card" style={{ padding: 0 }}>
                <table className="task-table">
                    <thead>
                        <tr>
                            <th style={{ width: 40 }}>
                                <input type="checkbox" checked={selected.size === tasks.length && tasks.length > 0} onChange={toggleAll} />
                            </th>
                            <th>任务名称</th>
                            <th>状态</th>
                            <th>进度</th>
                            <th>速度</th>
                            <th>大小</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.map((task) => (
                            <tr key={task.id}>
                                <td onClick={e => e.stopPropagation()}>
                                    <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggleSelect(task.id)} />
                                </td>
                                <td style={{ cursor: 'pointer' }} onClick={() => navigate(`/tasks/${task.id}`)}>
                                    <div className="task-name">{task.name}</div>
                                    <div className="task-url">{task.url}</div>
                                </td>
                                <td>
                                    <span className={getStatusClass(task.status)}>
                                        <span className="dot" />
                                        {STATUS_LABELS[task.status] || task.status}
                                    </span>
                                </td>
                                <td style={{ minWidth: 160 }}>
                                    <div className="progress-bar-bg">
                                        <div className={getProgressClass(task.status)} style={{ width: `${task.progress || 0}%` }} />
                                    </div>
                                    <span className="progress-text">
                                        {task.status === 'ERROR' ?
                                            <span style={{ color: 'var(--danger)' }}>{task.errorMessage || '错误'}</span> :
                                            `${(task.progress || 0).toFixed(1)}%`}
                                    </span>
                                </td>
                                <td className="speed-cell">{task.speed || '--'}</td>
                                <td className="speed-cell">{task.fileSize || '--'}</td>
                                <td onClick={e => e.stopPropagation()}>
                                    {(task.status === 'DOWNLOADING' || task.status === 'MERGING') && (
                                        <button className="action-btn" title="暂停" onClick={() => handleAction('stop', task.id)}><PauseOutlined /></button>
                                    )}
                                    {(task.status === 'QUEUED' || task.status === 'STOPPED') && (
                                        <button className="action-btn" title="开始" onClick={() => handleAction('start', task.id)}><CaretRightOutlined /></button>
                                    )}
                                    {task.status === 'ERROR' && (
                                        <button className="action-btn" title="重试" onClick={() => handleAction('retry', task.id)}><ReloadOutlined /></button>
                                    )}
                                    <button className="action-btn danger" title="删除" onClick={() => handleAction('delete', task.id)}><DeleteOutlined /></button>
                                </td>
                            </tr>
                        ))}
                        {tasks.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 60 }}>
                                    <ThunderboltOutlined style={{ fontSize: 32, marginBottom: 12 }} /><br />
                                    暂无录制任务，点击"新建任务"开始
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pagination.total > pagination.pageSize && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
                    <Pagination
                        current={pagination.page}
                        pageSize={pagination.pageSize}
                        total={pagination.total}
                        onChange={(page) => setPagination(p => ({ ...p, page }))}
                        showSizeChanger={false}
                        size="small"
                    />
                </div>
            )}

            {/* Create Modal */}
            {showCreate && (
                <TaskCreateModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); loadTasks(); }}
                />
            )}
        </>
    );
}
