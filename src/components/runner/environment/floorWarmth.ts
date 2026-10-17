/** GLSL literal for a fixed-size tuple, e.g. vec3(1.000, 0.920, 0.800). */
const glslVec = (values: readonly number[]) => `vec${values.length}(${values.map(n => n.toFixed(3)).join(", ")})`;

/** How far the floor warms with the sustained pace (uEnergy.y). The grade and the
 * wake multiply the lit color, so reflections warm too; tinting only an albedo was
 * lost under the satin clear coat. Both are identity at zero energy. */
export const FLOOR_WARMTH = {
  grade: [1.07, 0.92, 0.8], // whole floor at a held sprint
  wake: [1.18, 0.8, 0.58], // trailing Pip, gated by sustained²
  wakeStrength: 0.7,
  wakeCenter: [-2.6, -0.3], wakeRadii: [4.2, 2.0], // world xz; Pip runs toward +x
} as const;

/** Shared by every floor finish. Requires `energyField` (uEnergy) declared first. */
export const floorWarmthField = /* glsl */ `
  vec3 floorWarmth(vec3 color, vec3 world) {
    float held = uEnergy.y;
    if (held <= 0.0) return color;
    color *= mix(vec3(1.0), ${glslVec(FLOOR_WARMTH.grade)}, held);
    vec2 wake = (world.xz - ${glslVec(FLOOR_WARMTH.wakeCenter)}) / ${glslVec(FLOOR_WARMTH.wakeRadii)};
    float trail = exp(-dot(wake, wake)) * held * held * ${FLOOR_WARMTH.wakeStrength.toFixed(3)};
    return mix(color, color * ${glslVec(FLOOR_WARMTH.wake)}, trail);
  }
`;
