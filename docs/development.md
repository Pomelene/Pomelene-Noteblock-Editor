# 开发指南

后续开发遵循 [桌面运行环境可替换性](desktop-runtime-portability.md)：保持音乐与文件格式核心独立、宿主能力集中适配，为未来评估更轻量方案保留迁移空间。当前继续使用 Electron 推进核心功能。

新增输入调研见 [文件格式与非发声结构参考表](input-formats-and-control-events.md)，包含格式结构、控制／视觉事件编码、已验证来源和当前语义缺口；它是设计参考，不代表这些新增能力已经实现。

需要 Node.js 22+ 与 pnpm 11.25。先在独立检出目录中执行 `pnpm install --frozen-lockfile`。

```powershell
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
pnpm smoke:smart
pnpm smoke:phrases
pnpm smoke:workspace
pnpm pack:win
pnpm smoke:packaged
```

此开发机复用了旧版 node_modules 的目录联接。源码归档不包含此联接、node_modules 或生成的 out；新机器正常安装依赖即可。
已在 pnpm-workspace.yaml 中允许 Electron / esbuild 安装脚本，并关闭命令运行前隐式重新安装，依据 pnpm 11 官方设置（https://pnpm.io/blog/releases/11.0）。也可直接执行已安装工具：

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/vitest/vitest.mjs run
node node_modules/electron-vite/bin/electron-vite.js build
node node_modules/electron-builder/cli.js --win nsis --x64
node scripts/smoke.cjs
node scripts/smart-import-smoke.cjs
node scripts/phrase-interaction-smoke.cjs
node scripts/workspace-shortcuts-smoke.cjs
node scripts/analyze-nbs.cjs 'D:/path/to/Songs'
```

真实 Electron 测试只替换系统对话框的路径选择；文件 IPC、序列化、磁盘读写、采样解码、鼠标和键盘操作仍使用实际实现。`NBE_EXE` 可指定解压后的发布 EXE。

安装版验收使用 `scripts/installer-lifecycle.ps1 -Installer <Setup.exe>`，会创建当前用户的临时测试安装和快捷方式，完成后卸载；若已经存在真实安装或同名快捷方式则拒绝执行。不要在未检查脚本和测试目录时直接用于已有安装。开发构建仍可用 `pnpm pack:dir` 生成免安装目录。

## 工程结构

- `src/shared`：数据契约、事务/历史、NBS 适配、音频事件计划。
- `src/shared/smartPattern`：独立的分组、特征、分段和精确复用算法，参数档案与算法版本；不依赖 UI 或网络服务。
- `src/main`：安全 IPC、原生窗口、文件保存、音频 ZIP。
- `src/preload`：受限桥接与工程代际防护。
- `src/renderer/src`：工作区、编辑器、交互、窗口/菜单、音频时钟。
- `src/legacy`：沿用旧版已验证的底层 NBS 格式编解码，未沿用旧 UI/状态架构。
- `tests` / `scripts/smoke.cjs`：单元、窗口组件、实际 Electron 回归。
- `docs/superpowers`：设计与实施方案。


仓库与历史产物约定见 [仓库与产物管理](repository-and-retention.md)。

## 参考资料与资源

交互参考 FL Studio 官方 Playlist、Piano roll、Channel Rack、窗口说明及 NBS 官方格式与教程，见 [参考说明](reference-notes.md)。没有声称完成 FL 原生界面代码的反编译。

内置采样来自本机 Minecraft Note Block Studio 的 OGG，来源记录见 `sample-sources.json`。未包含 FL 二进制、界面图片或其商业资源。图标采用 Lucide；应用图标为本项目绘制。
