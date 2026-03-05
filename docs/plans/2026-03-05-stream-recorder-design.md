# Stream Recorder 全栈实现设计

## 背景与目标
- 基于 `docs/prd.md`、`docs/system-architecture.md`、`docs/database-architecture.md` 与 `docs/previews/*.html`，从零构建可运行的全栈应用。
- 目标是交付一套可直接启动的 Web 控制台，覆盖：仪表盘、任务管理、任务详情、视频库、系统设置。
- 后端提供 REST API + WebSocket，数据库使用 SQLite + Prisma。

## 方案比较

### 方案 A：NestJS + React 双工程（严格对齐文档）
- 优点：与架构文档一致度最高。
- 缺点：初始化成本高，当前仓库空白状态下首版交付较慢。

### 方案 B：Express + React 单仓工程（推荐）
- 优点：在保证 API 与数据模型一致的前提下，最快交付可运行版本；后续可平滑迁移至 Nest。
- 缺点：模块化能力弱于 Nest，需要在目录结构中加强分层约束。

### 方案 C：仅静态前端 + Mock API
- 优点：实现最快。
- 缺点：不满足“完成项目开发”与“测试通过”目标，不可接受。

## 选型结论
采用 **方案 B**：Express + React + Prisma + Socket.IO 的单仓 TypeScript 方案，保证正确性优先与快速落地，并保持与文档约定的数据结构/API 兼容。

## 架构设计
- `src/server`：后端 API、引擎调度、WebSocket。
- `src/web`：React 页面与样式系统，复刻预览 HTML 的视觉规范。
- `prisma/schema.prisma`：Task/TaskConfig/MediaFile/SystemSetting 四表。
- `tests/unit`：解析器与业务单元测试。
- `tests/integration`：API 集成测试（含数据库读写与状态迁移）。

## 数据与流程
- 任务状态流转：`QUEUED -> DOWNLOADING -> MERGING -> COMPLETED`，失败进入 `ERROR`，手动停止进入 `STOPPED`。
- 调度器根据 `task.max_concurrent` 限制并发。
- Engine 层支持两种模式：
  - 真引擎模式：存在 `N_m3u8DL-RE` 可执行文件时使用子进程。
  - 模拟模式：本地开发/测试使用定时器推进进度，保证端到端可测。

## UI 设计约束
- 参考预览页变量体系与布局（Sidebar/Header/Card/Table）。
- 使用 Lucide SVG 图标，禁止 emoji 图标。
- 支持亮暗主题切换，保留 `Inter + JetBrains Mono` 组合。
- 响应式断点覆盖 375/768/1024/1440。

## 测试策略
- 单元测试：stdout 进度解析、任务调度边界、参数构建。
- 集成测试：任务创建、启动、停止、重试、设置更新、文件列表接口。
- 前端构建校验：`vite build` 必须成功。

## 迁移说明
- 当前仓库为空，本次为 **无迁移、直接替换（初始化实现）**。
