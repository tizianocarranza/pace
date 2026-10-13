"use client";

import { useLayoutEffect } from "react";
import * as THREE from "three";
import { PIP_FLOOR_Y } from "./pipContacts";
import { GROUND_Y } from "./environment/terrainProfile";

/* A soft mirror image of Pip in the glossy floor, without a reflection pass.
 * Each skinned mesh gets a sibling bound to the same skeleton and morph
 * weights. Its vertices are mirrored about the contact plane, then slid along
 * the camera ray onto the floor surface: the screen position is unchanged, but
 * the depth is the floor's. Pip and anything in front therefore occlude it
 * through the ordinary depth test; no stencil buffer is needed. */
const REFLECTED: Record<string, { color: string; opacity: number }> = {
  "Pip | Warm ivory matte": { color: "#cfcde6", opacity: 0.5 },
  "Pip | Soft black eyes": { color: "#3d3a55", opacity: 0.4 },
};

export function usePipReflection(scene: THREE.Group) {
  useLayoutEffect(() => {
    const mirrors: { mirror: THREE.SkinnedMesh; parent: THREE.Object3D }[] = [];
    const materials = new Map<string, THREE.MeshBasicMaterial>();
    const material = (name: string) => {
      let reflected = materials.get(name);
      if (reflected) return reflected;
      const style = REFLECTED[name];
      reflected = new THREE.MeshBasicMaterial({ name: `${name} / reflection`, color: style.color,
        transparent: true, opacity: style.opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      reflected.onBeforeCompile = shader => {
        shader.vertexShader = "varying float vMirrorDepth;\n" + shader.vertexShader.replace("#include <project_vertex>", `
          vec4 mirrorWorld = modelMatrix * vec4(transformed, 1.0);
          mirrorWorld.y = ${(2 * PIP_FLOOR_Y).toFixed(6)} - mirrorWorld.y;
          vMirrorDepth = ${PIP_FLOOR_Y.toFixed(6)} - mirrorWorld.y;
          vec3 ray = mirrorWorld.xyz - cameraPosition;
          // Just above the floor and below the contact shadow, which draws over it.
          float toFloor = (${(GROUND_Y + 0.004).toFixed(6)} - cameraPosition.y) / min(ray.y, -0.0001);
          vec4 mvPosition = viewMatrix * vec4(cameraPosition + ray * toFloor, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        `);
        shader.fragmentShader = "varying float vMirrorDepth;\n" + shader.fragmentShader.replace("#include <opaque_fragment>", `
          #include <opaque_fragment>
          // Strongest at the contact and short: a long reflection would cross
          // the bottom fade, where the floor itself has dissolved to white.
          gl_FragColor.a *= exp(-max(vMirrorDepth, 0.0) * 6.0);
        `);
      };
      materials.set(name, reflected);
      return reflected;
    };

    scene.traverse(object => {
      if (!(object instanceof THREE.SkinnedMesh) || Array.isArray(object.material)
        || !(object.material.name in REFLECTED) || !object.parent) return;
      const mirror = new THREE.SkinnedMesh(object.geometry, material(object.material.name));
      mirror.name = `${object.name}Reflection`;
      mirror.position.copy(object.position);
      mirror.quaternion.copy(object.quaternion);
      mirror.scale.copy(object.scale);
      mirror.bind(object.skeleton, object.bindMatrix);
      // Share the live morph weights so squash/stretch reflects too.
      mirror.morphTargetInfluences = object.morphTargetInfluences;
      mirror.morphTargetDictionary = object.morphTargetDictionary;
      mirror.frustumCulled = false;
      // Before the contact shadow (-1) and the transparent world.
      mirror.renderOrder = -2;
      mirrors.push({ mirror, parent: object.parent });
    });
    // Add after traversal, so the new siblings are not visited themselves.
    mirrors.forEach(({ mirror, parent }) => parent.add(mirror));

    return () => {
      mirrors.forEach(({ mirror }) => mirror.removeFromParent());
      materials.forEach(reflected => reflected.dispose());
    };
  }, [scene]);
}
