import { BufferAttribute, BufferGeometry } from "three";
import { terrainField } from "./terrainProfile";
import { energyField } from "./worldEnergy";

// Lane depth, height above the terrain, full length, seed, width, entry. Wide wind
// ribbons drift behind Pip at several heights; one low ribbon passes his feet.
// Entry is the resolved intensity (via WorldEnergy.tier) at which a ribbon fades
// in, so the count reads as a speed meter: 1 at 15 WPM, 2 at 30, 3 at 45, ~5 at
// 60, ~6 at 75 and all 7 at 90. The low ribbon is the first; the highest the last.
export const LIGHT_TRAILS = [
  [1.1, 0.07, 9.0, 0.38, 0.12, 0.28], [-1.0, 0.22, 12.0, 0.11, 0.3, 0.45],
  [-2.1, 0.35, 13.0, 0.83, 0.4, 0.58], [-1.5, 0.55, 15.0, 0.47, 0.45, 0.68],
  [-3.4, 0.5, 14.0, 0.65, 0.45, 0.74], [-2.7, 0.8, 16.0, 0.29, 0.5, 0.86],
  [-1.25, 0.9, 10.0, 0.91, 0.3, 0.95],
] as const;
export const TRAIL_ENTRY_WIDTH = 0.07;

const SEGMENTS = 64;

/** One immutable ribbon batch; flow, sway and twist happen in the shader. */
export function createTrailGeometry() {
  const positions: number[] = [], styles: number[] = [], widths: number[] = [], indices: number[] = [];
  LIGHT_TRAILS.forEach(([z, height, length, seed, width, entry]) => {
    const start = positions.length / 3;
    for (let i = 0; i <= SEGMENTS; i++) {
      for (const side of [-1, 1]) {
        positions.push(i / SEGMENTS, side, 0);
        styles.push(z, height, length, seed);
        widths.push(width, entry);
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
  geometry.setAttribute("trailShape",new BufferAttribute(new Float32Array(widths), 2));
  geometry.setIndex(indices);
  return geometry;
}

export const trailVertex = /* glsl */ `
  attribute vec4 trailStyle;
  attribute vec2 trailShape; // width, entry
  uniform float uTravel;
  uniform float uTrailTravel;
  uniform float uEnergyTier;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSeed;
  varying float vTwist;
  varying float vPresence;
  ${terrainField}
  ${energyField}
  void main() {
    float t = position.x;
    float seed = trailStyle.w;
    float energy = uEnergy.x;
    // Ribbons join one by one as the sustained pace rises.
    vPresence = smoothstep(trailShape.y, trailShape.y + ${TRAIL_ENTRY_WIDTH.toFixed(2)}, uEnergyTier);
    // Tails lengthen as speed builds. The period leaves room for the longest
    // tail, so a ribbon always recycles entirely outside the frame. The clock is
    // unwrapped: wrapping at the terrain period would jump every ribbon.
    float span = 44.0 + trailStyle.z;
    float rate = 1.3 + seed * 0.5;
    float head = mod(seed * span - uTrailTravel * rate, span) - 22.0 - trailStyle.z;
    float s = t * trailStyle.z * mix(0.6, 1.0, energy);
    // Waves travel down the ribbon on the velocity clock (integer harmonics of
    // uEnergyPhase stay continuous across its wrap). Faster reads straighter.
    float calm = 1.0 - 0.35 * energy;
    float wave = uEnergyPhase * 2.0 + seed * 6.28318;
    float lift = (0.5 + 0.5 * sin(s * 0.55 - wave)) * (0.06 + trailStyle.y * 0.3) * calm;
    // Ribbons beside the lane sway in depth; the low front one stays clear of Pip.
    float sway = sin(s * 0.32 - wave + seed * 4.0) * 0.3 * clamp(abs(trailStyle.x) - 0.9, 0.0, 1.0) * calm;
    vec3 center = vec3(head + s, 0.0, trailStyle.x + sway);
    center.y = terrainHeight(vec2(center.x + uTravel, center.z)) + trailStyle.y + lift;
    // Silk twist: the width axis turns about the flow, alternating face and edge.
    float twist = sin(s * 0.4 - wave + seed * 3.0) * 1.1;
    vTwist = cos(twist);
    float taper = sqrt(sin(3.14159265 * t));
    // The sprint ribbons read a little broader, not only more numerous.
    float width = trailShape.x * (0.85 + 0.3 * uEnergyTier);
    vec3 p = center + vec3(0.0, cos(twist), sin(twist)) * position.y * width * 0.5 * (0.3 + 0.7 * taper);
    vUv = vec2(t, position.y);
    vSeed = seed;
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

export const trailFragment = /* glsl */ `
  uniform float uVisibility;
  uniform vec2 uResolution;
  uniform float uNight;
  uniform vec3 uWarm;
  uniform vec3 uBlue;
  uniform vec3 uViolet;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSeed;
  varying float vTwist;
  varying float vPresence;
  ${energyField}
  void main() {
    // Soft entry at the head (t = 0: ribbons flow backward), long fading tail.
    float along = smoothstep(0.0, 0.1, vUv.x) * pow(1.0 - vUv.x, 1.3);
    float across = vUv.y;
    float body = exp(-across * across * 2.2);
    // A thin brighter rim catches the light as the ribbon turns edge-on.
    float rimDistance = (abs(across) - 0.8) / 0.09;
    float rim = exp(-rimDistance * rimDistance) * (0.35 + 0.65 * (1.0 - abs(vTwist)));
    // Deeper than the palette peach/cobalt: the ribbons must read on a pastel floor.
    vec3 tint = mix(uWarm * vec3(1.0, 0.78, 0.55), uBlue * 0.8, step(0.55, fract(vSeed * 7.31)));
    // Toward the tail the color cools into the palette violet. Brightness is
    // added in the tint itself: mixing white in linear space reads pastel.
    vec3 color = mix(tint, uViolet * 0.85, smoothstep(0.3, 1.0, vUv.x) * 0.5);
    color += tint * rim * 0.8;
    color *= 0.9 + 0.3 * uEnergy.y;
    // On the midnight floor the ribbons are light on dark: brighter.
    color *= 1.0 + uNight * 0.85;
    float alpha = min(1.0, body * 0.68 + rim * 0.6) * along;
    vec2 screen = gl_FragCoord.xy / uResolution;
    float frame = smoothstep(0.12, 0.24, screen.y) * (1.0 - smoothstep(0.66, 0.76, screen.y));
    float edges = 1.0 - smoothstep(16.0, 22.0, abs(vWorld.x));
    // The ribbon count carries the speed; energy only gates idle/coasting, so the
    // single ribbon at a slow pace still reads instead of vanishing.
    float gate = smoothstep(0.0, 0.15, uEnergy.x) * mix(0.55, 1.0, uEnergy.x);
    alpha *= gate * vPresence * frame * edges * uVisibility * energyContinuity(vWorld);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
