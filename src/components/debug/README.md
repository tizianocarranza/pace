# WPM simulator

Run `npm run dev`, open **Pace Debug** in the top-right corner, then check
**Simulate visual speed**. The slider covers 0–120 WPM in 0.5 WPM steps; presets
are 0, 15, 30, 45, 60 and 90. Uncheck it to return immediately to real input.
No query parameter or browser storage is required; reload starts disabled.

The panel and its lazy import are guarded by `NODE_ENV === "development"`.
The override is also ignored at the page's signal boundary in production.
Keyboard events inside the panel do not reach the typing handler.

`src/lib/visualSpeed.ts` resolves real/simulated WPM and applies the single
curve: `clamp(wpm / 65, 0, 1) ** 0.75`. At 15/30/45/60 WPM this produces
approximately 33/56/76/94% intensity; 65 WPM reaches full intensity and higher
speeds remain capped. Future visual systems should consume this resolved signal.

Simulation holds visual input active in the existing Pip controller. It does
not write keystrokes, refresh real input timestamps, advance text, create errors,
or change statistics. The main WPM counter continues displaying real WPM.
Simulated zero speed uses the regular deceleration; it does not reset world travel.
Real prompt completion takes priority, retains the normal finish/results flow,
and temporarily suspends the simulator. Real typing still works while it is enabled.

Run `node scripts/check-visual-speed.mjs`, `node scripts/check-pip-motion.mjs`
and `node scripts/check-environment.mjs` for mapping, controller and momentum checks.
