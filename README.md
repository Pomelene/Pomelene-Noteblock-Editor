# NoteBlock Editor · Desktop Foundation

Electron + React + TypeScript 的真实桌面工程，Windows 优先。当前是继续开发用的可交互基础版本。

## 直接运行

打开 `release/win-unpacked/NoteBlock Editor.exe`。保留同目录的 `resources`、DLL、locales 等文件，不能只移动 EXE。

主窗口双击左侧 Pattern 或编排中的乐段打开编辑器。标题栏可拖动；右上角支持最小化、最大化、关闭以及弹出独立桌面窗口。音色只出现在 Pattern 编辑器内。

**当前编辑仅保留在运行中的主进程会话里。退出整个应用会重置示例工程；还没有工程保存、NBS 文件读写或 MIDI 导入。** 关闭或重开编辑子窗口会保留当前会话里的内容。

## 编辑操作

| 位置 | 操作 |
| --- | --- |
| Playlist | 先在左侧选 Pattern，左键放置引用；右键删除引用；双击编辑；按小节拖动移动 |
| Pattern / 图层 | 左键放置，右键删除；拖动音符改变时间及图层 |
| Pattern / 钢琴卷帘 | 拖动改变时间与音高；垂直滚动覆盖 MIDI 21–108 |
| 多选 | Shift + 空白处拖动框选；选择工具拖动框选；Ctrl + 点击增减；Ctrl+A 全选 |
| 剪贴板 | Ctrl+C / X 复制或剪切；点击时间标尺设置目标 tick 后 Ctrl+V。应用内部剪贴板跨原生窗口共享 |
| 微调 | 左右方向键移动一个 tick；上下方向键移调一个半音；Shift + 上下方向键移调八度 |
| 音色 / 力度 | 点击音色原音试听，双击应用到选区；力度滑杆修改落笔值和选中音符 |
| 播放 | 主窗口播放整段编排，Pattern 播放按钮试听当前乐段；主窗口空格切换播放/停止 |
| 历史 | Ctrl+Z 撤销，Ctrl+Y / Ctrl+Shift+Z 重做；所有窗口共享历史 |

相同 Pattern 的多个编排位置共享音符内容；“独立副本”创建可单独修改的新 Pattern。同层同 tick 只能有一个音符，冲突操作会被拒绝并在底部说明。

## 开发

验证环境：Windows x64、Node 24、pnpm 11.25.0。项目包含固定版本 pnpm，已有依赖时可用 `node node_modules/pnpm/bin/pnpm.cjs` 替代全局 `pnpm`。

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
pnpm pack:win
node scripts/smoke.cjs --packaged
```

`build`、`pack:win` 按顺序运行，打包期间不要同时重建 `out/`。目前只配置 Windows 目录包，未制作安装器，也未验证 macOS / Linux 打包。

`pnpm-workspace.yaml` 将缓存放在父目录 `tooling/`，只允许 Electron / esbuild 构建脚本。Electron 首次安装会从官方 release 下载运行时。网络中断时，可运行父目录的 `tooling/download-electron-runtime.cjs` 分段下载并核对官方 SHA-256；本次运行时已完成校验。

## 代码结构

- `src/main`：窗口生命周期、所属窗口校验、命令入口及快照广播。
- `src/preload`：仅暴露获取快照、提交命令、订阅、打开 Pattern 窗口及音符剪贴板的业务 API。
- `src/shared/project.ts`：权威工程状态、参数校验、原子编辑、共享撤销和会话剪贴板。
- `src/renderer/src`：React 编排和子窗口、Canvas 音符网格、采样播放、界面样式。
- `src/renderer/public/sounds`：16 个本地 OGG 采样；来源及 SHA-256 见 `docs/sample-sources.json`。
- `tests`：命令及音频取消回归测试。
- `scripts/smoke.cjs`：运行真正的 Electron，检查窗口、编辑、IPC、资源解码及打包结果。
- `test-results`：本机验收截图和 JSON 结果（不提交）。

渲染进程启用 context isolation 和 sandbox，禁用 Node；主进程以命令修改最新工程状态，不接受窗口整份覆盖项目。每次拖动只提交一次命令。

## UI skill 与参考

用户指定的 [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 已安装到 `C:/Users/Lenovo/.codex/skills/ui-ux-pro-max`，固定提交 `56ea9cf174ed86786187daa9de0e6247cb0747e4`，版本 2.15.0。它提供设计及实现指导；Electron、React、TypeScript 是应用技术栈。

本次采用本地系统字体、可见键盘焦点、语义标签、低干扰状态反馈和上下文工具栏。skill 两次设计系统搜索未匹配到合适的桌面 DAW 布局，未采用其网站 Hero / FAQ 推荐；结构沿用用户认可的 NBS / FL 方向。

音色来自本机 Minecraft Note Block Studio 3.11.0 的 `Data/Sounds`，基准音为 MIDI 66 / F♯4，播放倍率 `2 ** ((midi - 66) / 12)`。保留原始采样尾音，不使用合成器代替。源数据、默认基准核对及参考图记录在父目录 `docs/discovery/`。

## 后续开发边界

下一阶段接入 NBS 读写与工程持久化，再扩展资源包/自定义采样、MIDI 转换、和弦与鼓组模板。当前固定八个图层和八条编排轨，吸附为 1/16，适合验证操作和窗口方向；长曲虚拟滚动、大工程性能及跨窗口统一播放调度尚未完成。
