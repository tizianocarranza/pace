# Landscape and material family

## Current world

The world is reduced to its essentials: the terrain, Pip (with his shadow and
reflection) and the light trails. Everything else that used to be authored here
was deleted in the unused-layer clean up (see "History" below).

- **Draw budget.** About 16 draws and 92k triangles at idle, 18 draws while
  running with ribbons (desktop, Study B). The terrain is 53,760 triangles.
- **Frame loop.** R3F renders automatically. Pip's controller runs at `-1`,
  `ReactiveEnvironment` at `-0.5` (`LandscapeMotion`, `WorldInteractions`,
  `WorldEnergy` and the shared uniforms), shadows and uploads at `0`.
- **Floor.** The analytic terrain (`landscapeShaders.ts`,
  `landscapeMaterials.ts`) is the only landscape material. It is drawn without
  tone mapping on purpose: lighter and better modelled than the tonemapped look.
  `TERRAIN_RELIEF` (0.32, `terrainProfile.ts`) scales the shared CPU/GPU height
  field so the dunes stay low swells; the walking corridor stays level at
  `GROUND_Y`. Foot landings and stumbles dent it through `contactPressure`
  (`worldInteractions.ts`).
- **Light pools.** Warm, cool, amber and transmitted bounce pools color the
  ground. Their anchors are constants in `worldLighting.ts` (they used to come
  from the deleted formations) and scroll with the terrain via
  `LandscapeMotion.wrapX`.
- **Distance air.** `distanceHaze` (`atmosphere.ts`) fades the ground toward a
  cool white; `surfacePresence` crops the frame around the sentence column.
- **Pip lighting.** `StudioEnvironment` builds a procedural linear studio PMREM
  (`environmentIntensity` 0.8) with `NeutralToneMapping`; ACES greyed the
  high-key field. `EnvironmentLighting` adds a low ambient, a periwinkle
  hemisphere bounce and key/warm/cool rims that share `WORLD_LIGHT`.
  `usePipReflection` adds a mirrored copy slid along the camera ray onto the
  floor, with no stencil or extra pass.
- **Light trails.** Wind ribbons (`trailShaders.ts`, `LightTrails.tsx`): seven
  wide, soft ribbons that follow the terrain, sway, twist like silk and lengthen
  with `uEnergy.x`; waves run on `uEnergyPhase`. Each recycles fully off frame.
  One draw, about 900 triangles, skipped at idle and under reduced motion.
- **Speed tiers.** The world makes typing speeds read differently without
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

    Ribbons widen slightly with the tier. `uEnergy.x` only gates idle and
    coasting, so the single slow ribbon stays readable.
  - **Ribbon clock.** Ribbons run on `WorldEnergy.trailDistance` (`uTrailTravel`),
    an unwrapped clock that adds `velocity × (1 + 0.7 × tier)` each frame. They
    drift with the floor when slow and overtake it in a sprint. The old
    `uTravel` clock wrapped at 72 and made every ribbon jump on each lap.
  - **Color temperature.** Sustained energy (`uEnergy.y`) warms the floor through
    `floorWarmth()` (`floorWarmth.ts`, tuning in `FLOOR_WARMTH`), before the
    distance air so far ground stays pale. It has two parts:
    - **Grade.** A warm grade that multiplies the floor color. It is identity
      at zero energy, so idle and reduced motion are unchanged.
    - **Wake.** A warm wake trailing Pip, centered at x ≈ −2.6 and gated by
      `uEnergy.y²`. It is also multiplied, never mixed toward white.
  - **Limits.** Both levers derive from `LandscapeMotion` through `WorldEnergy`,
    with no new draws or triangles. `check-environment` asserts the ribbon
    count per pace step, the tier progression, and the idle and reduced-motion
    resets.
- **Traveling catch.** `energySweep` adds a narrow moving reflection inside the
  pools and one shelf caustic at z ≈ −1.85; it vanishes exactly at zero energy.

Verify: `node scripts/check-environment.mjs`, then with `npm run dev` running,
`node scripts/review-composition.mjs --quick --wpm=90` and
`--quick --mobile --wpm=90`. For the speed tiers, capture the ladder
`--quick --wpm=15|30|45|60|90` and compare ribbon count and floor warmth.

## History

Earlier phases authored much more world, all of it now deleted:

- Phase 1 composition study (A/B/C cameras and a neutral gray mode). Study B was
  approved and is the only framing left (`composition.ts`).
- Phase 2 material pilot: a satin floor, an optical fold sheet and a mineral
  with screen-space refraction (`pilotMaterials.ts`, `LayeredOptics.tsx`).
- Phase 3 geometry and density: folds, glass arches and suspended stones
  (`FORMATIONS`), instanced crystals, petals, bubbles, glass rings and motes
  (`detailClusters.ts`, `EnvironmentDetails.tsx`), with depth-only twins for
  translucent surfaces.
- Phase 4 optical depth: defocused near banks and a foreground blur
  (`ForegroundSoftness.ts`).
- Phase 5 visual energy: six passing-light paths (`EnvironmentEnergy.tsx`,
  `energyGeometry.ts`, `energyShaders.ts`).
- Dev-only comparison studies (`?materials=`, `?atmosphere=`, `?energy=`,
  `?composition=`, `?gray=`) and their review scripts.

They were switched off when the world was reduced to its essentials, then
removed. To bring one back, start from the last commit that has it (`71a2284`).
