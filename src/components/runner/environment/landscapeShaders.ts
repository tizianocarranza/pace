import { terrainField } from "./terrainProfile";
import { interactionField } from "./worldInteractions";
import { energyField } from "./worldEnergy";

export const landscapeVertex = /* glsl */ `
  uniform float uTravel;
  uniform float uPhase;
  uniform vec2 uMomentum;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vObjectX;
  varying vec3 vLocal;
  varying float vFilament;
  #ifdef USE_INSTANCING
    attribute float detailGrounded;
    attribute vec2 detailMotion;
  #endif
  ${terrainField}
  ${interactionField}
  void main() {
    vec3 p = position;
    vec3 n = normal;
    vFilament = 0.0;
    #ifdef USE_INSTANCING
      vFilament = step(1.5, detailMotion.x);
      if (detailMotion.x > 0.5 && detailMotion.x < 1.5) {
        float angle = (sin(uPhase + detailMotion.y) - sin(detailMotion.y)) * 0.075;
        mat2 turn = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        p.xz = turn * p.xz;
        n.xz = turn * n.xz;
      }
      if (detailMotion.x > 1.5) {
        // The filament envelope vanishes at both buried tips. Local phase keeps
        // neighboring structures from flexing together; lag survives deceleration.
        float envelope = pow(max(sin((position.x + 0.5) * 3.14159265), 0.0), 2.0);
        float wave = sin(uPhase * 2.0 + detailMotion.y + position.x * 4.0)
          - sin(detailMotion.y + position.x * 4.0);
        p.z += envelope * (wave * 0.022 + (uMomentum.y - uMomentum.x) * 0.08);
      }
    #endif
    #ifdef TERRAIN
      vec2 at = p.xz + vec2(uTravel, 0.0);
      p.y = terrainHeight(at);
      vec3 pressure = contactPressure(p.xz);
      p.y += pressure.x;
      float dx = terrainHeight(at + vec2(0.04, 0.0)) - terrainHeight(at - vec2(0.04, 0.0));
      float dz = terrainHeight(at + vec2(0.0, 0.04)) - terrainHeight(at - vec2(0.0, 0.04));
      n = normalize(vec3(-dx - pressure.y * 0.08, 0.08, -dz - pressure.z * 0.08));
    #endif
    mat4 objectTransform = modelMatrix;
    #ifdef USE_INSTANCING
      objectTransform = modelMatrix * instanceMatrix;
    #endif
    vec4 world = objectTransform * vec4(p, 1.0);
    vWorld = world.xyz;
    vLocal = position;
    #ifdef TERRAIN
      vLocal = vec3(p.x + uTravel, p.y, p.z);
    #endif
    vObjectX = objectTransform[3].x;
    // Inverse-transpose for these rotation/scale transforms, including narrow-screen banks.
    mat3 axes = mat3(objectTransform);
    vec3 scaleSquared = vec3(dot(axes[0], axes[0]), dot(axes[1], axes[1]), dot(axes[2], axes[2]));
    vNormal = normalize(axes * (n / max(scaleSquared, vec3(0.00001))));
    #ifdef USE_INSTANCING
      // Static art-directed instances share the exact terrain phase. Rooted
      // sheets conform per vertex; floating fragments keep their authored height.
      if (detailGrounded > 0.5) {
        world.y += terrainHeight(world.xz);
        float dx = (terrainHeight(world.xz + vec2(0.04, 0.0)) - terrainHeight(world.xz - vec2(0.04, 0.0))) / 0.08;
        float dz = (terrainHeight(world.xz + vec2(0.0, 0.04)) - terrainHeight(world.xz - vec2(0.0, 0.04))) / 0.08;
        vNormal = normalize(vec3(vNormal.x - dx * vNormal.y, vNormal.y, vNormal.z - dz * vNormal.y));
      }
      float wrappedX = mod(vObjectX - uTravel + 36.0, 72.0) - 36.0;
      world.x += wrappedX - vObjectX;
      if (detailMotion.x > 0.5 && detailMotion.x < 1.5) {
        float drift = sin(uPhase + detailMotion.y) - sin(detailMotion.y);
        float bob = sin(uPhase * 2.0 + detailMotion.y) - sin(detailMotion.y);
        world.y += bob * 0.055;
        world.x += drift * 0.035 + (uMomentum.y - uMomentum.x) * 0.16;
      }
      if (detailGrounded < 0.5) {
        // Evaluate once per object position (identical across its vertices), so
        // the fragment moves rigidly. Distant/high pieces receive no reaction.
        vec3 center = vec3(wrappedX, objectTransform[3].y, objectTransform[3].z);
        vec2 reaction = fragmentResponse(center);
        vec3 offset = world.xyz - center;
        mat2 tilt = mat2(cos(reaction.y), -sin(reaction.y), sin(reaction.y), cos(reaction.y));
        offset.xy = tilt * offset.xy;
        vNormal.xy = tilt * vNormal.xy;
        world.xyz = center + offset + vec3(reaction.y * 0.18, reaction.x, 0.0);
      }
      vObjectX = wrappedX;
      vWorld = world.xyz;
    #endif
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const landscapeFragment = /* glsl */ `
  uniform vec3 uPearl;
  uniform vec3 uBlue;
  uniform vec3 uViolet;
  uniform vec3 uDeep;
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
  uniform float uCompositionGray;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vObjectX;
  varying vec3 vLocal;
  varying float vFilament;
  ${energyField}

  // Broad reflection lobes use the shared world light directions. No scene capture.
  float studioCard(vec3 reflection, vec3 direction, float spread) {
    float alignment = max(dot(reflection, normalize(direction)), 0.0);
    return exp((alignment - 1.0) / spread);
  }
  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 n = normalize(vNormal);
    // Terrain normals always point out of the height field. Flipping them near a
    // grazing ridge creates a dark seam where smooth and triangle normals differ.
    #ifndef TERRAIN
      if (dot(n, view) < 0.0) n = -n;
    #endif
    #if MATERIAL_KIND == 3
      vec3 facet = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      if (dot(facet, view) < 0.0) facet = -facet;
      n = normalize(mix(n, facet, 0.28));
    #endif
    float nv = max(dot(n, view), 0.0);
    float fresnel = pow(1.0 - nv, 3.0);
    vec3 reflection = reflect(-view, n);
    float light = dot(n, uKeyDirection) * 0.5 + 0.5;
    float warmFacing = 0.5 + 0.5 * dot(n, uWarmDirection);
    float coolFacing = 0.5 + 0.5 * dot(n, uCoolDirection);
    float warmBacklight = max(dot(-n, uWarmDirection), 0.0);
    // Low-frequency bounce follows the existing forms, coherently coloring every material.
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
    // Orientation and optical path length drive the palette, rather than screen-space fills.
    float pearlShift = smoothstep(-0.65, 0.8, reflection.x + reflection.y * 0.35);
    vec3 pearl = mix(uViolet, uBlue, pearlShift);
    float alpha = 1.0;
    vec3 color;
    float transmission = 0.0;

    #if MATERIAL_KIND == 0 || MATERIAL_KIND == 4
      float crest = smoothstep(-0.75, 2.5, vWorld.y);
      vec3 mineral = mix(uBlue * 0.65, uViolet * 0.9, 1.0 - pearlShift);
      color = mix(mineral, uPearl, 0.12 + 0.58 * pow(light, 3.0));
      color = mix(color, pearl, (0.16 + 0.3 * slope) * (0.55 + 0.45 * fresnel));
      color = mix(color, uPearl, crest * 0.12);
      // Warm and cool pools fall across the same ridge/valley system, not individual object fills.
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
      #ifdef FOREGROUND
        color = mix(color, pearl, 0.32 * slope);
        color = mix(color, uCoolLight, studioCard(reflection, uCoolDirection, 0.15) * 0.38);
      #else
        float path = 1.0 - smoothstep(0.65, 3.3, abs(vWorld.z + 0.1));
        color = mix(color, uPearl, path * 0.48);
      #endif
    #elif MATERIAL_KIND == 1
      // Thin satin resin: light through the lifted sheet, denser color in its folds.
      float thin = smoothstep(-0.5, 3.1, vLocal.y) * (0.4 + 0.6 * fresnel);
      vec3 tint = mix(uBlue, uViolet, 0.35 + 0.4 * (1.0 - pearlShift));
      #ifdef WARM_ACCENT
        tint = mix(tint, uWarm, 0.42 + smoothstep(-0.15, 0.75, n.x + n.y * 0.5) * 0.53);
      #endif
      color = mix(tint * 0.67, uPearl, 0.1 + 0.33 * light);
      color = mix(color, tint * (0.9 + thin * 0.25), thin * 0.42);
      float reflectionBand = studioCard(reflection, uKeyDirection, 0.075);
      color = mix(color, vec3(1.08, 1.04, 1.01), reflectionBand * 0.7 + fresnel * thin * 0.25);
      transmission = thin * (0.25 + 0.75 * warmBacklight);
      alpha = 0.78 + 0.18 * fresnel - thin * 0.22;
    #elif MATERIAL_KIND == 2
      // Approximate thickness-dependent absorption; background remains visible through the arch.
      float thickness = (0.35 + nv * 1.25) * (1.0 - 0.4 * smoothstep(0.0, 4.5, vLocal.y));
      vec3 absorption = exp(-vec3(1.8, 0.85, 0.34) * thickness);
      color = mix(uDeep * 0.72, uBlue, 0.14 + light * 0.48);
      color = mix(color, absorption, 0.02 + light * 0.06);
      float milk = exp(-thickness * 2.0);
      color = mix(color, mix(uViolet, uPearl, milk), 0.12 + fresnel * 0.3);
      transmission = exp(-thickness * 1.5) * (0.2 + warmBacklight * 0.8);
      float wide = studioCard(reflection, uKeyDirection, 0.085);
      float edgeLight = studioCard(reflection, uCoolDirection, 0.026);
      float front = studioCard(reflection, vec3(0.12, 0.2, 1.0), 0.025);
      color = mix(color, mix(uCoolLight, vec3(1.15), 0.8), min(0.96, wide * 0.75 + edgeLight * 0.55 + front * 0.36 + fresnel * 0.16));
      color += mix(uWarmLight, vec3(1.0), 0.32) * pow(transmission, 1.2) * 0.7;
      alpha = 0.45 + 0.34 * fresnel + 0.1 * thickness;
    #else
      // Polished artifacts share the mineral palette, with one amber-pearl accent.
      vec3 body = mix(uDeep, uBlue, light * 0.7);
      #ifdef WARM_ACCENT
        body = mix(uWarm * 0.65, uWarm, light);
      #endif
      color = mix(body, pearl, fresnel * 0.5);
      float broad = studioCard(reflection, uKeyDirection, 0.10);
      float small = studioCard(reflection, uCoolDirection, 0.035);
      color = mix(color, uPearl, min(0.95, broad * 0.65 + small * 0.36 + fresnel * 0.22));
      transmission = (0.12 + fresnel * 0.28) * warmBacklight;
    #endif

    // Shared colored irradiance unifies the family; transmitted light is not a glow halo.
    color *= vec3(0.68 + light * 0.28) + uWarmLight * warmEnergy * 0.10 + uCoolLight * coolEnergy * 0.10;
    float warmReflection = studioCard(reflection, uWarmDirection, 0.14);
    color = mix(color, uWarmLight, min(0.5, warmEnergy * 0.035 + warmReflection * 0.24 + transmission * 0.45));
    color = mix(color, uCoolLight, coolEnergy * (0.025 + fresnel * 0.12));

    // Narrow traveling reflection inside the existing mineral/resin. The quiet
    // finish is recovered exactly at zero; no global light or background tint.
    float opticalEnergy = uEnergy.x * energyContinuity(vWorld);
    float traveling = energySweep(vWorld);
    float catchLight = traveling * (0.48 + 0.52 * fresnel);
    vec3 caught = mix(uCoolLight, uWarmLight, warmPool * 0.75 + warmBacklight * 0.2);
    #if MATERIAL_KIND == 0
      // Refracted light grazes one shelf beside the lane. It remains a surface
      // reflection, spatially confined to the existing warm/cool mineral pools.
      float shelf = vWorld.z + 1.85 + sin(vWorld.x * 0.55 + uEnergyPhase) * 0.36;
      float caustic = exp(-shelf * shelf / 0.035) * (warmPool + coolPool) * 0.5;
      catchLight = catchLight * (0.2 + slope * 0.6) * (warmPool + coolPool) * 0.6
        + caustic * (0.3 + traveling * 0.7);
    #elif MATERIAL_KIND == 4
      catchLight *= 0.6;
    #else
      catchLight *= 1.15 + transmission * 0.9 + vFilament * 0.8;
      // A restrained pearl edge becomes readable within the passing highlight.
      caught = mix(caught, mix(uViolet, vec3(1.0), 0.65), fresnel * 0.35);
      vec3 mineralDepth = mix(uBlue, uViolet, 0.35);
      #ifdef WARM_ACCENT
        mineralDepth = uWarm;
      #endif
      color = mix(color, mineralDepth, opticalEnergy * (1.0 - traveling) * 0.18);
    #endif
    color = mix(color, caught, min(0.7, catchLight * opticalEnergy * (0.7 + uEnergy.y * 0.3 + uEnergy.z)));
    color += caught * traveling * transmission * opticalEnergy * 0.2;

    // Local diffusion is evaluated on surfaces, leaving the HTML text and empty sky crisp.
    float pathClarity = 1.0 - smoothstep(0.4, 1.5, abs(vWorld.z));
    float diffusion = (warmPool * 0.08 + amberPool * 0.14 + transmittedPool * 0.1) * (1.0 - pathClarity * 0.72);
    color = mix(color, mix(uWarmLight, vec3(1.0), 0.76), diffusion);
    float atmosphere = smoothstep(3.0, 28.0, -vWorld.z);
    vec3 air = mix(uCoolLight, vec3(1.0), 0.88);
    air = mix(air, vec3(1.0), atmosphere);
    color = mix(color, air, atmosphere * 0.985);
    float nearFade = smoothstep(6.0, 10.0, vWorld.z);
    #ifdef FOREGROUND
      nearFade = 0.0;
    #endif
    float farFade = smoothstep(29.0, 37.0, -vWorld.z);
    float edge = smoothstep(28.0, 35.0, abs(vWorld.x));
    #if MATERIAL_KIND > 0 && MATERIAL_KIND < 4
      edge = max(edge, smoothstep(24.0, 34.0, abs(vObjectX)));
    #endif
    vec2 screen = gl_FragCoord.xy / uResolution;
    float frame = smoothstep(0.12, 0.20, screen.y) * (1.0 - smoothstep(0.67, 0.77, screen.y));
    // Crop at the viewport sides: a screen-edge fade made the world read as a
    // rectangular panel and erased the strongest near-plane depth cue.
    // Preserve the actual central sentence area, while letting cropped side
    // forms reach higher. This is a composition mask, not a character halo.
    float sentenceColumn = 1.0 - smoothstep(0.22, 0.38, abs(screen.x - 0.5));
    frame *= 1.0 - sentenceColumn * smoothstep(0.60, 0.66, screen.y);
    // Bleach boundary surfaces before their coverage disappears, avoiding a cut-out silhouette.
    float boundaryAir = max(max(nearFade, farFade), max(edge, 1.0 - frame));
    color = mix(color, vec3(1.0), smoothstep(0.05, 0.9, boundaryAir) * 0.78);
    float presence = (1.0 - nearFade) * (1.0 - farFade) * (1.0 - edge) * frame * uVisibility;
    // Neutral study mode uses this same shader/geometry, without new materials.
    color = mix(color, vec3(0.22 + 0.66 * light), uCompositionGray);
    #if MATERIAL_KIND == 1 || MATERIAL_KIND == 2
      gl_FragColor = vec4(color, alpha * presence);
    #else
      gl_FragColor = vec4(color, 1.0);
    #endif
    #include <tonemapping_fragment>
    #if MATERIAL_KIND != 1 && MATERIAL_KIND != 2
      gl_FragColor.rgb = mix(vec3(1.0), gl_FragColor.rgb, presence);
    #endif
    #include <colorspace_fragment>
  }
`;

