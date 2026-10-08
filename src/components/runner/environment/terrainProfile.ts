import { MathUtils } from "three";
import { PIP_FLOOR_Y } from "../pipContacts";

export const WORLD_PERIOD = 72;
export const GROUND_Y = PIP_FLOOR_Y - 0.018;

// Center, width, base/amplitude, lateral drift/frequency, height frequency/phase.
// Broad masses carry a few narrow shoulders and incised channels. No random noise.
const BANDS = [
  [-4.8, 1.35, 0.85, 1.35, 0.8, 5, 3, -0.9],
  [-2.85, 0.47, 0.18, 0.45, 0.48, 5, 4, 0.65],
  [-3.65, 0.42, -0.12, -0.2, 0.6, 5, 4, 0.2],
  [-6.7, 0.8, 0.2, 0.72, 1.0, 3, 5, 1.8],
  [-11.5, 3.2, 1.1, 1.9, 1.5, 3, 4, 2.37],
  [-23, 5.8, 2.6, 2.5, 1.8, 2, 3, 1.8],
] as const;

/** Shared art-directed field; periodic travel and a perfectly level foot corridor. */
export function terrainHeight(x: number, z: number) {
  const phase = x * Math.PI * 2 / WORLD_PERIOD;
  let height = 0;
  for (const [center, width, base, amplitude, drift, frequency, heightFrequency, offset] of BANDS) {
    const bend = center + drift * Math.sin(phase * frequency + offset);
    const breadth = width * (1 + 0.2 * Math.sin(phase * 3 + offset));
    const p = (z - bend) / breadth;
    height += (base + amplitude * (0.5 + 0.5 * Math.sin(phase * heightFrequency + offset))) * Math.exp(-p * p);
  }
  const nearP = (z - 2.5 - 0.25 * Math.sin(phase * 6)) / 0.75;
  const near = (0.2 + 0.3 * (0.5 + 0.5 * Math.cos(phase * 5))) * Math.exp(-nearP * nearP);
  return GROUND_Y + (1 - MathUtils.smoothstep(z, -2.5, -1.15)) * height
    + near * MathUtils.smoothstep(z, 0.8, 1.6);
}

const glsl = (value: number) => value.toFixed(6);
// Generate the GPU field from the very same bands used to root the CPU formations.
export const terrainField = /* glsl */ `
  float terrainBand(float phase, float z, float center, float width, float base,
    float amplitude, float drift, float frequency, float heightFrequency, float offset) {
    float bend = center + drift * sin(phase * frequency + offset);
    float breadth = width * (1.0 + 0.2 * sin(phase * 3.0 + offset));
    float p = (z - bend) / breadth;
    return (base + amplitude * (0.5 + 0.5 * sin(phase * heightFrequency + offset))) * exp(-p * p);
  }
  float terrainHeight(vec2 p) {
    float phase = p.x * 6.28318530718 / ${glsl(WORLD_PERIOD)};
    float height = ${BANDS.map(band => `terrainBand(phase, p.y, ${band.map(glsl).join(", ")})`).join("\n      + ")};
    float nearP = (p.y - 2.5 - 0.25 * sin(phase * 6.0)) / 0.75;
    float near = (0.2 + 0.3 * (0.5 + 0.5 * cos(phase * 5.0))) * exp(-nearP * nearP);
    return ${glsl(GROUND_Y)} + (1.0 - smoothstep(-2.5, -1.15, p.y)) * height
      + near * smoothstep(0.8, 1.6, p.y);
  }
`;
