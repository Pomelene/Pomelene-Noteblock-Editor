# Smart Pattern Import Implementation Plan

> For agentic workers: execute inline with executing-plans; UI is an independent delegated component; final review uses a fresh reviewer.

Goal: Add optional 智能 Pattern 整理（Beta） with researched, versioned, lossless structure heuristics.
Architecture: Pure analysis modules -> authoritative ProjectFiles import decision -> token-scoped renderer dialog. Persist report/original layout, preserve audio tails and re-use export layer definitions.
Stack: Existing Electron / React / TypeScript / Vitest / Playwright, no new runtime dependencies.
Spec: ../specs/2026-10-18-smart-pattern-design.md

Global constraints: No quantization/transposition/note deletion; exact sharing only; default optional checkbox; original/restore/cancel paths; existing project JSON never reorganized; preserve 0.3.0; 0.4.0 separate source/runtime packaging.
Review focus: Tail truncation at new boundaries; repeated retriggers vs musical duplication; different gain/pan/locking across layers; import cancellation and stale window/token; resource-limit fallback and NBS export layer growth.

- [x] Task 1: tests/smartPattern.test.ts red -> src/shared/smartPattern/{profile,features,grouping,segmentation,index}.ts green. Input Project with one original NBS Pattern/clip; output {project,summary}. Shared contracts in model.ts. Verify exact event multiplicity and audio timing/rate/gain/pan/duration, 3-bar cycles, raw expressive timing, safe budgets.
- [x] Task 2: tests for tailTicks, backup roundtrip/restore/undo, export layer reuse -> update model.ts/session.ts/timeline.ts/io.ts. Restore command import:restoreOriginal. Clear tail override on explicit length/offset changes. Compare real-song traces and NBS export.
- [x] Task 3: files tests red -> ProjectFiles chooseImport callback, summary filename, original/smart/cancel transaction; main token request broker + preload onImportPrompt/respondImport. Cancellation never replaces project; modal lifetime releases busy on close. UI agent owns ImportDialog.tsx/import-dialog.css and App.tsx integration, report and restoration menu.
- [x] Task 4: real-source corpus analysis script (positional corpus-folder argument) outputs summaries/invariants/performance, never packages songs. Full type/tests, actual desktop import checkbox, cancel/default/original, restore+undo, save/reopen/export; review and fix issues; package 0.4.0, extracted EXE regression, source ZIP and manifest.

Rulings: Existing independent desktop-next repo is used on feature/smart-pattern-beta; no additional worktree is needed. Thresholds are our initial heuristics rather than validated universal music theory. Native sample decoding is not needed for organizing; tail playback windows are preserved mathematically.

Evidence: 103 tests in 14 files, strict typecheck/noUnusedLocals, source and extracted-runtime desktop suites (20 baseline + 12 smart-import), ten-song raw/audio/export comparisons. Independent review's two P2 findings were reproduced, fixed and retested. Detailed evidence and Beta quality limits are recorded in docs/validation-0.4.0.md and the release verification folder. Source and runtime are archived separately.
