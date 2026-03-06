# Stream Recorder Web UI

M3U8/DASH 视频流录制可视化控制台，基于 **N_m3u8DL-RE** 引擎构建。

## 功能特性

- 🎬 **可视化任务管理** — 创建、监控、控制录制任务
- 📊 **实时仪表盘** — CPU/内存/磁盘使用率监控
- 🎥 **视频库** — 已下载视频的管理、预览、下载
- ⚡ **WebSocket 实时推送** — 进度、速度、状态实时更新
- 🧾 **任务日志体系** — 实时增量日志 + 历史日志查询
- 🔁 **自动重试与批量重试** — 支持失败任务重试策略
- 🌙 **暗色/亮色主题** — 一键切换
- 📱 **响应式导航** — 侧栏折叠 + 移动端底部导航
- 🔧 **灵活配置** — 引擎路径、并发数、线程数、代理、临时目录、输出格式等

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React 18 + Ant Design 5 + Vite |
| 后端 | Express + Socket.IO |
| 数据库 | SQLite + Prisma ORM |
| 引擎 | N_m3u8DL-RE |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

```bash
npx prisma db push
```

### 3. 下载引擎 (可选, 自动检测平台)

```bash
npm run setup:engine
```

> 支持 Windows (x64)、Linux (x64/arm64)、macOS (x64/arm64)

### 4. 启动开发服务器

```bash
npm run dev
```

- 前端: http://localhost:5173
- 后端 API: http://localhost:3000

### 5. 生产构建

```bash
npm run build
npm start
```

## Docker 部署

```bash
docker compose up -d
```

## Windows / WSL 支持

- **Windows**: 自动下载 `N_m3u8DL-RE_win-x64.exe`，使用 `taskkill` 停止进程
- **WSL/Linux**: 自动下载 `N_m3u8DL-RE_linux-x64`，使用 `SIGINT` 优雅停止

## 项目结构

```
├── src/
│   ├── server/          # Express 后端
│   │   ├── engine/      # N_m3u8DL-RE 引擎管理
│   │   ├── routes/      # API 路由
│   │   └── db.ts        # Prisma 数据库
│   └── web/             # React 前端
│       ├── pages/       # 5 个页面
│       ├── components/  # UI 组件
│       ├── hooks/       # WebSocket Hook
│       └── services/    # API 服务
├── prisma/              # 数据库 Schema
├── scripts/             # 引擎下载脚本
└── tests/               # 单元/集成测试
```

## License

MIT
