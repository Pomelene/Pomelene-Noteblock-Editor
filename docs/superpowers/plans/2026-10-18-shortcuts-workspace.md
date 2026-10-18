# Shortcuts and flexible workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship keyboard-complete supported editing, freely arranged and detachable Playlist/source windows, and clear Pattern instrument focus.

**Architecture:** Renderer shortcut registry defines contexts and help. WindowFrame stays generic while App coordinates arrangement/source frames; main/preload validate detach/dock IPC against current generation. Pattern rendering adds visual focus only.

**Tech Stack:** Electron, React, TypeScript, Canvas, Vitest, Playwright Electron.

**Spec:** ../shortcuts-workspace-design.md

## Global Constraints
- Windows first; preserve portable Electron architecture and existing schema2 documents.
- Keep source/runtime separate; only latest application retained after verification.
- No fake commands; input fields retain text editing, shared project and undo remain authoritative.

## Review Focus
- Text fields/contenteditable/dialogs must not trigger editor shortcuts.
- Minimized/deleted sources and native Playlist must recover via window controls.
- Detach/dock during active playback must not leave a stale owner or lose project data.
- Small/HiDPI workspaces must remain usable with resize and tiling.
- Ghost notes and velocities must not alter song audio or export.

### Task 1: Scoped shortcuts and help
Files: renderer shortcuts.ts, ShortcutHelp.tsx, Playlist.tsx; tests/shortcuts.test.ts.
Interface: resolveShortcut(event, context) returns a documented action or undefined; registry supplies help groups.
- [x] Add failing tests for exact modifiers, text contexts, repeats and context actions.
- [x] Implement registry, searchable help, Playlist local actions and source picker.
- [x] Verify targeted tests and typecheck; integrate App globals separately.

### Task 2: Window composition
Files: WindowFrame.tsx, windowGeometry.ts, window.css, tests/windowComponents.test.ts, tests/windowGeometry.test.ts.
Interface: separate playlist window kind; frame className option; layoutWindows helper returning valid rects for tile/cascade.
- [x] Add failing layout/frame tests for Playlist, bounds and activation.
- [x] Implement generic frame and layout utilities.
- [x] Verify targeted and full unit tests.

### Task 3: Pattern instrument focus
Files: PatternEditor.tsx, pattern-focus.css, tests/instrumentFocus.test.ts.
Interface: shared shortcuts resolver consumed in Pattern context; instrument focus opacity helper for canvas and velocity UI.
- [x] Add failing tests for instrument navigation/opacity and safe local keyboard commands.
- [x] Implement visible instrument choices, ghost display and local shortcuts.
- [x] Verify no project/audio mutation from visual focus and targeted tests.

### Task 4: App and native integration
Files: App.tsx, main/index.ts, preload/index.ts, shared/model.ts, scripts/workspace-shortcuts-smoke.cjs.
- [x] Write real Electron acceptance checks for F5/7/cycling, Playlist resize/detach/dock, shared edits, help, input protection and focus.
- [x] Run to confirm missing behavior.
- [x] Implement Playlist frame/native route, safe dock IPC, keyboard globals and help menus.
- [x] Run full unit/type/build and all existing/new Electron suites; inspect screenshots.

### Task 5: Delivery
- [x] Fresh review and fix findings; repeat affected verification.
- [x] Version, create source archive and Windows build; verify extracted executable.
- [x] Retain only latest application safely, record verification, commit and push private GitHub.


Execution record: dispatching-parallel-agents used for independent renderer/window work; root integrated IPC/App and ran all desktop acceptance. Fresh review P2 compact layout fixed with RED/GREEN browser regression. Final verification: 148 tests, 65 source and 65 extracted-EXE flows. Delivery checklist completed after archive, retention cleanup and remote verification.

