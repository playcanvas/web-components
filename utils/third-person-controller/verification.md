# Observatory verification

Reviewed 6 September 2026 against PWC 0.22.0 and Engine 2.22.0. This records the delivered example, not the development history.

## Automated checks

| Check                                 | Result                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm test`                            | 58 files, 1,261 tests pass, including 25 observatory input/state/animation regressions |
| `npm run test:observatory-assets`     | 15 tests pass after a fresh `npm ci --prefix utils/third-person-controller`            |
| `npm run lint`                        | Pass                                                                                   |
| `npm run type-check`                  | Source and test types pass                                                             |
| `npm run build` and `npm run publint` | Pass                                                                                   |

The normal test suite now protects held-Space suppression, short taps, focus cleanup, pause/reset, the controller-removal observer gap, fall recovery while paused, and real Engine ticks at 20 fps. Integration tests load the example's actual animation markup with a small animated model and verify takeoff blending, one-shot landing and loop continuity. Asset tests decode the delivered Draco GLBs and check skin weights, walk continuity, animated ring hierarchy/loop closure, round collision and static AO bindings. CI runs both suites.

Targeted runtime JavaScript/test formatting passes. Repository-wide formatting reports existing unrelated files; they are excluded from this change. Tests ran with the locally installed Vitest 4.1.11; the root manifest/lockfile request 5.0.0. The root dependency tree was not replaced during this pass.

## Browser checks

Windows in-app Chromium 152, WebGL2:

- Automatic startup resolves all six declarative character clips.
- Each clip changes both sampled non-root joints (pelvis and left clavicle) and maintains finite playback values.
- Twenty 50 ms Engine ticks advance one second of simulation; the 0.1-second hitch cap remains active.
- Pause/resume remounts the controller; reset returns to play.
- Synthetic left touch moves the player, right touch orbits the camera, and right double tap emits exactly one jump. Only browser pointer-capture methods were stubbed for synthetic pointers; the Engine input source and physics were exercised.
- Light quality caps pixel ratio at 1 and directional shadow resolution at 1024. The startup regression verifies coarse-pointer devices select this mode.
- [Preview](preview.webp) captured from the rendered example at 1024 × 768.

Synthetic touch validates the input route, not the ergonomics, browser gesture arbitration or performance of a physical phone.

## Asset/performance evidence

The support-cliff shading pass retains 25% of the original facet normal and preserves 55° creases. Fixed-camera before/after WebGL2 captures confirm softer small facets while retaining ledges and silhouettes. All 81 primitives preserve positions, UV0/UV1, oriented triangles, hierarchy and animation; normals change only on the valley support-cliff batch. All textures remain byte-identical at source. Compression validation and all 15 delivered-asset tests pass. The change adds 166,220 compressed bytes and no triangles or draw calls.

Three delivered GLBs total 14,580,676 bytes, versus approximately 56.38 MB before compression. Draco positions, skin data, nondegenerate triangle winding and animation samples were verified against source exports. ETC1S mip extents are compatible with the Engine's texture upload requirements.

Architectural AO uses five 1024-square delivery atlases for 39 static meshes. UV audits found no overlapping occupied samples at delivery resolution. AO-only source comparisons preserved all 81 primitives' positions, normals, UV0, oriented triangles, hierarchy and animations. Moving monument parts are excluded from static baking.

At the fixed arrival view, desktop WebGL2, 1024 × 768, eight alternating measurements compared SSAO with baked AO using the same uploaded geometry. Median GPU time was 9.27 ms versus 7.99 ms (13.8% reduction); draw submissions were 307 versus 232. The tradeoff is 1,367,456 additional downloaded bytes and approximately 3.33 MiB of AO texture memory on that GPU, plus UV/vertex storage. These measurements predate the code cleanup; geometry, textures and lighting were unchanged in the cleanup.

## Checks still requiring another environment or deployment

- **Default WebGPU:** this machine's in-app browser reports D3D12 `DXGI_ERROR_DEVICE_REMOVED` during device creation/restoration and can leave startup at 100%. WebGL2 works. Repeat on a healthy WebGPU device before claiming backend parity; the example has not been forced to WebGL2 to conceal this failure.
- **Physical mobile and independent Chrome:** no phone or connected Chrome browser was available to the automation tools. Check movement/look together, double-tap jumping, browser gestures, pause/resume, orientation changes and sustained frame time on iOS Safari and Android Chrome.
- **Live StackBlitz:** source-closure/packaging tests pass. The three new GLB URLs on the deployed examples site currently return 404 because this example is not deployed. After deployment, open Edit on StackBlitz and confirm dependency installation, model decoding and controls. Local packaging checks cannot substitute for this end-to-end run.

## PR contents

Include runtime HTML/CSS/JS, the three compressed GLBs and HDR, catalogue/StackBlitz expectations, behavioral tests, CI wiring, and the authoring tools with compact source assets, licenses and this documentation. `output/`, Python caches and Blender backups are ignored. Historical captures, verification logs and the obsolete collision migration remain local under `output/third-person-controller/pr-review/`; they are not PR inputs.
