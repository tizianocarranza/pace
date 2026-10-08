"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { createDetailBatches, createDetailGeometry } from "./detailClusters";
import { type createLandscapeMaterials } from "./landscapeMaterials";
import { FRAGMENT_RATE, type LandscapeMotion } from "./worldMotion";
import { COMPOSITION_STUDIES, heightAtScreen, nearPassX } from "../composition";
import { useComposition } from "../CompositionStudy";

export function EnvironmentDetails({ surfaces, world }: {
  surfaces: ReturnType<typeof createLandscapeMaterials>;
  world: RefObject<LandscapeMotion | null>;
}) {
  const composition = useComposition();
  const instances = useRef<THREE.Group>(null);
  const closeFragment = useRef<THREE.Mesh>(null);
  const batches = useMemo(() => createDetailBatches(), []);
  const geometries = useMemo(() => {
    const make = (shape: Parameters<typeof createDetailGeometry>[0]) => {
      const data = createDetailGeometry(shape);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geometry.setAttribute("detailGrounded", new THREE.BufferAttribute(
        new Float32Array(data.positions.length / 3).fill(shape === "mineral" ? 0 : 1), 1));
      return geometry;
    };
    return { mineral: make("mineral"), sheet: make("sheet"), lens: make("lens"), filament: make("filament") };
  }, []);
  const instancedGeometry = useMemo(() => batches.map(batch => {
    const shared = geometries[batch.shape];
    const geometry = new THREE.BufferGeometry();
    // Attribute buffers are shared. Only the tiny per-instance motion metadata differs.
    for (const name of Object.keys(shared.attributes)) geometry.setAttribute(name, shared.getAttribute(name));
    geometry.setIndex(shared.index);
    geometry.setAttribute("detailMotion", new THREE.InstancedBufferAttribute(batch.motion, 2));
    return geometry;
  }), [batches, geometries]);
  useLayoutEffect(() => {
    const meshes = (instances.current?.children ?? []) as THREE.InstancedMesh[];
    meshes.forEach((mesh, i) => {
      mesh.instanceMatrix.array.set(batches[i].matrices);
      mesh.instanceMatrix.needsUpdate = true;
    });
    // dispose={null} protects shared geometry/materials, so release the instance
    // buffers explicitly (InstancedMesh.dispose does not dispose either shared resource).
    return () => meshes.forEach(mesh => mesh.dispose());
  }, [batches]);
  useEffect(() => () => {
    Object.values(geometries).forEach(geometry => geometry.dispose());
    instancedGeometry.forEach(geometry => geometry.dispose());
  }, [geometries, instancedGeometry]);
  useFrame(({ camera }) => {
    if (!closeFragment.current || !world.current) return;
    const config = COMPOSITION_STUDIES[composition.study];
    const z = camera.position.z * config.foregroundDepth;
    const depth = camera.position.z - z;
    const halfWidth = depth / camera.projectionMatrix.elements[0];
    const scale = Math.min(1, halfWidth / 9);
    const x = camera.position.x * config.foregroundDepth + nearPassX(world.current.distance, halfWidth, 3 * scale,
      -halfWidth - 0.15 * scale, FRAGMENT_RATE);
    closeFragment.current.position.set(x, heightAtScreen(camera as THREE.PerspectiveCamera, z, 0.47, x), z);
    closeFragment.current.scale.set(1.5 * scale, 0.9 * scale, 0.8 * scale);
  });
  return (
    <group name="EnvironmentalDetails">
      <group ref={instances}>
        {batches.map((batch, i) => (
          <instancedMesh key={batch.name} name={batch.name}
            args={[instancedGeometry[i], surfaces[batch.finish], batch.matrices.length / 16]}
            frustumCulled={false} dispose={null} />
        ))}
      </group>
      <mesh ref={closeFragment} name="NearMineralFragment" rotation={[0.3, -0.45, -0.2]}
        geometry={geometries.mineral} material={surfaces.foreground} dispose={null} />
    </group>
  );
}
