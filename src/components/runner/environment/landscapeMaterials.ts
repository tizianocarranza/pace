import * as THREE from "three";
import { landscapeFragment, landscapeVertex } from "./landscapeShaders";
import { createLightingUniforms } from "./worldLighting";
import { WorldInteractions } from "./worldInteractions";

/** Transparent world surfaces draw last: the light trails, then the intro's big bang core. */
export const RENDER_ORDER = { light: 4, genesis: 5 } as const;

/** The pearl ground, plus the uniforms the light trails share with it. */
export function createLandscapeMaterials(interactions = new WorldInteractions()) {
  const uniforms = {
    ...createLightingUniforms(),
    uTravel: { value: 0 }, uVisibility: { value: 1 },
    // The intro's big bang (worldGenesis.ts); the resting value is a complete world.
    uGenesis: { value: new THREE.Vector4(1e4, 0, -1, 0) },
    uEnergy: { value: new THREE.Vector4() }, uEnergyPhase: { value: 0 },
    uEnergyTier: { value: 0 }, uTrailTravel: { value: 0 },
    uImpulses: { value: interactions.packed }, uImpulseParameters: { value: interactions.parameters },
    uResolution: { value: new THREE.Vector2(1, 1) },
    // High-key field with saturated cobalt, periwinkle and peach accents.
    uPearl: { value: new THREE.Color("#f6f7fd") },
    uBlue: { value: new THREE.Color("#4a74e6") },
    uViolet: { value: new THREE.Color("#a493f2") },
    uWarm: { value: new THREE.Color("#f79a5c") },
  };
  return {
    terrain: new THREE.ShaderMaterial({
      name: "Pace / pearl ground", uniforms,
      vertexShader: landscapeVertex, fragmentShader: landscapeFragment,
      // Untonemapped on purpose: the lighter, better modelled production floor.
      toneMapped: false,
    }),
  };
}
