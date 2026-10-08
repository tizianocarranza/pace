import { terrainField } from "./terrainProfile";
import { IMPULSE_CAPACITY } from "./worldInteractions";
import { energyField } from "./worldEnergy";

export const energyVertex = /* glsl */ `
  attribute vec3 energyOrigin;
  attribute vec4 energyStyle;
  uniform float uTravel;
  uniform vec4 uImpulses[${IMPULSE_CAPACITY}];
  uniform vec4 uImpulseParameters[${IMPULSE_CAPACITY}];
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vStyle;
  varying float vLife;
  ${terrainField}
  ${energyField}
  void main() {
    float kind = energyStyle.x;
    float seed = energyStyle.y;
    float t = position.x;
    vUv = vec2(t, position.y);
    vStyle = vec3(kind, seed, energyStyle.w);
    vLife = 1.0;
    vec3 p = energyOrigin;
    if (kind < 0.5) {
      float x = p.x + (t - 0.5) * energyStyle.z;
      p.z += sin(t * 3.14159265) * (0.3 + energyStyle.w * 0.7);
      p.y = terrainHeight(vec2(x, p.z)) + 0.09 + sin(t * 3.14159265) * energyStyle.w;
      // Wrap the path as a whole. Ends cannot split across the recycling seam.
      p.x = mod(p.x - uTravel + 36.0, 72.0) - 36.0 + (t - 0.5) * energyStyle.z;
      p.y += position.y * 0.065;
    } else if (kind < 1.5) {
      p.y += terrainHeight(p.xz);
      p.x = mod(p.x - uTravel + 36.0, 72.0) - 36.0;
      p.y += sin(uEnergyPhase + seed * 6.2831853) * 0.13;
      p.x -= uEnergy.z * 0.25;
      float size = energyStyle.z;
      // Camera-facing small quads at real depths; perspective supplies parallax.
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      p += right * (t * 2.0 - 1.0) * size + up * position.y * size;
      vLife = pow(0.5 + 0.5 * sin(uEnergyPhase + seed * 23.0), 3.0);
    } else {
      int slot = int(seed);
      vec4 event = uImpulses[slot];
      vec4 config = uImpulseParameters[slot];
      // Draw only real landings; stumble interrupts light rather than emitting it.
      float lifetime = mix(0.16, 0.70, uEnergy.x);
      float age = event.w / lifetime;
      vLife = event.z * (1.0 - step(0.5, config.z)) *
        smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.15, 1.0, age));
      p = vec3(event.x + (t * 2.0 - 1.0) * (0.22 + uEnergy.x * 0.35),
        config.w - 0.008, event.y + position.y * 0.19);
    }
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

export const energyFragment = /* glsl */ `
  uniform float uVisibility;
  uniform vec2 uResolution;
  uniform vec3 uWarmLight;
  uniform vec3 uCoolLight;
  uniform vec3 uViolet;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vStyle;
  varying float vLife;
  ${energyField}
  void main() {
    float strength = uEnergy.x;
    float alpha;
    vec3 tint = mix(uCoolLight, uWarmLight, 0.5 + 0.5 * sin(vStyle.y * 9.0));
    if (vStyle.x < 0.5) {
      // A finite light passage, with a longer tail as momentum becomes sustained.
      float clock = fract(uEnergyPhase / 6.2831853 + vStyle.y);
      float head = 1.35 - clock * 1.7;
      float tail = 0.11 + strength * 0.46 + uEnergy.y * 0.08;
      float d = vUv.x - head;
      float passage = exp(-pow(d / (d > 0.0 ? tail : 0.06), 2.0));
      float edge = exp(-vUv.y * vUv.y * 5.0);
      // Analytic pixel coverage keeps the very thin core continuous at distance.
      float footprint = max(fwidth(vUv.y), 0.01);
      float core = (1.0 - smoothstep(0.06, 0.06 + footprint, abs(vUv.y))) *
        min(1.0, 0.28 / footprint);
      float ends = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
      alpha = (edge * 0.32 + core * 0.65) * passage * ends * strength * (0.65 + uEnergy.y * 0.35 + uEnergy.z);
      tint = mix(tint * 0.76, vec3(1.0), core * 0.8);
    } else if (vStyle.x < 1.5) {
      vec2 q = vec2(vUv.x * 2.0 - 1.0, vUv.y);
      float shape = exp(-dot(q, q) * 5.0) * (1.0 - smoothstep(0.6, 1.0, length(q)));
      alpha = shape * vLife * strength * 0.65;
      tint = mix(tint, uViolet, 0.25) * 0.78;
    } else {
      vec2 q = vec2(vUv.x * 2.0 - 1.0, vUv.y);
      alpha = exp(-dot(q, q) * 5.0) * vLife * strength * strength * 0.52;
      tint = mix(uWarmLight, vec3(1.0), 0.62);
    }
    vec2 screen = gl_FragCoord.xy / uResolution;
    float frame = smoothstep(0.0, 0.13, screen.y) * (1.0 - smoothstep(0.70, 0.90, screen.y));
    frame *= smoothstep(0.0, 0.06, screen.x) * (1.0 - smoothstep(0.94, 1.0, screen.x));
    float distanceFade = 1.0 - smoothstep(5.0, 22.0, -vWorld.z);
    float edges = 1.0 - smoothstep(25.0, 33.0, abs(vWorld.x));
    alpha *= frame * distanceFade * edges * uVisibility * energyContinuity(vWorld);
    gl_FragColor = vec4(tint, alpha);
    #include <colorspace_fragment>
  }
`;
