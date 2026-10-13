---
name: pace-visual-review
description: How to verify a change in Pace — which check scripts to run per area, how to capture headless visual reviews, the dev-only comparison query params, and how to add a new Off/On study toggle. Use after changing Pip, the environment, visual speed, or before writing a phase note.
---

# Verifying changes in Pace

There are two kinds of verification: fast Node checks (no browser, run always) and headless
visual reviews (need the dev server and Chrome). Run commands from the repo root.

## 1. Node checks — pick by what you touched

| You changed | Run |
|---|---|
| `src/lib/visualSpeed.ts`, simulator | `node scripts/check-visual-speed.mjs` |
| Pip motion, contacts, stumble, finish, `usePip*` | `node scripts/check-pip-motion.mjs` |
| Terrain, formations, details, world motion/energy, budgets, composition | `node scripts/check-environment.mjs` |
| Formation geometry (folds, arches) | `node scripts/check-landscape-topology.mjs` (also runs check-environment) |

When unsure, run all four. Also run `npm run lint`. A check that fails is a real regression
unless the change intentionally moved that target; then update the assertion *and* say why
in the README.

`check-environment` transpiles a fixed list of `.ts` files. A new module it should cover must
be added to that list.

## 2. Headless visual review

Requirements: `npm run dev` on port 3000, Chrome at
`C:/Program Files/Google/Chrome/Application/chrome.exe` (scripts use SwiftShader, so numbers
are structural — draws, triangles, allocations — not real FPS).

- `PACE_REVIEW_DIR` — output folder (default per script). Use a new folder per comparison,
  under `assets/reviews/` (Git-ignored).
- `PACE_REVIEW_PORT` — Chrome debugging port for `review-materials` (default 9226).
- `PACE_STUDIES=b` — limit composition reviews to the approved study.

`node scripts/review-materials.mjs [flags]`
- `--energy` (with `--wpm=60` or `--wpm=90`), `--atmosphere`, `--geometry`, `--quick`, `--ablate`
- Example: `PACE_REVIEW_DIR=assets/reviews/<topic>/60 node scripts/review-materials.mjs --energy --wpm=60`

`node scripts/review-composition.mjs [flags]`
- `--mobile` (390×844), `--quick` (idle/2s/3s/neutral), `--energy`, `--atmosphere`,
  `--wpm=N`, `--overlap`
- Mobile sprint: `PACE_STUDIES=b node scripts/review-composition.mjs --mobile --energy --wpm=90`

Comparison checks (need a matching review dir and, for some, a frozen `baseline/`):
`check-energy-review.mjs` (uses `sharp`), `check-atmosphere-review.mjs`,
`check-geometry-review.mjs`, `check-material-review.mjs`
(`--baseline=<dir>`, `--nested-fold-budget`, `--same-submissions`).

Both review scripts exit non-zero if the page logs errors or WebGL warnings
(`GL_INVALID`, feedback loops). Treat any of those as a failure.

After capturing, actually look at the PNGs (open them) — at least idle, steady 60, and 90.

## 3. Dev comparison query params (development only)

| Param | Values | Default |
|---|---|---|
| `composition` (with `compositionReview=1`) | `a`, `b`, `c` | `b` |
| `materials` | see `MaterialStudy.tsx` (`current`, …, `pilot`) | production mode |
| `atmosphere` | `off`, `haze`, `on` | `on` |
| `energy` | `off`, `surfaces`, `on` | `on` |
| `gray` | `1` removes world color | off |

Switching modes must not reset time, pose, contacts or travel. The WPM simulator lives in the
"Pace Debug" panel (top-right); use it instead of real typing for repeatable speeds.

`window.__paceReview` exposes `{ camera, scene, renderer, raycaster }` in development for the
capture harness only. Never read it from gameplay code.

## 4. Adding a new Off/On study toggle

Copy `EnergyStudy.tsx` (simplest) or `AtmosphereStudy.tsx` (with Context):

1. `type XMode = "off" | ... | "on"`; a unique window event name `pace-<name>-study`.
2. `snapshot()` returns the production mode when `NODE_ENV !== "development"`, otherwise reads
   the query param.
3. `useSyncExternalStore(subscribe, snapshot, () => productionMode)` — subscribe to the custom
   event and `popstate`.
4. Controls component returns `null` outside development, stops `keydown`/`keyup`
   propagation, writes the param with `history.replaceState` and dispatches the event.
5. Consume the mode by changing uniforms/visibility in the existing frame update — never by
   remounting the world.
6. Mount the controls in `Runner.tsx` next to the others; place them so panels don't overlap.
7. Make the legacy review scripts request the old mode explicitly so previous baselines stay
   comparable.

## 5. Writing it up

Update the current section of `src/components/runner/environment/README.md` (or
`runner/README.md` for Pip) with: what changed and why, what was deliberately left alone,
measured draws/triangles/targets, known limitations, and the exact commands to verify.
