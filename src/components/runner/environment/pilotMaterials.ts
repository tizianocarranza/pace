import * as THREE from "three";
import { terrainField } from "./terrainProfile";
import { interactionField } from "./worldInteractions";
import { type createLandscapeMaterials } from "./landscapeMaterials";

type Shared = ReturnType<typeof createLandscapeMaterials>["terrain"]["uniforms"];
type Role = "ground" | "sheet" | "mineral";

/** Three opt-in surfaces. Keep the built-in physical BRDF and volume transmission;
 * shader hooks only supply the existing deformation, broad variation and framing. */
export function createPilotMaterials(uniforms: Shared) {
  const ground = new THREE.MeshPhysicalMaterial({ name: "Pilot / calm ground", color: "#b0bdd8",
    roughness: 0.48, metalness: 0, ior: 1.46, specularIntensity: 0.7 });
  const sheet = new THREE.MeshPhysicalMaterial({ name: "Pilot / thin peach resin", color: "#fff8ee",
    roughness: 0.12, metalness: 0, ior: 1.45, transmission: 0.94, thickness: 0.18,
    attenuationColor: "#e99042", attenuationDistance: 0.28, side: THREE.DoubleSide });
  const mineral = new THREE.MeshPhysicalMaterial({ name: "Pilot / blue resin volume", color: "#b2d2ef",
    roughness: 0.11, metalness: 0, ior: 1.5, transmission: 0.72, thickness: 1.15,
    // The existing parametric stone has inward winding. Render its outward
    // surface with corrected normals without touching the approved geometry.
    attenuationColor: "#3975bd", attenuationDistance: 1.35, side: THREE.BackSide });

  function configure(material: THREE.MeshPhysicalMaterial, role: Role) {
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.forceSinglePass = true;
    material.dithering = true;
    const viewport = new THREE.Vector4();
    material.onBeforeRender = renderer => {
      renderer.getCurrentViewport(viewport);
      uniforms.uResolution.value.set(viewport.z, viewport.w);
    };
    material.customProgramCacheKey = () => `pace-pilot-v1-${role}`;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      const declarations = `varying vec3 vPilotWorld; varying vec3 vPilotLocal;
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
        #include <project_vertex>`);
      shader.fragmentShader = declarations + shader.fragmentShader;
      const variation = role === "ground" ? `
        float basin = (0.5 + 0.5 * sin((vPilotWorld.x + uTravel) * 0.42 + vPilotWorld.z * 0.85));
        float outsideLane = smoothstep(0.7, 2.5, abs(vPilotWorld.z));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10,0.19,0.36), basin * outsideLane * 0.60);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96,0.73,0.55), (1.0-basin) * outsideLane * 0.16);
      ` : role === "sheet" ? `
        float density = smoothstep(-2.0,3.0,vPilotLocal.x) * (0.5+0.5*sin(vPilotLocal.z*1.8));
        diffuseColor.rgb *= mix(vec3(1.0),vec3(1.0,0.72,0.42),density*0.3);
      ` : `
        float density = smoothstep(2.6,4.2,vPilotLocal.y);
        diffuseColor.rgb *= mix(vec3(0.52,0.72,1.0),vec3(1.0),density*0.6);
      `;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + variation);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' +
        (role === "ground" ? 'roughnessFactor = mix(0.36,0.62,basin);' : 'roughnessFactor += density * 0.065;'));
      if (role !== "ground") {
        shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_fragment>',
          THREE.ShaderChunk.transmission_fragment.replace('material.thickness = thickness;',
            `material.thickness = thickness * ${role === "sheet" ? '(0.35 + density * 0.65)' : '(0.75 + density * 0.35)'};`));
      }
      shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>', `
        #include <tonemapping_fragment>
        vec2 screen = gl_FragCoord.xy / uResolution;
        float frame = smoothstep(0.12,0.20,screen.y) * (1.0-smoothstep(0.67,0.77,screen.y));
        float sentenceColumn = 1.0-smoothstep(0.22,0.38,abs(screen.x-0.5));
        frame *= 1.0-sentenceColumn*smoothstep(0.60,0.66,screen.y);
        float presence = frame * uVisibility * (1.0-smoothstep(29.0,37.0,-vPilotWorld.z))
          * (1.0-smoothstep(28.0,35.0,abs(vPilotWorld.x)))
          * (1.0-smoothstep(6.0,10.0,vPilotWorld.z));
        float haze = smoothstep(7.0,32.0,-vPilotWorld.z)*0.93;
        gl_FragColor.rgb = mix(gl_FragColor.rgb,vec3(1.0),haze);
        gl_FragColor.rgb = mix(gl_FragColor.rgb,vec3(dot(gl_FragColor.rgb,vec3(0.2126,0.7152,0.0722))),uCompositionGray);
        gl_FragColor.rgb = mix(vec3(1.0),gl_FragColor.rgb,presence);
      `);
    };
    return material;
  }
  return { ground: configure(ground, "ground"), sheet: configure(sheet, "sheet"), mineral: configure(mineral, "mineral") };
}
