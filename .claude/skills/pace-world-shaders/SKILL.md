---
name: pace-world-shaders
description: Rules and gotchas for adding or changing Pace's world rendering — landscape/detail/trail shaders, materials, uniforms, terrain field, lighting, color, transparency and render budgets. Use for any work in src/components/runner/environment/ or on Pip's materials.
---

# Pace world shaders and materials

The world is custom `ShaderMaterial`s driven by shared uniforms. No textures beyond the
procedural studio PMREM, no post-processing composer. Most effects are analytic shading.

## Before you write anything

1. Read the top "Target art direction pass" section of
   `src/components/runner/environment/README.md`. Older phases are history.
2. Find the closest existing example and copy its shape:
   - New single-draw effect batch → `LightTrails.tsx` + `trailShaders.ts`
   - New instanced detail → `detailClusters.ts` + `EnvironmentDetails.tsx`
   - New surface finish → `MATERIAL_KIND` in `landscapeMaterials.ts` / `landscapeShaders.ts`
   - Offscreen pass / render target → `LayeredOptics.tsx`, `ForegroundSoftness.ts`

## Uniforms: share, don't duplicate

- All landscape surfaces share one `uniforms` object from `createLandscapeMaterials()`.
  New materials reuse it (`uniforms: surfaces.terrain.uniforms`) instead of copying values.
- Uniforms are written once per frame in `ReactiveEnvironment`'s `useFrame` (priority -0.5).
  Add new live values there, not in a second `useFrame`.
- Available signals:
  - `uTravel` (wrapped distance, 0–72), `uVisibility` (finish fade), `uPhase` (ambient)
  - `uMomentum` = (intensity, lagged intensity)
  - `uEnergy` = (strength, sustained coherence, acceleration catch, stumble interruption),
    plus `uEnergyPhase`. Include `energyField` from `worldEnergy.ts` to get
    `energyContinuity()` and `energySweep()`.
  - `uImpulses` / `uImpulseParameters` — the landing/stumble impulse pool.
  - `uAtmosphere`, `uCompositionGray`, `uResolution`, palette colors
    (`uPearl`, `uBlue`, `uViolet`, `uDeep`, `uWarm`).
- `uResolution` must match the *current* viewport (transmission capture uses a smaller one):
  set it in `material.onBeforeRender` via `renderer.getCurrentViewport()` like the existing
  materials do.
- Energy-driven batches set `mesh.visible = false` when `uEnergy.x` is ~0 so idle skips the draw.

## Terrain field

- `terrainProfile.ts` defines the field once and generates GLSL (`terrainField`) from the
  same `BANDS`. Never hand-edit a GLSL copy of the terrain; change the bands/constants.
- CPU (`terrainHeight`) and GPU must agree: rooted geometry is placed on the CPU and
  displaced on the GPU. `check-environment` asserts roots to 1e-10.
- The world period is `WORLD_PERIOD = 72`. Anything that travels must wrap seamlessly at it.
- The walking corridor is perfectly level at `GROUND_Y`; nothing enters the physical lane.
- Rooted objects share physical velocity. Do not multiply them by a depth factor — they
  will slide off the terrain. Only near passes use `FOREGROUND_RATE` / `FRAGMENT_RATE`.

## Color and lighting gotchas (learned the hard way)

- Renderer uses `NeutralToneMapping` (ACES greyed the white field and desaturated accents).
- Do not mix toward white in linear space to "brighten" a tint — it reads pastel/grey on
  screen. Apply tints with little or no white; saturate deeper than the palette when an
  effect sits on the pale floor.
- `scene.environment` ignores `material.envMapIntensity`. To scale image-based light on a
  material, scale it inside that material's shader.
- Shaders that should be tone-mapped end with
  `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` and set
  `toneMapped` accordingly. Check what neighbors do before choosing.
- Distance haze comes from `atmosphere.ts` (`distanceHaze`), relative to Pip's focal plane.
  Reuse it instead of fading by screen height.
- Shared light directions/palette live in `worldLighting.ts`. Don't add scene lights for
  world surfaces; Pip has its own lights in `EnvironmentLighting.tsx`.

## Transparency and depth

- Translucent kinds (1 resin, 2 glass arch, 5 bubble): `transparent: true`,
  `depthWrite: false`, `forceSinglePass: true`. No back-face pass.
- Additive/glow batches never write depth but must depth-test, so Pip's opaque silhouette
  stays intact.
- Pip never enters blur buffers or optical captures. `ForegroundSoftness` only isolates
  `NearWesternBank`, `NearEasternBank`, `NearMineralFragment`; a new near object needs
  depth-aware handling, not just adding it to that list.

## Budgets (enforced by scripts/check-environment.mjs)

- Landscape: < 90,000 triangles.
- Details: ≤ 14 batches, < 110 instances, < 32,000 triangles.
- No per-frame allocation, no growth with speed or session length. Fixed pools only.
- New render targets: reuse, cap the long edge, dispose on unmount, restore renderer state
  in `finally`, skip the pass when its objects are off-frustum.

## Lifecycle

- `useMemo` creates geometry/material; a `useEffect` cleanup disposes them.
- JSX meshes using shared resources pass `dispose={null}`.
- `InstancedMesh.dispose()` does not dispose shared geometry/material; release instance
  buffers explicitly (see `EnvironmentDetails.tsx`).

## New module checklist

- If `check-environment.mjs` should exercise it, add the file to the transpile list at the
  top of that script (it compiles specific `.ts` files into `node_modules/.cache`).
- Respect reduced motion (freeze phases, acknowledge event sequences so nothing replays).
- Respect `status`: idle resets, finished fades with `uVisibility`, reset starts fresh.
- If a comparison is useful, add a dev-only Off/On toggle (see `pace-visual-review`).
- Run the checks listed in `pace-visual-review` and record new budgets/limitations in the
  README's current section.
