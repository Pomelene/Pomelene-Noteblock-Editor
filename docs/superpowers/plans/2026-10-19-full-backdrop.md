# Full-background evolving sound-field artwork

User correction: the initial right-side particle drawing is too limited. Fill the entire background with richer evolving patterns; explicitly use linear and sin interpolation for larger color and shape changes. Preserve the established start page actions and glass editor.

- Use one original, framework-free full-screen WebGL shader: three coordinate-warp iterations, interference/nodal bands, fine fringes and highlights. Existing particles become a subtle full-screen layer.
- Linearly interpolate geometry/mode/scale; use sine easing for three distinct palettes, sinusoidal warp/rotation. Palette transitions last 9 seconds each, without frame flashes or hard cuts.
- A stable dark glass panel holds the three entry actions over the moving field. Editor UI and music/file data are unchanged.
- Preserve pause, reduced motion, native minimized/hidden/inactive stopping and teardown. Respect forced colors. Bound shader resolution to 1280 pixels on the long edge and frame requests to the existing 30Hz target. Supply Canvas-wave and CSS compatibility renderers.
- Verify parameter continuity and substantial evolution, actual GPU and fallback coverage/motion in all quadrants, context restoration, real EXE start workflows and screenshots at two real times. Archive source separately, retain one runtime and back up main.

Implemented and independently reviewed. Paused WebGL restoration regression observed red then green. Typecheck and all 326 tests / 41 files pass; packaged EXE passes 44 checks. Both real-time screenshots inspected; 22 packaged build files and guide match. Host main/preload hashes are unchanged from 0.5.6. Source archive, retention and remote backup are recorded in release verification.
