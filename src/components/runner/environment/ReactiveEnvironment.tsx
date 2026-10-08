"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type PipStatus } from "../pipMotion";
import { type PipMotionRef } from "../usePipMotion";
import { LandscapeMotion, FORMATIONS, createFormation, createTerrain, createNearBank } from "./landscape";
import { createLandscapeMaterials, formationMaterial } from "./landscapeMaterials";
import { updateLightingUniforms, type createLightingUniforms } from "./worldLighting";
import { EnvironmentDetails } from "./EnvironmentDetails";
import { FOREGROUND_RATE } from "./worldMotion";
import { WorldInteractions } from "./worldInteractions";
import { COMPOSITION_STUDIES, heightAtScreen, nearPassX } from "../composition";
import { useComposition } from "../CompositionStudy";
import { GROUND_Y } from "./terrainProfile";
import { useMaterialStudy } from "../MaterialStudy";
import { createPilotMaterials } from "./pilotMaterials";

/** A fixed window into a continuous landscape, independent of Pip's placement. */
export function ReactiveEnvironment({ motion, status }: {
  motion: PipMotionRef;
  status: PipStatus;
}) {
  const composition = useComposition();
  const materialMode = useMaterialStudy();
  const controller = useRef<LandscapeMotion | null>(null);
  const formations = useRef<THREE.Group>(null);
  const nearBanks = useRef<THREE.Group>(null);
  const terrain = useMemo(() => createTerrain(), []);
  const shapes = useMemo(() => FORMATIONS.map(createFormation), []);
  const banks = useMemo(() => [createNearBank(false), createNearBank(true)], []);
  const bankCrests = useMemo(() => banks.map(bank => {
    let crest = -Infinity;
    for (let i = 1; i < bank.positions.length; i += 3) crest = Math.max(crest, bank.positions[i]);
    return crest;
  }), [banks]);
  const interactions = useMemo(() => new WorldInteractions(), []);
  const surfaces = useMemo(() => createLandscapeMaterials(interactions), [interactions]);
  const pilot = useMemo(() => createPilotMaterials(surfaces.terrain.uniforms), [surfaces]);
  const liveUniforms = useRef<THREE.ShaderMaterial["uniforms"] | null>(null);
  useLayoutEffect(() => { liveUniforms.current = surfaces.terrain.uniforms; }, [surfaces]);
  useEffect(() => {
    for (const surface of Object.values(surfaces)) {
      surface.toneMapped = materialMode !== "current";
      surface.needsUpdate = true;
    }
  }, [surfaces, materialMode]);
  // Shared primitive materials are manually owned; R3F owns the mesh buffers.
  useEffect(() => () => {
    Object.values(surfaces).forEach(surface => surface.dispose());
    Object.values(pilot).forEach(surface => surface.dispose());
  }, [surfaces, pilot]);
  useFrame(({ size, gl, camera }, delta) => {
    const world = controller.current ?? (controller.current = new LandscapeMotion());
    world.update(delta, motion.current, status);
    interactions.update(delta, motion.current, world, status);
    if (liveUniforms.current) {
      const live = liveUniforms.current;
      live.uTravel.value = world.travel;
      live.uVisibility.value = world.visibility;
      live.uPhase.value = world.phase;
      live.uMomentum.value.set(world.intensity, world.lag);
      // Phase 1 evaluates space without optical decoration.
      live.uEnergy.value.set(0, 0, 0, 0);
      live.uCompositionGray.value = composition.gray ? 1 : 0;
      updateLightingUniforms(live as ReturnType<typeof createLightingUniforms>, world);
      const dpr = gl.getPixelRatio();
      live.uResolution.value.set(size.width * dpr, size.height * dpr);
    }
    const structures = formations.current?.children;
    if (structures) for (let i = 0; i < structures.length; i++) {
      structures[i].position.x = world.formationX(FORMATIONS[i].x);
      structures[i].scale.y = 0.78;
      structures[i].position.y = GROUND_Y * 0.22;
      if (FORMATIONS[i].kind === "stone") {
        const seed = FORMATIONS[i].x * 0.73 + FORMATIONS[i].z * 0.41;
        structures[i].position.y += (Math.sin(world.phase * 2 + seed) - Math.sin(seed)) * 0.055;
        structures[i].rotation.y = (Math.sin(world.phase + seed) - Math.sin(seed)) * 0.06;
      }
    }
    // Near banks may cross the lower silhouette. The physical lane remains at
    // z=0; projected overlap is intentional, with the eyes above the crests.
    const config = COMPOSITION_STUDIES[composition.study];
    const z = camera.position.z * config.foregroundDepth;
    const centerX = camera.position.x * config.foregroundDepth;
    const halfWidth = (camera.position.z - z) / camera.projectionMatrix.elements[0];
    const bankScale = Math.min(1.8, halfWidth / 4.7);
    const foreground = nearBanks.current?.children;
    if (foreground) for (let i = 0; i < foreground.length; i++) {
      const mesh = foreground[i];
      const heightScale = 0.85;
      const x = centerX + nearPassX(world.distance, halfWidth, 6 * bankScale,
        (i ? 1 : -1) * (halfWidth + bankScale * 0.75), FOREGROUND_RATE);
      mesh.position.set(x,
        heightAtScreen(camera as THREE.PerspectiveCamera, z, 0.69, x) - bankCrests[i] * heightScale, z);
      mesh.scale.set(bankScale, heightScale, 1);
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
        <primitive object={materialMode === "pilot" ? pilot.ground : surfaces.terrain} attach="material" />
      </mesh>
      <group ref={formations}>
        {FORMATIONS.map((form, i) => (
          <mesh key={form.name} name={form.name} position={[form.x, 0, form.z]}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[shapes[i].positions, 3]} />
              <bufferAttribute attach="attributes-normal" args={[shapes[i].normals, 3]} />
              <bufferAttribute attach="index" args={[shapes[i].indices, 1]} />
            </bufferGeometry>
            <primitive object={materialMode === "pilot" && form.name === "WesternFold" ? pilot.sheet
              : materialMode === "pilot" && form.name === "SuspendedStone" ? pilot.mineral
              : surfaces[formationMaterial(form.name, form.kind)]} attach="material" />
          </mesh>
        ))}
      </group>
      <group ref={nearBanks}>
        {banks.map((bank, i) => (
          <mesh key={i} name={i ? "NearEasternBank" : "NearWesternBank"}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[bank.positions, 3]} />
              <bufferAttribute attach="attributes-normal" args={[bank.normals, 3]} />
              <bufferAttribute attach="index" args={[bank.indices, 1]} />
            </bufferGeometry>
            <primitive object={surfaces.foreground} attach="material" />
          </mesh>
        ))}
      </group>
      <EnvironmentDetails surfaces={surfaces} world={controller} />
    </group>
  );
}
