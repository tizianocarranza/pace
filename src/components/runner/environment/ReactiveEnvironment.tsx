"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type PipStatus } from "../pipMotion";
import { type PipMotionRef } from "../usePipMotion";
import { LandscapeMotion, createTerrain } from "./landscape";
import { createLandscapeMaterials } from "./landscapeMaterials";
import { updateLightingUniforms, type createLightingUniforms } from "./worldLighting";
import { WorldInteractions } from "./worldInteractions";
import { WorldEnergy } from "./worldEnergy";
import { LightTrails } from "./LightTrails";

/** A fixed window into a continuous landscape, independent of Pip's placement. */
export function ReactiveEnvironment({ motion, status }: {
  motion: PipMotionRef;
  status: PipStatus;
}) {
  const energy = useMemo(() => new WorldEnergy(), []);
  const controller = useRef<LandscapeMotion | null>(null);
  const terrain = useMemo(() => createTerrain(), []);
  const interactions = useMemo(() => new WorldInteractions(), []);
  const surfaces = useMemo(() => createLandscapeMaterials(interactions), [interactions]);
  const liveUniforms = useRef<THREE.ShaderMaterial["uniforms"] | null>(null);
  useLayoutEffect(() => { liveUniforms.current = surfaces.terrain.uniforms; }, [surfaces]);
  // Shared primitive materials are manually owned; R3F owns the mesh buffers.
  useEffect(() => () => Object.values(surfaces).forEach(surface => surface.dispose()), [surfaces]);
  useFrame(({ size, gl }, delta) => {
    const world = controller.current ?? (controller.current = new LandscapeMotion());
    world.update(delta, motion.current, status);
    interactions.update(delta, motion.current, world, status);
    energy.update(delta, motion.current, world, status);
    if (liveUniforms.current) {
      const live = liveUniforms.current;
      live.uTravel.value = world.travel;
      live.uVisibility.value = world.visibility;
      live.uEnergy.value.copy(energy.value);
      live.uEnergyPhase.value = energy.phase;
      live.uEnergyTier.value = energy.tier;
      live.uTrailTravel.value = energy.trailDistance;
      updateLightingUniforms(live as ReturnType<typeof createLightingUniforms>, world);
      const dpr = gl.getPixelRatio();
      live.uResolution.value.set(size.width * dpr, size.height * dpr);
    }
  }, -0.5);

  return (
    <group name="PaceLandscape">
      <mesh name="ContinuousTerrain" frustumCulled={false}>
        {/* R3F owns and disposes these declarative resources. */}
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[terrain.positions, 3]} />
          <bufferAttribute attach="attributes-normal" args={[terrain.normals, 3]} />
          <bufferAttribute attach="index" args={[terrain.indices, 1]} />
        </bufferGeometry>
        <primitive object={surfaces.terrain} attach="material" />
      </mesh>
      <LightTrails surfaces={surfaces} />
    </group>
  );
}
