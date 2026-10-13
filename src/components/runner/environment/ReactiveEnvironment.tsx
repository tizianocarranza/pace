"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type PipStatus } from "../pipMotion";
import { type PipMotionRef } from "../usePipMotion";
import { LandscapeMotion, FORMATIONS, FORMATION_HEIGHT_SCALE, createFormation, createTerrain, createNearBank } from "./landscape";
import { createLandscapeMaterials, formationMaterial, hasTranslucentDepth, RENDER_ORDER } from "./landscapeMaterials";
import { updateLightingUniforms, type createLightingUniforms } from "./worldLighting";
import { EnvironmentDetails } from "./EnvironmentDetails";
import { FOREGROUND_RATE } from "./worldMotion";
import { WorldInteractions } from "./worldInteractions";
import { COMPOSITION_STUDIES, heightAtScreen, nearPassX } from "../composition";
import { useComposition } from "../CompositionStudy";
import { GROUND_Y } from "./terrainProfile";
import { useMaterialStudy } from "../MaterialStudy";
import { createPilotMaterials } from "./pilotMaterials";
import { LayeredOptics, createOpticalUniforms } from "./LayeredOptics";
import { useAtmosphere } from "../AtmosphereStudy";
import { useEnergySelection } from "../EnergyStudy";
import { WorldEnergy } from "./worldEnergy";
import { EnvironmentEnergy } from "./EnvironmentEnergy";
import { LightTrails } from "./LightTrails";

/** A fixed window into a continuous landscape, independent of Pip's placement. */
export function ReactiveEnvironment({ motion, status }: {
  motion: PipMotionRef;
  status: PipStatus;
}) {
  const composition = useComposition();
  const materialMode = useMaterialStudy();
  const atmosphere = useAtmosphere();
  const energyMode = useEnergySelection();
  const energy = useMemo(() => new WorldEnergy(), []);
  const controller = useRef<LandscapeMotion | null>(null);
  const formations = useRef<THREE.Group>(null);
  const nearBanks = useRef<THREE.Group>(null);
  const terrain = useMemo(() => createTerrain(), []);
  const shapes = useMemo(() => FORMATIONS.map(createFormation), []);
  // Shared by each formation and its translucent depth twin, so owned here.
  const formationGeometry = useMemo(() => shapes.map(shape => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(shape.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(shape.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(shape.indices, 1));
    return geometry;
  }), [shapes]);
  useEffect(() => () => formationGeometry.forEach(geometry => geometry.dispose()), [formationGeometry]);
  const banks = useMemo(() => [createNearBank(false), createNearBank(true)], []);
  const bankCrests = useMemo(() => banks.map(bank => {
    let crest = -Infinity;
    for (let i = 1; i < bank.positions.length; i += 3) crest = Math.max(crest, bank.positions[i]);
    return crest;
  }), [banks]);
  const interactions = useMemo(() => new WorldInteractions(), []);
  const surfaces = useMemo(() => createLandscapeMaterials(interactions), [interactions]);
  const optics = useMemo(() => createOpticalUniforms(), []);
  const pilot = useMemo(() => createPilotMaterials(surfaces.terrain.uniforms, optics), [surfaces, optics]);
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
    energy.update(delta, motion.current, world, status);
    if (liveUniforms.current) {
      const live = liveUniforms.current;
      live.uTravel.value = world.travel;
      live.uVisibility.value = world.visibility;
      live.uPhase.value = world.phase;
      live.uMomentum.value.set(world.intensity, world.lag);
      live.uEnergy.value.copy(energy.value);
      if (energyMode === "off" || composition.gray) live.uEnergy.value.set(0, 0, 0, 0);
      live.uEnergyPhase.value = energy.phase;
      live.uCompositionGray.value = composition.gray ? 1 : 0;
      live.uAtmosphere.value = atmosphere === "off" ? 0 : 1;
      updateLightingUniforms(live as ReturnType<typeof createLightingUniforms>, world);
      const dpr = gl.getPixelRatio();
      live.uResolution.value.set(size.width * dpr, size.height * dpr);
    }
    const structures = formations.current?.children;
    if (structures) for (let i = 0; i < structures.length; i++) {
      structures[i].position.x = world.formationX(FORMATIONS[i].x);
      structures[i].scale.y = FORMATION_HEIGHT_SCALE;
      structures[i].position.y = GROUND_Y * (1 - FORMATION_HEIGHT_SCALE);
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
        (i ? 1 : -1) * (halfWidth + bankScale * 0.75), i ? FOREGROUND_RATE * 0.91 : FOREGROUND_RATE);
      mesh.position.set(x,
        heightAtScreen(camera as THREE.PerspectiveCamera, z, 0.69, x) - bankCrests[i] * heightScale, z);
      mesh.scale.set(bankScale, heightScale, 1);
    }
  }, -0.5);

  return (
    <group name="PaceLandscape">
      <LayeredOptics uniforms={optics} nearCapture={surfaces.terrain.uniforms.uNearCapture} />
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
        {FORMATIONS.map((form, i) => {
          const finish = formationMaterial(form.name, form.kind);
          const optical = materialMode !== "pilot" ? null
            : form.name === "WesternFold" ? pilot.sheet : form.name === "SuspendedStone" ? pilot.mineral : null;
          const layered = !optical && hasTranslucentDepth(finish);
          return (
            <mesh key={form.name} name={form.name} position={[form.x, 0, form.z]}
              geometry={formationGeometry[i]} renderOrder={layered ? RENDER_ORDER.translucent : 0} dispose={null}>
              <primitive object={optical ?? surfaces[finish]} attach="material" />
              {layered && (
                <mesh name={`${form.name} depth`} geometry={formationGeometry[i]} material={surfaces.translucentDepth}
                  renderOrder={RENDER_ORDER.translucentDepth} dispose={null} />
              )}
            </mesh>
          );
        })}
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
      <EnvironmentEnergy surfaces={surfaces} enabled={energyMode === "on" && !composition.gray} />
      <LightTrails surfaces={surfaces} enabled={energyMode === "on" && !composition.gray} />
    </group>
  );
}
