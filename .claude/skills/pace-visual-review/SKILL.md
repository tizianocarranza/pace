---
name: pace-visual-review
description: How to verify a change in Pace — which check scripts to run per area, how to capture headless visual reviews and compare them before/after. Use after changing Pip, the environment, visual speed, or before writing a README note.
---

# Verifying changes in Pace

There are two kinds of verification: fast Node checks (no browser, run always) and headless
visual reviews (need the dev server and Chrome). Run commands from the repo root.

## 1. Node checks — pick by what you touched

| You changed | Run |
|---|---|
| `src/lib/visualSpeed.ts`, simulator | `node scripts/check-visual-speed.mjs` |
| Pip motion, contacts, stumble, finish, `usePip*` | `node scripts/check-pip-motion.mjs` |
| Terrain, light pools, world motion/energy, light trails, budgets, composition | `node scripts/check-environment.mjs` |

When unsure, run all three. Also run `npm run lint`. A check that fails is a real regression
unless the change intentionally moved that target; then update the assertion *and* say why
in the README.

`check-environment` transpiles a fixed list of `.ts` files. A new module it should cover must
be added to that list.

## 2. Headless visual review

Requirements: `npm run dev` on port 3000, Chrome at
`C:/Program Files/Google/Chrome/Application/chrome.exe` (the script uses SwiftShader, so numbers
are structural — draws, triangles, allocations — not real FPS).

`node scripts/review-composition.mjs [flags]`
- `--mobile` (390×844), `--quick` (idle/2s/3s only, no traversal video), `--wpm=N`
  (simulated speed, default 60)
- `PACE_REVIEW_DIR` — output folder (default `assets/reviews/composition`). Use a new folder
  per comparison, under `assets/reviews/` (Git-ignored).
- Mobile sprint: `node scripts/review-composition.mjs --quick --mobile --wpm=90`

The script exits non-zero if the page logs errors or WebGL warnings (`GL_INVALID`, feedback
loops). Treat any of those as a failure.

After capturing, actually look at the PNGs (open them) — at least idle, steady 60, and 90.

## 3. Before/after comparisons

There are no in-app comparison toggles. To compare a change, capture the same flags into two
folders: one before editing (or with the change stashed) and one after. The captures are
clock-stepped, so `travel`, draws and triangles in each `*-quick.json` must match exactly
unless the change meant to move them; diff the PNGs with `sharp` (available through `next`).

The WPM simulator lives in the "Pace Debug" panel (top-right); use it instead of real typing
for repeatable speeds. `window.__paceReview` exposes `{ camera, scene, renderer, raycaster }`
in development for the capture harness only. Never read it from gameplay code.

## 4. Writing it up

Update the current section of `src/components/runner/environment/README.md` (or
`runner/README.md` for Pip) with: what changed and why, what was deliberately left alone,
measured draws/triangles/targets, known limitations, and the exact commands to verify.
