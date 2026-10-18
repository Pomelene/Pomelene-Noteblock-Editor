# 工程约束

本项目为 Pomelene Noteblock Editor，Windows 优先，当前使用 Electron + React + TypeScript。后续核心功能继续在现有方案推进，同时保留更轻量桌面宿主的迁移空间。

- 开发前参考 [桌面运行环境可替换性](docs/desktop-runtime-portability.md)。
- `src/shared` 与 `src/legacy` 保持纯数据核心，不引入 Electron、Node 文件系统、原生窗口或 UI 依赖。
- renderer 的文件、剪贴板、窗口及宿主通信走 `StudioAPI`；Electron 细节集中在 main／preload 适配层。
- 保持工程序列化兼容、异步任务 generation 校验与跨窗口单一播放所有权。
- 未明确开展运行环境迁移时，不引入替代框架、双后端或为迁移提前进行大规模重构。
