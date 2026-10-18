# Phrase Samples and Editing Interaction Implementation Plan

> For agentic workers: use executing-plans for assigned work and test-driven-development for behavior. Independent core and canvas tasks may run in parallel; root owns browser/preview/desktop integration.

Goal: Deliver real FL-style continuous placement, reliable individual clip trimming, musical snap controls and immutable reusable note phrases.
Architecture: Optional version-compatible phrase sources in shared model/session/io/timeline; shared snap+gesture helpers; browser/editor previews and authoritative IPC/file transactions.
Stack: Existing Electron/React/TypeScript/Vitest/Playwright; no new runtime dependencies.
Spec: ../specs/2026-10-18-phrase-interactions-design.md

Global constraints: Preserve existing NBS beta imports and .nbproject schema2; old audio samples remain supported under explicit audio-resource naming; phrase notes cannot be edited; runtime/source separate0.5.0 archives; no FL binaries/resources copied.

Review focus: stale gesture after project switch; narrow clip edges versus menu hit area; phrase conversion aliases source objects; custom instrument import ID collisions; triplet snap and disabled snap never mutate existing off-grid timing.

- [x] Task1 shared core: model/session/io/timeline/main/files plus tests. Optional phrases, phrase Clip kind; fromPattern/fromClips, rename/color/remove, toPattern/unique conversion; playback/export and atomic importPhrase with custom resource remapping. Red/green immutable boundaries and old-project compatibility.
- [x] Task2 editing: Playlist/PatternEditor/editing/SnapPicker/snap module and tests. P/B/E/D (+Playlist T/S), continuous pointer paint/erase, one-history transaction, capture/cancel guards; reliable edges and feedback, local edit menus; musical snap grouped labels and auto visible grid.
- [x] Task3 root integration: Source/window kinds/IPC; App browser sections/menu/readonly PhrasePreview and conversion flows. Audio resources clearly labeled. Typecheck, actual screenshots and semantic UI flows.
- [x] Task4 verification: full unit/type/build, baseline and smart regression, new real desktop gesture/library workflows, independent review and fixes. Update docs, package0.5, extract+retest runtime, independently verify source lockfile, hash/manifest/source commit.

Core contracts: PhraseSample extends Pattern; Project.phrases?; Clip.kind/Source.kind include phrase. Commands phrase:fromPattern{patternId,name?}, phrase:fromClips{ids,name?}, phrase:update{id,patch{name?,color?}}, phrase:remove{id}, pattern:fromPhrase{phraseId}. source:unique on phrase reference creates editable Pattern and replaces only that reference. FileAction importPhrase reads NBS into current library atomically. Root and canvas workers consume these names.

Evidence: strict typecheck/noUnusedLocals; 122 tests in18files; actual Electron suites baseline20 +smart12 +phrase/interaction18, repeated on extracted release EXE. Independent review's readonly-command bypass and coarse-snap anchor findings reproduced/fixed; real menu stale-cut selection and fractional-DPI preview oscillation also reproduced/fixed. Details and limits: docs/validation-0.5.0.md and release verification folder.
