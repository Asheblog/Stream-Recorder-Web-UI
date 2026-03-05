import { useState } from 'react';
import { taskApi } from '../services/api';
import { message } from 'antd';
import {
    CloseOutlined,
    SendOutlined,
    SettingOutlined,
} from '@ant-design/icons';

interface Props {
    onClose: () => void;
    onCreated: () => void;
}

export default function TaskCreateModal({ onClose, onCreated }: Props) {
    const [mode, setMode] = useState<'single' | 'batch'>('single');
    const [url, setUrl] = useState('');
    const [batchUrls, setBatchUrls] = useState('');
    const [name, setName] = useState('');
    const [saveName, setSaveName] = useState('');
    const [saveDir, setSaveDir] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [config, setConfig] = useState({
        userAgent: '',
        headers: '',
        proxy: '',
        threads: 16,
        isLiveStream: false,
        extraArgs: '',
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        const urls = mode === 'single'
            ? [url.trim()]
            : batchUrls.split('\n').map(u => u.trim()).filter(Boolean);

        if (urls.length === 0 || !urls[0]) {
            return message.warning('请输入流媒体 URL');
        }

        setLoading(true);
        try {
            const data: any = {
                urls,
                name: name || undefined,
                saveName: saveName || undefined,
                saveDir: saveDir || undefined,
            };

            if (showAdvanced) {
                data.config = {
                    userAgent: config.userAgent || undefined,
                    headers: config.headers ? JSON.parse(config.headers) : undefined,
                    proxy: config.proxy || undefined,
                    threads: config.threads || 16,
                    isLiveStream: config.isLiveStream,
                    extraArgs: config.extraArgs || undefined,
                };
            }

            await taskApi.create(data);
            message.success(`已创建 ${urls.length} 个任务`);
            onCreated();
        } catch (err: any) {
            message.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title">
                    <span>新建录制任务</span>
                    <button className="modal-close" onClick={onClose}><CloseOutlined /></button>
                </div>

                {/* Mode Toggle */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" checked={mode === 'single'} onChange={() => setMode('single')} />
                        单条录制
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" checked={mode === 'batch'} onChange={() => setMode('batch')} />
                        批量导入
                    </label>
                </div>

                {/* URL Input */}
                <div className="form-group">
                    <label className="form-label">流媒体 URL *</label>
                    {mode === 'single' ? (
                        <input className="form-input" placeholder="https://example.com/video.m3u8"
                            value={url} onChange={e => setUrl(e.target.value)} />
                    ) : (
                        <textarea className="form-textarea" placeholder="每行一个 URL&#10;https://example.com/video1.m3u8&#10;https://example.com/video2.mpd"
                            rows={5} value={batchUrls} onChange={e => setBatchUrls(e.target.value)} />
                    )}
                </div>

                {/* Name */}
                <div className="form-group">
                    <label className="form-label">任务名称</label>
                    <input className="form-input" placeholder="自定义视频名称（选填）"
                        value={name} onChange={e => setName(e.target.value)} />
                </div>

                {/* Save Name + Dir */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                        <label className="form-label">保存文件名</label>
                        <input className="form-input" placeholder="输出文件名（选填）"
                            value={saveName} onChange={e => setSaveName(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">保存目录</label>
                        <input className="form-input" placeholder="使用默认目录"
                            value={saveDir} onChange={e => setSaveDir(e.target.value)} />
                    </div>
                </div>

                {/* Advanced */}
                <div style={{
                    border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    overflow: 'hidden', marginBottom: 16,
                }}>
                    <button
                        style={{
                            width: '100%', padding: '10px 16px', background: 'var(--bg-elevated)',
                            border: 'none', color: 'var(--text-secondary)', fontSize: 13,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                            fontFamily: 'inherit',
                        }}
                        onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                        <SettingOutlined /> 高级参数 {showAdvanced ? '▾' : '▸'}
                    </button>
                    {showAdvanced && (
                        <div style={{ padding: 16 }}>
                            <div className="form-group">
                                <label className="form-label">User-Agent</label>
                                <input className="form-input" placeholder="自定义 UA"
                                    value={config.userAgent} onChange={e => setConfig(c => ({ ...c, userAgent: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">自定义 Headers (JSON)</label>
                                <input className="form-input" placeholder='{"Referer":"https://..."}'
                                    value={config.headers} onChange={e => setConfig(c => ({ ...c, headers: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">代理地址</label>
                                <input className="form-input" placeholder="http://127.0.0.1:7890"
                                    value={config.proxy} onChange={e => setConfig(c => ({ ...c, proxy: e.target.value }))} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div className="form-group">
                                    <label className="form-label">线程数</label>
                                    <input className="form-input" type="number" min={1} max={64}
                                        value={config.threads} onChange={e => setConfig(c => ({ ...c, threads: parseInt(e.target.value) || 16 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">额外引擎参数</label>
                                    <input className="form-input" placeholder="--key value"
                                        value={config.extraArgs} onChange={e => setConfig(c => ({ ...c, extraArgs: e.target.value }))} />
                                </div>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                                <input type="checkbox" checked={config.isLiveStream}
                                    onChange={e => setConfig(c => ({ ...c, isLiveStream: e.target.checked }))} />
                                直播流实时录制
                            </label>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onClose}>取消</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                        <SendOutlined /> {loading ? '创建中...' : '开始录制'}
                    </button>
                </div>
            </div>
        </div>
    );
}
