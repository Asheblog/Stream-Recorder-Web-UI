# Stream Recorder (M3U8/DASH 录制控制台)

基于 `docs/` 中的 PRD、系统架构与 HTML 预览实现的全栈项目，提供流媒体录制任务管理、视频库管理、系统设置与实时状态展示。

## 技术栈

- 前端：React 18 + Vite + 自定义 CSS（暗色 SaaS 面板风格）
- 后端：Express + Socket.IO
- 数据库：SQLite + Prisma ORM
- 测试：Vitest + Supertest（单元 + 集成）

## 功能覆盖

- 仪表盘：运行中/排队/完成/失败统计、系统负载、存储监控、最近任务
- 任务管理：新建任务（单条/批量）、启动/暂停/重试/删除、批量操作
- 任务详情：实时进度、关键指标、终端日志面板
- 视频库：网格/列表视图、播放、下载、复制路径、删除
- 系统设置：引擎路径、存储目录、并发与重试策略
- WebSocket：`task:progress`、`task:statusChange`、`system:stats`

## 快速开始

### 1) 安装依赖

```bash
npm install
```

### 2) 配置环境变量

```bash
cp .env.example .env
```

默认值：

- `DATABASE_URL=file:./data/app.db`
- `PORT=3000`
- `ENGINE_MODE=mock`

### 3) 初始化数据库

```bash
npm run db:generate
npm run db:push
```

### 4) 启动开发环境

```bash
npm run dev
```

- 前端开发地址：`http://localhost:5173`
- 后端 API 地址：`http://localhost:3000`

### 可选：自动下载引擎二进制

```bash
npm run setup:engine
```

## 构建与运行

```bash
npm run build
npm run start
```

## Docker 部署

```bash
docker compose up -d --build
```

启动后访问：`http://localhost:3000`

## 测试

```bash
npm run test
```

等价执行：

```bash
npm run test:unit
npm run test:integration
```

## 跨平台说明（Linux / Windows）

- 所有 npm 脚本均可在 Linux/Windows 运行（使用 `cross-env` 处理环境变量）
- 默认引擎与存储路径会根据平台生成不同初值
- 路径拼接统一使用 Node `path` API 处理

## 目录结构

```text
src/
  server/   # API + 调度器 + WebSocket + 服务层
  web/      # React 页面与组件
prisma/
  schema.prisma
tests/
  unit/
  integration/
docs/
  previews/ # 视觉参考
```

## 迁移策略

本仓库此前无可运行实现，本次为：**无迁移、直接替换（初始化实现）**。
