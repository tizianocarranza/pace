# Pip motion

Visual speed is resolved once in `src/lib/visualSpeed.ts`: real WPM or the
development simulator feeds one nonlinear 0–90 WPM intensity curve. See the
[WPM simulator](../debug/README.md) for controls and pipeline boundaries.
The typing engine owns only real statistics. Held visual input uses the same
controller, cadence, world momentum and finish behavior as normal gameplay.

`usePipMotion` owns one `PipMotion` controller and a shared, mutable signal ref.
The controller runs at frame priority `-1`; the environment consumes that frame
at `-0.5`, then shadows and GPU uploads run at `0`. React handles game inputs, never
per-frame motion updates.

The controller blends the unchanged Idle/Run clips continuously, then adds small
body-pivot lean and existing Squash/Stretch morph weights. A damped compression
spring responds to actual landings. Stumble temporarily interrupts momentum;
additional errors cannot restart a stumble that is already recovering. The dip
comes from the damped speed target (faster damping while stumbling), never a cut
in one frame, and the clip eases in over its first 20% at 1.15× speed. The Run
cadence is itself damped, so the clip never changes tempo in a single frame;
`check-pip-motion` asserts no per-frame jump in speed or tempo through a stumble.
The Stumble clip itself has continuous velocity and is sampled at 60 fps (see
`assets/pip/README.md`).

`pipContacts` samples the two skinned sole vertices once per frame. Each foot
exposes position, height, hysteretic grounded state, a one-frame impact strength,
and an increasing sequence number. Hysteresis distinguishes landing from grazing.
The world consumes each sequence once; `stumbleSequence` advances only when an
actual Stumble starts, so repeated errors during recovery do not repeat impacts.
`PipShadow` retains its
contact shading. The [landscape](environment/README.md) preserves a level corridor
under those contacts and surrounds it with continuous terrain and larger 3D formations.

The environment's `WorldInteractions` consumes these same contacts after world
momentum updates. Its fixed impulse pool drives local terrain compression and
delayed nearby mineral responses through shared uniforms. No extra sampler,
footstep timer or independent speed curve is involved. Pip's existing smoothed
acceleration adds a small transient lean; deceleration contributes a little
compression before recovery, using the original rig and morph targets.

Pip's face and follow-through live in the same controller. Eye shape is written
to `pipFace.ts` uniforms and applied in the eye shader (`usePipSurface`), which
scales each eye about its own center before skinning. Blinks come every 2–5 s
from a deterministic sequence (sometimes doubled), plus one on starting. Each
lasts 0.28 s, closing over the first 40% and opening more slowly. The
expression follows existing signals only: a concentrated squint at sprint, eyes
squeezed shut through a stumble, wide eyes at the finish. A softer bounce spring
sinks the body a beat after each landing and pops it up on starting and at the
finish (before the unchanged exit launch); a roll spring rocks it toward the
landing foot; a slow breath scales it at rest. These move only the Body bone, so
the feet, contacts and shadow are unchanged. Pip's floor reflection does not blink.

`lastCorrectAt` is a visual intent signal. It lets Pip coast before the existing
four-second WPM statistic expires; scoring and results calculations are unchanged.
The finish charge advances in stride cycles, accelerates across the scene, then
fires its callback once the character's bounding sphere leaves the camera.

Reduced motion suppresses procedural deformation and impact accents (including
blinks, expressions, bounce, roll and breath; the eyes ease back to their modeled
shape), stops environmental travel,
and reduces clip cadence and stumble amplitude. Materials, lighting and the GLB
remain unchanged. The current composition study uses a full-viewport camera and
an oblique view, with foreground overlap outside the physical lane. See the
[composition notes](environment/README.md) for the three study URLs and review artifacts.

Run `node scripts/check-pip-motion.mjs` to check real-GLB landings at 30/60/120 Hz, blinks and expressions,
coasting, error recovery, full-silhouette exits, reset, and reduced motion.
