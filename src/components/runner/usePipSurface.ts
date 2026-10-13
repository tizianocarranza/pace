"use client";

import { useLayoutEffect } from "react";
import * as THREE from "three";

/** A small surface adjustment; the cached GLB's materials stay reusable. */
export function usePipSurface(scene: THREE.Group) {
  useLayoutEffect(() => {
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const surfaces = new Map<THREE.Material, THREE.MeshPhysicalMaterial>();

    const refine = (source: THREE.Material) => {
      if (!(source instanceof THREE.MeshPhysicalMaterial)) return source;
      const body = source.name === "Pip | Warm ivory matte";
      const eyes = source.name === "Pip | Soft black eyes";
      if (!body && !eyes) return source;

      let surface = surfaces.get(source);
      if (!surface) {
        surface = source.clone();
        if (body) {
          // Preserve the ivory albedo. Two very rough, restrained specular lobes
          // suggest a soft-touch surface without a shiny coating or texture.
          surface.roughness = 0.76;
          surface.ior = 1.46;
          surface.specularIntensity = 0.48;
          surface.clearcoat = 0.045;
          surface.clearcoatRoughness = 0.85;
          // A faint cool sheen at grazing angles reads as soft, slightly
          // translucent vinyl rather than chalk.
          surface.sheen = 0.45;
          surface.sheenRoughness = 0.75;
          surface.sheenColor.set("#ece6ff");
          // The studio's orange card otherwise tints the back of Pip cream.
          // Keep its hue as a hint; Pip should read white.
          surface.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_maps>", `
              #include <lights_fragment_maps>
              iblIrradiance = mix(iblIrradiance, vec3(dot(iblIrradiance, vec3(0.2126, 0.7152, 0.0722))), 0.65);
            `);
          };
          surface.customProgramCacheKey = () => "pip-body-v2";
        } else {
          // Glossy eyes pick up a small, sharp highlight from the studio key.
          surface.roughness = 0.12;
          surface.clearcoat = 1;
          surface.clearcoatRoughness = 0.04;
        }
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
