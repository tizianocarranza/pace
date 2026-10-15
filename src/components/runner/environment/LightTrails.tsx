"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, Mesh, ShaderMaterial } from "three";
import { RENDER_ORDER, type createLandscapeMaterials } from "./landscapeMaterials";
import { createTrailGeometry, trailFragment, trailVertex } from "./trailShaders";

/** Ground-level light streaks: one draw, no textures/targets, shared uniforms. */
export function LightTrails({ surfaces }: { surfaces: ReturnType<typeof createLandscapeMaterials> }) {
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => createTrailGeometry(), []);
  const material = useMemo(() => new ShaderMaterial({
    name: "Pace / light trails",
    uniforms: surfaces.terrain.uniforms,
    vertexShader: trailVertex, fragmentShader: trailFragment,
    transparent: true, depthWrite: false, side: DoubleSide,
    forceSinglePass: true, toneMapped: true,
  }), [surfaces]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(() => {
    // Idle and coasting-to-stop skip the draw entirely.
    if (mesh.current) mesh.current.visible = material.uniforms.uEnergy.value.x > 0.0001;
  });
  return <mesh ref={mesh} name="WorldLightTrails" geometry={geometry} material={material}
    renderOrder={RENDER_ORDER.light} frustumCulled={false} dispose={null} />;
}
