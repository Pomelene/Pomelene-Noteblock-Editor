# Pattern chord generator and right-button erase integration

**Goal:** Integrate the approved independent chord demo into real Pattern editing and ensure a held right-button sweep removes all touched notes as one reversible operation.

**Authority:** User explicitly approved integration and requested FL-style right-button erase. Existing Electron/React architecture and project v2 remain unchanged.

## Contracts and implementation choices

- Pure TypeScript chord generation belongs in `src/shared/chords.ts`; no renderer or host dependencies. Musical intervals match the demo. Production tick limits replace the demo's four-bar limit.
- A single `notes:chord` command validates the whole request, allocates unlocked layers without cell collisions, extends Pattern length when needed and records one history transaction.
- Default insertion appends. Explicit replacement only replaces unlocked notes of the current instrument at generated time positions. Other instruments and locked notes remain. The UI states the scope.
- The Pattern toolbar's chord button opens a generator panel. While open, left-clicking the note grid selects the time/root or layer instead of accidentally drawing a single note. Right-button erase remains available. The current instrument, velocity and start layer come from the editor.
- Chord controls support diatonic strips, custom quality/extensions/inversions/bass/open voicing, simultaneous or ascending/descending triggers, and optional forward stepping. Previews use the existing audio resources, including custom mappings.
- Chord preview cancellation is separate from song playback. Closing the panel, replacing the document or cancelling a pending decode cannot produce a late preview. Generation guards remain in the host command path.
- The existing erase implementation must first be tested rather than assumed absent. Fix proven geometry/lifecycle gaps; interpolate fast movement, honor actual drawn note rectangles and locked layers, keep one command on release and cancel safely on Escape/blur/document replacement.

## Work and verification

- [x] Chord core: interval and boundary fixtures, fractional timing, collision allocation, locked-layer preservation, atomic replacement and undo/redo tests.
- [x] Generator panel: real commands/preview, visible current insertion position and tone list, native inputs and responsive layout; component tests.
- [x] Erase: real pointer regressions in both piano/layer modes, exact geometry, rapid movement and complete single-step undo.
- [x] Parent/audio integration: choose-only chord mode, grouped audio scheduling and cancellation, document identity guard, narrow/native windows.
- [x] Typecheck, focused/full suite, packaged desktop workflows, source backup and one retained local runtime.
- [ ] Fresh independent review: attempted, unavailable due to service 429; separate implementer self-review completed and disclosed.

## Scope

The standalone demo remains as a historical experiment. Its private JSON format and local cache are not added to production. No new project schema or audio effects are introduced. Application version advances to 0.5.2; project format stays v2.

## Execution ledger

- Core/audio contracts: 39 chord tests and 23 audio tests pass; atomic placement, collision/lock protection, v2 and NBS roundtrip verified.
- Panel/erase: 10 actual browser tests pass, plus 8 packaged desktop checks including compact native window and shared undo.
- Final: fixed chorded-button release — real pointer regression RED to GREEN. Fixed 6/8 insertion display — meter regression RED to GREEN. Whole suite 302/302.
- Final review: independent reviewer attempted but failed with service 429 retry limit. Implementer performed a separate self-review of the full change; no outstanding critical or important findings identified. Independent review remains unavailable, explicitly disclosed in validation notes.
- Build: TypeScript/unused-locals clean; production build and Windows directory package succeeded. All 22 packaged build files and user guide match current build.
- Delivery: packaged baseline 20/20, NBS/v2 6/6, chord desktop 8/8. Old 0.5.1 runtime removed only after 0.5.2 verification; its source archive hash checked and retained.
