"use client";

import { useLayoutEffect } from "react";
import * as THREE from "three";

/** A small surface adjustment; the cached GLB's materials stay reusable. */
export function usePipSurface(scene: THREE.Group) {
  useLayoutEffect(() => {
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const surfaces = new Map<THREE.Material, THREE.MeshPhysicalMaterial>();

    const refine = (source: THREE.Material) => {
      if (!(source instanceof THREE.MeshPhysicalMaterial)
        || source.name !== "Pip | Warm ivory matte") return source;

      let surface = surfaces.get(source);
      if (!surface) {
        surface = source.clone();
        // Preserve the ivory albedo. Two very rough, restrained specular lobes
        // suggest a soft-touch surface without a shiny coating or texture.
        surface.roughness = 0.76;
        surface.ior = 1.46;
        surface.specularIntensity = 0.48;
        surface.clearcoat = 0.045;
        surface.clearcoatRoughness = 0.85;
        surface.dithering = true;
        surfaces.set(source, surface);
      }
      return surface;
    };

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const original = object.material;
      const refined = Array.isArray(original) ? original.map(refine) : refine(original);
      if (refined === original) return;
      originals.set(object, original);
      object.material = refined;
    });

    return () => {
      for (const [mesh, material] of originals) mesh.material = material;
      for (const material of surfaces.values()) material.dispose();
    };
  }, [scene]);
}
