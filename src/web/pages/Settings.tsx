import { useState, useEffect, useCallback } from 'react';
import { settingsApi } from '../services/api';
import { message, Switch } from 'antd';
import {
    ToolOutlined,
    FolderOutlined,
    ThunderboltOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    SaveOutlined,
    UndoOutlined,
} from '@ant-design/icons';

interface SettingsData {
    [key: string]: { value: string; description: string | null };
}

export default function Settings() {
    const [settings, setSettings] = useState<SettingsData>({});
    const [original, setOriginal] = useState<SettingsData>({});
    const [dirty, setDirty] = useState(false);
    const [testing, setTesting] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, { ok: boolean; version?: string; error?: string }>>({});

    const loadSettings = useCallback(async () => {
        try {
            const data = await settingsApi.getAll();
            setSettings(data);
            setOriginal(data);
            setDirty(false);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { loadSettings(); }, [loadSettings]);

    const updateValue = (key: string, value: string) => {
        setSettings(prev => ({
            ...prev,
            [key]: { ...prev[key], value },
        }));
        setDirty(true);
    };

    const handleSave = async () => {
        try {
            const updates: Record<string, string> = {};
            for (const [key, s] of Object.entries(settings)) {
                if (original[key]?.value !== s.value) {
                    updates[key] = s.value;
                }
            }
            await settingsApi.update(updates);
            message.success('设置已保存');
            loadSettings();
        } catch (err: any) { message.error(err.message); }
    };

    const handleReset = () => {
        setSettings(original);
        setDirty(false);
    };

    const handleTestEngine = async () => {
        setTesting('engine');
        try {
            const result = await settingsApi.testEngine(settings['engine.n_m3u8dl_path']?.value);
            setTestResults(prev => ({ ...prev, engine: result }));
            if (result.ok) message.success(`引擎可用: ${result.version}`);
            else message.error(`引擎不可用: ${result.error}`);
        } catch (err: any) {
            setTestResults(prev => ({ ...prev, engine: { ok: false, error: err.message } }));
        }
        setTesting(null);
    };

    const handleTestFfmpeg = async () => {
        setTesting('ffmpeg');
        try {
            const result = await settingsApi.testFfmpeg(settings['engine.ffmpeg_path']?.value);
            setTestResults(prev => ({ ...prev, ffmpeg: result }));
            if (result.ok) message.success(`FFmpeg 可用: ${result.version}`);
            else message.error(`FFmpeg 不可用: ${result.error}`);
        } catch (err: any) {
            setTestResults(prev => ({ ...prev, ffmpeg: { ok: false, error: err.message } }));
        }
        setTesting(null);
    };

    const getValue = (key: string) => settings[key]?.value || '';

    return (
        <>
            {/* Engine Config */}
            <div className="settings-section">
                <div className="settings-section-title"><ToolOutlined /> 引擎配置</div>
                <div className="settings-card">
                    <div className="form-group">
                        <label className="form-label">N_m3u8DL-RE 路径（留空则自动查找）</label>
                        <div className="settings-row">
                            <input className="form-input" placeholder="留空自动查找 bin/ 或系统 PATH"
                                value={getValue('engine.n_m3u8dl_path')}
                                onChange={e => updateValue('engine.n_m3u8dl_path', e.target.value)} />
                            <button className="btn btn-ghost" onClick={handleTestEngine} disabled={testing === 'engine'}>
                                {testResults.engine ? (testResults.engine.ok ? <CheckCircleOutlined style={{ color: 'var(--success)' }} /> : <CloseCircleOutlined style={{ color: 'var(--danger)' }} />) : null}
                                {testing === 'engine' ? '测试中...' : '测试'}
                            </button>
                        </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">FFmpeg 路径（留空则使用系统 PATH）</label>
                        <div className="settings-row">
                            <input className="form-input" placeholder="留空使用系统 PATH"
                                value={getValue('engine.ffmpeg_path')}
                                onChange={e => updateValue('engine.ffmpeg_path', e.target.value)} />
                            <button className="btn btn-ghost" onClick={handleTestFfmpeg} disabled={testing === 'ffmpeg'}>
                                {testResults.ffmpeg ? (testResults.ffmpeg.ok ? <CheckCircleOutlined style={{ color: 'var(--success)' }} /> : <CloseCircleOutlined style={{ color: 'var(--danger)' }} />) : null}
                                {testing === 'ffmpeg' ? '测试中...' : '测试'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Storage Config */}
            <div className="settings-section">
                <div className="settings-section-title"><FolderOutlined /> 存储配置</div>
                <div className="settings-card">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">默认保存目录</label>
                        <input className="form-input" placeholder="/data/videos"
                            value={getValue('storage.save_dir')}
                            onChange={e => updateValue('storage.save_dir', e.target.value)} />
                    </div>
                </div>
            </div>

            {/* Task Config */}
            <div className="settings-section">
                <div className="settings-section-title"><ThunderboltOutlined /> 任务配置</div>
                <div className="settings-card">
                    <div className="form-group">
                        <label className="form-label">最大并发任务数</label>
                        <input className="form-input" type="number" min={1} max={20}
                            value={getValue('task.max_concurrent')}
                            onChange={e => updateValue('task.max_concurrent', e.target.value)}
                            style={{ width: 120 }} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">默认下载线程数</label>
                        <input className="form-input" type="number" min={1} max={64}
                            value={getValue('task.default_threads')}
                            onChange={e => updateValue('task.default_threads', e.target.value)}
                            style={{ width: 120 }} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">自动重试失败任务</label>
                        <Switch
                            checked={getValue('task.auto_retry') === 'true'}
                            onChange={v => updateValue('task.auto_retry', String(v))}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">最大重试次数</label>
                        <input className="form-input" type="number" min={1} max={10}
                            value={getValue('task.max_retry_count')}
                            onChange={e => updateValue('task.max_retry_count', e.target.value)}
                            style={{ width: 120 }} />
                    </div>
                </div>
            </div>

            {/* Save Bar */}
            {dirty && (
                <div style={{
                    position: 'fixed', bottom: 0, left: 'var(--sidebar-width)', right: 0,
                    background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
                    padding: '12px 28px', display: 'flex', justifyContent: 'flex-end', gap: 12,
                    zIndex: 100,
                }}>
                    <button className="btn btn-ghost" onClick={handleReset}><UndoOutlined /> 重置</button>
                    <button className="btn btn-primary" onClick={handleSave}><SaveOutlined /> 保存设置</button>
                </div>
            )}
        </>
    );
}
