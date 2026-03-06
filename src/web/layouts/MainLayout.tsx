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
    MenuFoldOutlined,
    MenuUnfoldOutlined,
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
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond: number): string {
    if (!bytesPerSecond || bytesPerSecond <= 0) return '0 B/s';
    return `${formatBytes(bytesPerSecond)}/s`;
}

export default function MainLayout() {
    const { theme, toggle } = useThemeStore();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(localStorage.getItem('sidebar_collapsed') === 'true');
    const [systemStats, setSystemStats] = useState({
        cpu: 0,
        memory: 0,
        memTotal: 0,
        memUsed: 0,
        downloadSpeedTotal: 0,
    });

    useWebSocket({
        onSystemStats: (data) => {
            setSystemStats((prev) => ({
                ...prev,
                cpu: data.cpu,
                memory: data.memory,
                memTotal: data.memTotal,
                memUsed: data.memUsed,
                downloadSpeedTotal: data.downloadSpeedTotal || 0,
            }));
        },
    });

    useEffect(() => {
        systemApi.info().then((info) => {
            setSystemStats({
                cpu: info.cpu.usage,
                memory: info.memory.usage,
                memTotal: info.memory.total,
                memUsed: info.memory.used,
                downloadSpeedTotal: info.downloadSpeedTotal || 0,
            });
        }).catch(() => { });
    }, []);

    const pageTitle = pageLabels[location.pathname] || (location.pathname.startsWith('/tasks/') ? '任务详情' : '控制台');

    const toggleSidebar = () => {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem('sidebar_collapsed', String(next));
    };

    return (
        <div className={`layout-root ${collapsed ? 'sidebar-collapsed' : ''}`}>
            <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
                <div className="sidebar-brand">
                    <div className="logo" aria-hidden="true">SR</div>
                    {!collapsed && <span className="name">Stream Recorder</span>}
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            aria-label={item.label}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            {!collapsed && item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button
                        className="sidebar-collapse-btn"
                        onClick={toggleSidebar}
                        aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
                    >
                        {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        {!collapsed && <span>折叠</span>}
                    </button>
                </div>
            </aside>

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
                    <div className="header-stat">
                        <span className="dot" style={{ background: 'var(--accent)' }} />
                        {formatSpeed(systemStats.downloadSpeedTotal)}
                    </div>
                    <button className="theme-toggle" onClick={toggle} aria-label="切换主题">
                        {theme === 'dark' ? <MoonOutlined /> : <SunOutlined />}
                    </button>
                </div>
            </header>

            <main className="main">
                <Outlet />
            </main>

            <nav className="mobile-tabbar" aria-label="移动端导航">
                {navItems.map((item) => (
                    <NavLink
                        key={`mobile-${item.path}`}
                        to={item.path}
                        end={item.path === '/'}
                        className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}
                        aria-label={item.label}
                    >
                        <span className="mobile-tab-icon">{item.icon}</span>
                        <span className="mobile-tab-label">{item.label}</span>
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
