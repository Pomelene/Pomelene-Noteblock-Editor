# 文件输入与非发声结构参考表

调研日期：2026-10-19。用途：为 Pomelene Noteblock Editor 及相关项目提供设计参考。本文件记录调研和建议，不表示下表格式或事件已经在本软件实现；本次不修改解析器、播放或工程结构。

证据分级：**源码核对**表示读取了实际实现；**项目声明**表示仅有 README／发布说明支持；**路线图**不算已实现。优先级是本项目的建议，不是上游项目承诺。

## 1. 输入格式整体结构

| 格式／扩展名 | 来源及证据 | 真实结构／识别方式 | 可携带的信息 | 导入时需要明确的转换 | 建议 |
|---|---|---|---|---|---|
| NBS Classic、v1–v6 `.nbs` | [官方规格][nbs-spec]；[NoteBlockLib][lib] | 小端二进制；Classic 的首个 short 是长度，新版首个 short 为 0，再读版本及原版音色数；随后是文件头、稀疏音符、可选图层和可选自定义乐器定义 | 音符、初始速度、拍号分子、图层、循环、元信息、资源引用，也可能含控制／视觉事件 | 按版本读取字段；音色表基址不能固定为 16；必须在普通音符修正前识别功能事件 | 已有基础支持；优先补事件语义与独奏状态 |
| Standard MIDI `.mid/.midi` | [MIDI Association][midi-spec]；[NoteBlockLib][lib] | `MThd` 头块与 `MTrk` 轨道块；大端长度、变长 delta-time、带时间戳的 MIDI／Meta／SysEx 事件 | 轨道、通道、音符开关、音色、力度、速度和拍号事件、文本等 | 0 型单轨、1 型同步多轨与 2 型独立序列不能混为一谈；保留 PPQ／SMPTE 时间基准；明确长音、踏板、弯音及变速的转换策略 | 主要新增输入；不能仅转换 Note On |
| NoteBot 文本 `.txt` | [TxtIo][txt-io]、[TxtConverter][txt-converter]；[SongPlayer][songplayer] | UTF-8 文本，每条 `tick:pitch:instrument`；元信息／注释存在不同方言，NoteBlockLib 识别 `// Name:`、`// Author:`，SongPlayer 文档允许 `#` 注释 | 主要为时间、Minecraft 音高和乐器；通常没有声部、力度、长音或变速表 | 此参考实现默认 20 ticks/s，音高使用 Minecraft 0–24 范围；不能直接套用 MIDI 音高或本软件 tick；错误行需报告而非静默全部跳过 | 直接相关、转换较简单，适合第一批 |
| `.notebot` | [NoteBlockTool README][tool] | README 声称支持；本次检查的库格式枚举只列 `.nbs/.mcsp/.mcsp2/.txt/.mid/.midi`，过滤器也由枚举生成 | 不能仅凭后缀确认 | 必须补具体来源、版本、文件样例和实际读取入口；不能宣布所有 `.notebot` 都是同一种 TXT | 待确认，按内容／方言识别 |
| Minecraft Song Planner `.mcsp` | [McSpIo][mcsp-io]、[定义][mcsp-def] | 以 `|` 分隔的文本；开头版本 token，随后为 tick 增量与音符字符串；该实现每个时间列固定 7 个槽，每槽两字符编码乐器／音高 | 旧式多声部音符；信息量有限 | 此参考实现固定 10 ticks/s；字符表、空槽、增量和旧编码要单独解释，不能按 NBS 二进制处理 | 旧曲库兼容，第二批 |
| Minecraft Song Planner `.mcsp2` | [McSp2Io][mcsp2-io]；[NBSTool 转换器][mcsp2-python] | 主体为 `|` 分隔的版本、自动保存、名称／作者等、tick 增量和 `图层增量>音符字符`；可有第二行速度／统计信息 | 比 MCSP 多的图层、元信息和速度 | 注意旧字符编码及特殊字符音符表；参考实现对编码和尾部元数据处理并不完全一致，需要真实样例交叉验证 | 旧曲库兼容，第二批 |
| NBSTool JSON `.json` | [NBSTool][nbstool] 的实际导入／导出代码 | 顶层 `header`、`notes`、`layers`、`custom_instruments`，再按其 JSON Schema 验证 | 接近 NBS 的结构化转储 | 必须按 NBSTool 方言解释字段、单位、默认值；不等同于我们的 `.nbproject`，也不代表支持任意 JSON | 第一批或第二批，适合项目互通 |
| CSV／JSON 音符表 | [nbs-mcp-server][mcp-server] 项目声明及示例 | CSV 表头或结构化音符对象；示例含 `tick/layer/instrument/key/velocity/panning/pitch` | 音符及部分表达数据，完整元信息取决于方言 | 需要标明 schema／来源、时间基准和音高体系，必要时由用户映射列；`pitch` 在该示例中是微调，不是 MIDI 音高 | 以明确方言接入，不宣称通用 CSV／JSON |
| MuseScore `.mscx/.mscz` | [musescore2nbs.py][musescore] 源码核对 | `.mscx` 是包含 Score／Staff／Measure／voice 等节点的 XML；`.mscz` 是 ZIP 内的 `.mscx` | 乐谱声部、小节、音高、时值、连音／连音组、文字和元信息等 | 该转换器检查 MuseScore 3／4；需定义反复、连音、装饰音及符号的演奏化规则，不能把任意 XML／ZIP 当作该格式 | 乐谱工作流阶段再做 |
| 建筑／结构 `.schematic/.schem/.nbt/.litematic` | [OpenNBS 发布记录][opennbs-releases] | Minecraft 方块、坐标、状态与布局等结构数据，不是统一的时间音符表；后缀也不唯一决定其内部 schema | 可能包含音符盒和红石电路，也可能是任意建筑 | 恢复歌曲需要识别布局和红石时序；能导出建筑不等于能反向导入。OpenNBS v3.12 beta 1 明确移除了旧 schematic 导入 | 单独研究，不能伪装成普通歌曲读取 |
| `.nbproj/.nbseq` | [NewNoteBlockStudio][new-nbs] | 出现在项目 Roadmap | 本次未确认稳定已实现的文件契约 | 路线图不能当作可兼容的现成格式 | 暂不承诺 |

补充：NBSTool 的音频及 `.it` 支持主要在导出方向；发现的 `ncfio.py` 是遗留代码，本次未确认有效产品入口及测试，均不列为已验证的新输入。音频资源加载与“识别音频中的音符”也是两项不同能力。

## 2. NBS 基本数据区

| 数据区 | 原始结构 | 不直接发声的信息 | 设计注意 |
|---|---|---|---|
| Header | 按版本排列的整数、字节和长度前缀字符串 | 曲名、作者、原作者、描述、初始速度、拍号分子、自动保存信息、编辑统计、原导入文件名、循环开关／次数／起点 | 初始速度单位是 ticks/s ×100，不是 BPM；拍号只存分子、隐含 `/4`；导入文件名只是元数据，不是执行入口 |
| Note blocks | tick 增量 → layer 增量 → 乐器和音高；v4+ 另有力度、声像、微调 | 普通音符记录中也可能嵌入控制和视觉事件 | 先解析原始记录，再识别事件类型，最后对普通音符做合法化／归一化 |
| Layers | 每层的名称、状态、音量、声像，按版本取字段 | 来源声部身份、锁定／独奏等状态 | 现代参考实现区分状态 0 正常、1 锁定、2 独奏，不能把非零统一当锁定；这是播放语义，不只是编辑器外观 |
| Custom instruments | 乐器定义数量及名称、声音文件名、基准键、按键行为等 | 外部资源引用，也用名称承载功能事件类型 | 乐器绝对编号 = 文件头原版音色数 + 自定义表索引；自定义表不等于嵌入音频；协议名称应与可编辑显示别名区分 |

四区布局依据[官方规格][nbs-spec]；事件及现代层状态交叉参考 [NoteBlockLib 转换器][nbs-converter] 和 [pynbs-v6][pynbs-v6]。后者是社区分支，不是官方规范替代品。

## 3. NBS 中的控制／视觉事件

这些事件没有新增统一事件段，而是复用自定义乐器与普通音符。按上游约定识别乐器名称后，音符 tick 是事件位置，原来的表达字段才按事件参数解释。表中 `pitch` 指 NBS 原始微调字段，对应本项目通常称 `finePitch` 的值，不是键盘音高。

| 类型／协议标识 | 储存位置与辨认方式 | 复用参数 | 实际含义 | 其他项目的建议处理 |
|---|---|---|---|---|
| `Tempo Changer` | 自定义乐器精确名称 + 使用它的音符 | tick 为位置；参考实现将 `abs(pitch / 15)` 解为 ticks/s | 从该位置改变播放速度，不直接发声 | 解出独立 tempo map；影响播放、跳转、时长及 MIDI 转换；不要当作缺失采样、和弦成员或普通微调 |
| `Sound Stopper` | 同名自定义乐器 + 事件音符 | `pitch` 编码目标起始层；`panning/velocity` 经过偏移后组合成结束层 | 截止已在发声的声音，可指定图层范围 | 事件所在层不等于目标层；参考范围为 1 起算、含端点，起点 0 有全停止语义；须保留原层身份并转换索引 |
| `Toggle Rainbow` | 同名自定义乐器，事件 tick 表示触发时刻 | 主要由名称及位置编码，没有显式目标开关值 | 翻转彩虹强调色状态 | 可保留而不执行；若执行，跳转／重播时须恢复确定状态，不能仅依赖上次 UI 状态 |
| `Change Color to #…` | 颜色数据进入自定义乐器名称，再由音符触发 | 按来源约定从名称解析颜色；每种颜色可能占用不同乐器定义 | 改变界面强调色 | 不把颜色标记作为可播放音色；不要把“RGB”字段误认成普通音符属性；保留原始名称，容错时不执行无效值 |
| `Toggle Background Accent` | 同名自定义乐器 + 事件位置 | 开关翻转，无显式最终状态 | 切换背景强调显示 | 作为可选视觉自动化；可以保留并忽略，不能影响音频事件计数 |
| `Show Save Popup` | 同名自定义乐器 + 事件位置 | 主要由名称／位置编码 | 显示“已保存”的提示效果；**不等于真的保存文件** | 默认只保留或忽略；绝不能把它接到工程保存、磁盘写入或文件对话框 |
| 未识别的功能标记 | 未识别／不支持的定义和音符记录 | 保留原始名称、编号、tick、layer 和字段字节 | 无法可靠推断 | 标注未解释并保存来源数据；不凭模糊关键词自动执行，更不能静默删除 |

参数依据：[NoteBlockLib `NbsConverter`][nbs-converter]、[名称定义][nbs-def]；视觉事件与范围说明另见 [pynbs-v6][pynbs-v6]。不同实现有版本门槛差异：v4 起有承载这些参数的逐音符字段，但本次读取的 NoteBlockLib 仅在 v5+ 解释 Sound Stopper；不能据此认定所有播放器都执行同一套约定。名称匹配也须逐类定义：多数精确匹配，颜色在参考实现中另有不区分大小写的识别路径。

Sound Stopper 参数的偏移组合说明（此处只是解释已读到的实现，不是新定义）：

```text
start = max(rawPitch, 0)
low   = (rawPanning  - 100) mod 256
high  = (rawVelocity - 100) mod 256
end   = max(signed16(low + 256 * high), start)
```

模运算按非负 0–255 解释。因此普通音符的声像／力度边界不能提前套到事件上。与原始数据的 byte 偏移、音高体系、图层索引混用都可能破坏事件。

## 4. MIDI 等格式中的非发声／控制数据

| 结构 | 典型储存方式 | 用途 | 转换策略 |
|---|---|---|---|
| MIDI 速度／拍号／调号 | 轨道内 Meta Events；初始值和中途变化都可能存在 | 时间映射、网格显示和乐谱解释 | 速度、拍号属于时间控制，不是音符；调号不应自动改写实际音高 |
| MIDI 轨道名／标记／提示点 | 带 tick 的文本 Meta Events | 声部名称、段落、表演提示 | 可用于命名和辅助切分 Pattern，但标记本身不是分段正确性的保证 |
| MIDI 歌词／版权／描述 | 相应文本元事件 | 文本展示及来源信息 | 可保留；不能拿文本字段当命令或资源路径执行 |
| MIDI Program Change／Bank Select | MIDI 通道消息／控制器 | 选择来源合成器音色，可能曲中切换 | 保留通道和程序身份；与 NBS 乐器 ID 分开，通过可调整映射转成目标音色 |
| MIDI 踏板、音量、声像、弯音等 | Control Change／Pitch Bend 等消息 | 改变演奏效果和持续时值 | 明确哪些被实现、离散化、近似或仅保留；不能只读取 Note On 却宣称完整 MIDI 语义 |
| MIDI SysEx／厂商扩展 | 含长度与负载的专用消息 | 特定设备设置 | 未支持时保留或报告忽略；不向系统或设备透传未确认负载 |
| MCSP2 速度／编辑统计 | 主体之外的可选元数据行 | 播放速度、历史编辑信息 | 缺失时采用明确默认值；统计不参与发声，尾部不能误读为音符列 |
| MuseScore 小节／声部／记谱符号 | XML 节点及属性 | 记谱与演奏组织 | 记谱不等同演奏时间线；反复、连音和其他符号须有演奏化策略，未知符号保留并提示 |
| JSON／CSV 字段、来源 schema | 键、表头、显式类型／版本字段 | 表达与交换数据 | 扩展名不是 schema；要求明确时间单位、音高体系、力度范围、声像中心和层索引 |

MIDI 结构参考 [MIDI Association][midi-spec] 与 [NoteBlockLib MIDI 转换器][midi-converter]；其他格式见第一表所列实际源码。

## 5. 对相关项目的通用建模建议

| 内部类别 | 至少保存什么 | 不应混用 |
|---|---|---|
| 原始来源 | 格式／版本／方言、时间基准、来源轨道／层 ID、未解释字段、必要原始负载 | 扩展名不能替代协议版本或 schema |
| 发声音符 | 发生位置、键盘音高、音色来源、力度／声像／微调；有来源时保留时值与释放事件 | 键盘音高与事件参数 `pitch`；NBS、Minecraft、MIDI 的音高编号 |
| 音乐控制事件 | tick／顺序、类型、类型化参数、作用范围与原始来源 | 速度变化不能作为调音；停止发声不能作为静音采样 |
| 视觉／提示事件 | 时间、类型、状态／颜色参数、原始名称 | 提示效果不能直接触发真实文件保存或其他宿主操作 |
| 元信息／编辑历史 | 作者、描述、循环配置、统计、原文件名等 | 不该被当作音符或任意文件访问指令 |
| 外部资源引用 | 来源标识、相对引用、解析结果、可重新绑定关系 | 文件名不等于已存在音频；音色替代不能覆盖控制事件 |

保留“原始数据”和“解释后的语义”两个层次：先识别控制事件，再对普通音符归一化；不认识的效果保留但不执行。排序、智能分组、片段复用、图层重排和导出均要包含控制事件语义检查，而不仅比较普通音符数量。

## 6. 当前工程与真实样本核对

- 当前主入口主要接受 `.nbproject/.nbs`；片段导入为 `.nbs`，乐器资源为 NBS／ZIP，音频输入属于资源而非自动转谱。
- 当前 `Project` 只有单一 BPM，播放计划用固定 `secondsPerTick`；未实现上面的变速／Sound Stopper／视觉事件模型。能读取 NBS v0–v6 的记录，不等于已实现所有来源播放器的运行语义。
- 对用户给定 112 首歌曲进行了额外只读原始记录统计：7 首含 Tempo Changer 定义，其中 6 首有实际标记，共 168 条；另 1 首有 6 条 Toggle Rainbow 标记。本次未发现 Sound Stopper 定义或状态为 2 的图层。
- Black Knife 的 55 个超普通力度范围记录在本次检查中未关联上述控制乐器；不能把这 55 个修正提示直接归因为 Sound Stopper。反过来，未来也不能对其他事件数据套用同一普通音符修正规则。
- 先前 112/112 的验收说明文件可解码、可整理、可保存及其导入后内部数据对照一致；不应据此宣称已还原所有 OpenNBS 功能事件。后续需要独立的事件／播放语义样例。

## 7. 建议实现顺序（尚未实施）

1. 建立原始事件识别与保留层，补齐变速和 Sound Stopper 的数据契约；视觉事件先保留并允许忽略。先保护现有曲目的语义。
2. NoteBot TXT 与明确方言的 JSON，建立统一输入预览、单位标注、行号错误、音色映射和转换报告。
3. MIDI 0／1 及其速度、通道／音色与时值策略；2 型独立序列和其他控制消息的处理必须显式说明，不静默摊平。
4. MCSP／MCSP2 旧曲库支持；再根据实际用户文件推进 MuseScore。
5. 建筑结构反推、路线图格式与缺少样例的方言另立研究任务。

建议使用宿主无关的 TypeScript 解析适配器，不因为参考库使用 Java／Python 就额外打包相应运行环境。尚未决定具体新 API 和 schema 变更；表格可作为其他项目设计输入。

## 来源与快照

- NoteBlockLib：`024312d9d7d16cc28c01e85b2bf1ca71f7afde6a`。
- NoteBlockTool：`28c3e3698b767ec60759e88f178606d8c9e93ede`。
- NBSTool：`121d9b5d00120aed527ce2fc5eb4ec6d78fb9509`。
- 官方网页、发布页与其他项目文档按调研当日读取。参考源码仅用于分析，下载副本与用户歌曲统计位于忽略的研究目录；未将第三方源码或用户歌曲加入仓库。

[nbs-spec]: https://noteblock.studio/nbs
[lib]: https://github.com/RaphiMC/NoteBlockLib
[tool]: https://github.com/RaphiMC/NoteBlockTool
[txt-io]: https://github.com/RaphiMC/NoteBlockLib/blob/024312d9d7d16cc28c01e85b2bf1ca71f7afde6a/src/main/java/net/raphimc/noteblocklib/format/txt/TxtIo.java
[txt-converter]: https://github.com/RaphiMC/NoteBlockLib/blob/024312d9d7d16cc28c01e85b2bf1ca71f7afde6a/src/main/java/net/raphimc/noteblocklib/format/txt/TxtConverter.java
[mcsp-io]: https://github.com/RaphiMC/NoteBlockLib/blob/024312d9d7d16cc28c01e85b2bf1ca71f7afde6a/src/main/java/net/raphimc/noteblocklib/format/mcsp/McSpIo.java
[mcsp-def]: https://github.com/RaphiMC/NoteBlockLib/blob/024312d9d7d16cc28c01e85b2bf1ca71f7afde6a/src/main/java/net/raphimc/noteblocklib/format/mcsp/McSpDefinitions.java
[mcsp2-io]: https://github.com/RaphiMC/NoteBlockLib/blob/024312d9d7d16cc28c01e85b2bf1ca71f7afde6a/src/main/java/net/raphimc/noteblocklib/format/mcsp2/McSp2Io.java
[mcsp2-python]: https://github.com/IoeCmcomc/NBSTool/blob/121d9b5d00120aed527ce2fc5eb4ec6d78fb9509/mcsp2nbs.py
[nbstool]: https://github.com/IoeCmcomc/NBSTool/blob/121d9b5d00120aed527ce2fc5eb4ec6d78fb9509/nbstool.py
[musescore]: https://github.com/IoeCmcomc/NBSTool/blob/121d9b5d00120aed527ce2fc5eb4ec6d78fb9509/musescore2nbs.py
[midi-spec]: https://midi.org/standard-midi-files
[songplayer]: https://github.com/hhhzzzsss/SongPlayer
[mcp-server]: https://github.com/jasonlikeminecraft/nbs-mcp-server
[opennbs-releases]: https://github.com/OpenNBS/NoteBlockStudio/releases
[new-nbs]: https://github.com/OpenNBS/NewNoteBlockStudio
[nbs-converter]: https://github.com/RaphiMC/NoteBlockLib/blob/024312d9d7d16cc28c01e85b2bf1ca71f7afde6a/src/main/java/net/raphimc/noteblocklib/format/nbs/NbsConverter.java
[nbs-def]: https://github.com/RaphiMC/NoteBlockLib/blob/024312d9d7d16cc28c01e85b2bf1ca71f7afde6a/src/main/java/net/raphimc/noteblocklib/format/nbs/NbsDefinitions.java
[midi-converter]: https://github.com/RaphiMC/NoteBlockLib/blob/024312d9d7d16cc28c01e85b2bf1ca71f7afde6a/src/main/java/net/raphimc/noteblocklib/format/midi/MidiConverter.java
[pynbs-v6]: https://github.com/NoteBlockMR/pynbs-v6
