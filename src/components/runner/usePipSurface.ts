"use client";

import { useLayoutEffect } from "react";
import * as THREE from "three";
import { type PipFace } from "./pipFace";

/** A small surface adjustment; the cached GLB's materials stay reusable. */
export function usePipSurface(scene: THREE.Group, face: PipFace) {
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
          // Soft white vinyl: the GLB's ivory albedo read beige against the pale
          // world. Two very rough, restrained specular lobes suggest a soft-touch
          // surface without a shiny coating or texture.
          surface.color.set("#f7f4f1");
          // Soft vinyl scatters light inside, so its shadows never sink to grey.
          // A faint lavender lift stands in for that (and the world's bounce).
          surface.emissive.set("#ebe8f7");
          surface.emissiveIntensity = 0.2;
          surface.roughness = 0.76;
          surface.ior = 1.46;
          surface.specularIntensity = 0.48;
          surface.clearcoat = 0.045;
          surface.clearcoatRoughness = 0.85;
          // A faint cool sheen at grazing angles reads as soft, slightly
          // translucent vinyl rather than chalk.
          surface.sheen = 0.6;
          surface.sheenRoughness = 0.7;
          surface.sheenColor.set("#e2dcff");
          // The studio's orange card otherwise tints the back of Pip cream. Keep
          // enough of its hue that the shadows take the world's lavender bounce.
          surface.onBeforeCompile = shader => {
            shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_maps>", `
              #include <lights_fragment_maps>
              iblIrradiance = mix(iblIrradiance, vec3(dot(iblIrradiance, vec3(0.2126, 0.7152, 0.0722))), 0.3);
            `);
          };
          surface.customProgramCacheKey = () => "pip-body-v3";
        } else {
          // Glossy eyes pick up a small, sharp highlight from the studio key.
          surface.roughness = 0.12;
          surface.clearcoat = 1;
          surface.clearcoatRoughness = 0.04;
          // Blinks and expressions scale each eye about its own center before
          // skinning, so the eyes still ride the body bone.
          surface.onBeforeCompile = shader => {
            shader.uniforms.uEyeOpen = face.uEyeOpen;
            shader.uniforms.uEyeWidth = face.uEyeWidth;
            shader.vertexShader = "attribute vec3 pipEyeCenter;\nuniform float uEyeOpen;\nuniform float uEyeWidth;\n"
              + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
                transformed = pipEyeCenter + (transformed - pipEyeCenter) * vec3(uEyeWidth, uEyeOpen, uEyeWidth);`);
          };
          surface.customProgramCacheKey = () => "pip-eyes-v1";
        }
        surface.dithering = true;
        surfaces.set(source, surface);
      }
      return surface;
    };

    const eyeGeometries: THREE.BufferGeometry[] = [];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const original = object.material;
      const refined = Array.isArray(original) ? original.map(refine) : refine(original);
      if (refined === original) return;
      originals.set(object, original);
      object.material = refined;
      if (!Array.isArray(original) && original.name === "Pip | Soft black eyes") {
        // The eye shader scales about this per-vertex center (bind space).
        const geometry: THREE.BufferGeometry = object.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
        const count = geometry.getAttribute("position").count;
        const centers = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) center.toArray(centers, i * 3);
        geometry.setAttribute("pipEyeCenter", new THREE.BufferAttribute(centers, 3));
        eyeGeometries.push(geometry);
      }
    });

    return () => {
      for (const [mesh, material] of originals) mesh.material = material;
      for (const material of surfaces.values()) material.dispose();
      // The geometry belongs to the cached GLB; leave it as it was loaded.
      for (const geometry of eyeGeometries) geometry.deleteAttribute("pipEyeCenter");
    };
  }, [scene, face]);
}
