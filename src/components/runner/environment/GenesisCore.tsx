"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { NormalBlending, Points, ShaderMaterial } from "three";
import { RENDER_ORDER, type createLandscapeMaterials } from "./landscapeMaterials";
import { createGenesisGeometry, genesisFragment, genesisVertex } from "./genesisShaders";
import { type WorldGenesis } from "./worldGenesis";

/** The big bang's core: one point, drawn only while the intro plays. */
export function GenesisCore({ surfaces, genesis }: {
  surfaces: ReturnType<typeof createLandscapeMaterials>;
  genesis: WorldGenesis;
}) {
  const points = useRef<Points>(null);
  const geometry = useMemo(() => createGenesisGeometry(), []);
  const material = useMemo(() => new ShaderMaterial({
    name: "Pace / genesis core",
    uniforms: surfaces.terrain.uniforms,
    vertexShader: genesisVertex, fragmentShader: genesisFragment,
    transparent: true, depthWrite: false, blending: NormalBlending,
    forceSinglePass: true, toneMapped: true,
  }), [surfaces]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(() => {
    // Outside the intro the batch skips its draw entirely.
    if (points.current) points.current.visible = genesis.active;
  });
  return <points ref={points} name="WorldGenesisCore" geometry={geometry} material={material}
    renderOrder={RENDER_ORDER.genesis} frustumCulled={false} visible={false} dispose={null} />;
}
