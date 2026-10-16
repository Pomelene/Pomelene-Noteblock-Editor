# Desktop Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 建立可构建、可启动、可继续开发的 Electron + React + TypeScript 桌面工程，落实 Pattern 编辑子窗口和上下文音色栏。

**Architecture:** Electron 主进程持有工程会话及共享撤销；受限 preload API 连接 React。主窗口以 Playlist 为中心，Pattern 编辑器可在工作区内浮动或弹出原生窗口；音频使用本地真实采样。

**Tech Stack:** Electron、React、TypeScript、electron-vite、Lucide React、Vitest、Playwright Electron、electron-builder。

**Spec:** `docs/superpowers/specs/2026-10-17-desktop-foundation-design.md`

## Global Constraints

- Windows 优先；不宣称其他平台已测试。
- 音色仅在 Pattern 编辑器中显示。
- 不将 HTML 试作嵌入 webview 作为产品；使用 React 组件及独立状态模块。
- preload 只公开具体业务方法，校验 IPC 参数与发送窗口。
- NBS 采样默认基准为 MIDI 66；无合成替代音色。
- 暂无 NBS 读写，不展示可保存 NBS 的假功能。

## Review Focus

- 同一 Pattern 在多个窗口中修改时，不丢失另一窗口的更新。
- 非法参数或目标位置已有音符时，工程状态不改变。
- 浮动窗口最小化 / 关闭 / 再打开不会删除已编辑内容。
- 关闭所有编辑器后，主窗口无音色栏。
- 打包后离线资源和 preload 路径仍正确。

## Files and Interfaces

- `desktop/package.json`, `electron.vite.config.ts`, `tsconfig*.json`, `electron-builder.yml`：依赖、类型检查、构建、Windows 目录打包。
- `desktop/src/shared/project.ts`：工程、命令、快照类型；`createDemoProject(): Project`；`ProjectSession.dispatch(command): Snapshot`；拒绝非法命令。
- `desktop/src/main/index.ts`：主进程、受限 IPC、原生编辑窗口单例与广播。
- `desktop/src/preload/index.ts`：`getSnapshot`, `dispatch`, `onSnapshot`, `openPatternWindow` 四类业务 API。
- `desktop/src/renderer/src/`：App、FloatingWindow、PatternEditor、Playlist、AudioEngine、共享订阅和语义样式。
- `desktop/tests/project.test.ts`：多窗口顺序命令、引用与副本、非法操作、撤销。
- `desktop/scripts/smoke.cjs`：真实 Electron 多窗口及布局操作。

### Task 1: 可启动工程及可验证的共享状态

- [x] 配置独立目录、依赖和开发分支；本轮仅做环境配置，不为配置本身写重复断言。
- [x] 先写测试：独立复制不改原 Pattern；连续不同音符命令保留彼此更新；非法 tick / 音域 / 音色 / 同格冲突不改变快照；一次移动一次撤销。
- [x] 运行测试确认缺少实现，再实现 `ProjectSession` 并运行全套测试。

### Task 2: Electron 与 React 窗口

- [x] 配置 main / preload / renderer 隔离入口及明确业务 IPC。
- [x] 实现共享订阅，按修订号接收快照；清理订阅。
- [x] 实现主窗口 Playlist 和内部编辑子窗，音色、钢琴与编辑工具局限于子窗内。
- [x] 实现原生编辑窗口的去重、共享命令和同步；关闭子窗保留内容。
- [x] 类型检查及构建通过。

### Task 3: 实际运行与交付

- [x] Electron smoke：主窗口无音色栏；打开 / 最小化 / 恢复内部编辑器；弹出原生编辑器并去重；原生更新在主窗口可见；关闭重开数据保留。
- [x] 检查本地采样与打包资源，生成 Windows 可运行目录。
- [x] 新鲜代码审查并修复重要问题；重新运行受影响的检查。
- [x] 写运行说明、当前限制和 skill 来源，展示实际桌面窗口供用户继续评价。

配置和继续执行来自用户当前请求；具体实现由当前会话完成，审查单独进行。独立目录原先无 Git 仓库，不为新目录再创建重复 worktree。
