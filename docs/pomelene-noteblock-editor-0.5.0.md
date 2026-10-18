# Pomelene Noteblock Editor 0.5.0

2026-10-19，项目正式命名为 **Pomelene Noteblock Editor**，GitHub 仓库更名为 `Pomelene/Pomelene-Noteblock-Editor`。沿用 Electron、React、TypeScript，Windows 优先。

用户将正式命名后的版本定为 **0.5.0**，表示项目仍有核心功能待逐步推进。此前 NoteBlock Editor 的 0.3–0.7 开发编号与提交历史保留，功能不回退。旧 `v0.5.0` 标签不移动；本次使用独立标签 **`pomelene-noteblock-editor-v0.5.0`**。

应用主窗口、子窗口工作台品牌、启动界面、关于菜单、HTML 标题、Windows 程序名、产品名、npm 包名、构建产物和文档改为新名称。保留工程与剪贴板格式标识以及应用内部 ID，兼容原有工程文件和内部集成。

源码推送到 `main`；Windows 便携运行 ZIP 与独立源码 ZIP 放在同仓库 Releases。运行时请解压整个运行包后启动 `Pomelene Noteblock Editor.exe`，不需要安装 Node.js。

历史功能验收见 [大型歌曲与音色映射验收](validation-0.7.0.md)。本次验证范围是品牌、版本、完整回归和最终运行包的桌面操作，不重复修改音乐解析或整理算法。历史歌曲库 112 首的完整验收仍属于上述功能版本记录。

本次验证：30 个文件的 206 项测试通过，严格 TypeScript 检查和生产构建通过；最终 Windows ZIP 实际解压后的程序完成 73 项桌面操作检查。另核对运行时应用名、版本、主窗口标题、关于窗口、Windows 产品名／文件描述，以及 420px 紧凑窗口的品牌与菜单布局。ASAR 内 22 个编译文件与生产输出一致。

同时修正桌面测试自身的缓存依赖：解码取消测试使用独立 WAV，而不假定某个内置音色此前未被缓存；测试仍验证真实异步解码期间替换工程不会误放置片段。
