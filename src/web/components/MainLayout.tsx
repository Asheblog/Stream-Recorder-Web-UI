import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  Clapperboard,
  Download,
  Gauge,
  Moon,
  Settings,
  Sun
} from "lucide-react";

import { api } from "../api/client.js";
import { useSocketTasks } from "../hooks/useSocketTasks.js";
import type { SystemInfo } from "../types/index.js";

const NAV_ITEMS = [
  { to: "/dashboard", label: "仪表盘", icon: Gauge },
  { to: "/tasks", label: "录制任务", icon: Activity },
  { to: "/videos", label: "视频库", icon: Clapperboard },
  { to: "/settings", label: "系统设置", icon: Settings }
];

const INITIAL_STATS: SystemInfo = {
  cpu: 0,
  memory: 0,
  disk: { used: 0, total: 0, free: 0 },
  downloadSpeed: "0 MB/s"
};

export function MainLayout() {
  const location = useLocation();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [stats, setStats] = useState<SystemInfo>(INITIAL_STATS);

  useEffect(() => {
    document.body.classList.toggle("light", theme === "light");
  }, [theme]);

  useEffect(() => {
    let active = true;
    api.getSystemInfo().then((info) => {
      if (active) {
        setStats(info);
      }
    });

    const timer = setInterval(async () => {
      const next = await api.getSystemInfo();
      if (active) {
        setStats(next);
      }
    }, 8000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useSocketTasks({
    onSystemStats(payload) {
      setStats(payload as SystemInfo);
    }
  });

  const pageTitle = useMemo(() => {
    const nav = NAV_ITEMS.find((item) => location.pathname.startsWith(item.to));
    if (location.pathname.startsWith("/tasks/") && location.pathname !== "/tasks") {
      return "任务详情";
    }
    return nav?.label ?? "Stream Recorder";
  }, [location.pathname]);

  return (
    <div className="layout-root">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo" aria-hidden>
            SR
          </div>
          <div className="brand-text">Stream Recorder</div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`.trim()}
              >
                <Icon size={18} aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <a href="https://github.com/nilaoda/N_m3u8DL-RE" target="_blank" rel="noreferrer">
            N_m3u8DL-RE
          </a>
        </div>
      </aside>

      <header className="top-header">
        <div className="header-title-row">
          <h1>{pageTitle}</h1>
        </div>

        <div className="header-metrics">
          <span className="header-metric">
            <span className="dot cpu" />CPU {stats.cpu.toFixed(1)}%
          </span>
          <span className="header-metric">
            <span className="dot mem" />RAM {stats.memory.toFixed(1)}%
          </span>
          <span className="header-metric">
            <span className="dot speed" />↓ {stats.downloadSpeed}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme((previous) => (previous === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <Link to="/tasks" className="floating-shortcut" title="快速创建任务">
        <Download size={18} />
      </Link>
    </div>
  );
}
