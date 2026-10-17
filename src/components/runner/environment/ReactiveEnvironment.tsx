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
import { GenesisCore } from "./GenesisCore";
import { WorldGenesis } from "./worldGenesis";
import { genesisStage } from "./genesisStage";
import { PAGE_COLOR, sceneTheme } from "./sceneTheme";

/** The big bang's core (Pip's spot, body height), projected for the page each frame. */
const genesisCore = new THREE.Vector3();
import { worldTone } from "./worldTone";

/** A fixed window into a continuous landscape, independent of Pip's placement. */
export function ReactiveEnvironment({ motion, status }: {
  motion: PipMotionRef;
  status: PipStatus;
}) {
  const energy = useMemo(() => new WorldEnergy(), []);
  const genesis = useMemo(() => new WorldGenesis(), []);
  const controller = useRef<LandscapeMotion | null>(null);
  const terrain = useMemo(() => createTerrain(), []);
  const interactions = useMemo(() => new WorldInteractions(), []);
  const surfaces = useMemo(() => createLandscapeMaterials(interactions), [interactions]);
  const liveUniforms = useRef<THREE.ShaderMaterial["uniforms"] | null>(null);
  const ground = useRef<THREE.Mesh>(null);
  useLayoutEffect(() => { liveUniforms.current = surfaces.terrain.uniforms; }, [surfaces]);
  // Shared primitive materials are manually owned; R3F owns the mesh buffers.
  useEffect(() => () => Object.values(surfaces).forEach(surface => surface.dispose()), [surfaces]);
  // The world is gone: its warmth no longer applies to the orb.
  useEffect(() => () => worldTone.publish(0), []);
  useFrame(({ size, gl, camera }, delta) => {
    const world = controller.current ?? (controller.current = new LandscapeMotion());
    world.update(delta, motion.current, status);
    interactions.update(delta, motion.current, world, status);
    energy.update(delta, motion.current, world, status);
    genesis.update(delta, motion.current, status);
    // The page expands with the ground: same clock and curve, centered on the core on
    // screen (the canvas fills the viewport), reaching its farthest corner as the ground
    // reaches its edges (progress ≈ 0.75).
    genesisCore.set(0, 0.45, 0).project(camera);
    const x = (genesisCore.x * 0.5 + 0.5) * size.width;
    const y = (0.5 - genesisCore.y * 0.5) * size.height;
    const reach = Math.max(Math.hypot(x, y), Math.hypot(size.width - x, y),
      Math.hypot(x, size.height - y), Math.hypot(size.width - x, size.height - y));
    genesisStage.publish(genesis.arrivals, genesis.expanding, x, y, genesis.progress * reach / 0.75);
    if (liveUniforms.current) {
      const live = liveUniforms.current;
      live.uTravel.value = world.travel;
      live.uVisibility.value = world.visibility;
      live.uEnergy.value.copy(energy.value);
      live.uEnergyPhase.value = energy.phase;
      live.uEnergyTier.value = energy.tier;
      live.uTrailTravel.value = energy.trailDistance;
      live.uGenesis.value.copy(genesis.value);
      live.uNight.value = sceneTheme.night;
      live.uPage.value.lerpColors(PAGE_COLOR.day, PAGE_COLOR.night, sceneTheme.night);
      worldTone.publish(energy.value.y);
      updateLightingUniforms(live as ReturnType<typeof createLightingUniforms>, world);
      const dpr = gl.getPixelRatio();
      live.uResolution.value.set(size.width * dpr, size.height * dpr);
      // Faded out (finish, results) or not yet born (radius ≤ 0): every fragment would be
      // exactly the page color, which the scene background already is. Skip the draw.
      if (ground.current) ground.current.visible = world.visibility > 0 && genesis.value.x > 0;
    }
  }, -0.5);

  return (
    <group name="PaceLandscape">
      <mesh ref={ground} name="ContinuousTerrain" frustumCulled={false}>
        {/* R3F owns and disposes these declarative resources. */}
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[terrain.positions, 3]} />
          <bufferAttribute attach="attributes-normal" args={[terrain.normals, 3]} />
          <bufferAttribute attach="index" args={[terrain.indices, 1]} />
        </bufferGeometry>
        <primitive object={surfaces.terrain} attach="material" />
      </mesh>
      <LightTrails surfaces={surfaces} />
      <GenesisCore surfaces={surfaces} genesis={genesis} />
    </group>
  );
}
