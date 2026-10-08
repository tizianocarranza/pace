# Landscape and material family

## Phase 2 material pilot (current)

Study B is user-approved and locked. Only ContinuousTerrain, WesternFold and
SuspendedStone receive the physical materials in `pilotMaterials.ts`. The rest
retain their previous finishes. `StudioEnvironment.tsx` generates a shared linear
HDR studio texture and PMREM; white remains the visible background. Pip keeps
its existing opaque material and all motion systems remain unchanged.

Development controls compare Current, Shared light and Pilot without remounting
the world. Shared light retains the old finishes with the new illumination and
tone mapping. The optical pilot uses native transmission, not alpha blending;
the terrain remains opaque. No post-processing is active. Full comparisons,
cost measurements, limitations and criterion grades are in
`assets/reviews/phase2-materials/README.md` and its adjacent review board.

Review artifacts are local and ignored by Git. Run `node scripts/review-materials.mjs`
with the development server on port 3000 to regenerate matched captures and
`report.json`, then run `node scripts/check-material-review.mjs`. The captured
pilot uses one shared half-resolution transmission target; idle measured 40 draws
and 190,032 submitted triangles versus 25 / 104,136 for Current. These are software
renderer counts, not hardware FPS. The pilot remains promising but unapproved:
the sheet still reads partly as satin, mineral internal depth needs refinement,
and native transmission cannot resolve nested sheets/legacy alpha surfaces fully.

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

## Visual energy

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
