# Pip production GLB validation

**PASS** — `public/models/pip.glb`

12,672 triangles; 6,346 exported vertices; 4 bones; 5 meshes; 2 materials; 544.74 KiB (557,812 bytes).

| Clip | Seconds | Result |
| --- | ---: | --- |
| Idle | 3.200 | Seamless matching endpoints |
| Run | 0.800 | Seamless matching endpoints |
| Stumble | 1.200 | Returns to approved rest pose |

`Squash` and `Stretch` survive as body-only morph targets. All clips leave their weights untouched for independent runtime control. Eyes and feet have no morph targets.

The exported rest positions match the evaluated approved static source within 0.00000000 units. The GLB contains no cameras, lights, image textures or environment meshes.

Run was evaluated from exported keyframes at 0.6×, 1× and 2×, with neutral, full Squash, full Stretch, half/half, and simultaneous full morph influences. Skinning and bounds remain finite. Material definitions retain opaque, nonmetallic ivory and black.

## Checks

- GLB headers, buffer bounds, finite accessor values and declared extrema.
- Triangle indices, normals, nondegenerate base geometry.
- Joint indices, normalized skin weights, invertible inverse-bind matrices.
- Exported rest geometry equals approved evaluated static geometry.
- Exactly Idle/Run/Stumble; separate clips and normalized quaternions.
- Idle and Run matching world-matrix and skinned-vertex loop endpoints.
- Stumble recovery returns to approved rest geometry.
- Run sampled at 0.6x, 1x and 2x with five independent morph combinations.
- Runtime body-only Squash/Stretch survives export without animated weights.
- Two texture-free opaque nonmetallic materials and no environment objects.

## Limits and runtime notes

- CPU playback validation is not a browser/GPU integration test; the application was not modified.
- Loop endpoints are numerically verified; finite-difference seam velocity is reported, not a proof of continuous derivatives.
- Ground bounds are sampled, not a continuous collision/intersection solver; no floor is exported.
- Morph values were tested on [0,1], including simultaneous full influences; values outside this range are not supported.
- glTF coordinates are Y-up, +Z forward. Scale is approximately 1.954 units high.
- Loop Idle and Run. Play Stumble once, then transition to Idle/Run. Keep root translation in the application; the run is in place.
- Change Run playback speed independently of body morph weights. The same neutral-speed clip supports the full intended speed range.

See `glb-validation.json` for per-clip endpoint errors, ground bounds, morph dimensions and sampler results.
