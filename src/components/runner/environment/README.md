# Landscape and material family

## Essential world pass (current)

The world read as cluttered, so it is reduced to its essentials: the terrain,
Pip (with his shadow and reflection) and the light trails. Every other layer is
switched off in `worldLayers.ts` (`WORLD_LAYERS`), not deleted: formations,
details (including `NearMineralFragment`), the near banks and the passing-light
paths (`EnvironmentEnergy`). Layers will be reintroduced one at a time once the
essentials are polished; turning one back on is a single boolean.

- Without `WesternFold`/`SuspendedStone`, `LayeredOptics` builds no fold capture,
  and `ForegroundSoftness` has no near meshes, so it draws the frame directly.
- Draws at idle 50 → 16; triangles about 167k → 92k (desktop, Study B).
- Pure-function checks (`check-environment`, `check-landscape-topology`) still
  cover the disabled layers' geometry and budgets.
- `review-composition` and `review-materials` now read the shared uniforms from
  `WorldLightTrails`. Reviews that study disabled objects (the pilot sheet/mineral
  optics, `WorldPassingLight`, foreground visibility in `check-atmosphere-review`)
  do not apply while those layers are off.
- Pip is a taller egg with larger eyes (model revision 03, see
  `assets/pip/README.md`) and a soft white vinyl finish with a faint lavender
  lift in `usePipSurface.ts`. He is placed by his soles (`PIP_SOLE_Y`), so the
  floor, contacts and Study B framing are unchanged.
- Light trails are now wind ribbons (`trailShaders.ts`): seven wide, soft
  ribbons that follow the terrain, sway, twist like silk and lengthen with
  `uEnergy.x`; waves run on `uEnergyPhase`. Each recycles fully off frame. Still
  one draw, about 900 triangles, skipped at idle and under reduced motion.
- **Production floor.** It is the analytic terrain (`surfaces.terrain`,
  `landscapeShaders.ts`), drawn without tone mapping in every material mode:
  the Current look, lighter and better modelled. Pip keeps the Pilot lighting
  (studio IBL, low ambient, hemisphere bounce, rims). Only the ground mesh uses
  `surfaces.terrain` while formations are off; re-enabling a terrain-finish
  formation would also make it untonemapped.
- **Satin floor (off).** The satin floor (`pilot.ground` in
  `pilotMaterials.ts`) is behind `WORLD_LAYERS.satinGround`. It is a calm pearl:
  - Two slow, broad periwinkle/peach zones (two or three in view, never bands)
    plus a faint lavender with distance.
  - A soft clear coat (0.45, roughness 0.22) and roughness 0.38.
  - The shelf caustic at z ≈ −1.85 returns only with `WORLD_LAYERS.formations`.
- **Speed tiers.** The world now makes typing speeds read differently without
  adding objects. There are two levers:
  - **Ribbon count.** `WorldEnergy.tier` is a slow memory of the resolved
    intensity: it rises at 1.2/s and falls at 0.8/s, so jitter cannot flicker a
    ribbon at its entry point. Each `LIGHT_TRAILS` entry has an entry intensity,
    so the number of ribbons reads as a speed meter:

    | WPM | Ribbons |
    | ---: | ---: |
    | 15 | 1 (the low one at Pip's feet) |
    | 30 | 2 |
    | 45 | 3 |
    | 60 | 5 |
    | 90 | 7 |

    Ribbons widen slightly with the tier. `uEnergy.x` now only gates idle and
    coasting, so the single slow ribbon stays readable.
  - **Ribbon clock.** Ribbons run on `WorldEnergy.trailDistance` (`uTrailTravel`),
    an unwrapped clock that adds `velocity × (1 + 0.7 × tier)` each frame. They
    drift with the floor when slow and overtake it in a sprint. The old
    `uTravel` clock wrapped at 72 and made every ribbon jump on each lap.
  - **Color temperature.** Sustained energy (`uEnergy.y`) warms the floor.
    `floorWarmth()` (`floorWarmth.ts`, tuning in `FLOOR_WARMTH`) is shared by
    both floor finishes:
    - On the terrain it runs before the distance air, so far ground stays
      pale.
    - On the satin floor it runs on the lit color. Tinting only the satin
      albedo was invisible: its clear coat and image-based light dominate.

    It has two parts:
    - **Grade.** A warm grade that multiplies the floor color. It is identity
      at zero energy, so idle, reduced motion and `energy=off` are unchanged.
    - **Wake.** A warm wake trailing Pip, centered at x ≈ −2.6 and gated by
      `uEnergy.y²`. It is also multiplied, never mixed toward white.

    The satin floor's peach zones also spread with sustained energy (threshold
    0.45 → 0.15). Slow typing keeps the cool floor; only a held sprint warms it.
  - **Limits.** Both levers derive from `LandscapeMotion` through `WorldEnergy`,
    with no new draws or triangles. `check-environment` asserts the ribbon
    count per pace step, the tier progression, and the idle and reduced-motion
    resets.
- **Relief shading (satin floor only).** The terrain shader already models its
  slopes. On the satin floor they read flat: typical slopes change key-light
  facing by only 0.05–0.1, which the studio fill and the tone curve swallowed.
  `RELIEF_SHADING` (`pilotMaterials.ts`) handles it:
  - Slopes facing away from `uKeyDirection` take a cool lavender shade.
  - Slopes facing it get a slight lift.
  - The lane (|z| < 0.6) is masked.
- Review modes: `review-composition.mjs --quick` loads the legacy
  `materials=current` study (shader terrain, no atmosphere, old Pip lighting).
  `--energy` captures show production: terrain floor, Pilot lighting on Pip.

Verify: `PACE_STUDIES=b node scripts/review-composition.mjs --quick`, then
`--energy --wpm=90`, and `--mobile --energy --wpm=90`. For the speed tiers,
capture the ladder `--energy --wpm=15|30|45|60|90` and compare ribbon count and
floor warmth.

## Target art direction pass (retained)

A seven-step pass moved the world and Pip toward the reference image kept
locally in `target/` (Git-ignored). It deliberately supersedes three earlier
decisions: no bloom (Phase 4), no motes (Phase 5) and the small detail budget
(Phase 3). The Study B camera and formation anchors are unchanged.

1. **Palette and light.** `StudioEnvironment` uses `NeutralToneMapping`; ACES
   greyed the high-key field and desaturated the accents. Landscape colors are a
   near-white pearl with saturated cobalt, periwinkle and peach. A periwinkle
   hemisphere bounce plus stronger warm/cool rims give Pip colored volume. The
   pilot ground scales and partly desaturates its image-based light in its own
   shader, because `scene.environment` ignores `material.envMapIntensity`.
   Several shaders previously mixed white in linear space, which reads pastel or
   grey on screen; tints are now applied with little or no white.
2. **Ground.** `TERRAIN_RELIEF` (0.32) scales the shared CPU/GPU field, so the
   dunes become low swells and the world sits in a horizontal band. Formations
   and rooted details follow automatically; the walking corridor stays level.
   The pilot floor is a thin glossy sheet (roughness 0.14–0.3, clearcoat 0.8).
   The bottom screen fade starts higher and distance haze reaches 84% at 28 units.
3. **Glass arches.** Arches are thick bands with a superellipse section. Kind 2
   is a glass shader: eased cobalt-to-peach gradient along the span, brighter
   face center, narrow highlights and sparse internal streaks. Two thin glass
   rings (`filament`) sweep over the formations.
4. **Details.** Crystals use hard facets (85% face normal). New shapes: `sphere`
   (floating, like minerals) and `petal` (rooted blades). New finish: `bubble`
   (kind 5, thin-film iridescence). 46 deterministic motes span the whole loop,
   all behind the lane. `check-environment` budgets are now ≤14 detail batches,
   <110 instances and <32k detail triangles (89 / 14 / ~24.8k at present).
5. **Light trails.** `LightTrails` draws 14 ground-level ribbons that flow
   backward faster than the floor, driven by `uEnergy.x`. A white core, a glow
   and a saturated halo are built into each streak: a selective bloom without a
   render target. One draw, about 900 triangles, skipped at idle.
6. **Foreground.** The near layer (z ≈ 9) is cobalt on the left and peach into
   lavender on the right; distant pieces sharing the finish keep the pearl look.
   `ForegroundSoftness` now runs two separable passes at quarter resolution
   (512 px long-edge cap), roughly 20 CSS px of softness.
7. **Pip.** Glossy clearcoated eyes; a faint cool sheen and a partly desaturated
   image-based light on the body. `usePipReflection` adds a mirrored copy bound to
   the same skeleton and morphs. Its vertices are slid along the camera ray onto
   the floor, so the ordinary depth test hides it behind Pip and anything in
   front, with no stencil buffer or extra pass. It fades within a short distance.

8. **Translucent depth.** Resin (kind 1) and glass (kind 2) wrote no depth and
   drew in arbitrary order (instanced batches all sort at the origin), so sheets,
   petals and arches showed their own back layers and each other in the wrong
   order. Each such formation and detail batch now has a depth-only twin
   (`translucentDepth`, `DEPTH_PREPASS` in the shared shader, slight polygon
   offset) drawn first in the transparent queue (`RENDER_ORDER` in
   `landscapeMaterials.ts`): only the front-most resin/glass layer is shaded,
   over the opaque world. Bubbles (kind 5) stay layered on purpose and draw
   after it; light trails and passing light draw last. Fragments below 0.5
   coverage (frame/haze/finish fades) write no depth. Cost: +11 depth-only draws
   and ~+25k triangles (39→50 draws at idle). Verify with
   `PACE_STUDIES=b node scripts/review-composition.mjs --quick` and `--energy --wpm=90`.

Still open: a real bloom pass for crystal and bubble glints, a stronger glow at
Pip's feet, denser authored detail in the part of the loop seen while running,
larger foreground blobs (this would touch the Study B framing) and the Pip model
itself (eye size, visible feet and tail). Earlier phase notes below describe the
state before this pass where they disagree with it.

## Phase 5 motion and visual energy (retained)

The Phase 1 composition switch was still forcing energy to zero and leaving
`EnvironmentEnergy` unmounted. The existing `WorldEnergy` now runs after world
momentum and contact sampling. It drives the landscape and all three optical
pilot surfaces. Camera, static geometry, base material parameters and the
physical contact plane remain fixed. Gameplay statistics are unaffected.

`visualSpeed.ts` remains the single real/simulated mapping:
`clamp(wpm / 90, 0, 1) ** 0.6`. Intensities at 15/30/45/60/90 are
0.341/0.517/0.660/0.784/1.000. Full expression moves from 65 to 90 WPM.
World maximum velocity becomes 7.6 units/s so 60 retains 5.96 units/s (previously
6.03); 90 reaches 7.6. Acceleration/coasting rates and exact distance integration
are unchanged. The eastern near bank runs at 91% of the western bank's relative
rate, breaking their locked cadence without moving the approved idle anchors.

Energy is smoothstep(momentum, 0.2, 1): about 0.82 at steady 60 and 1 at 90.
Sustained response builds with bounded memory and decays after slowing. Two
overlapping surface catches use integer temporal harmonics, avoiding a jump
when the phase wraps. The phase follows velocity and settles as movement ends.
Accepted stumble events interrupt only nearby light and recover exponentially;
the world does not brake when Pip stumbles. Existing landing pressure, fragment
response, event pools and reduced-motion handling are preserved.

Six existing paths remain in one 768-triangle batch behind the physical lane.
Their placement follows the current terrain; they write no depth, respect Pip's
depth, and fade at both ends of the phase cycle. Their material now follows the
same tone mapping and actual render-target viewport as the rest of the scene.
No new render targets, particles, blooms or world objects are added. The 32
micro-motes and eight contact-glow quads were removed after five matched
comparisons changed only 8-48 pixels by more than 2/255 at 1536x1024. The physical
contact effects are separate and remain active. The energy batch is skipped at
idle and after its continuous fade becomes imperceptible.

Development-only Visual energy controls compare Off / Surfaces / On without
resetting time, pose, contacts or traversal (`?energy=off|surfaces|on`). Production
always uses On. Legacy review tools request energy=off explicitly. Phase 4
historical comparisons now lock only idle to the old evidence, since Phase 5
intentionally changes travel; matched current on/off comparisons remain strict.

Local evidence is in `assets/reviews/phase5-energy`. Run
`node scripts/review-materials.mjs --energy --wpm=60` and `--wpm=90` with separate
`PACE_REVIEW_DIR` values ending in `/60` and `/90`; `PACE_REVIEW_PORT` selects a
separate Chrome debugging port if needed. `--ablate` supports the earlier
effect-removal experiment (the final batch already contains only paths).
`node scripts/check-energy-review.mjs` checks matched poses, visible energy,
brightness limits, resource reuse, real keyboard errors and coast recovery.
The mobile sprint review uses `review-composition.mjs --mobile --energy --wpm=90`
with `PACE_STUDIES=b`. Phase 6 quality tiers and hardware qualification are
deliberately outside this pass.

## Phase 4 optical depth (retained)

The approved Study B framing, Phase 3 geometry and material parameters are
unchanged. `ForegroundSoftness.ts` isolates only NearWesternBank,
NearEasternBank and NearMineralFragment. The sharp scene and its refraction
captures exclude those three meshes. Their linear, premultiplied color/coverage
is rendered separately, filtered horizontally and vertically, then composited
over the sharp frame. Pip never enters the blur buffers; HTML is outside WebGL.
This is a selected near-layer treatment, not general depth of field.

(Superseded sizes: the target art direction pass uses quarter resolution, a
512-pixel cap and two blur passes. The original Phase 4 values follow.)
Two reusable half-resolution targets have a 1024-pixel long-edge cap, no MSAA
and no mipmaps. The source has a depth renderbuffer; the blur scratch target
does not. A 17-tap Gaussian per axis gives approximately six CSS pixels of
softness independent of DPR. Transparent pixels contain zero color, preventing
a white/dark fringe. Tone mapping and output conversion happen once at the
final composite. Visibility, capture uniforms and renderer state are restored
in `finally`; targets, helper triangle and materials are disposed on unmount.
The pass bypasses rendering when all three near meshes are outside the frustum.

`atmosphere.ts` supplies camera-space haze relative to Pip's fixed focal plane.
It starts five units behind that plane and reaches 74% at 34 units. It replaces
the old distance whitening and redundant boundary bleaching; the composition
coverage masks protecting the sentence and lower interface remain. Haze adds
no passes. Existing material-local reflection/transmission provides luminosity.
No bloom was added: bright white background and opaque white Pip would make
a blanket luminance threshold a poor selection mask.

Development controls compare `?atmosphere=off`, `haze`, and `on` without resetting
the world. Off restores the Phase 3 rendering baseline; haze enables only the
new atmospheric response. Production uses on and has no comparison controls.
Legacy material/composition capture commands explicitly select off.

Capture with `PACE_REVIEW_DIR=assets/reviews/phase4-optics` and
`node scripts/review-materials.mjs --atmosphere`. Then run
`node scripts/check-atmosphere-review.mjs`; this requires the local frozen
Phase 3 `baseline/report.json`. Mobile review uses `PACE_STUDIES=b`, a separate
review directory, and `node scripts/review-composition.mjs --mobile --quick --atmosphere`.
The local, Git-ignored review board includes matched Off/Haze/On images,
closeups, a traversal through world wrap and mobile captures.

At 1536x1024 DPR 1, on uses two additional 768x512 color textures (12 total),
about 7.5 MiB of nominal color/depth storage. Idle remains 48 draws because
near geometry no longer gets duplicated in refraction captures. Sampled travel
is 24-50 draws, with no more than three extra fullscreen draws versus off.
Warmed buffer/texture/framebuffer allocations remain stable through a wrap
and mode switches. Pixel checks preserve Pip's eyes/body, sentence and white
field exactly; the near-fragment crop has 51.5% of haze-only edge energy.
These are software-renderer structural measurements, not a hardware FPS claim.

The pass separates near softness, sharp focal objects and lower-contrast distance.
TARGET still has richer local light transport and foreground shapes; this
pass intentionally does not change those materials or geometry. Layer selection
assumes the existing near objects stay in front of the focal scene. New objects
crossing between planes would need a depth-aware compositing approach.

## Phase 3 geometry and density (retained)

Study B's camera and all FORMATIONS anchors are unchanged. The existing grids
now describe an asymmetric leading sail, a broad distant fold and a reversed
crest beyond the bend. Their second lobes are lower and separated in depth;
the optical pilot still receives the same equal-sized index ranges. Arches use
flattened sections with a broad shoulder and a thin return. The outer arch is
lower, with its weight on the opposite shoulder.

Terrain bands gain a smooth asymmetric cross-section shared by CPU and GPU.
The nearest shelf is broader and lower. The level contact corridor, world period
and existing near banks stay fixed. Formation roots compensate for the approved
0.78 vertical scale; arch feet follow the terrain across their entire section.

Secondary forms decrease from 37 to 32: remove two small sheets, two competing
filament arches and one distant mineral. Remaining accents group around roots
and shoulders with unequal scales and gaps. Small minerals gain facets; lens
edges sink into terrain rather than floating as flat oval plates. Instancing
and shared buffers remain. Landscape triangles stay at 88,896; detail triangles
drop from 9,672 to 7,248, including the existing near fragment. Detail draws drop
from ten to nine. No materials or rendering effects were added in Phase 3.

Run `node scripts/check-landscape-topology.mjs` for the environment regressions
and transverse triangle-crossing checks. Shared seams/tips and coplanar overlap
are excluded from that intersection diagnostic. The existing root assertions
now test rendered positions after scaling, and arch root checks were added.

Matched evidence is in the local, Git-ignored `assets/reviews/phase3-geometry`.
Capture with `PACE_REVIEW_DIR=assets/reviews/phase3-geometry` and
`node scripts/review-materials.mjs --geometry`, then run
`node scripts/check-geometry-review.mjs`. The latter requires the frozen baseline
in that review directory; it verifies unchanged camera, anchors, Pip pose,
materials, lighting and world travel against Phase 2. Fixed screen crops isolate
geometry changes without recentering the views. No material budget was increased.

The pass is ready for visual review. Broad terrain bands and the small shared
shape vocabulary remain simpler than TARGET; the pre-existing Phase 2 optical
limitations remain. No further phase or material rollout is included.

## Phase 2 material pilot (retained)

Study B is approved and locked. Only ContinuousTerrain, WesternFold and
SuspendedStone receive the physical pilot materials. Other scenery retains its
previous finishes. Pip, geometry, physical lane, gameplay, world motion and WPM
simulation are unchanged. No post-processing was active in the Phase 2 baseline.

The ground is opaque and rough with deeper cool basins. The thin sheet uses
white diffuse color, .99 transmission and selective warm absorption: attenuation
#f3954d / distance .09, thickness .055 * (.08 + density squared * .92) / incidence.
The blue mineral uses white diffuse color, .98 transmission, roughness .055-.09
and attenuation #356cac / distance .92. A bounding ellipsoid estimates its
absorption path and exit normal; the outgoing ray reaches at most .75 scene
units toward the captured background depth. This is not a mesh ray trace.

StudioEnvironment.tsx generates one linear HDR studio texture and PMREM.
White remains the visible background. Pip keeps its existing opaque material.
Development controls compare Current, Shared light and Pilot without remounting
the world. Physical optics use opacity 1, depth writing and NoBlending; the
transparent queue supplies ordering, not alpha-based transmission.

LayeredOptics.tsx owns three reusable color/depth targets, half resolution
with the longer edge capped at 1024 pixels. It captures existing scenery with
the sheet/mineral hidden, then renders the rear fold from its existing index
range. The front fold samples that layer. When both optical objects are visible,
one additional draw renders the complete sheet into the third target. The
mineral now sees both fold lobes; their captured depth rejects nearer folds.
Sheet optics, material parameters and shared lighting are unchanged by this
latest continuation. The improvement is localized to the overlapping mineral.

No capture runs when both optical objects leave view. The rear-fold pass is
skipped when only the mineral is visible; the complete-fold pass needs both.
Targets are explicitly disposed. Renderer state, visibility and the full draw
range are restored in finally. No world meshes or geometry buffers are added.

At 1536x1024 DPR 1, idle measured 50 draws / 210,384 submitted triangles versus
49 / 204,240 for the preceding warm pilot and 25 / 104,136 for Current. The
sampled traversal spans 22-52 draws. Three 768x512 half-float color/depth pairs
use 10 renderer textures including existing resources; the third pair adds
about 4.5 MiB of nominal storage. Actual hardware time remains unmeasured.
Warmed buffer/texture/framebuffer allocations remain stable through the wrap
and comparison switches. These are software-renderer structural counts, not FPS.

The pilot remains **9 PASS / 3 PARTIAL**, recommendation B. Both fold lobes now
appear in mineral transmission, but fixed lobe ordering, legacy alpha depth,
half-resolution detail and approximate mineral exits remain limitations. The
untouched scenery still dominates portions of the traversal. No broader
material propagation follows from this assessment.

Review artifacts are local and ignored by Git. The board, motion capture,
architecture, costs and all twelve grades are in assets/reviews/phase2-materials.
With the development server on port 3000, run:

    node scripts/review-materials.mjs
    node scripts/check-material-review.mjs --baseline=warm-baseline --nested-fold-budget

The latest budget comparison requires exactly one existing full-sheet draw
(6,144 triangles) when the third capture is active, one additional color/depth
pair and no geometry growth. Pose, camera, travel, illumination, Pip identity,
allocation stability and restored renderer-state checks remain enforced.
The --same-submissions flag remains available for parameter-only refinements.

## Phase 1 composition study (approved baseline)

This section supersedes the older framing and optical-energy descriptions below.
The world now renders in a full-viewport canvas behind the existing HTML UI.
`../composition.ts` pairs lens and distance to compare 30°, 42° and 56° views at
the same subject height. B is the default: 42°, with a 0.35-radian camera azimuth
that makes the running lane recede diagonally. C uses 0.50 radians. Pip's
placement, animation and facing controller are unchanged; the viewpoint changes.
On narrow screens, subject height is capped relative to viewport width.

The two existing banks and close fragment occupy a true near plane. Banks may
overlap the lower body; they no longer obey an artificial whole-body exclusion
zone. Seven existing details sit on the camera side of the physical lane. All
remain outside the physical corridor. The original terrain grid's near strip
extends to z=10, retaining its indices, vertex count and lane samples. It still
uses the same terrain field. Hero objects are shortened about ground height via
instance transforms to keep the central sentence clear. No objects were added.

The integrated world distance, velocity, foot contacts and world interactions
are unchanged. Near passes recycle independently after their complete bounds
leave view. Optical energy and its decorative batch are disabled for this study;
their source and unit checks remain available. The active environment stays at
22 mesh draws and 98,568 triangles, with the same seven materials. No textures,
postprocessing, new lights or Pip asset changes were introduced.

Archived development URLs use `?compositionReview=1&composition=a&materials=current`
(substitute `b` or `c`); `&gray=1` removes world color using the existing shader.
Normal use and production are locked to B. The simulator UI and gameplay metrics
are unchanged. A development-only scene
handle supports the local capture harness and is absent in production.

Review `assets/reviews/phase1-composition/index.html` and its accompanying report.
`scripts/review-composition.mjs` captures matched clock-stepped frames and full
traversals. `PACE_REVIEW_DIR` selects an artifact folder; `PACE_STUDIES=b` selects
one study. Use `--mobile` for 390×844 and `--quick` for idle/2s/3s/neutral only.
Occlusion probes cover the three CPU-transformed foreground meshes; visual
review is still needed for GPU-displaced details and between sampled frames.

Pip occupies a level path through a continuous, procedural 3D landscape. The
ground extends horizontally beyond the viewport, rises into several ridges and
valleys, and recedes into pale distant formations. Large folded surfaces and
asymmetric mineral bridges emerge from that ground. Three suspended stones
provide restrained scale cues. Cropped near banks pass low across the view,
leaving Pip's body readable, including on narrow screens.

`detailClusters.ts` adds the next scale down without changing those landmarks.
Six authored regions relate small folded strata, embedded minerals, floating
fragments and shallow lenses to the nearby formations. The western fold repeats
a few warm accents; the bridge carries a denser cool mineral cluster. Small path
edge deposits stay outside the entire walking corridor. The distant seam is
sparse and atmospheric, and two outlying regions continue the composition
beyond the initial view. Three thin physical filaments connect terrain regions,
with both ends rooted in the ground. A single cropped near fragment provides
an asymmetric foreground cue. These are persistent world objects, not gameplay VFX.

`EnvironmentDetails` renders 37 authored instances in nine geometry/material
batches, plus the near fragment. Four shared geometries reuse the existing seven
materials. Instance transforms upload once; the shared travel uniform wraps
their world positions in the shader. Tiny per-instance metadata selects suspended
fragments and flexible filaments; embedded minerals remain stationary relative
to the ground. Grounded detail vertices and their normals
conform to the same terrain field before wrapping, keeping sheets and filament
tips attached. Slow phase-offset floating/rotation and root-pinned filament flex
use the shared ambient phase and delayed momentum. Instance buffers and shared geometry are
explicitly disposed separately from the parent-owned materials.

The sculptural family uses three related behaviors: taper, curl and fold.
The western formation lifts into two overlapping sheets with tapered roots and
an opening beneath them. The eastern loop has an offset crown, narrowed shoulder,
uneven section and twisting depth. Near banks have secondary folded contours;
floating fragments use twisted pentagonal sections instead of rounded blobs.
The far world uses fewer layers and broader silhouettes.

`terrainProfile.ts` describes the broad terrain masses, narrow shoulders and
shallow channels with six authored bands, rather than random displacement.
It generates the GPU profile from the same parameters used to root CPU geometry.
The existing grid concentrates its vertices in the middle distance so sharper
contours do not require more terrain triangles. `landscape.ts` builds the fixed
mesh buffers. `worldMotion.ts` owns momentum and the single travel distance. Elevation repeats every
72 world units; formations are
rooted in that same field and recycle beyond its atmospheric edges. GPU vertex
displacement scrolls the terrain without CPU vertex uploads. All middle and far
formations move in the same world space, so perspective supplies natural
parallax. Grounded objects intentionally share physical velocity: applying another
depth factor to them would make their roots slide across the height field.
`depthMultiplier` describes the perspective rate relative to Pip's ground plane.
Near banks and the close fragment use modest 1.18/1.36 travel multipliers and
independent offscreen recycling phases. They retain their existing geometry and
proportions but sit lower in the near plane so a pass cannot obscure Pip's body.
The authored terrain repeats after 72 units, while ambient phases and near passes
do not restart with that lap; the entire frame does not repeat in lockstep.
The world remains present at idle, with very restrained ambient motion; it does
not follow Pip's finish position.

`LandscapeMotion` reads Pip's existing coasting typing intent before the
character-only stumble response. It maps continuously to 0–6.4 world units per
second, with exponential acceleration (4.8/s) and slower deceleration (2.6/s).
Distance is integrated analytically, not assigned from WPM. The smoothed intensity,
velocity, distance, periodic terrain coordinate, ambient phase and delayed
momentum are updated once at frame priority -0.5. A delayed velocity adds a very
small lag to suspended pieces and filament flex without jittering primary travel.
There are no speed modes or new camera motion. At idle, traversal
settles to zero while the ambient phase continues. Reduced motion freezes both
phases and preserves the visible secondary pose. Finish keeps moving during Pip's
existing exit, then fades with the original results flow; reset starts a fresh journey.

`worldInteractions.ts` connects real animated landings to this world. Eight
preallocated impulses hold position, measured contact energy, radius, age,
lifetime and kind. Foot sequences emit exactly once; an accepted Stumble emits
one stronger offset disturbance. Normalized speed scales contact energy
continuously, without introducing another WPM model. Impulse positions follow
unwrapped travel distance, so they remain attached to the contacted surface
across the 72-unit terrain seam and expire rather than returning on the next lap.

The existing terrain shader applies a small negative pressure dent, with analytic
normal derivatives for its surface highlight. It spreads slightly along the ground
and settles within 0.85 seconds (1.1 seconds for a stumble); there is no visible
ring or added effect mesh. Only mineral instances inside a 2.65-unit landing
radius (3.1 for stumble) can respond. Their 3D distance supplies attenuation and
a propagation delay, followed by a very small damped lift/tilt. High or distant
fragments are unaffected. Embedded sheet roots and Pip's level collision plane
remain unchanged; the compression is intentionally shallow below that plane.
The same sole positions still drive the untouched contact shadow.

The impulse pool and its uniform vectors are reused; frame updates allocate no
objects. Ground deformation and fragment response reuse the current meshes and
materials, adding no draw calls or textures. Reduced motion clears the responses
and acknowledges event sequences so old impacts cannot replay when resumed.
Idle/reset and the completed exit clear the pool. World velocity, recycling,
parallax and the development simulator retain their previous behavior.

The floor stays 0.018 units below `PIP_FLOOR_Y` throughout the walking corridor.
The existing skinned sole sampler, contact shadow, Pip controller, GLB, camera
projection and UI remain intact. Distant depth, near-floor falloff and gentle
edge blending dissolve scenery into white without a circular backdrop. The
shader's directional shading and atmosphere require no textures or extra passes.

`landscapeMaterials.ts` assigns a deliberate material hierarchy to the existing
geometry. The terrain and near banks are opaque pearl/mineral surfaces, with
blue/lavender grazing-angle color, softer ridge highlights and a pale walking
lane. Folded sheets use lighter satin resin; the western fold carries the warm
peach tint. Arches use denser blue mineral, thickness-dependent absorption and
controlled transparency. Floating stones have tighter polished reflections and
subtle facet response, with amber pearl repeated sparingly in the detail clusters.

`landscapeShaders.ts` evaluates broad reflection lobes analytically.
Normals, view angle, elevation and approximate optical thickness drive the
gradients. Distance softens their contrast into the existing white atmosphere.
These are art-directed shading approximations: transparency reveals the actual
background, but there is no scene refraction, reflection capture, transmission
buffer or extra render target. The environment requires no textures or bloom.
Pip's material remains unchanged.

`worldLighting.ts` owns the shared lighting palette and directions.
`EnvironmentLighting` gives Pip a soft neutral key with faint warm backlight and
cool fill. The same directions illuminate the custom world shaders. Broad warm
and cool bounce fields follow the existing fold, arch and amber stone as the
world travels. A warm transmitted-light region extends from the fold onto the
neighboring ground. All materials receive these fields; color no longer stops
at object boundaries. Thickness and light direction control internal illumination
in thin resin/mineral surfaces while thicker areas retain their cooler depth.

Surface diffusion and stronger distance haze lower contrast into white, with
boundary surfaces bleaching before fading. These approximations are evaluated
only on world fragments, so typography stays crisp. The walking corridor limits
diffusion to preserve the unchanged contact shadows. Near-white highlights are
part of the surface shading; this pass uses no bloom, volumetrics, shadow maps,
reflection captures or additional geometry. The subtle fills add two unshadowed
directional lights to Pip's existing rendering, not extra scene passes.

The physical environment has at most 22 mesh draws and 98,568 triangles at full visibility.
The detail pass adds 10 draws and 9,672 triangles to the unchanged 12-draw,
88,896-triangle landscape. The overlapping hero sheet layers are merged
into their parent formation buffers; they add no objects or material draws.
Seven shared shader materials serve those meshes. Translucent sheets and arches
use depth testing without depth writing and render in a single pass, preserving
Pip's opaque silhouette and avoiding a second back-face pass. R3F owns the
declarative geometry; the component explicitly disposes its shared primitive
materials on unmount.
Updates use refs and uniforms, without React state or per-frame mesh allocation.
Reduced motion freezes travel and secondary motion; results fade the world after Pip exits; reset
restores the initial view. The prior illustration effects remain removed.

## Visual energy prototype (superseded by Phase 5 above)

`worldEnergy.ts` reads the existing smoothed world intensity. Its squared response
keeps 15 WPM quiet while 60 WPM receives roughly 89% of the light response; 90 WPM
reaches 100% using the unchanged central speed mapping. There are no WPM gates.
An exponentially smoothed strength, slower coherence value and short acceleration
catch share one preallocated vector. Coasting decays naturally. A shared bounded
phase connects light passages, mineral reflections and atmospheric drift without
introducing a gameplay flow state.

Existing surface shaders reveal traveling reflections, gentle mineral depth and
a narrow refracted highlight along a shelf beside the lane. Warm/cool pools and
surface normals locate the response in the existing formations. The near banks
and passing fragment share this optical response. Pip's material, lights, camera,
geometry, animation and physics are unchanged. This is analytical surface shading,
not actual dynamic lights, bloom, refraction captures or global recoloring.

`EnvironmentEnergy` adds one immutable 848-triangle batch: six world-space paths,
32 fine atmospheric motes distributed over 72 units at different depths, and
eight quads addressing the existing contact slots. Path endpoints follow the
terrain; two lifted passages cross the space behind the running lane. Finite
traveling envelopes lengthen with energy, and analytic pixel coverage keeps
their thin cores continuous. Depth testing preserves Pip's opaque silhouette.
World-edge, depth and screen-edge fades keep the upper interface clear.

Contact light reads the real landing pool directly, never a separate footstep
timer. Each patch follows the contacted terrain and lasts 0.16–0.70 seconds
depending on energy, always within the physical impulse lifetime. Stumble slots
do not emit light. Instead, one accepted stumble interrupts optical continuity
locally around Pip and recovers exponentially. Repeated rejected stumble events
cannot retrigger it. Reduced motion suppresses the optical layer and acknowledges
event sequences; reset clears it. At zero energy the original surface colors
are recovered exactly, and the extra draw is skipped after its fade is imperceptible.

The active total is at most 23 environment draws and 99,416 triangles. The extra
batch shares all uniform objects with the landscape, uses normal alpha blending,
has no textures/render targets and allocates no objects during frame updates.
Its buffers and shader material are explicitly disposed on unmount. No particle
counts grow with speed or session length.

Run `node scripts/check-environment.mjs` for geometry bounds, contact clearance,
periodic continuity, rooted structures, frame-rate independent travel, parallax,
reduced motion, finish/reset and shared lighting attachment through world wraps.
It also checks deterministic detail placement, instance budgets, full-corridor
clearance and rooted detail attachment through wrapping, calibrated 15/30/45/60/90 WPM
acceleration/coasting envelopes, independence from stumble, ambient idle, and
ten-minute foreground recycling with offscreen geometry margins.
`node scripts/check-pip-motion.mjs` separately
checks the character and interaction system against the actual GLB: grounded
landings at 30/60/120 Hz, exactly-once contact/stumble impulses, reused pool
storage, travel attachment, reset and reduced-motion suppression. Browser previews
are used to review desktop/mobile composition and real WebGL shader compilation.
The environment check also exercises energy progression, finite coasting memory,
acceleration, local-error timing, reduced motion, reset, frame-rate independence
and the fixed optical geometry budget. Browser review covers simulator presets
0/15/30/45/60/90, a sustained 60 WPM hold, 90→0, 15→60 and real errors.
