---
name: pace-world-shaders
description: Rules and gotchas for adding or changing Pace's world rendering — terrain/trail shaders, materials, uniforms, terrain field, lighting, color, transparency and render budgets. Use for any work in src/components/runner/environment/ or on Pip's materials.
---

# Pace world shaders and materials

The world is custom `ShaderMaterial`s driven by shared uniforms. No textures beyond the
procedural studio PMREM, no post-processing composer, no offscreen passes. Most effects are
analytic shading. Today the world is the terrain (`landscapeShaders.ts`) plus the light
trails (`trailShaders.ts`); everything else was removed (see the README's "History").

## Before you write anything

1. Read the "Current world" section of `src/components/runner/environment/README.md`.
2. Find the closest existing example and copy its shape:
   - New single-draw effect batch → `LightTrails.tsx` + `trailShaders.ts`
   - Ground shading → `landscapeShaders.ts` (one material, `surfaces.terrain`)
   - A removed system you want back (formations, instanced details, foreground blur, passing
     light, satin floor) → start from commit `71a2284`, don't rebuild from scratch.

## Uniforms: share, don't duplicate

- All world surfaces share one `uniforms` object from `createLandscapeMaterials()`.
  New materials reuse it (`uniforms: surfaces.terrain.uniforms`) instead of copying values.
- Uniforms are written once per frame in `ReactiveEnvironment`'s `useFrame` (priority -0.5).
  Add new live values there, not in a second `useFrame`.
- Available signals:
  - `uTravel` (wrapped distance, 0–72), `uVisibility` (finish fade)
  - `uEnergy` = (strength, sustained coherence, acceleration catch, stumble interruption),
    plus `uEnergyPhase`, `uEnergyTier` and `uTrailTravel`. Include `energyField` from
    `worldEnergy.ts` to get `energyContinuity()` and `energySweep()`.
  - `uImpulses` / `uImpulseParameters` — the landing/stumble impulse pool
    (`contactPressure()` in `interactionField`).
  - Light directions/colors and the four bounce pools from `worldLighting.ts`.
  - `uResolution` (drawing-buffer pixels, set in `ReactiveEnvironment`), palette colors
    (`uPearl`, `uBlue`, `uViolet`, `uWarm`).
- Energy-driven batches set `mesh.visible = false` when `uEnergy.x` is ~0 so idle skips the draw.

## Terrain field

- `terrainProfile.ts` defines the field once and generates GLSL (`terrainField`) from the
  same `BANDS`. Never hand-edit a GLSL copy of the terrain; change the bands/constants.
- CPU (`terrainHeight`) and GPU must agree: anything placed on the CPU is displaced on the GPU.
- The world period is `WORLD_PERIOD = 72`. Anything that travels must wrap seamlessly at it;
  world-anchored x positions go through `LandscapeMotion.wrapX`.
- The walking corridor is perfectly level at `GROUND_Y`; nothing enters the physical lane.

## Color and lighting gotchas (learned the hard way)

- Renderer uses `NeutralToneMapping` (ACES greyed the white field and desaturated accents).
  The terrain is deliberately `toneMapped: false`; the trails are tone mapped.
- Do not mix toward white in linear space to "brighten" a tint — it reads pastel/grey on
  screen. Apply tints with little or no white; saturate deeper than the palette when an
  effect sits on the pale floor.
- `scene.environment` ignores `material.envMapIntensity`. To scale image-based light on a
  material, scale it inside that material's shader.
- Shaders end with `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` and
  set `toneMapped` accordingly. Check what neighbors do before choosing.
- Distance haze comes from `atmosphere.ts` (`distanceHaze`), relative to Pip's focal plane.
  Reuse it instead of fading by screen height.
- Shared light directions/palette live in `worldLighting.ts`. Don't add scene lights for
  world surfaces; Pip has its own lights in `EnvironmentLighting.tsx`.

## Transparency and depth

- Transparent batches: `transparent: true`, `depthWrite: false`, `forceSinglePass: true`,
  and a `RENDER_ORDER` slot from `landscapeMaterials.ts`. No back-face pass.
- Additive/glow batches never write depth but must depth-test, so Pip's opaque silhouette
  stays intact.

## Budgets (enforced by scripts/check-environment.mjs)

- Landscape: < 90,000 triangles.
- No per-frame allocation, no growth with speed or session length. Fixed pools only.
- A new render target or offscreen pass needs a strong reason: reuse, cap the long edge,
  dispose on unmount, restore renderer state in `finally`, and never take over R3F's
  automatic render with a positive `useFrame` priority by accident.

## Lifecycle

- `useMemo` creates geometry/material; a `useEffect` cleanup disposes them.
- JSX meshes using shared resources pass `dispose={null}`.

## New module checklist

- If `check-environment.mjs` should exercise it, add the file to the transpile list at the
  top of that script (it compiles specific `.ts` files into `node_modules/.cache`).
- Respect reduced motion (freeze phases, acknowledge event sequences so nothing replays).
- Respect `status`: idle resets, finished fades with `uVisibility`, reset starts fresh.
- Run the checks listed in `pace-visual-review` (with a before/after capture) and record new
  budgets/limitations in the README's current section.
