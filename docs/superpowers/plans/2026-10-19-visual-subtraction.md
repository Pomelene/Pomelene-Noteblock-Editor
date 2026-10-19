# Visual subtraction implementation plan

**Goal:** Keep the dark, compact desktop editor while removing decorative chrome and redundant text; emphasize musical content and everyday actions for non-specialist users.
**Authority:** User approved the preceding simplification proposal and explicitly requested direct subtraction, no new effects.
**Architecture:** Edit existing renderer styles and presentation copy in place. Keep Session, file formats, geometry, playback, shortcuts and host boundaries unchanged. No new visual framework or runtime dependency.
**Tech stack:** Existing Electron / React / TypeScript / Canvas / CSS.

- [x] Simplify shell and editors: flat neutral surfaces, restrained window separation, contiguous tool groups and instrument tabs, consistent control spacing. Keep useful resize/drag handles and focus indicators. Preserve meaningful note/track colors.
- [x] Remove duplicate visual labels: decorative project/window badges, source ordinal, duplicate selected-source footer copy, zero instrument counts, current-text badge, uppercase diagnostics and idle shortcut prose. Preserve accessible button names, tooltips and musical state. Make visible transport mode and speed labels understandable in Chinese.
- [x] Simplify chord panel into a compact parameter tool: unboxed summary, modest chord name, concise root/position labels, put detailed instructions behind explicit help disclosure; keep audition, placement, errors and replacement scope discoverable.
- [x] Review actual screenshots in Playlist, Pattern, chord panel, overlapping windows, context menu and compact native editor. Run existing interaction tests and desktop smoke; do not add implementation-mirroring CSS tests for this reversible visual change.
- [ ] Build 0.5.3, compare packaged outputs, retain one local application with separate source archive, back up source on main.

## Design choices

Gray hierarchy replaces ambient blue tint. Green is reserved for chosen controls and primary actions; amber remains the transport cursor. Meaningful source/instrument colors remain on music content. No decorative gradients or inset shadows. A single light shadow is allowed on floating windows and menus to separate overlapping surfaces.

Text removal must not remove actions. Static tutorial prose moves into help/tooltips; runtime warnings, locked/muted state, selected instrument and save status remain visible. Existing core behavior is out of scope.

## Execution ledger

- Existing implementation retained; renderer presentation and version/documentation only. No core, host, preload or format code changed.
- Removed obsolete badge assertion in window component test; kept title/focus/geometry behavior checks. Changed chord auto-advance's duplicate raw-tick assertion to the available tooltip. No CSS-mirroring tests added.
- Verification: TypeScript/unused-locals clean; full suite 302/302 in 35 files. Packaged desktop baseline20/20 and chord8/8, no renderer errors.
- Visual inspection: Playlist, chord panel, overlapping windows, context menu, compact native editor and dense35k-note screenshot checked. Preserved focus, selection, locks/mute cues and actionable menu entries.
- Package:22 build files and guide match. Main/preload byte hashes unchanged from0.5.2. Old source ZIP checked before runtime cleanup.
