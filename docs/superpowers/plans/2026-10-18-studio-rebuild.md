# Studio Rebuild Implementation Plan

> For agentic workers: use subagent-driven-development or executing-plans task by task. This session uses focused parallel ownership for independent modules with root integration and review.

**Goal:** Deliver a new real desktop workspace with coherent source/instance semantics and dependable editing, transport, file and sample workflows.
**Architecture:** Shared typed contract, authoritative main-process session, clean React canvas workspace and view registry, independent audio transport. Reuse only validated low-level NBS codec.
**Tech Stack:** Electron 44, React 19, TypeScript, electron-vite, Vitest, Playwright.
**Spec:** ../specs/2026-10-18-studio-rebuild-design.md

## Global Constraints

User confirmed right-click erase on edit canvas and context menus in lists; play/pause separate from stop; one stop returns position to zero; Pattern and sample first-class, multiple instances; resize pads/truncates non-destructively. Windows first. Keep old desktop intact. No fake controls. No FX, slice, slide. Subsequent intelligent music features remain deferred.

## Review Focus

1. Cancelled or failed file import/save must leave current project and original file safe.
2. Dragging fast across boundaries, scrolling, or losing focus must not black out or strand a drag.
3. Pausing and seeking cancel previously scheduled sources, stop resets position and visible viewport.
4. Clip crop must not destroy source notes or repeat content on extension.
5. Native windows and independent internal views must share data without cross-project stale commands or duplicate sound.

## Tasks

- [x] Domain/session and file adapter: model.ts commands, session.ts validation/history, io.ts schema migration and NBS adaptation, files.ts dialogs/atomic IO/sample ZIP import, main/preload restricted bridge. Tests before implementation for clip crop, independent sources, layers, custom import, failed save.
- [x] Audio: pure timeline extraction and transport states, AudioContext renderer scheduling, sample decoding, NBS gain/pan/key semantics, pause/stop/seek and cross-window ownership. Tests before implementation for timing, crop and cancellation semantics.
- [x] Workspace: independent window manager, contextual menus, browser with source instances, Playlist and Pattern canvases, sample properties, command wiring and visual system. Begin with a failing real Electron workflow script, then verify after each integration.
- [x] Integrate, typecheck, meaningful domain tests, real desktop smoke and visual review; fix findings, package Windows ZIP and separate source archive; verify extracted executable.

## File ownership

Domain agent owns src/main, src/preload, src/shared/session.ts and io.ts plus related tests. Audio agent owns src/renderer/src/audio.ts, src/shared/timeline.ts and audio tests. Root owns shared/model.ts, all renderer UI except audio, setup, documents, integration and packaging. Contract changes are discussed with root first.
