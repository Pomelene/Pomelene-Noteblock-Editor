# 参考理解与实现对应

本轮以官方说明和上游源码中的文件/播放语义建立设计，不再依据对旧 demo 的局部修补。

- FL Playlist：https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/playlist.htm
  Pattern 与音频作为可编排源对象，引用具有独立的裁剪窗口。本项目按用户已确认的规则采用补空白/裁剪、不隐式重复；不同 FL Clip 类型的全部边界规则不作为统一承诺。
- FL Piano roll：https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll.htm
  音符编辑、框选、拖动、复制、力度区域和工具菜单。NBS 是触发事件，所以不伪造 DAW 持续音/滑音语义。
- FL 编辑工具：https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll_menu.htm
  按当前适用范围实现选区、移调、复制与和弦快捷放置；不做 Slice/Slide。
- FL Channel Rack：https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/channelrack.htm
  音色与源对象的上下文管理，音色选择放在 Pattern 编辑器中。
- FL 窗口：https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/basics_interface.htm
  多编辑实例、叠放、最大化、还原、最小化、弹出。内部实例与源对象身份分离。
- NBS 文件规范：https://noteblock.studio/nbs
  v0–5 解析、音符/层音量、声像、微调、自定义乐器定义。小数 tick 导出明确提示取整。
- NBS 官方教程：https://noteblock.world/help/creating-song
  图层、音域与创作流程等上下文。本项目 v5 兼容部分采用 16 种基础乐器；Minecraft 常用音域并不等于编辑器只允许该范围。
- OpenNBS：https://github.com/OpenNBS/NoteBlockStudio
  本地参考源码的 `pack_instruments.gml` 仅按相对路径打包音频 ZIP，定义仍在 NBS；本项目匹配这个模型，没有杜撰 JSON 乐器包标准。上游 `play_sound` 中自定义调音是加上 key−45；预听速率对照这一实现。

ui-ux-pro-max 用于桌面工作区的层次、颜色、反馈、窗口与菜单检查。其通用网站模板和移动触摸尺寸不直接套用高密度鼠标桌面编辑器。

FL 本机安装版本曾用 REA 做二进制身份/版本参考；本轮交互证据主要来自上述官方手册和运行行为。没有把静态 PE 信息说成 FL 界面代码的反编译结果。

0.6 快捷键与窗口参考：

- https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/basics_shortcuts.htm
  按上下文组织工具、选区、缩放和窗口快捷键。实现支持范围中的 P/B/E/D、Ctrl+A/C/X/V/B/D、Shift+I、八度移动、Home/End、PageUp/PageDown、Shift+1–5、Backspace、F1/F4/F5/F7/F12 及窗口切换。G/K 与 H/J 分别导航全部音色及已用音色。保留本项目 Ctrl+N 新建、Ctrl+E 导出 NBS；不把 FL 的工程版本保存或音频插件快捷键直接套用。
- https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/menu_view.htm
  参考可显示、隐藏、排列和切换的编辑窗口；本项目整曲 Playlist 与来源编辑器同属工作区窗口，也能弹出为原生系统窗口，再停靠回主窗口。Enter/F12 在原生编辑器中控制当前系统窗口，平铺与 Ctrl+Tab 仅作用主工作区内部窗口。

音色聚焦是本项目的视觉辅助：非当前音色音符及力度条降低不透明度，选区保持清晰；不改变声音、静音、音符或导出数据。短窗口使用紧凑布局保留音符画布。

0.5 追加核对：Playlist 与 Piano roll 的 P 绘制、B 笔刷、右键连续擦除、Ctrl 选择和 Alt 临时绕过吸附。官方 Snap 区分 Line/Cell/None、拍值与三连音；本项目明确采用自动网格、格首放置与相对位移吸附的组合，1 拍=4 tick，1/3 拍=4/3 tick。关闭吸附仍遵守内部精度，NBS 导出保留取整提示。官方吸附说明：https://support.image-line.com/action/knowledgebase?ans=47 。用户所称“采样”在本项目是只读音符片段；它不等同于 FL 的原始音频 Sampler，因此以独立 phrases 类型实现。
