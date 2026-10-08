import * as THREE from "three";
import { landscapeFragment, landscapeVertex } from "./landscapeShaders";
import { createLightingUniforms } from "./worldLighting";
import { WorldInteractions } from "./worldInteractions";

/** Shared finishes; the authored placement reserves warmth for a few related accents. */
export function createLandscapeMaterials(interactions = new WorldInteractions()) {
  const uniforms = {
    ...createLightingUniforms(),
    uTravel: { value: 0 }, uVisibility: { value: 1 },
    uPhase: { value: 0 }, uMomentum: { value: new THREE.Vector2() },
    uEnergy: { value: new THREE.Vector4() }, uEnergyPhase: { value: 0 },
    uCompositionGray: { value: 0 },
    uImpulses: { value: interactions.packed }, uImpulseParameters: { value: interactions.parameters },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPearl: { value: new THREE.Color("#eef0f8") },
    uBlue: { value: new THREE.Color("#487fbe") },
    uViolet: { value: new THREE.Color("#ac96d9") },
    uDeep: { value: new THREE.Color("#2b527e") },
    uWarm: { value: new THREE.Color("#f0ac72") },
  };
  function surface(name: string, kind: number, warm = false) {
    const translucent = kind === 1 || kind === 2;
    const material = new THREE.ShaderMaterial({
      name, uniforms, vertexShader: landscapeVertex, fragmentShader: landscapeFragment,
      defines: {
        MATERIAL_KIND: kind,
        ...(kind === 0 ? { TERRAIN: 1 } : {}),
        ...(kind === 4 ? { FOREGROUND: 1 } : {}),
        ...(warm ? { WARM_ACCENT: 1 } : {}),
      },
      side: kind === 0 ? THREE.FrontSide : THREE.DoubleSide,
      transparent: translucent,
      depthWrite: !translucent,
      // Thin sheets and approximate mineral transmission need no back-face render pass.
      forceSinglePass: true,
      toneMapped: false,
    });
    const viewport = new THREE.Vector4();
    material.onBeforeRender = renderer => {
      // The native transmission capture uses a smaller viewport than the canvas.
      renderer.getCurrentViewport(viewport);
      uniforms.uResolution.value.set(viewport.z, viewport.w);
      material.uniformsNeedUpdate = true;
    };
    return material;
  }
  return {
    terrain: surface("Pace / pearl ground", 0),
    fold: surface("Pace / cool satin resin", 1),
    warmFold: surface("Pace / peach satin resin", 1, true),
    arch: surface("Pace / blue mineral", 2),
    stone: surface("Pace / polished mineral", 3),
    warmStone: surface("Pace / amber pearl", 3, true),
    foreground: surface("Pace / near pearl", 4),
  };
}

export function formationMaterial(name: string, kind: "fold" | "arch" | "stone") {
  if (name === "WesternFold") return "warmFold";
  if (name === "DistantStone") return "warmStone";
  return kind;
}
