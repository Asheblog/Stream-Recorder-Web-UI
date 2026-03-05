import { useState, useEffect, useCallback } from 'react';
import { fileApi } from '../services/api';
import { message, Pagination, Modal } from 'antd';
import {
    SearchOutlined,
    AppstoreOutlined,
    UnorderedListOutlined,
    PlayCircleOutlined,
    DownloadOutlined,
    CopyOutlined,
    DeleteOutlined,
    VideoCameraOutlined,
} from '@ant-design/icons';

function formatBytes(bytes: number | string): string {
    const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (!n || n === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(n) / Math.log(k));
    return parseFloat((n / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function VideoLibrary() {
    const [files, setFiles] = useState<any[]>([]);
    const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [playingFile, setPlayingFile] = useState<any>(null);

    const loadFiles = useCallback(async () => {
        try {
            const res = await fileApi.list({
                page: pagination.page,
                pageSize: pagination.pageSize,
                search: search || undefined,
            });
            setFiles(res.files);
            setPagination(prev => ({ ...prev, total: res.pagination.total }));
        } catch { /* ignore */ }
    }, [pagination.page, pagination.pageSize, search]);

    useEffect(() => { loadFiles(); }, [loadFiles]);

    const handleDelete = async (id: string) => {
        try {
            await fileApi.delete(id);
            message.success('文件已删除');
            loadFiles();
        } catch (err: any) { message.error(err.message); }
    };

    const handleCopyPath = (path: string) => {
        navigator.clipboard.writeText(path).then(() => message.success('路径已复制'));
    };

    return (
        <>
            {/* Toolbar */}
            <div className="toolbar">
                <h2 style={{ fontSize: 16, fontWeight: 600 }}>视频库</h2>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>({pagination.total} 个文件)</span>
                <div className="spacer" />
                <div style={{ position: 'relative' }}>
                    <SearchOutlined style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-tertiary)', zIndex: 1 }} />
                    <input
                        className="search-input"
                        placeholder="搜索文件..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                    />
                </div>
                <button className={`action-btn ${viewMode === 'list' ? '' : ''}`}
                    style={{ background: viewMode === 'list' ? 'var(--accent-glow)' : 'transparent', color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-secondary)' }}
                    onClick={() => setViewMode('list')}>
                    <UnorderedListOutlined />
                </button>
                <button className={`action-btn`}
                    style={{ background: viewMode === 'grid' ? 'var(--accent-glow)' : 'transparent', color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-secondary)' }}
                    onClick={() => setViewMode('grid')}>
                    <AppstoreOutlined />
                </button>
            </div>

            {/* Grid View */}
            {viewMode === 'grid' ? (
                <div className="video-grid">
                    {files.map((file) => (
                        <div key={file.id} className="video-card" onClick={() => setPlayingFile(file)}>
                            <div className="video-thumbnail">
                                <VideoCameraOutlined style={{ fontSize: 40, color: 'var(--text-tertiary)' }} />
                                <div className="play-icon"><PlayCircleOutlined /></div>
                            </div>
                            <div className="video-info">
                                <div className="video-title">{file.fileName}</div>
                                <div className="video-meta">
                                    <span>{formatBytes(file.fileSize)}</span>
                                    <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                                    <button className="action-btn" title="播放" onClick={e => { e.stopPropagation(); setPlayingFile(file); }}>
                                        <PlayCircleOutlined />
                                    </button>
                                    <a href={fileApi.downloadUrl(file.id)} download onClick={e => e.stopPropagation()}>
                                        <button className="action-btn" title="下载"><DownloadOutlined /></button>
                                    </a>
                                    <button className="action-btn" title="复制路径" onClick={e => { e.stopPropagation(); handleCopyPath(file.filePath); }}>
                                        <CopyOutlined />
                                    </button>
                                    <button className="action-btn danger" title="删除" onClick={e => { e.stopPropagation(); handleDelete(file.id); }}>
                                        <DeleteOutlined />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {files.length === 0 && (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-tertiary)', padding: 60 }}>
                            <VideoCameraOutlined style={{ fontSize: 40, marginBottom: 12 }} /><br />
                            暂无视频文件
                        </div>
                    )}
                </div>
            ) : (
                /* List View */
                <div className="card" style={{ padding: 0 }}>
                    <table className="task-table">
                        <thead>
                            <tr>
                                <th>文件名</th>
                                <th>大小</th>
                                <th>类型</th>
                                <th>录制时间</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {files.map((file) => (
                                <tr key={file.id}>
                                    <td>
                                        <div className="task-name">{file.fileName}</div>
                                        <div className="task-url">{file.filePath}</div>
                                    </td>
                                    <td className="speed-cell">{formatBytes(file.fileSize)}</td>
                                    <td className="speed-cell">{file.mimeType}</td>
                                    <td className="speed-cell">{new Date(file.createdAt).toLocaleString()}</td>
                                    <td>
                                        <button className="action-btn" title="播放" onClick={() => setPlayingFile(file)}><PlayCircleOutlined /></button>
                                        <a href={fileApi.downloadUrl(file.id)} download>
                                            <button className="action-btn" title="下载"><DownloadOutlined /></button>
                                        </a>
                                        <button className="action-btn" title="复制路径" onClick={() => handleCopyPath(file.filePath)}><CopyOutlined /></button>
                                        <button className="action-btn danger" title="删除" onClick={() => handleDelete(file.id)}><DeleteOutlined /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

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

            {/* Video Player Modal */}
            <Modal
                open={!!playingFile}
                onCancel={() => setPlayingFile(null)}
                footer={null}
                width={800}
                title={playingFile?.fileName}
                destroyOnClose
            >
                {playingFile && (
                    <video
                        controls
                        autoPlay
                        style={{ width: '100%', borderRadius: 8, background: '#000' }}
                        src={fileApi.streamUrl(playingFile.id)}
                    />
                )}
            </Modal>
        </>
    );
}
