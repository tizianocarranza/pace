# Pip motion

`usePipMotion` owns one `PipMotion` controller and a shared, mutable signal ref.
The controller runs at frame priority `-1`; shadows and environmental motion
read its completed frame at priority `0`. React handles game inputs, never
per-frame motion updates.

The controller blends the unchanged Idle/Run clips continuously, then adds small
body-pivot lean and existing Squash/Stretch morph weights. A damped compression
spring responds to actual landings. Stumble temporarily interrupts momentum;
additional errors cannot restart a stumble that is already recovering.

`pipContacts` samples the two skinned sole vertices once per frame. Each foot
exposes position, height, a one-frame impact strength, and an increasing sequence
number. Hysteresis distinguishes landing from grazing. `PipShadow` retains its
contact shading; `SpeedLines` captures those same landing positions for pooled
ground accents. Air passages remain independent of Pip.

`lastCorrectAt` is a visual intent signal. It lets Pip coast before the existing
four-second WPM statistic expires; scoring and results calculations are unchanged.
The finish charge advances in stride cycles, accelerates across the scene, then
fires its callback once the character's bounding sphere leaves the camera.

Reduced motion suppresses procedural deformation, impact accents and air passes,
and reduces clip cadence and stumble amplitude. Materials, lighting, camera and
the GLB remain unchanged by this pass.

Run `node scripts/check-pip-motion.mjs` to check real-GLB landings at 30/60/120 Hz,
coasting, error recovery, full-silhouette exits, reset, and reduced motion.
