import { terrainField } from "./terrainProfile";
import { interactionField } from "./worldInteractions";
import { energyField } from "./worldEnergy";
import { atmosphereField } from "./atmosphere";
import { floorWarmthField } from "./floorWarmth";

export const landscapeVertex = /* glsl */ `
  uniform float uTravel;
  varying vec3 vWorld;
  varying vec3 vNormal;
  ${terrainField}
  ${interactionField}
  void main() {
    vec3 p = position;
    vec2 at = p.xz + vec2(uTravel, 0.0);
    p.y = terrainHeight(at);
    vec3 pressure = contactPressure(p.xz);
    p.y += pressure.x;
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
  varying vec3 vWorld;
  varying vec3 vNormal;
  ${energyField}
  ${floorWarmthField}
  ${atmosphereField}

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
    return (1.0 - nearFade) * (1.0 - farFade) * (1.0 - edge) * frame * uVisibility;
  }
  void main() {
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
    vec3 pearl = mix(uViolet, uBlue, pearlShift);

    float crest = smoothstep(-0.75, 2.5, vWorld.y);
    vec3 mineral = mix(uBlue * 0.65, uViolet * 0.9, 1.0 - pearlShift);
    vec3 color = mix(mineral, uPearl, 0.12 + 0.58 * pow(light, 3.0));
    color = mix(color, pearl, (0.16 + 0.3 * slope) * (0.55 + 0.45 * fresnel));
    color = mix(color, uPearl, crest * 0.12);
    // Warm and cool pools fall across the same ridge/valley system.
    float ridgeCatch = pow(max(dot(n, normalize(uWarmDirection + vec3(0.0, 0.7, 0.0))), 0.0), 2.0);
    color = mix(color, uWarmLight, warmPool * (0.05 + ridgeCatch * 0.24));
    color = mix(color, mix(uViolet, uCoolLight, 0.5), coolPool * slope * 0.18);
    // An elongated soft reflection reads as a satin/pearl surface at grazing angles.
    vec3 cardDelta = reflection - normalize(vec3(-0.25, 0.4, -0.9));
    float lobe = exp(-dot(cardDelta * vec3(1.25, 4.4, 1.8), cardDelta * vec3(1.25, 4.4, 1.8)));
    color = mix(color, mix(uWarmLight, vec3(1.0), 0.68), lobe * (0.26 + fresnel * 0.38));
    float pathLight = 0.2 + 0.8 * smoothstep(0.5, 1.5, abs(vWorld.z));
    color = mix(color, mix(uWarmLight, vec3(1.0), 0.66), transmittedPool * pathLight * (0.3 + ridgeCatch * 0.35));
    color += vec3(1.0, 0.94, 0.88) * transmittedPool * ridgeCatch * pathLight * 0.16;
    float path = 1.0 - smoothstep(0.65, 3.3, abs(vWorld.z + 0.1));
    color = mix(color, uPearl, path * 0.48);

    // Shared colored irradiance. Shading lifts toward white rather than sinking into grey mid-tones.
    color *= vec3(0.80 + light * 0.22) + uWarmLight * warmEnergy * 0.10 + uCoolLight * coolEnergy * 0.10;
    float warmReflection = studioCard(reflection, uWarmDirection, 0.14);
    color = mix(color, uWarmLight, min(0.5, warmEnergy * 0.035 + warmReflection * 0.24));
    color = mix(color, uCoolLight, coolEnergy * (0.025 + fresnel * 0.12));

    // Narrow traveling reflection. The quiet finish is recovered exactly at zero.
    float opticalEnergy = uEnergy.x * energyContinuity(vWorld);
    float traveling = energySweep(vWorld);
    vec3 caught = mix(uCoolLight, uWarmLight, warmPool * 0.75 + warmBacklight * 0.2);
    // Refracted light grazes one shelf beside the lane. It remains a surface
    // reflection, spatially confined to the warm/cool pools.
    float shelf = vWorld.z + 1.85 + sin(vWorld.x * 0.55 + uEnergyPhase) * 0.36;
    float caustic = exp(-shelf * shelf / 0.035) * (warmPool + coolPool) * 0.5;
    float catchLight = traveling * (0.48 + 0.52 * fresnel) * (0.2 + slope * 0.6) * (warmPool + coolPool) * 0.6
      + caustic * (0.3 + traveling * 0.7);
    color = mix(color, caught, min(0.7, catchLight * opticalEnergy * (0.7 + uEnergy.y * 0.3 + uEnergy.z)));

    // Local diffusion is evaluated on surfaces, leaving the HTML text and empty sky crisp.
    float pathClarity = 1.0 - smoothstep(0.4, 1.5, abs(vWorld.z));
    float diffusion = (warmPool * 0.08 + amberPool * 0.14 + transmittedPool * 0.1) * (1.0 - pathClarity * 0.72);
    color = mix(color, mix(uWarmLight, vec3(1.0), 0.76), diffusion);
    // The floor warms with the sustained pace, before distance air.
    color = floorWarmth(color, vWorld);
    vec3 air = mix(uCoolLight, vec3(1.0), 0.88);
    color = mix(color, air, distanceHaze(vWorld));
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    gl_FragColor.rgb = mix(vec3(1.0), gl_FragColor.rgb, surfacePresence());
    #include <colorspace_fragment>
  }
`;
