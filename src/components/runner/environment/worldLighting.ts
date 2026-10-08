import * as THREE from "three";
import { FORMATIONS, type LandscapeMotion } from "./landscape";

/** Shared palette and directions for Pip's real lights and the landscape shaders. */
export const WORLD_LIGHT = {
  ambient: 1.38,
  key: { color: "#fffaf4", intensity: 1.95, position: [-3.5, 5, 4] as [number, number, number] },
  warm: { color: "#ffd5b4", intensity: 0.32, position: [-4, 2.5, -3] as [number, number, number] },
  cool: { color: "#d7e3ff", intensity: 0.38, position: [4, 2, 3] as [number, number, number] },
};

// Bounce sources belong to existing world objects; no new emitters/meshes or particles.
const warmFold = FORMATIONS.find(form => form.name === "WesternFold")!;
const coolArch = FORMATIONS.find(form => form.name === "EasternBridge")!;
const amberStone = FORMATIONS.find(form => form.name === "DistantStone")!;

export function createLightingUniforms() {
  return {
    uKeyDirection: { value: new THREE.Vector3(...WORLD_LIGHT.key.position).normalize() },
    uWarmDirection: { value: new THREE.Vector3(...WORLD_LIGHT.warm.position).normalize() },
    uCoolDirection: { value: new THREE.Vector3(...WORLD_LIGHT.cool.position).normalize() },
    uWarmLight: { value: new THREE.Color(WORLD_LIGHT.warm.color) },
    uCoolLight: { value: new THREE.Color(WORLD_LIGHT.cool.color) },
    uWarmPool: { value: new THREE.Vector3(warmFold.x, 0.3, warmFold.z) },
    uCoolPool: { value: new THREE.Vector3(coolArch.x, 0.7, coolArch.z) },
    uAmberPool: { value: new THREE.Vector3(amberStone.x, amberStone.lift, amberStone.z) },
    uTransmittedPool: { value: new THREE.Vector3(warmFold.x + warmFold.width * 0.38, -0.6, warmFold.z + 2.0) },
  };
}

export function updateLightingUniforms(uniforms: ReturnType<typeof createLightingUniforms>, world: LandscapeMotion) {
  uniforms.uWarmPool.value.x = world.formationX(warmFold.x);
  uniforms.uCoolPool.value.x = world.formationX(coolArch.x);
  uniforms.uAmberPool.value.x = world.formationX(amberStone.x);
  uniforms.uTransmittedPool.value.x = world.formationX(warmFold.x) + warmFold.width * 0.38;
}
