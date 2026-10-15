import * as THREE from "three";
import { type LandscapeMotion } from "./worldMotion";

/** Shared palette and directions for Pip's real lights and the landscape shaders. */
export const WORLD_LIGHT = {
  key: { color: "#fffaf4", position: [-3.5, 5, 4] as [number, number, number] },
  warm: { color: "#ffc596", position: [-4, 2.5, -3] as [number, number, number] },
  cool: { color: "#c3d2ff", position: [4, 2, 3] as [number, number, number] },
};

// Ground bounce pools, at world x before travel. They scroll with the terrain.
const WARM_POOL = [-7.8, 0.3, -4.2] as const;
const COOL_POOL = [5.5, 0.7, -4.5] as const;
const AMBER_POOL = [2, 5.2, -12] as const;
const TRANSMITTED_OFFSET = 4.18;
const TRANSMITTED_POOL = [WARM_POOL[0] + TRANSMITTED_OFFSET, -0.6, -2.2] as const;

export function createLightingUniforms() {
  return {
    uKeyDirection: { value: new THREE.Vector3(...WORLD_LIGHT.key.position).normalize() },
    uWarmDirection: { value: new THREE.Vector3(...WORLD_LIGHT.warm.position).normalize() },
    uCoolDirection: { value: new THREE.Vector3(...WORLD_LIGHT.cool.position).normalize() },
    uWarmLight: { value: new THREE.Color(WORLD_LIGHT.warm.color) },
    uCoolLight: { value: new THREE.Color(WORLD_LIGHT.cool.color) },
    uWarmPool: { value: new THREE.Vector3(...WARM_POOL) },
    uCoolPool: { value: new THREE.Vector3(...COOL_POOL) },
    uAmberPool: { value: new THREE.Vector3(...AMBER_POOL) },
    uTransmittedPool: { value: new THREE.Vector3(...TRANSMITTED_POOL) },
  };
}

export function updateLightingUniforms(uniforms: ReturnType<typeof createLightingUniforms>, world: LandscapeMotion) {
  uniforms.uWarmPool.value.x = world.wrapX(WARM_POOL[0]);
  uniforms.uCoolPool.value.x = world.wrapX(COOL_POOL[0]);
  uniforms.uAmberPool.value.x = world.wrapX(AMBER_POOL[0]);
  uniforms.uTransmittedPool.value.x = world.wrapX(WARM_POOL[0]) + TRANSMITTED_OFFSET;
}
