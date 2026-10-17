# NoteBlock Editor 0.2.1

Windows 优先的 Electron + React + TypeScript 音符盒音乐编辑器。当前版本包含 Pattern 编排、音符编辑、工程保存和 NBS 读写。

## 运行包与源码包

发行文件位于工作区 `deliverables/NoteBlockEditor-0.2.1/`：

- `NoteBlockEditor-0.2.1-windows-x64.zip`：完整解压后运行 `NoteBlock Editor.exe`。运行包包含应用及 Electron 运行时，不含 src、测试、Git 和开发依赖。
- `NoteBlockEditor-0.2.1-source.zip`：源码、配置、锁文件、测试和采样资源；不含 node_modules、可执行文件或构建输出。
- `win-unpacked/`：本机直接试用目录，与 Windows ZIP 内容对应。保留 EXE 同目录的 DLL、resources、locales 等文件。

源码工作目录为 `desktop/`，发行输出放在工作目录外。旧版 `desktop/release/` 是 0.1.0 的历史输出，不是本次交付。

## 文件读写

- **新建**：创建空工程；有未保存修改时先提示保存 / 不保存 / 取消。
- **打开**：读取 `.nbproject` 工程或 `.nbs`。导入 NBS 后可编辑并保存成工程，保存不会自动覆盖原始 NBS。
- 打开时按文件内容识别格式；自选扩展名不会让已保存文件无法重开。
- **保存 / 另存**：保存所有 Pattern、编排引用、音符完整属性、BPM、拍号及 NBS 元数据。保存采用同目录临时文件写入、刷盘后替换；失败时保留原文件。写入路径始终是对话框确认的确切路径。
- **导出 NBS**：将 Playlist 中全部 Pattern 引用展开为 NBS v5；重叠的同层同格音符分配附加图层，保留每个音符。未放入编排的 Pattern 不会自动导出，请先放置引用。
- **退出保护**：整个应用有未保存修改时提示处理；取消保留当前工程。关闭 Pattern 子窗口保留会话编辑。

NBS 读取支持旧格式 v0 和现代 v1–v5，保留音符力度、声像、音高微调、图层设置、自定义音色定义、循环及作者等元数据。编辑器内部将自定义音色统一放到 16 号之后，避免旧文件的自定义音色误当成原版音色。

NBS 的速度精度对应本编辑器 BPM 的 0.15 步进，因此 100 BPM 导出为 100.05 BPM；导出后会显示转换说明，工程文件仍保留原值。6/8 导出为具有相同小节长度的 3/4；NBS 无法表示的分数拍长会明确拒绝。NBS 导出歌曲长度最多 65,535 ticks，当前导出最多 100,000 音符。

## 实际编辑操作

| 位置 | 操作 |
| --- | --- |
| Pattern 浏览器 | 点击选择、双击编辑、拖入编排；新建、独立副本、删除及引用清理 |
| Playlist | 默认以 1 tick 放置、拖动；吸附可选 1 / 2 / 4 ticks 或一小节；Alt 暂时以 1 tick 拖动 |
| Playlist 选区 | Shift 空白处拖动框选，Ctrl 点击增减；Ctrl+A 全选，Ctrl+C / X / V 复制剪切粘贴，Delete 删除，方向键移动，Ctrl+D 接续复制 |
| 编排时间标尺 | 点击设置播放位置和粘贴目标；工具栏滑杆及缩放按钮调整显示 |
| Pattern 长度 | 名称和 tick 长度可直接改；已有音符不会被静默截断。内部编辑不再强行扩成整小节 |
| 图层网格 | 左键放置、右键删除 / 拖动擦除、拖动音符改变时间和图层；点击左侧图层名选中该层 |
| 钢琴卷帘 | 完整 MIDI 21–108；拖动改变时间和音高；点击左侧琴键试听 |
| Pattern 选区 | Shift 框选、Ctrl 点击增减；音高、力度、声像、微调直接改选区；选音色后点击“应用音色到选区” |
| 力度栏 | 拖动力度柱修改实际音符力度；选中多个音符时可一起调整 |
| Pattern 吸附 / 缩放 | 都是可操作控件；一小节吸附会随拍号变化；大工程只绘制可见区域 |
| 音符剪贴板 | Ctrl+C / X；点击标尺定位后 Ctrl+V，跨原生窗口共享 |
| 微调 | 左右方向键按吸附移动；上下移调半音；Shift+上下移调八度 |
| 播放 | SONG 播放编排，PAT 播放所选 Pattern；空格播放 / 停止，停止归零；新窗口启动播放会停止其他窗口的播放 |
| 历史 | Ctrl+Z、Ctrl+Y / Ctrl+Shift+Z；所有编辑窗口共享撤销历史 |

Pattern 子窗口支持拖动、缩放、最小化、最大化、关闭、弹出原生窗口；同一 Pattern 的原生窗口会去重。音色栏仅在 Pattern 编辑器内出现。

## 快捷键

Ctrl+N 新建、Ctrl+O 打开、Ctrl+S 保存、Ctrl+Shift+S 另存、Ctrl+E 导出 NBS、F1 操作说明。

## 开发与构建

验证环境：Windows x64、Node 24、pnpm 11.25.0。已安装依赖时可以用 `node node_modules/pnpm/bin/pnpm.cjs` 代替全局 pnpm。

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
pnpm pack:win
pnpm smoke:packaged
```

构建、打包、验收按顺序运行，打包读取 out 时不要重建 out。源代码包可通过 `git archive` 从版本提交生成，版本说明见 `docs/0.2.1-validation.md`。

桌面验收优先使用本机参考曲目；该文件不存在时会自动生成 35,361 音符的 NBS 压力样本。也可以通过 `NBE_NBS_FIXTURE` 指定自己的测试 NBS，源码包不依赖原机器的用户歌曲。

代码入口：`src/main` 管理文件和窗口；`src/preload` 仅提供业务 API；`src/shared/project.ts` 为权威状态；`nbs.ts` 为 NBS 编解码；`project-file.ts` 为工程格式；`src/renderer/src` 为 React 界面、可见区域 Canvas 和音频引擎。安全配置启用 sandbox / context isolation、禁用 Node、验证窗口及工程代次，防止旧窗口命令修改新工程。

## 已知能力边界

自定义音色定义和外部文件名会完整保留，但外部采样加载 / 资源包管理尚未接入；缺少采样时会明确提示，原版 16 种音色可离线播放。NBS 循环及图层锁定信息可保存和导出，目前不控制编排播放 / 编辑锁定；图层音量、声像以及音符微调参与预听。MIDI 转换与自动编曲尚未实现。Windows 以外的平台未验收。

UI 依据用户选定的 NBS / FL 工作区方向及 UI UX Pro Max 指导。采样来自本机 Note Block Studio，来源及 SHA-256 见 `docs/sample-sources.json`。
