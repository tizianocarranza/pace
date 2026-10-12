import * as THREE from "three";
import { terrainField } from "./terrainProfile";
import { interactionField } from "./worldInteractions";
import { type createLandscapeMaterials } from "./landscapeMaterials";
import { type OpticalUniforms } from "./LayeredOptics";
import { atmosphereField } from "./atmosphere";
import { energyField } from "./worldEnergy";

type Shared = ReturnType<typeof createLandscapeMaterials>["terrain"]["uniforms"];
type Role = "ground" | "sheet" | "mineral";

/** Three opt-in surfaces. Keep the physical BRDF and volume absorption while
 * supplying the existing deformation, thickness estimates and layered capture. */
export function createPilotMaterials(uniforms: Shared, optics: OpticalUniforms) {
  const ground = new THREE.MeshPhysicalMaterial({ name: "Pilot / calm ground", color: "#eef0fa",
    roughness: 0.2, metalness: 0, ior: 1.46, specularIntensity: 0.7,
    // A thin wet sheet: a sharp clear layer over a slightly softer base.
    clearcoat: 0.8, clearcoatRoughness: 0.07 });
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
    material.customProgramCacheKey = () => `pace-pilot-v7-${role}`;
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
      shader.fragmentShader = declarations + atmosphereField + energyField + `
        uniform float uAtmosphere;
        uniform mat4 uPilotWorldToLocal;
        uniform vec3 uPilotCenter;
        uniform vec3 uPilotRadii;
      ` + shader.fragmentShader;
      const variation = role === "ground" ? `
        float basin = (0.5 + 0.5 * sin((vPilotWorld.x + uTravel) * 0.42 + vPilotWorld.z * 0.85));
        float outsideLane = smoothstep(0.7, 2.5, abs(vPilotWorld.z));
        // Concentrate value in the basin instead of darkening the whole floor.
        // Saturated periwinkle/cobalt pools and peach warmth on a near-white floor.
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08,0.14,0.62), pow(basin, 4.0) * outsideLane * 0.78);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42,0.30,0.85), basin * (1.0-basin) * outsideLane * 0.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0,0.56,0.32), pow(1.0-basin, 4.0) * outsideLane * 0.26);
      ` : role === "sheet" ? `
        float density = smoothstep(-2.0,3.0,vPilotLocal.x) * (0.5+0.5*sin(vPilotLocal.z*1.8));
      ` : `
        float density = smoothstep(2.6,4.2,vPilotLocal.y);
      `;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + variation);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' +
        (role === "ground" ? 'roughnessFactor = mix(0.14,0.3,basin);' : 'roughnessFactor += density * 0.035;'));
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
        ${role === "ground" ? `
          float shelf = vPilotWorld.z + 1.85 + sin((vPilotWorld.x+uTravel)*0.55) * 0.36;
          float ribbon = exp(-shelf*shelf/0.065) * smoothstep(0.8,1.5,abs(vPilotWorld.z));
          gl_FragColor.rgb += vec3(0.28,0.18,0.09) * ribbon * energy * (0.45+sweep*0.55);
        ` : `
          float grazing = pow(1.0-max(dot(normal,normalize(vViewPosition)),0.0),2.0);
          gl_FragColor.rgb += vec3(0.16,0.12,0.075) * sweep * energy * (0.2+grazing*0.8);
        `}
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
