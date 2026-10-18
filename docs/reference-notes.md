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

0.5 追加核对：Playlist 与 Piano roll 的 P 绘制、B 笔刷、右键连续擦除、Ctrl 选择和 Alt 临时绕过吸附。官方 Snap 区分 Line/Cell/None、拍值与三连音；本项目明确采用自动网格、格首放置与相对位移吸附的组合，1 拍=4 tick，1/3 拍=4/3 tick。关闭吸附仍遵守内部精度，NBS 导出保留取整提示。官方吸附说明：https://support.image-line.com/action/knowledgebase?ans=47 。用户所称“采样”在本项目是只读音符片段；它不等同于 FL 的原始音频 Sampler，因此以独立 phrases 类型实现。
