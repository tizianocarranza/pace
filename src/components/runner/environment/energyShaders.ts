import { terrainField } from "./terrainProfile";
import { energyField } from "./worldEnergy";

export const energyVertex = /* glsl */ `
  attribute vec3 energyOrigin;
  attribute vec3 energyStyle;
  uniform float uTravel;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSeed;
  ${terrainField}
  void main() {
    float t = position.x;
    vUv = vec2(t, position.y);
    vSeed = energyStyle.x;
    vec3 p = energyOrigin;
    float x = p.x + (t - 0.5) * energyStyle.y;
    p.z += sin(t * 3.14159265) * (0.3 + energyStyle.z * 0.7);
    p.y = terrainHeight(vec2(x, p.z)) + 0.09 + sin(t * 3.14159265) * energyStyle.z;
    // Wrap the whole path with its authored terrain coordinates, never each end.
    p.x = mod(p.x - uTravel + 36.0, 72.0) - 36.0 + (t - 0.5) * energyStyle.y;
    p.y += position.y * 0.065;
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

export const energyFragment = /* glsl */ `
  uniform float uVisibility;
  uniform vec2 uResolution;
  uniform vec3 uWarmLight;
  uniform vec3 uCoolLight;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vSeed;
  ${energyField}
  void main() {
    float strength = uEnergy.x;
    vec3 tint = mix(uCoolLight, uWarmLight, 0.5 + 0.5 * sin(vSeed * 9.0));
    float clock = fract(uEnergyPhase / 6.2831853 + vSeed);
    float head = 1.35 - clock * 1.7;
    float tail = 0.11 + strength * 0.46 + uEnergy.y * 0.08;
    float d = vUv.x - head;
    float passage = exp(-pow(d / (d > 0.0 ? tail : 0.06), 2.0));
    // Both ends of the phase wrap vanish, including the long sprint tail.
    passage *= smoothstep(0.0, 0.1, clock) * (1.0 - smoothstep(0.8, 1.0, clock));
    float edge = exp(-vUv.y * vUv.y * 5.0);
    float footprint = max(fwidth(vUv.y), 0.01);
    float core = (1.0 - smoothstep(0.06, 0.06 + footprint, abs(vUv.y))) * min(1.0, 0.28 / footprint);
    float ends = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
    float alpha = (edge * 0.32 + core * 0.65) * passage * ends * strength * (0.65 + uEnergy.y * 0.35 + uEnergy.z);
    tint = mix(tint * 0.76, vec3(1.0), core * 0.8);
    vec2 screen = gl_FragCoord.xy / uResolution;
    float frame = smoothstep(0.0, 0.13, screen.y) * (1.0 - smoothstep(0.70, 0.90, screen.y));
    frame *= smoothstep(0.0, 0.06, screen.x) * (1.0 - smoothstep(0.94, 1.0, screen.x));
    float distanceFade = 1.0 - smoothstep(5.0, 22.0, -vWorld.z);
    float edges = 1.0 - smoothstep(25.0, 33.0, abs(vWorld.x));
    alpha *= frame * distanceFade * edges * uVisibility * energyContinuity(vWorld);
    gl_FragColor = vec4(tint, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
