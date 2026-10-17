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
- **Orb warmth.** `ReactiveEnvironment` publishes `energy.value.y` (the same
  sustained energy `floorWarmth()` reads) through `worldTone.ts` every frame. The
  WPM orb (`src/components/typing/WpmCounter.tsx`) mixes its colors toward
  `FLOOR_WARMTH.grade` by that value, so the orb and the floor warm and cool
  together. Publishing only wakes the orb when the value changes; no allocation.
- **Big bang (intro).** Each arrival (`PipMotion.arrivalSequence`, consumed once by
  `WorldGenesis` in `worldGenesis.ts`) plays the world's birth. A point of light grows
  where Pip will stand for 0.45 s (`GENESIS_BANG`), then flares and is spent. `GenesisCore`
  (`genesisShaders.ts`) draws it as one point with normal blending (light on a white page
  has to be color), only while the intro plays. The ground is revealed by a circle growing from Pip's spot,
  `r = 70·(1 − e^(−t/0.9))`, through `genesisReveal()` in `surfacePresence`. Its front
  (`genesisFront()`) is lit like the core (lavender haze, pale peach band, near-white crest);
  it swells the terrain by up to 0.35 and
  fades over ~1.2 s. Everything is a function of elapsed time, so it plays the same at any
  frame rate; after 2 s it rests at a complete world (`uGenesis` = (1e4, 0, −1, 0)).
  At the finish, once Pip has run off the frame, it plays in reverse
  (`WorldGenesis.collapse`): the edge falls inward from the visible boundary (radius 42)
  to the core over 0.9 s, accelerating, with its front lit; the core gathers, flares and
  goes out over 0.6 s, and the page stays empty behind the results until the next arrival.
  The collapse does not touch the page's UI.
  Reduced motion skips the burst and the collapse; `LandscapeMotion` fades the world in
  and out from white instead. Cost: +1 draw (one point) during the intro only, no new triangles.
- **Big bang on the page.** `ReactiveEnvironment` projects the core to screen and
  publishes it through `genesisStage.ts` (the `worldTone` pattern), with a page radius on
  the ground's own curve (`WorldGenesis.progress`), reaching the farthest corner as the
  ground reaches its edges. `GenesisStage` (`runner/GenesisStage.tsx`) writes CSS
  variables and `<html data-genesis>` (`waiting` → `playing` → `done`), never React
  state: each `[data-genesis-reveal]` element (header, prompt/results, WPM counter) is
  uncovered by a radial mask as the wave crosses it; nothing is drawn in the sky. The UI starts hidden
  from SSR; if no arrival comes within 6 s it shows anyway. Reduced motion shows it at once.
- **Day and night.** The page theme (`src/lib/theme.ts`, `<html data-theme>`, toggled in
  the header) has a world counterpart: `NightMix` damps `sceneTheme.night` (0 → 1) toward it
  at frame slot −0.75, so switching crossfades in ~0.6 s (instantly under reduced motion).
  The world reads it the same frame: `uNight` and `uPage` (the page color the ground
  dissolves into, also `scene.background`) at −0.5; Pip's lights, emissive lift, reflection
  and contact shadow at 0. At night the ground keeps the same light model on a midnight
  palette (deep blue → cobalt by the key, now a cool moon, with a moonlit satin sheen); the
  peach pools stay the only warm light, the ribbons brighten, the core's halo grows and the
  big bang's front softens. The studio IBL drops to 0.26. No new draws or triangles.
- **Sun and moon (the theme toggle).** `SkyBodies` draws a sun by day and a crescent moon
  by night high on the right; `CelestialToggle` is an invisible button over them. One anchor
  in `celestial.ts` (CSS px from the top-right) places both. The bodies are screen-space quads
  (`celestialShaders.ts`), so they never depend on the camera framing; `depthTest` off,
  render order `sky`. Switching sets one body along an arc down and out while the other
  rises, on its own damped swap (~1.1 s, instant under reduced motion). Their halo grows with
  the floor's sustained warmth (`worldTone`) and with hover/focus (`celestialHover`). They
  are hidden until the first arrival and appear as the big bang's page wave reaches them;
  the finish collapse leaves them. Slot 0. Cost: +1 draw (2 triangles), only for the visible body.
- **Traveling catch.** `energySweep` adds a narrow moving reflection inside the
  pools and one shelf caustic at z ≈ −1.85; it vanishes exactly at zero energy.

To see the intro, use **Pace Debug → Replay intro**. `check-environment` asserts the
big bang's timing, reveal coverage, frame-rate independence, replay and reduced motion.

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
