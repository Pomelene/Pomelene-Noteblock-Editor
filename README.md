# NoteBlock Editor 0.4.0

Windows first 的 Electron / React / TypeScript 音符盒编辑器。本目录是独立重构工程，旧版 `desktop` 保留。

采用源对象、编排引用、编辑视图三层模型。Pattern 和 Sample 均可反复放置、打开多个内部或原生桌面编辑实例；主进程维护工程、历史及原生文件访问，音频通过 AudioContext 时钟调度并跨窗口协调。

## 已实现

- Playlist 自由编排，独立引用长度/偏移、移动、框选、剪贴板、独立副本、轨道静音/独奏/锁定。
- 片段拖长补空白、缩短裁播放窗口，保留源数据；不会自动循环或变速。
- 钢琴卷帘、NBS 图层视图、音高/音色/力度/声像/微调、力度拖动、基础和弦放置。
- 16 个实际原版采样，真实 PCM 波形，采样预听设置，自定义乐器调音与路径管理。
- 多编辑实例、八方向缩放、最大化/还原、最小化、原生弹出；列表右键菜单与画布右键擦除。
- 独立播放/暂停和终止，暂停精确保留位置，一次终止归零；SONG / Pattern / Sample 范围。
- 原生文件对话框，原子写入、失败保留原文件、未保存保护、完整工程保存/重开。
- NBS v0–5 读取、v5 导出、旧工程迁移；自定义 NBS 定义及音频 ZIP 自动匹配，音频包导出。
- NBS 导入预览和可选的“智能 Pattern 整理（Beta）”：按声部分组、识别完全相同的乐句并复用；保留原始布局备份，支持恢复和撤销。

打开 NBS 后可取消勾选，沿用单 Pattern 原始布局。智能整理不量化、移调或删除音符，也不把近似旋律当成同一个 Pattern。乐句候选支持 1、2、3、4、6、8 小节，使用乐曲拍号；这是一版可继续改进的启发式算法，不承诺理解主歌、副歌或所有声部。

“帮助 → 智能整理报告…”查看结果；“编辑 → 恢复原始导入布局…”会用导入时的音符和编排替换当前布局，请先保存需要保留的修改。恢复可撤销。完整工程保存报告和备份；NBS 格式本身不保存 Pattern，重新打开导出的 NBS 仍需重新选择整理方式。

详细操作见 [使用说明](resources/使用说明.txt)。本轮研究见 [制作经验与算法依据](docs/smart-pattern-research.md)，验证和已知范围见 [0.4 验收报告](docs/validation-0.4.0.md)。

## 本地开发

需要 Node.js 22+ 与 pnpm 11.25。先在独立检出目录中执行 `pnpm install --frozen-lockfile`。

```powershell
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
pnpm smoke:smart
pnpm pack:win
pnpm smoke:packaged
```

此开发机复用了旧版 node_modules 的目录联接。源码归档不包含此联接、node_modules 或生成的 out；新机器正常安装依赖即可。
已在 pnpm-workspace.yaml 中允许 Electron / esbuild 安装脚本，并关闭命令运行前隐式重新安装，依据 pnpm 11 官方设置（https://pnpm.io/blog/releases/11.0）。也可直接执行已安装工具：

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/vitest/vitest.mjs run
node node_modules/electron-vite/bin/electron-vite.js build
node node_modules/electron-builder/cli.js --win zip --x64
node scripts/smoke.cjs
node scripts/smart-import-smoke.cjs
node scripts/analyze-nbs.cjs 'D:/path/to/Songs'
```

真实 Electron 测试只替换系统对话框的路径选择；文件 IPC、序列化、磁盘读写、采样解码、鼠标和键盘操作仍使用实际实现。`NBE_EXE` 可指定解压后的发布 EXE。

## 工程结构

- `src/shared`：数据契约、事务/历史、NBS 适配、音频事件计划。
- `src/shared/smartPattern`：独立的分组、特征、分段和精确复用算法，参数档案与算法版本；不依赖 UI 或网络服务。
- `src/main`：安全 IPC、原生窗口、文件保存、音频 ZIP。
- `src/preload`：受限桥接与工程代际防护。
- `src/renderer/src`：工作区、编辑器、交互、窗口/菜单、音频时钟。
- `src/legacy`：沿用旧版已验证的底层 NBS 格式编解码，未沿用旧 UI/状态架构。
- `tests` / `scripts/smoke.cjs`：单元、窗口组件、实际 Electron 回归。
- `docs/superpowers`：设计与实施方案。

## 参考资料与资源

交互理解依据 FL 官方 Playlist、Piano roll、Channel Rack、窗口说明和 NBS 官方格式/教程，见 [参考说明](docs/reference-notes.md)。没有声称完成 FL 原生界面代码的反编译。
内置采样来自本机 Minecraft Note Block Studio 的实际 OGG，来源及哈希记录于 `docs/sample-sources.json`。未包含 FL 二进制、界面图片或其商业资源。图标采用 Lucide；应用图标为本项目绘制。

## 当前边界

本版是可运行的重构核心，472 项需求总表仍是持续开发清单。智能整理仍可能拆出较多 Pattern；缺少可靠名称的交织旋律、弱起和跨小节主题需要后续改进。超过资源预算时保留原布局，并在预览中说明原因。MIDI 智能转换、鼓点素材库、半自动丰富听感未实现。NBS v6 未支持。直接音频 Clip 无法无损表达成 NBS，导出会提示。复杂拍号、细分时间及工程播放参数受到 NBS 格式约束，完整工程保留所有内部数据。
