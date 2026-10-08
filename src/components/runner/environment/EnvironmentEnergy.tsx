"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Mesh, ShaderMaterial } from "three";
import { type createLandscapeMaterials } from "./landscapeMaterials";
import { createEnergyGeometry } from "./energyGeometry";
import { energyFragment, energyVertex } from "./energyShaders";

/** One draw, no textures/targets, with the landscape's shared mutable uniforms. */
export function EnvironmentEnergy({ surfaces }: { surfaces: ReturnType<typeof createLandscapeMaterials> }) {
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => createEnergyGeometry(), []);
  const material = useMemo(() => new ShaderMaterial({
    name: "Pace / passing light",
    uniforms: surfaces.terrain.uniforms,
    vertexShader: energyVertex, fragmentShader: energyFragment,
    transparent: true, depthWrite: false, side: DoubleSide,
    forceSinglePass: true, toneMapped: false,
  }), [surfaces]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(() => {
    // Skip the entire batch once its continuous fade is imperceptible.
    if (mesh.current) mesh.current.visible = material.uniforms.uEnergy.value.x > 0.0001;
  });
  return <mesh ref={mesh} name="WorldPassingLight" geometry={geometry} material={material}
    frustumCulled={false} dispose={null} />;
}
