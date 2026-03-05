# Stream Recorder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 交付一个可运行的 Stream Recorder 全栈应用，覆盖 PRD 核心能力并通过单元测试与集成测试。

**Architecture:** 使用单仓 TypeScript。后端采用 Express + Prisma + Socket.IO；前端采用 React + Vite 并复刻 docs/previews 视觉语言；引擎层提供真实/模拟双模式以保证开发与测试可用性。

**Tech Stack:** TypeScript, React, Vite, Express, Prisma, SQLite, Socket.IO, Vitest, Supertest

---

### Task 1: 初始化工程与依赖

**Files:**
- Create: `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`

**Step 1: 写基础配置文件**
- 定义 build/dev/test/lint/db 脚本。

**Step 2: 安装依赖并锁定版本**
- 运行 `npm install`，确保跨平台脚本可执行。

**Step 3: 运行空测试验证环境**
- 运行 `npm run test`（允许无用例通过）。

### Task 2: 建立数据库模型与初始化逻辑

**Files:**
- Create: `prisma/schema.prisma`, `src/server/db/*.ts`

**Step 1: 先写数据库相关单元测试（状态与默认设置）**
- 覆盖默认设置写入与读取。

**Step 2: 实现 Prisma schema 与 db 初始化代码**
- Task/TaskConfig/MediaFile/SystemSetting 与文档一致。

**Step 3: 运行单元测试验证通过**
- 执行 `npm run test:unit`。

### Task 3: 实现后端模块（Tasks/Settings/System/Files）

**Files:**
- Create: `src/server/**/*.ts`
- Test: `tests/integration/api.integration.test.ts`

**Step 1: 先写 API 集成测试**
- 覆盖创建任务、查询列表、启动/停止、更新设置。

**Step 2: 实现 Express 路由与服务层**
- 保持与文档 API 路径一致。

**Step 3: 跑集成测试直到通过**
- 执行 `npm run test:integration`。

### Task 4: 实现引擎进程管理与 WebSocket 推送

**Files:**
- Create: `src/server/engine/*.ts`
- Test: `tests/unit/stdout-parser.test.ts`

**Step 1: 编写 stdout 解析失败用例**
- 先确认未实现时失败。

**Step 2: 实现 parser + mock engine + scheduler**
- 保证 progress/status 事件推送。

**Step 3: 补充通过用例**
- `npm run test:unit`。

### Task 5: 实现前端页面与主题系统

**Files:**
- Create: `src/web/**/*`

**Step 1: 搭建路由与主布局**
- Sidebar/Header/Main 三段式。

**Step 2: 完成五大页面并接入 API**
- Dashboard/Tasks/TaskDetail/VideoLibrary/Settings。

**Step 3: 视觉一致性修正**
- 对齐 docs/previews 配色、卡片层级、动画与响应式。

### Task 6: 全量验证与交付

**Files:**
- Modify: `README.md`

**Step 1: 运行所有验证命令**
- `npm run lint`
- `npm run test`
- `npm run build`

**Step 2: 补充 README 使用说明**
- 包含 Linux/Windows 启动方式与脚本。

**Step 3: 记录迁移策略**
- 标记“无迁移、直接替换（初始化实现）”。
