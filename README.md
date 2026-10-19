# Pomelene Noteblock Editor 0.5.3

Windows first 的 Electron / React / TypeScript 音符盒编辑器。本目录是独立重构工程，旧版 `desktop` 保留。

远端代码仓库：[Pomelene/Pomelene-Noteblock-Editor](https://github.com/Pomelene/Pomelene-Noteblock-Editor)（私有）。`main` 保存当前代码，版本标签保留已交付源码，`legacy/desktop-0.2` 保留旧工程提交历史。开发与本地文件保留规则见 [仓库与产物管理](docs/repository-and-retention.md)。

当前开发版 **0.5.3** 进行视觉减法：暗色中性灰界面，去掉装饰渐变、厚阴影、重复徽标、零数量和常驻快捷键长提示，压缩音色标签与参数面板的视觉间隙。关键选中状态、音符颜色、锁定／静音／错误提示及键盘焦点保留。

播放范围显示“整曲／当前片段”，速度、拍号和播放位置用中文标识。和弦详细说明收进面板的“使用说明”，完整操作与快捷键仍可通过 F1／帮助菜单查看。0.5.2 的和弦生成与连续擦除功能继续保留。

本轮验证见 [0.5.3 验证记录](docs/validation-0.5.3.md)；此前 [0.5.2 记录](docs/validation-0.5.2.md) 保留和弦算法、文件及音频测试依据。

工程仍使用带版本前缀和 CRC32 校验的 v2 格式；此前 NBS 控制事件与格式支持见 [工程 v2 与 NBS 控制事件](docs/project-v2.md) 与 [0.5.1 验证记录](docs/validation-0.5.1.md)。

采用源对象、编排引用、编辑视图三层模型。Pattern 是可编辑乐段，片段采样是只读的可复用音符快照，均可反复编排和打开多个内部或原生窗口。历史音频文件与乐器单音在“音频 / 乐器资源”中单独管理。主进程维护工程、历史及原生文件访问，音频通过 AudioContext 时钟调度并跨窗口协调。

## 已实现

- 大型 NBS 智能整理：最多分析 65,536 条图层／音色通道，输出预算与工程格式对齐（256 轨道、1,024 Pattern、10,000 引用）；复杂歌曲合并相邻乐句或按音色／音区共享轨道，原始图层与全部音符保留。整理摘要支持百万音符。
- 编排行高 24–128px、NBS 图层行高 20–96px、钢琴行高 12–48px；编辑区内 Ctrl+滚轮以鼠标时间位置为中心缩放，普通滚轮继续滚动。
- “添加 → 自定义音色与映射…”管理缺失或自定义音色；支持手选替换、建议分配、试听、重置和撤销，绑定随工程保存，播放与 NBS 导出统一补偿原调音。建议参考本地 notebot 的名称、音域与节奏分析，不会自动替换原音色。

- Playlist 自由编排，独立引用长度/偏移、移动、框选、剪贴板、独立副本、轨道静音/独奏/锁定。
- 片段拖长补空白、缩短裁播放窗口，保留源数据；不会自动循环或变速。
- P 绘制、B 连续笔刷、E 选择、D 连续删除，编排另有 T 静音、S 滑移；快速拖动补齐经过的位置，回扫不重复，一个手势一次撤销。
- 共用的拍值吸附选择器：关闭、随缩放变化的自动网格、直拍、三连音、小节；Alt 临时自由定位，拖动保留原有离格偏移。
- Pattern / 编排选区保存为只读片段采样、导入外部 NBS 片段、只读预览及预听、根据采样创建独立 Pattern；片段引用同样可补静音和裁剪。
- 钢琴卷帘、NBS 图层视图、音高/音色/力度/声像/微调、力度拖动、基础和弦放置。
- 16 个实际原版采样，真实 PCM 波形，采样预听设置，自定义乐器调音与路径管理。
- 多编辑实例、八方向缩放、最大化/还原、最小化、原生弹出；列表右键菜单与画布右键擦除。
- 整曲 Playlist 也作为子窗口，可与 Pattern 平铺、层叠；所有编辑器可弹出成系统窗口并停靠回主工作区，共享工程和撤销。
- 按上下文分派快捷键，F1 搜索操作；支持选区反选/取消、音符八度移动、网格切换、定位、缩放预设与窗口切换。输入框保留文字编辑。
- Pattern 显眼的音色选择栏显示各音色音符数量；聚焦当前音色时，其余音色音符和力度条半透明，支持显示全部。
- 独立播放/暂停和终止，暂停精确保留位置，一次终止归零；SONG / Pattern / Sample 范围。
- 原生文件对话框，原子写入、失败保留原文件、未保存保护、完整工程保存/重开。
- NBS v0–6 读取、v5 导出；兼容旧文件零填充、少报图层及扩展原版音色，异常力度明确提示规范化。v6 铜号按具名自定义资源保留，音频缺失时明确提示。
- NBS 变速与停止发声控制参与整曲播放、跳转和循环；视觉事件保留并可查看。控制定义不作为缺失采样。工程保存为带版本前缀、长度及 CRC32 校验的 v2 文件，旧工程不再导入。
- 播放位置固定数字栏宽，TICK 始终三位；PAT 目标跟随编排中的来源选择和活动编辑窗口，SONG 不受来源选择影响。
- NBS 导入预览和可选的“智能 Pattern 整理（Beta）”：按声部分组、识别完全相同的乐句并复用；保留原始布局备份，支持恢复和撤销。

打开 NBS 后可取消勾选，沿用单 Pattern 原始布局。智能整理不量化、移调或删除音符，也不把近似旋律当成同一个 Pattern。乐句候选支持 1、2、3、4、6、8 小节，使用乐曲拍号；这是一版可继续改进的启发式算法，不承诺理解主歌、副歌或所有声部。

“帮助 → 智能整理报告…”查看结果；“编辑 → 恢复原始导入布局…”会用导入时的音符和编排替换当前布局，请先保存需要保留的修改。恢复可撤销。完整工程保存报告和备份；NBS 格式本身不保存 Pattern，重新打开导出的 NBS 仍需重新选择整理方式。

保存选区会截取所选引用可见窗口内的触发事件，保留中间留白和末尾补白；不将音频识别成音符。片段音符和图层只读，音色仍引用当前工程的乐器资源；导入片段保留 tick 并跟随工程速度。全局控制事件通过整曲 NBS 打开，当前不直接导入为片段。工程仅支持新的 v2 容器，不读取此前的 JSON 工程。

详细操作见 [使用说明](resources/使用说明.txt)。本次正式命名发布见 [0.5.0 发布记录](docs/pomelene-noteblock-editor-0.5.0.md)，功能验收见 [此前开发验收报告](docs/validation-0.7.0.md)，历史见 [0.6.1 报告](docs/validation-0.6.1.md)；算法依据见 [制作经验与算法依据](docs/smart-pattern-research.md)。

## 本地开发

后续开发遵循 [桌面运行环境可替换性](docs/desktop-runtime-portability.md)：保持音乐与文件格式核心独立、宿主能力集中适配，为未来评估更轻量方案保留迁移空间。当前继续使用 Electron 推进核心功能。

新增输入调研见 [文件格式与非发声结构参考表](docs/input-formats-and-control-events.md)，包含格式结构、控制／视觉事件编码、已验证来源和当前语义缺口；它是设计参考，不代表这些新增能力已经实现。

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
node node_modules/electron-builder/cli.js --win zip --x64
node scripts/smoke.cjs
node scripts/smart-import-smoke.cjs
node scripts/phrase-interaction-smoke.cjs
node scripts/workspace-shortcuts-smoke.cjs
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

本版是可运行的重构核心，472 项需求总表仍是持续开发清单。智能整理仍可能拆出较多 Pattern；缺少可靠名称的交织旋律、弱起和跨小节主题需要后续改进。超过资源预算时保留原布局，并在预览中说明原因。MIDI 智能转换、鼓点素材库、半自动丰富听感未实现。NBS v6 的新铜号需对应音频资源，导出仍为 v5。直接音频 Clip 无法无损表达成 NBS，导出会提示。复杂拍号、细分时间及工程播放参数受到 NBS 格式约束，完整工程保留所有内部数据。
