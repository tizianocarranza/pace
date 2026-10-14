import * as THREE from "three";
import { terrainField } from "./terrainProfile";
import { interactionField } from "./worldInteractions";
import { type createLandscapeMaterials } from "./landscapeMaterials";
import { type OpticalUniforms } from "./LayeredOptics";
import { atmosphereField } from "./atmosphere";
import { energyField } from "./worldEnergy";
import { WORLD_LAYERS } from "./worldLayers";
import { floorWarmthField, glslVec as glsl } from "./floorWarmth";

type Shared = ReturnType<typeof createLandscapeMaterials>["terrain"]["uniforms"];
type Role = "ground" | "sheet" | "mineral";

/** Peach zones on the satin floor cover more of it at speed (sustained energy). */
const WARM_ZONE_THRESHOLD = [0.45, 0.15] as const;
/** Dune modeling on the floor. The studio fill and the tone curve's shoulder near
 * white flattened the slopes, so slopes facing away from the key light take a cool
 * shade and slopes facing it a slight lift. Identity on flat ground (the lane). */
export const RELIEF_SHADING = {
  // Typical slopes change key-light facing by only 0.05–0.1 (TERRAIN_RELIEF is low).
  gain: 9.0, // how quickly a slope reaches full shade/lift
  shade: [0.7, 0.72, 0.92], // cool lavender, never grey
  lift: 0.06,
} as const;

/** Three opt-in surfaces. Keep the physical BRDF and volume absorption while
 * supplying the existing deformation, thickness estimates and layered capture. */
export function createPilotMaterials(uniforms: Shared, optics: OpticalUniforms) {
  const ground = new THREE.MeshPhysicalMaterial({ name: "Pilot / calm ground", color: "#eef0fa",
    roughness: 0.38, metalness: 0, ior: 1.46, specularIntensity: 0.7,
    // A satin pearl sheet: a sharp clear coat mirrored the studio cards as
    // hard streaks across the floor.
    clearcoat: 0.45, clearcoatRoughness: 0.22 });
  const sheet = new THREE.MeshPhysicalMaterial({ name: "Pilot / thin peach resin", color: "#ffffff",
    roughness: 0.07, metalness: 0, ior: 1.42, transmission: 0.99, thickness: 0.055,
    attenuationColor: "#f3954d", attenuationDistance: 0.09, side: THREE.DoubleSide });
  const mineral = new THREE.MeshPhysicalMaterial({ name: "Pilot / blue resin volume", color: "#ffffff",
    roughness: 0.055, metalness: 0, ior: 1.5, transmission: 0.98, thickness: 1,
    // The existing parametric stone has inward winding. Render its outward
    // surface with corrected normals without touching the approved geometry.
    attenuationColor: "#356cac", attenuationDistance: 0.92, side: THREE.BackSide });

  function configure(material: THREE.MeshPhysicalMaterial, role: Role) {
    const transmission = material.transmission;
    // Enter the ordered transparent queue, but write a complete refracted color:
    // no alpha blending and no automatic native transmission capture.
    material.transparent = role !== "ground";
    material.blending = THREE.NoBlending;
    if (role !== "ground") {
      material.transmission = 0;
      material.defines = { ...material.defines, USE_TRANSMISSION: "" };
      material.userData.opticalTransmission = transmission;
    }
    material.opacity = 1;
    material.depthWrite = true;
    material.forceSinglePass = true;
    material.dithering = true;
    const viewport = new THREE.Vector4();
    const opticalUniforms = {
      uPilotWorldToLocal: { value: new THREE.Matrix4() },
      uPilotCenter: { value: new THREE.Vector3() },
      uPilotRadii: { value: new THREE.Vector3(1, 1, 1) },
    };
    material.onBeforeRender = (renderer, _scene, _camera, geometry, object) => {
      renderer.getCurrentViewport(viewport);
      uniforms.uResolution.value.set(viewport.z, viewport.w);
      if (role === "mineral") {
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        geometry.boundingBox!.getCenter(opticalUniforms.uPilotCenter.value);
        geometry.boundingBox!.getSize(opticalUniforms.uPilotRadii.value).multiplyScalar(0.5);
        opticalUniforms.uPilotWorldToLocal.value.copy(object.matrixWorld).invert();
      }
    };
    material.customProgramCacheKey = () => `pace-pilot-v8-${role}`;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms, opticalUniforms, optics);
      if (role === "mineral") shader.uniforms.uOpticalDepth = optics.uOpticalMineralDepth;
      if (role !== "ground") Object.assign(shader.uniforms, {
        transmission: { value: transmission }, thickness: { value: material.thickness },
        attenuationColor: { value: material.attenuationColor },
        attenuationDistance: { value: material.attenuationDistance },
      });
      const declarations = `varying vec3 vPilotWorld; varying vec3 vPilotLocal;
        varying float vPilotLayer; uniform float uOpticalSplit;
        uniform float uTravel; uniform float uVisibility; uniform vec2 uResolution;
        uniform float uCompositionGray;\n`;
      shader.vertexShader = declarations + (role === "ground" ? terrainField + interactionField : "") + shader.vertexShader;
      if (role === "ground") {
        shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
          vec2 at = position.xz + vec2(uTravel, 0.0);
          vec3 pressure = contactPressure(position.xz);
          float dx = terrainHeight(at + vec2(0.04,0.0)) - terrainHeight(at - vec2(0.04,0.0));
          float dz = terrainHeight(at + vec2(0.0,0.04)) - terrainHeight(at - vec2(0.0,0.04));
          vec3 objectNormal = normalize(vec3(-dx-pressure.y*0.08, 0.08, -dz-pressure.z*0.08));
        `).replace('#include <begin_vertex>', `vec3 transformed = vec3(position.x, terrainHeight(at) + pressure.x, position.z);`);
      }
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        vPilotWorld = (modelMatrix * vec4(transformed,1.0)).xyz;
        vPilotLocal = position;
        vPilotLayer = ${role === "sheet" ? 'step(uOpticalSplit, float(gl_VertexID))' : '0.0'};
        #include <project_vertex>`);
      shader.fragmentShader = declarations + atmosphereField + energyField + floorWarmthField + `
        uniform float uAtmosphere;
        uniform mat4 uPilotWorldToLocal;
        uniform vec3 uPilotCenter;
        uniform vec3 uPilotRadii;
        uniform vec3 uKeyDirection;
      ` + shader.fragmentShader;
      const variation = role === "ground" ? `
        // A pearl floor with two or three broad, soft zones in view: periwinkle
        // and peach drift past slowly while running. Narrow diagonal bands read
        // as noise; the saturated color belongs to the ribbons and Pip.
        // Color temperature follows the sustained pace (uEnergy.y): a pale, cool
        // pearl when slow; the peach zones spread and saturate only when a high
        // pace is held. Bursts barely change it. The lit grade is applied later.
        float sustained = uEnergy.y;
        vec2 field = vec2(vPilotWorld.x + uTravel, vPilotWorld.z);
        float cool = smoothstep(0.35, 1.0, 0.5 + 0.5 * sin(field.x * 0.085 + field.y * 0.12 + 0.7));
        float warmFrom = mix(${WARM_ZONE_THRESHOLD[0].toFixed(3)}, ${WARM_ZONE_THRESHOLD[1].toFixed(3)}, sustained);
        float warm = smoothstep(warmFrom, 1.0, 0.5 + 0.5 * sin(field.x * 0.11 - field.y * 0.09 + 3.4)) * (1.0 - cool);
        float outsideLane = smoothstep(0.7, 2.5, abs(vPilotWorld.z));
        float distant = smoothstep(2.0, 14.0, -vPilotWorld.z);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62,0.66,0.98), cool * outsideLane * mix(0.20, 0.30, sustained));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0,0.74,0.58), warm * outsideLane * mix(0.08, 0.42, sustained));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78,0.78,0.98), distant * 0.18);
      ` : role === "sheet" ? `
        float density = smoothstep(-2.0,3.0,vPilotLocal.x) * (0.5+0.5*sin(vPilotLocal.z*1.8));
      ` : `
        float density = smoothstep(2.6,4.2,vPilotLocal.y);
      `;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + variation);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' +
        (role === "ground" ? '' : 'roughnessFactor += density * 0.035;'));
      if (role === "ground") {
        // scene.environment ignores material.envMapIntensity. Without this the
        // studio's blue/violet cards wash every grazing slope lavender, and the
        // glossy sheet mirrors the warm card as a pink flood. Keep only a hint.
        shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', `
          #include <lights_fragment_maps>
          iblIrradiance *= 0.7;
          const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
          radiance = mix(radiance, vec3(dot(radiance, luma)), 0.5) * 0.85;
          #ifdef USE_CLEARCOAT
            clearcoatRadiance = mix(clearcoatRadiance, vec3(dot(clearcoatRadiance, luma)), 0.5);
          #endif`);
      }
      if (role !== "ground") {
        let transmissionChunk = THREE.ShaderChunk.transmission_pars_fragment;
        if (role === "mineral") {
          transmissionChunk = transmissionChunk.replaceAll(
            'vec3 refractedRayExit = position + transmissionRay;', `
              vec3 refractedRayExit = position + transmissionRay;
              // Approximate the second interface using the same bounding volume
              // as absorption. The native slab stops at the exit; a resin volume
              // also changes direction as light returns to the surrounding air.
              vec3 localExit = (uPilotWorldToLocal * vec4(refractedRayExit,1.0)).xyz;
              vec3 exitGradient = (localExit-uPilotCenter) / max(uPilotRadii*uPilotRadii,vec3(0.0001));
              vec3 exitNormal = normalize(transpose(mat3(uPilotWorldToLocal)) * exitGradient);
              vec3 outgoing = refract(normalize(transmissionRay), -exitNormal, ior);
              vec4 exitClip = projMatrix * viewMatrix * vec4(refractedRayExit,1.0);
              vec2 exitUv = clamp(exitClip.xy/exitClip.w*0.5+0.5,vec2(0.0),vec2(1.0));
              float backgroundDepth = texture2D(uOpticalDepth,exitUv).r;
              float backgroundZ = -projMatrix[3][2] / (backgroundDepth*2.0-1.0+projMatrix[2][2]);
              float exitZ = (viewMatrix * vec4(refractedRayExit,1.0)).z;
              float outgoingZ = (viewMatrix * vec4(outgoing,0.0)).z;
              // One depth estimate, not ray marching. Clamp offscreen/background
              // excursions; total internal reflection keeps the native sample.
              if (outgoingZ < -0.05 && backgroundDepth < 0.9999) {
                float reach = clamp((backgroundZ-exitZ)/outgoingZ,0.0,0.75);
                refractedRayExit += outgoing * reach;
              }
            `);
        }
        shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_pars_fragment>', `
          uniform sampler2D uOpticalBase;
          uniform sampler2D uOpticalLayers;
          uniform sampler2D uOpticalMineral;
          uniform sampler2D uOpticalDepth;
          uniform vec2 uOpticalSize;
          uniform float uOpticalCapture;
          vec4 readOpticalScene(vec2 uv) {
            ${role === "mineral" ? `
            // A nearer fold belongs in front of the mineral, never inside it.
            if (texture2D(uOpticalDepth, uv).r < gl_FragCoord.z - 0.0001)
              return texture2D(uOpticalBase, uv);
            return texture2D(uOpticalMineral, uv);` : `
            if (vPilotLayer > 0.5 || uOpticalCapture > 0.5) return texture2D(uOpticalBase, uv);
            return texture2D(uOpticalLayers, uv);
            `}
          }
        ` + transmissionChunk.replace(
          'return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );', `
            vec2 uv = clamp(fragCoord, vec2(0.0), vec2(1.0));
            // Prevent a displaced lookup from pulling a nearer opaque object
            // into the surface behind it (a common screen-space refraction halo).
            if (texture2D(uOpticalDepth, uv).r < gl_FragCoord.z - 0.0001)
              uv = gl_FragCoord.xy / uResolution;
            vec2 radius = vec2(0.5 + roughness * 4.0) / uOpticalSize;
            return readOpticalScene(uv) * 0.5
              + (readOpticalScene(uv+vec2(radius.x,0.0)) + readOpticalScene(uv-vec2(radius.x,0.0))
              + readOpticalScene(uv+vec2(0.0,radius.y)) + readOpticalScene(uv-vec2(0.0,radius.y))) * 0.125;
          `));
        shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_fragment>',
          THREE.ShaderChunk.transmission_fragment.replace('material.thickness = thickness;',
            role === "sheet" ? `
              // Thin-sheet path estimate; tint comes from absorption, not painted diffuse color.
              float incidence = max(0.35, dot(normal, normalize(vViewPosition)));
              // Keep broad thin areas clear; concentrate absorption where the
              // authored fold-density field indicates a longer optical path.
              material.thickness = thickness * (0.08 + density * density * 0.92) / incidence;
            ` : `
              // A bounded ellipsoid proxy estimates the path through the existing
              // convex mineral. It is not a ray-traced mesh exit or new geometry.
              vec3 worldNormal = transformNormalByInverseViewMatrix(normal, viewMatrix);
              vec3 worldRay = refract(-normalize(cameraPosition-vPilotWorld), worldNormal, 1.0/material.ior);
              vec3 localRay = normalize((uPilotWorldToLocal * vec4(worldRay,0.0)).xyz);
              vec3 radii = max(uPilotRadii, vec3(0.001));
              vec3 entry = normalize((vPilotLocal-uPilotCenter)/radii);
              vec3 ray = localRay/radii;
              float chord = max(0.025, -2.0*dot(entry,ray)/dot(ray,ray));
              material.thickness = thickness * chord;
            `));
      }
      shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>', `
        // Same finite traveling illumination as the surrounding landscape.
        // A localized surface catch, never an exposure or opacity change.
        float energy = uEnergy.x * energyContinuity(vPilotWorld);
        float sweep = energySweep(vPilotWorld);
        ${role === "ground" ? (WORLD_LAYERS.formations ? `
          // Refracted light on the shelf beside the formations.
          float shelf = vPilotWorld.z + 1.85 + sin((vPilotWorld.x+uTravel)*0.55) * 0.36;
          float ribbon = exp(-shelf*shelf/0.065) * smoothstep(0.8,1.5,abs(vPilotWorld.z));
          gl_FragColor.rgb += vec3(0.28,0.18,0.09) * ribbon * energy * (0.45+sweep*0.55);
        ` : "") : `
          float grazing = pow(1.0-max(dot(normal,normalize(vViewPosition)),0.0),2.0);
          gl_FragColor.rgb += vec3(0.16,0.12,0.075) * sweep * energy * (0.2+grazing*0.8);
        `}
        ${role === "ground" ? `
          // Relief shading relative to flat ground, so the level lane is untouched.
          // The lane mask also keeps contact footprints from shading.
          vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
          float facing = dot(worldNormal, uKeyDirection) - uKeyDirection.y;
          float dunes = smoothstep(0.6, 1.4, abs(vPilotWorld.z));
          float shade = clamp(-facing * ${RELIEF_SHADING.gain.toFixed(3)}, 0.0, 1.0) * dunes;
          float lift = clamp(facing * ${RELIEF_SHADING.gain.toFixed(3)}, 0.0, 1.0) * dunes;
          gl_FragColor.rgb *= mix(vec3(1.0), ${glsl(RELIEF_SHADING.shade)}, shade) * (1.0 + lift * ${RELIEF_SHADING.lift.toFixed(3)});
          // Warm grade of the lit floor, reflections included (floorWarmth.ts).
          gl_FragColor.rgb = floorWarmth(gl_FragColor.rgb, vPilotWorld);
        ` : ""}
        if (uAtmosphere > 0.5)
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.96,0.975,1.0), distanceHaze(vPilotWorld));
        #include <tonemapping_fragment>
        vec2 screen = gl_FragCoord.xy / uResolution;
        float frame = smoothstep(0.15,0.26,screen.y) * (1.0-smoothstep(0.67,0.77,screen.y));
        float sentenceColumn = 1.0-smoothstep(0.22,0.38,abs(screen.x-0.5));
        frame *= 1.0-sentenceColumn*smoothstep(0.60,0.66,screen.y);
        float presence = frame * uVisibility * (1.0-smoothstep(29.0,37.0,-vPilotWorld.z))
          * (1.0-smoothstep(28.0,35.0,abs(vPilotWorld.x)))
          * (1.0-smoothstep(6.0,10.0,vPilotWorld.z));
        float haze = smoothstep(7.0,32.0,-vPilotWorld.z)*0.93 * (1.0-uAtmosphere);
        gl_FragColor.rgb = mix(gl_FragColor.rgb,vec3(1.0),haze);
        gl_FragColor.rgb = mix(gl_FragColor.rgb,vec3(dot(gl_FragColor.rgb,vec3(0.2126,0.7152,0.0722))),uCompositionGray);
        gl_FragColor.rgb = mix(vec3(1.0),gl_FragColor.rgb,presence);
      `);
    };
    return material;
  }
  return { ground: configure(ground, "ground"), sheet: configure(sheet, "sheet"), mineral: configure(mineral, "mineral") };
}
