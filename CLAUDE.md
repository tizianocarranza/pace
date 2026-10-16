@AGENTS.md

# Pace

A typing game. The player types a prompt; Pip (a rigged GLB character) runs through a
procedural 3D landscape whose speed and light respond to typing speed. Results show
after Pip runs off screen.

Stack: Next 16 (App Router, read AGENTS.md), React 19, @react-three/fiber 9,
@react-three/drei 10, three 0.186, Tailwind 4, TypeScript. No GSAP. No physics engine.

## Map

- `src/app/page.tsx` — game shell, HTML UI, keyboard input.
- `src/hooks/useTypingEngine.ts` — the only owner of real statistics (WPM, accuracy, errors);
  the formulas are pure functions in `src/lib/typingStats.ts`.
- `src/components/results/` — results screen (chart, stats); `src/lib/runHistory.ts` keeps
  past runs in `localStorage` for best/average/history.
- `src/lib/visualSpeed.ts` — the single WPM → visual intensity curve.
- `src/components/runner/` — Canvas, Pip, motion controller, contacts, shadow, reflection.
- `src/components/runner/environment/` — landscape, shaders, materials, world motion/energy.
- `src/components/debug/` — development-only WPM simulator.
- `scripts/` — Node checks (`check-*.mjs`) and headless visual reviews (`review-*.mjs`).

`src/components/runner/environment/README.md` describes the current world (terrain,
light pools, light trails, speed tiers). Its "History" section lists the removed layers
and the commit to restore them from.

## Invariants (do not break without being asked)

**Frame loop**
- Order is explicit by `useFrame` priority: Pip controller `-1` → environment `-0.5`
  → shadows and GPU uploads `0`. A new per-frame system picks its slot deliberately.
- Negative priorities keep R3F's automatic render. Never take over rendering by accident.
- React handles game input only. Per-frame values live in refs, mutable signal objects
  and shader uniforms — never `setState` from `useFrame`.
- No allocations inside `useFrame` (no `new Vector3()`, no array/object literals,
  no closures). Preallocate at module or instance scope and reuse.
- Clamp `delta` (existing code uses `clamp(delta, 0, 0.05)`) and keep updates
  frame-rate independent (exponential damping / analytic integration, not `x += k`).

**Speed and gameplay signals**
- Every visual consumer reads the resolved intensity from `visualSpeed.ts`
  (`clamp(wpm/90, 0, 1) ** 0.6`). Never add a second WPM curve or a WPM threshold.
- `LandscapeMotion` (`worldMotion.ts`) is the only source of travel/velocity;
  `WorldEnergy` is the only visual-energy memory. Derive from them.
- Foot contacts and stumbles are consumed by sequence number, exactly once.
- Visuals never change scoring or statistics.

**Resources**
- GPU resources created by hand (geometries, ShaderMaterials, render targets, textures)
  are disposed explicitly in effect cleanup. Shared resources use `dispose={null}` on
  the JSX element and are released by their owner.
- Effects that change renderer/scene state (tone mapping, environment, viewport,
  visibility) restore the previous values in cleanup or `finally`.

**Accessibility and dev tooling**
- Respect `prefers-reduced-motion`: suppress procedural deformation, impacts and travel;
  never snap the visible pose.
- Development-only UI, query params and globals are guarded by
  `process.env.NODE_ENV === "development"`; production always uses the approved mode.
- Dev panels stop keyboard propagation so they never type into the game.

## Working conventions

- Composition Study B (camera, framing, light-pool anchors) is approved and locked.
- Keep the walking corridor level (`GROUND_Y`, 0.018 below `PIP_FLOOR_Y`).
- Review artifacts (`assets/reviews/`) and the reference image (`target/`) are Git-ignored.
- After a change, run the relevant checks — see the `pace-visual-review` skill.
- For any shader/material/environment work, use the `pace-world-shaders` skill.
- Update the environment README's current section when a change alters behavior,
  budgets or how to verify it.
