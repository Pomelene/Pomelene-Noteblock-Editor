# Scalable import and editor navigation implementation plan

**Goal:** Organize most songs in the supplied recursive NBS corpus, make dense scores navigable, and let users resolve unavailable custom instruments without losing original bindings.

**Architecture:** Keep Electron/React and schema 2. Organization changes layout only, with an immutable original-layout backup; complexity budgets select a coarser organization instead of dropping notes. Instrument replacement is a reversible binding, shared by preview and export. Editor zoom and row height are view state.

**Tech Stack:** Electron, React, TypeScript, Vitest, Playwright.

The user's existing request defines the behavior and authorizes implementation. Builder choices: keep exact original note attributes, map unavailable instruments explicitly, provide deterministic suggestions, and keep ordinary wheel scrolling. No additional dependencies or sound effects are needed.

## Tasks

- [x] Measure recursive corpus organization coverage and failure reasons; improve grouping and segmentation scalability with deterministic coarse fallbacks. Compare full note events, audio plans, and NBS export/readback with the original.
- [x] Reproduce and correct stale summary limits (100k notes / 64 groups) to match persisted project capacity (1m total notes / 256 tracks); test save/reopen and rejection above capacity.
- [x] Add adjustable track/layer row heights and pointer-anchored Ctrl+wheel time zoom in Playlist and Pattern windows. Test ordinary wheel, bounds and compact windows.
- [x] Add custom-instrument replacement bindings with deterministic name/register/rhythm suggestions informed by local SmartAssignment.java. Validate targets/cycles; retain original IDs and definitions; apply consistently in audio and NBS export; test undo/save/reopen/reset.
- [x] Wire a discoverable custom-instrument manager into the desktop UI. Test integrated native application and smart corpus imports.
- [x] Run full regression suite and independent review, package one latest runtime separately from a source archive, preserve historical sources, and push verified changes to GitHub.

## Review focus

Large scores must not fail only because report metadata uses a smaller limit. Coarse organization must preserve all events and layer semantics. Zoom must not trigger Chromium page zoom or break scrolling. Replacement must preserve the intended source pitch and reject cyclic bindings. Missing audio should remain recoverable after reopening, with no fabricated resources.
