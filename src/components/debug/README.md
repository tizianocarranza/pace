# WPM simulator

Run `npm run dev`, open **Pace Debug** in the top-right corner, then check
**Simulate visual speed**. The slider covers 0–120 WPM in 0.5 WPM steps; presets
are 0, 15, 30, 45, 60 and 90. Uncheck it to return immediately to real input.
No query parameter or browser storage is required; reload starts disabled.

The panel and its lazy import are guarded by `NODE_ENV === "development"`.
The override is also ignored at the page's signal boundary in production.
Keyboard events inside the panel do not reach the typing handler.

`src/lib/visualSpeed.ts` resolves real/simulated WPM and applies the single
curve: `clamp(wpm / 90, 0, 1) ** 0.6`. At 15/30/45/60 WPM this produces
approximately 34/52/66/78% intensity; 90 WPM reaches full intensity and higher
speeds remain capped. Future visual systems should consume this resolved signal.

Simulation holds visual input active in the existing Pip controller. It does
not write keystrokes, refresh real input timestamps, advance text, create errors,
or change statistics. The main WPM counter continues displaying real WPM.
Simulated zero speed uses the regular deceleration; it does not reset world travel.
Real prompt completion takes priority, retains the normal finish/results flow,
and temporarily suspends the simulator. Real typing still works while it is enabled.

**Error highlight** switches how a mistake shows in the prompt (`errorStyle.ts`):
`current` (flash and sideways shake), `glow` (peach halo, vertical caret pulse), `blur`
(the letter loses focus and sharpens), `marks` (glow plus a dot under every missed
letter), `haze` (a peach glow behind the letter), `word` (a wash over the
whole word), `caret` (only the caret glows) or `dip` (the letter sinks a hair). Production always uses `APPROVED_ERROR_STYLE` (currently `caret`), and a reload starts from it.

**Typed color** switches the color of correctly typed letters (`typedColor.ts`): `ink`
(the original near-black), `indigo`, `violet`, `cobalt` or `gradient` (violet to
cobalt along the prompt). Production always uses `APPROVED_TYPED_COLOR` (currently
`gradient`).

**Replay intro** (only before the first key) runs the intro again: the world fades in
from white and Pip runs in from the left. Production always passes `introReplay={0}`.

Run `node scripts/check-visual-speed.mjs`, `node scripts/check-pip-motion.mjs`
and `node scripts/check-environment.mjs` for mapping, controller and momentum checks.

## Orb debugger

Inside **Pace Debug**, open **Orb** to tune the WPM orb live
(`src/components/typing/orbTuning.ts`). **Fixed preview level** pins the fill
(0–100%) instead of following the game; **Replay rise** empties the orb at once
and lets it rise to the current target, to judge the motion. Sliders cover the
rise springs (level, front/back puffs, tilt, billow), the cloud filter (edge
distortion, noise scale and morph, softness, density) and the look (opacity,
sphere edge, drift and breathing periods, three colors).
**Fixed warmth** pins the orb's warm tint (normally the floor's warmth).
**Copy changed values** copies only what differs from `ORB_DEFAULTS` as JSON,
to paste back as new defaults. **Reset all** restores them. Nothing is stored;
reload starts from the defaults. Production always uses `ORB_DEFAULTS`.
