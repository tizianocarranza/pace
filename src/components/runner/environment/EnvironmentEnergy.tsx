"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Mesh, ShaderMaterial, Vector4 } from "three";
import { type createLandscapeMaterials } from "./landscapeMaterials";
import { createEnergyGeometry } from "./energyGeometry";
import { energyFragment, energyVertex } from "./energyShaders";

/** One draw, no textures/targets, with the landscape's shared mutable uniforms. */
export function EnvironmentEnergy({ surfaces, enabled = true }: { surfaces: ReturnType<typeof createLandscapeMaterials>; enabled?: boolean }) {
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => createEnergyGeometry(), []);
  const material = useMemo(() => {
    const material = new ShaderMaterial({
    name: "Pace / passing light",
    uniforms: surfaces.terrain.uniforms,
    vertexShader: energyVertex, fragmentShader: energyFragment,
    transparent: true, depthWrite: false, side: DoubleSide,
    forceSinglePass: true, toneMapped: true,
    });
    const viewport = new Vector4();
    material.onBeforeRender = renderer => {
      renderer.getCurrentViewport(viewport);
      material.uniforms.uResolution.value.set(viewport.z, viewport.w);
      material.uniformsNeedUpdate = true;
    };
    return material;
  }, [surfaces]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(() => {
    // Skip the entire batch once its continuous fade is imperceptible.
    if (mesh.current) mesh.current.visible = enabled && material.uniforms.uEnergy.value.x > 0.0001;
  });
  return <mesh ref={mesh} name="WorldPassingLight" geometry={geometry} material={material}
    frustumCulled={false} dispose={null} />;
}
