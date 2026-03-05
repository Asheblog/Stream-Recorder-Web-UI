import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useThemeStore } from '../stores/themeStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useState, useEffect } from 'react';
import { systemApi } from '../services/api';
import {
    DashboardOutlined,
    DownloadOutlined,
    PlaySquareOutlined,
    SettingOutlined,
    SunOutlined,
    MoonOutlined,
} from '@ant-design/icons';

const navItems = [
    { path: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    { path: '/tasks', icon: <DownloadOutlined />, label: '录制任务' },
    { path: '/videos', icon: <PlaySquareOutlined />, label: '视频库' },
    { path: '/settings', icon: <SettingOutlined />, label: '系统设置' },
];

const pageLabels: Record<string, string> = {
    '/': '仪表盘',
    '/tasks': '录制任务',
    '/videos': '视频库',
    '/settings': '系统设置',
};

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function MainLayout() {
    const { theme, toggle } = useThemeStore();
    const location = useLocation();
    const [systemStats, setSystemStats] = useState({ cpu: 0, memory: 0, memTotal: 0, memUsed: 0 });

    useWebSocket({
        onSystemStats: (data) => setSystemStats(data),
    });

    // Also poll system info on mount
    useEffect(() => {
        systemApi.info().then((info) => {
            setSystemStats({
                cpu: info.cpu.usage,
                memory: info.memory.usage,
                memTotal: info.memory.total,
                memUsed: info.memory.used,
            });
        }).catch(() => { });
    }, []);

    const pageTitle = pageLabels[location.pathname] || '任务详情';

    return (
        <>
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <div className="logo">SR</div>
                    <span className="name">Stream Recorder</span>
                </div>
                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Header */}
            <header className="header">
                <div className="header-title">{pageTitle}</div>
                <div className="header-right">
                    <div className="header-stat">
                        <span className="dot" style={{ background: systemStats.cpu > 80 ? 'var(--danger)' : 'var(--success)' }} />
                        CPU {systemStats.cpu}%
                    </div>
                    <div className="header-stat">
                        <span className="dot" style={{ background: systemStats.memory > 80 ? 'var(--warning)' : 'var(--info)' }} />
                        RAM {formatBytes(systemStats.memUsed)} / {formatBytes(systemStats.memTotal)}
                    </div>
                    <button className="theme-toggle" onClick={toggle}>
                        {theme === 'dark' ? <MoonOutlined /> : <SunOutlined />}
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="main">
                <Outlet />
            </main>
        </>
    );
}
