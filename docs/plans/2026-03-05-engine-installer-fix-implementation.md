# Engine Installer Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复引擎安装流程，确保根据当前运行环境（OS/CPU/libc）下载并安装正确的 N_m3u8DL-RE 发行资产。

**Architecture:** 提取统一安装模块作为单一事实来源，集中实现平台识别、GitHub Release 资产选择、下载解压与落盘；后端自动安装与 CLI 安装脚本共用该模块，删除过时实现，避免逻辑漂移。

**Tech Stack:** TypeScript, Node.js (https/http/fs/path/child_process), Vitest

---

### Task 1: 资产匹配规则测试

**Files:**
- Create: `tests/unit/engine-installer.test.ts`
- Modify: `src/server/engine/engine-installer.ts`

1. 添加针对平台/架构/libc 的匹配测试（先失败）
2. 实现最小匹配逻辑使测试通过

### Task 2: 统一安装模块

**Files:**
- Create: `src/server/engine/engine-installer.ts`
- Modify: `src/server/engine/auto-setup.ts`

1. 实现 GitHub latest release 元数据获取
2. 实现下载、解压、二进制定位与安装
3. 自动安装路径与日志接入 `ensureEngine`

### Task 3: CLI 安装脚本替换

**Files:**
- Create: `scripts/setup-engine.ts`
- Delete: `scripts/download-engine.js`
- Modify: `package.json`

1. 将 `npm run setup:engine` 切换到 `tsx` 脚本
2. 复用统一安装模块，修复 ESM/CJS 冲突

### Task 4: 端到端验证

**Files:**
- Test: `tests/unit/engine-installer.test.ts`

1. `npm run test:unit -- tests/unit/engine-installer.test.ts`
2. `npm run setup:engine`
3. `timeout 20s npm run dev`
