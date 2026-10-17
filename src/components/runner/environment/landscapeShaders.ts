import { terrainField } from "./terrainProfile";
import { interactionField } from "./worldInteractions";
import { energyField } from "./worldEnergy";
import { atmosphereField } from "./atmosphere";
import { floorWarmthField } from "./floorWarmth";
import { genesisField } from "./worldGenesis";
import { Color } from "three";

/** A linear GLSL constant from an sRGB hex (three's color management converts it). */
const glsl = (hex: string) => {
  const { r, g, b } = new Color(hex);
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
};

export const landscapeVertex = /* glsl */ `
  uniform float uTravel;
  varying vec3 vWorld;
  varying vec3 vNormal;
  ${terrainField}
  ${interactionField}
  ${genesisField}
  void main() {
    vec3 p = position;
    vec2 at = p.xz + vec2(uTravel, 0.0);
    p.y = terrainHeight(at);
    vec3 pressure = contactPressure(p.xz);
    p.y += pressure.x;
    // The big bang's wave front swells the ground as it passes, then it settles.
    p.y += genesisFront(p) * 0.35;
    float dx = terrainHeight(at + vec2(0.04, 0.0)) - terrainHeight(at - vec2(0.04, 0.0));
    float dz = terrainHeight(at + vec2(0.0, 0.04)) - terrainHeight(at - vec2(0.0, 0.04));
    vec3 n = normalize(vec3(-dx - pressure.y * 0.08, 0.08, -dz - pressure.z * 0.08));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    // The terrain mesh is never rotated or scaled.
    vNormal = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const landscapeFragment = /* glsl */ `
  uniform vec3 uPearl;
  uniform vec3 uBlue;
  uniform vec3 uViolet;
  uniform vec3 uWarm;
  uniform vec3 uKeyDirection;
  uniform vec3 uWarmDirection;
  uniform vec3 uCoolDirection;
  uniform vec3 uWarmLight;
  uniform vec3 uCoolLight;
  uniform vec3 uWarmPool;
  uniform vec3 uCoolPool;
  uniform vec3 uAmberPool;
  uniform vec3 uTransmittedPool;
  uniform float uVisibility;
  uniform vec2 uResolution;
  uniform float uNight;
  uniform vec3 uPage;
  varying vec3 vWorld;
  varying vec3 vNormal;
  // Midnight palette: deep blue valleys, cobalt slopes, a cool moon.
  const vec3 NIGHT_DEEP = ${glsl("#111a3f")};
  const vec3 NIGHT_COBALT = ${glsl("#2b4bb8")};
  const vec3 NIGHT_MOON = ${glsl("#a9bbff")};
  ${energyField}
  ${floorWarmthField}
  ${atmosphereField}
  ${genesisField}

  // Broad reflection lobes use the shared world light directions. No scene capture.
  float studioCard(vec3 reflection, vec3 direction, float spread) {
    float alignment = max(dot(reflection, normalize(direction)), 0.0);
    return exp((alignment - 1.0) / spread);
  }
  // Presence at the world's boundaries and the composition frame.
  float surfacePresence() {
    float nearFade = smoothstep(6.0, 10.0, vWorld.z);
    float farFade = smoothstep(29.0, 37.0, -vWorld.z);
    float edge = smoothstep(28.0, 35.0, abs(vWorld.x));
    vec2 screen = gl_FragCoord.xy / uResolution;
    float frame = smoothstep(0.15, 0.26, screen.y) * (1.0 - smoothstep(0.67, 0.77, screen.y));
    // Crop at the viewport sides: a screen-edge fade made the world read as a
    // rectangular panel and erased the strongest near-plane depth cue.
    // Preserve the actual central sentence area, while letting cropped side
    // forms reach higher. This is a composition mask, not a character halo.
    float sentenceColumn = 1.0 - smoothstep(0.22, 0.38, abs(screen.x - 0.5));
    frame *= 1.0 - sentenceColumn * smoothstep(0.60, 0.66, screen.y);
    return (1.0 - nearFade) * (1.0 - farFade) * (1.0 - edge) * frame * uVisibility * genesisReveal(vWorld);
  }
  void main() {
    // Outside the frame, the fades and the genesis reveal the world is exactly the page:
    // skip the shading there (the result is identical, the masks are exact zeros).
    float presence = surfacePresence();
    if (presence <= 0.0) {
      gl_FragColor = vec4(uPage, 1.0);
      #include <colorspace_fragment>
      return;
    }
    vec3 view = normalize(cameraPosition - vWorld);
    // Terrain normals always point out of the height field. Flipping them near a
    // grazing ridge creates a dark seam where smooth and triangle normals differ.
    vec3 n = normalize(vNormal);
    float nv = max(dot(n, view), 0.0);
    float fresnel = pow(1.0 - nv, 3.0);
    vec3 reflection = reflect(-view, n);
    float light = dot(n, uKeyDirection) * 0.5 + 0.5;
    float warmFacing = 0.5 + 0.5 * dot(n, uWarmDirection);
    float coolFacing = 0.5 + 0.5 * dot(n, uCoolDirection);
    float warmBacklight = max(dot(-n, uWarmDirection), 0.0);
    // Low-frequency bounce: broad warm/cool light pools that travel with the ground.
    vec3 warmDistance = (vWorld - uWarmPool) / vec3(6.5, 4.0, 6.0);
    vec3 coolDistance = (vWorld - uCoolPool) / vec3(7.0, 4.5, 7.0);
    vec3 amberDistance = (vWorld - uAmberPool) / vec3(2.6, 2.8, 2.6);
    float warmPool = exp(-dot(warmDistance, warmDistance));
    float coolPool = exp(-dot(coolDistance, coolDistance));
    float amberPool = exp(-dot(amberDistance, amberDistance));
    vec3 transmittedDistance = (vWorld - uTransmittedPool) / vec3(4.6, 1.3, 2.4);
    float transmittedPool = exp(-dot(transmittedDistance, transmittedDistance));
    float warmEnergy = warmFacing * 0.34 + warmPool * 0.58 + amberPool * 0.26;
    float coolEnergy = coolFacing * 0.25 + coolPool * 0.42;
    float slope = 1.0 - smoothstep(0.15, 0.98, n.y);
    // Orientation drives the palette, rather than screen-space fills.
    float pearlShift = smoothstep(-0.65, 0.8, reflection.x + reflection.y * 0.35);
    float crest = smoothstep(-0.75, 2.5, vWorld.y);
    float ridgeCatch = pow(max(dot(n, normalize(uWarmDirection + vec3(0.0, 0.7, 0.0))), 0.0), 2.0);
    vec3 cardDelta = reflection - normalize(vec3(-0.25, 0.4, -0.9));
    float lobe = exp(-dot(cardDelta * vec3(1.25, 4.4, 1.8), cardDelta * vec3(1.25, 4.4, 1.8)));
    float pathLight = 0.2 + 0.8 * smoothstep(0.5, 1.5, abs(vWorld.z));
    float path = 1.0 - smoothstep(0.65, 3.3, abs(vWorld.z + 0.1));
    float haze = distanceHaze(vWorld);

    // Narrow traveling reflection. The quiet finish is recovered exactly at zero, so
    // at rest (uEnergy.x == 0) the sweep is not evaluated at all.
    vec3 caught = vec3(0.0);
    float energyMix = 0.0;
    if (uEnergy.x > 0.0) {
      float opticalEnergy = uEnergy.x * energyContinuity(vWorld);
      float traveling = energySweep(vWorld);
      caught = mix(uCoolLight, uWarmLight, warmPool * 0.75 + warmBacklight * 0.2);
      // Refracted light grazes one shelf beside the lane. It remains a surface
      // reflection, spatially confined to the warm/cool pools.
      float shelf = vWorld.z + 1.85 + sin(vWorld.x * 0.55 + uEnergyPhase) * 0.36;
      float caustic = exp(-shelf * shelf / 0.035) * (warmPool + coolPool) * 0.5;
      float catchLight = traveling * (0.48 + 0.52 * fresnel) * (0.2 + slope * 0.6) * (warmPool + coolPool) * 0.6
        + caustic * (0.3 + traveling * 0.7);
      energyMix = min(0.7, catchLight * opticalEnergy * (0.7 + uEnergy.y * 0.3 + uEnergy.z));
    }

    // Day palette, skipped once the night crossfade is complete.
    vec3 color = vec3(0.0);
    if (uNight < 1.0) {
      vec3 pearl = mix(uViolet, uBlue, pearlShift);
      vec3 mineral = mix(uBlue * 0.65, uViolet * 0.9, 1.0 - pearlShift);
      color = mix(mineral, uPearl, 0.12 + 0.58 * pow(light, 3.0));
      color = mix(color, pearl, (0.16 + 0.3 * slope) * (0.55 + 0.45 * fresnel));
      color = mix(color, uPearl, crest * 0.12);
      // Warm and cool pools fall across the same ridge/valley system.
      color = mix(color, uWarmLight, warmPool * (0.05 + ridgeCatch * 0.24));
      color = mix(color, mix(uViolet, uCoolLight, 0.5), coolPool * slope * 0.18);
      // An elongated soft reflection reads as a satin/pearl surface at grazing angles.
      color = mix(color, mix(uWarmLight, vec3(1.0), 0.68), lobe * (0.26 + fresnel * 0.38));
      color = mix(color, mix(uWarmLight, vec3(1.0), 0.66), transmittedPool * pathLight * (0.3 + ridgeCatch * 0.35));
      color += vec3(1.0, 0.94, 0.88) * transmittedPool * ridgeCatch * pathLight * 0.16;
      color = mix(color, uPearl, path * 0.48);

      // Shared colored irradiance. Shading lifts toward white rather than sinking into grey mid-tones.
      color *= vec3(0.80 + light * 0.22) + uWarmLight * warmEnergy * 0.10 + uCoolLight * coolEnergy * 0.10;
      float warmReflection = studioCard(reflection, uWarmDirection, 0.14);
      color = mix(color, uWarmLight, min(0.5, warmEnergy * 0.035 + warmReflection * 0.24));
      color = mix(color, uCoolLight, coolEnergy * (0.025 + fresnel * 0.12));

      color = mix(color, caught, energyMix);

      // Local diffusion is evaluated on surfaces, leaving the HTML text and empty sky crisp.
      float pathClarity = 1.0 - smoothstep(0.4, 1.5, abs(vWorld.z));
      float diffusion = (warmPool * 0.08 + amberPool * 0.14 + transmittedPool * 0.1) * (1.0 - pathClarity * 0.72);
      color = mix(color, mix(uWarmLight, vec3(1.0), 0.76), diffusion);
      // The floor warms with the sustained pace, before distance air.
      color = floorWarmth(color, vWorld);
      vec3 air = mix(uCoolLight, vec3(1.0), 0.88);
      color = mix(color, air, haze);
    }
    // Night: the same light model on the midnight palette. The key becomes a cool moon
    // that models the dunes from deep blue to cobalt and draws the satin sheen; the peach
    // pools stay the only warm light. Mixed by uNight, so a theme change crossfades.
    if (uNight > 0.0) {
      vec3 night = mix(NIGHT_DEEP, NIGHT_COBALT, 0.04 + 0.42 * pow(light, 2.6));
      night = mix(night, uViolet * 0.22, slope * 0.25 * (1.0 - pearlShift));
      night += NIGHT_MOON * (lobe * (0.2 + fresnel * 0.34) + crest * 0.035 + fresnel * 0.03);
      night += uWarmLight * (warmPool * (0.05 + ridgeCatch * 0.16) + amberPool * 0.05
        + transmittedPool * ridgeCatch * pathLight * 0.14);
      night += uCoolLight * coolPool * slope * 0.04;
      night = mix(night, NIGHT_COBALT * 0.35, path * 0.2);
      night = mix(night, caught, energyMix);
      night = floorWarmth(night, vWorld);
      night = mix(night, mix(uPage, NIGHT_COBALT, 0.12), haze);
      color = mix(color, night, uNight);
    }
    // The big bang's wave front, lit like its core (genesisShaders.ts): a lavender haze,
    // a pale peach band inside it and a near-white hot line at the crest.
    // On the dark floor a pale band reads far brighter: softer at night.
    float front = genesisFront(vWorld) * mix(1.0, 0.55, uNight);
    if (front > 0.0) {
      color = mix(color, mix(uViolet, uPearl, 0.3), min(0.8, front));
      color = mix(color, mix(uWarm, uPearl, 0.5), front * front * 0.9);
      color = mix(color, vec3(1.0), pow(front, 6.0));
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    // The world dissolves into the page (white by day, midnight blue by night).
    gl_FragColor.rgb = mix(uPage, gl_FragColor.rgb, presence);
    #include <colorspace_fragment>
  }
`;
