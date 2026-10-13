import { BufferAttribute, BufferGeometry } from "three";
import { GROUND_Y } from "./terrainProfile";
import { energyField } from "./worldEnergy";

// Lane depth, height above the floor, length, seed. Most streaks run just behind
// Pip beside the lane; a few skim the floor in front, low enough to pass his feet.
export const LIGHT_TRAILS = [
  [-1.0, 0.06, 7.5, 0.11], [-1.25, 0.22, 5.5, 0.47], [-1.55, 0.1, 9.0, 0.83],
  [-1.9, 0.38, 6.0, 0.29], [-2.3, 0.16, 8.0, 0.65], [-2.8, 0.5, 5.0, 0.07],
  [-3.4, 0.24, 10.0, 0.91], [-4.1, 0.6, 7.0, 0.38], [-1.1, 0.42, 4.5, 0.56],
  [-2.05, 0.04, 11.0, 0.74], [1.0, 0.03, 6.5, 0.19], [1.3, 0.05, 8.5, 0.61],
  [-3.0, 0.08, 6.5, 0.44], [-1.7, 0.3, 5.0, 0.02],
] as const;

const SEGMENTS = 32;

/** One immutable ribbon batch; flow and glow happen in the shader. */
export function createTrailGeometry() {
  const positions: number[] = [], styles: number[] = [], indices: number[] = [];
  LIGHT_TRAILS.forEach(([z, height, length, seed]) => {
    const start = positions.length / 3;
    for (let i = 0; i <= SEGMENTS; i++) {
      for (const side of [-1, 1]) {
        positions.push(i / SEGMENTS, side, 0);
        styles.push(z, height, length, seed);
      }
      if (i < SEGMENTS) {
        const a = start + i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("trailStyle", new BufferAttribute(new Float32Array(styles), 4));
  geometry.setIndex(indices);
  return geometry;
}

export const trailVertex = /* glsl */ `
  attribute vec4 trailStyle;
  uniform float uTravel;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSeed;
  void main() {
    float t = position.x;
    vUv = vec2(t, position.y);
    vSeed = trailStyle.w;
    // Streaks outrun the floor (rate > 1) so they read as motion, not markings.
    float span = 44.0, rate = 1.7 + trailStyle.w * 0.8;
    float head = mod(trailStyle.w * span - uTravel * rate, span) - span * 0.5;
    vec3 p = vec3(head + t * trailStyle.z, ${GROUND_Y.toFixed(6)} + trailStyle.y, trailStyle.x);
    // A camera-facing ribbon; the halo needs far more width than the core.
    p.y += position.y * (0.16 + trailStyle.y * 0.12);
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

export const trailFragment = /* glsl */ `
  uniform float uVisibility;
  uniform vec2 uResolution;
  uniform vec3 uWarm;
  uniform vec3 uBlue;
  uniform vec3 uViolet;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSeed;
  ${energyField}
  void main() {
    float strength = uEnergy.x;
    // Bright leading head, long fading tail (the head is at t = 0: streaks flow backward).
    float along = smoothstep(0.0, 0.06, vUv.x) * pow(1.0 - vUv.x, 1.6);
    float across = vUv.y;
    float core = exp(-across * across * 110.0);
    float halo = exp(-across * across * 5.0);
    float glow = exp(-across * across * 22.0);
    // Deeper than the palette peach/cobalt: the glow must read on a pastel floor.
    vec3 tint = mix(uWarm * vec3(1.0, 0.78, 0.55), uBlue * 0.85, step(0.55, fract(vSeed * 7.31)));
    // White-hot core over a saturated glow: a selective bloom built into the streak.
    vec3 color = mix(tint, vec3(1.0), min(1.0, core * 0.9 + glow * 0.3));
    float alpha = min(1.0, core + glow * 0.8 + halo * 0.45) * along;
    vec2 screen = gl_FragCoord.xy / uResolution;
    float frame = smoothstep(0.12, 0.24, screen.y) * (1.0 - smoothstep(0.66, 0.76, screen.y));
    float edges = 1.0 - smoothstep(16.0, 22.0, abs(vWorld.x));
    alpha *= strength * frame * edges * uVisibility * energyContinuity(vWorld);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
