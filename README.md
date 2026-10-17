# pace.

A minimalist typing game. You type a prompt; Pip, a small rigged character, runs through
a procedural 3D landscape whose speed and light follow your typing speed. When you finish,
Pip runs off screen and your results appear.

- **Modes**: short, medium or long prompts, in English or Spanish. Best, average and
  history compare only runs of the same mode, and are kept in your browser.
- **Results**: WPM, its curve over the run, accuracy, time, peak and consistency.
- **Share**: every result has its own link (`/r/72-98-en-short`) with a generated card.
- **Day and night**: click the sun or the moon in the sky.
- **Touch screens**: tap the prompt to open the keyboard.
- Respects `prefers-reduced-motion`.

## Stack

Next.js 16 (App Router), React 19, three.js with @react-three/fiber and drei, Tailwind 4,
TypeScript. No physics engine, no animation library for the world: motion is analytic and
shading is custom GLSL.

## Run it

Uses pnpm (`pnpm-lock.yaml`).

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build && pnpm start
pnpm lint
```

In development a "Pace Debug" panel (top right) simulates typing speeds, replays the
intro and switches experimental styles. It does not exist in production builds.

## Checks

Node checks run without a browser:

| Script | Covers |
|---|---|
| `node scripts/check-typing-stats.mjs` | WPM, accuracy and run summary formulas |
| `node scripts/check-run-history.mjs` | saved runs, best/average/history per mode |
| `node scripts/check-prompts.mjs` | prompt lengths, characters, picking without repeats |
| `node scripts/check-share-result.mjs` | share links |
| `node scripts/check-visual-speed.mjs` | the WPM → visual intensity curve |
| `node scripts/check-pip-motion.mjs` | Pip's motion against the real GLB |
| `node scripts/check-environment.mjs` | terrain, world motion and render budgets |

With `pnpm dev` running and Chrome installed, `scripts/review-composition.mjs` captures
clock-stepped screenshots (`--mobile`, `--night`, `--quick`, `--wpm=N`, `--mode=es:long`)
and `scripts/review-perf.mjs` measures frame times. Output goes to `assets/reviews/`,
which is Git-ignored.

## Deploy

Deployed on Vercel with the default Next.js settings. Share cards build absolute URLs
from `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel sets; elsewhere they fall back to
`http://localhost:3000`.

## Where things live

- `src/app/page.tsx`: the game shell and keyboard input.
- `src/hooks/useTypingEngine.ts` and `src/lib/typingStats.ts`: all statistics.
- `src/data/prompts.ts`, `src/lib/runMode.ts`: prompts and modes.
- `src/components/results/`, `src/lib/runHistory.ts`: results and saved runs.
- `src/app/r/[result]/`, `src/app/_og/`: share page and cards.
- `src/components/runner/`: the 3D scene and Pip; the world is described in
  `src/components/runner/environment/README.md`.
