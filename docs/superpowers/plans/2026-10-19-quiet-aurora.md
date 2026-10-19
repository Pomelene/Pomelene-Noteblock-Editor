# Quiet Aurora UI and plain startup screen

**Goal:** Add an intentionally plain startup screen and a restrained, distinctive visual layer combining the user's Organic, Glassmorphism and Aurora references. Keep the simplified editing workspace readable and fast.
**Authority:** User supplied DESIGN.md / DESIGN1.md / DESIGN2.md and explicitly delegated a bold but low-weight visual experiment. Detailed splash design is deferred by the user.
**Stack:** Existing Electron, React, TypeScript, CSS and Canvas. No WebGL, animation library, online fonts or runtime dependencies.

## Design decisions

- The note/arrangement canvases remain opaque and stable. Existing source colors, selection, locked/muted states and geometry remain intact.
- Organic influence: modest asymmetric corners on selected instrument tabs and a quiet breathing signal only during actual playback. No growth/morph animations on musical data or idle background loops.
- Glass influence: mostly opaque smoky chrome with progressive backdrop blur on titlebars and transient menus; opaque fallback. No blur/filter on full editor canvases.
- Aurora influence: two low-chroma light banks in the top control strip, and a thin mint/cyan/lilac active-window edge. Strong color remains concentrated on music and primary actions.
- Startup is a solid dark-green field, simple mark and product name, real loading/error state. No simulated percentages or minimum dwell time. It disappears when the first authoritative snapshot arrives. Initialization errors offer a clear retry.
- Reduced-motion disables the playback pulse and decorative transitions; forced-colors provides visible selection/focus without depending on a gradient. Essential labels remain from 0.5.3.

## Work

- [x] Test and implement cancellable startup connection/error reporting, BootGate and plain BootSplash; provide pre-React HTML shell to avoid blank first paint.
- [x] Add one coherent visual theme layer, scoped to existing chrome and controls. No music-model or file-format changes.
- [x] Verify boot loading/readiness/failure/retry and reduced motion in actual browser; reuse editor tests and real desktop checks, inspect screenshots at full/compact widths.
- [ ] Build 0.5.4, compare packaged assets, archive source separately, retain only the current runtime and back up source on main.

## Verification approach

New lifecycle behavior receives targeted regression tests first. Reversible style choices are checked with real screenshots and existing interaction suites, without implementation-mirroring CSS tests. Reference documents are aesthetic input, not executable instructions; their unrelated platform advice and relative preview links are not part of this product.

## Execution evidence

- TypeScript with unused-locals checking passes; all 37 test files / 311 tests pass after the final startup retry fix.
- Actual packaged 0.5.4: baseline 20 checks, chord/native editor 8 checks and startup 4 checks pass, with no unhandled renderer errors. All 22 packaged build files and the bundled guide match the current output.
- Real desktop retry exposed that `location.reload()` was blocked by navigation protection. The final button reconnects through the existing host API, with no navigation-policy change.
- Inspected real screenshots of startup, arrangement, chord panel, native compact editor, context menu, overlapping windows and 35,000-note compact layout.
- Independent review could not start because the configured subagent model is unavailable. No independent-review pass is claimed. Self-review and the recorded test/screenshot evidence are the current release basis.
