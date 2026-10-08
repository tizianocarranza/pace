"use client";

/* R3F scene/renderer objects are mutable GPU resources, not React state.
 * Effects own these changes and restore their previous settings on cleanup. */
/* eslint-disable react-hooks/immutability */

import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useMaterialStudy } from "../MaterialStudy";

/** Linear HDR studio illumination; no downloaded HDRI and no visible sky geometry. */
export function createStudioTexture() {
  const width = 512, height = 256;
  const pixels = new Float32Array(width * height * 4);
  const cards = [
    { direction: new THREE.Vector3(-3.5, 5, 4).normalize(), color: new THREE.Color(1, 0.94, 0.85), power: 5.5, spread: 0.10 },
    { direction: new THREE.Vector3(3, 1.4, 2).normalize(), color: new THREE.Color(0.19, 0.42, 1), power: 2.6, spread: 0.16 },
    { direction: new THREE.Vector3(-3, 0.6, -2).normalize(), color: new THREE.Color(1, 0.39, 0.12), power: 3.4, spread: 0.13 },
    { direction: new THREE.Vector3(1, 2.8, -4).normalize(), color: new THREE.Color(0.57, 0.38, 0.95), power: 1.8, spread: 0.24 },
    { direction: new THREE.Vector3(0.1, 3, -0.2).normalize(), color: new THREE.Color(1, 1, 1), power: 3.2, spread: 0.035 },
  ];
  const direction = new THREE.Vector3();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const latitude = ((y + 0.5) / height - 0.5) * Math.PI;
    const longitude = ((x + 0.5) / width - 0.5) * Math.PI * 2;
    direction.set(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude));
    const offset = (y * width + x) * 4;
    const base = 0.18 + 0.13 * Math.max(0, direction.y);
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = base;
    for (const card of cards) {
      const light = Math.exp((direction.dot(card.direction) - 1) / card.spread) * card.power;
      pixels[offset] += card.color.r * light;
      pixels[offset + 1] += card.color.g * light;
      pixels[offset + 2] += card.color.b * light;
    }
    // A tall softbox supplies a readable reflection band on curved resin.
    // Its small solid angle adds specular structure without flooding diffuse light.
    const strip = 5 * Math.exp(-Math.pow((longitude - 1.05) / 0.075, 2)
      - Math.pow((latitude - 0.22) / 0.58, 4));
    pixels[offset] += strip;
    pixels[offset + 1] += strip * 0.97;
    pixels[offset + 2] += strip * 0.91;
    pixels[offset + 3] = 1;
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.name = "Pace / procedural linear studio";
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function StudioEnvironment() {
  const { gl, scene } = useThree();
  const mode = useMaterialStudy();
  const environment = useRef<THREE.WebGLRenderTarget | null>(null);
  useLayoutEffect(() => {
    const previous = { environment: scene.environment, background: scene.background, intensity: scene.environmentIntensity,
      output: gl.outputColorSpace, tone: gl.toneMapping, exposure: gl.toneMappingExposure, transmission: gl.transmissionResolutionScale };
    const generator = new THREE.PMREMGenerator(gl);
    const source = createStudioTexture();
    const target = generator.fromEquirectangular(source);
    target.texture.name = "Pace / studio PMREM";
    source.dispose(); generator.dispose();
    environment.current = target;
    scene.background = new THREE.Color("white");
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;
    // One shared native transmission capture, quarter of the full pixel area.
    gl.transmissionResolutionScale = 0.5;
    return () => {
      scene.environment = previous.environment; scene.background = previous.background;
      scene.environmentIntensity = previous.intensity;
      gl.outputColorSpace = previous.output; gl.toneMapping = previous.tone;
      gl.toneMappingExposure = previous.exposure; gl.transmissionResolutionScale = previous.transmission;
      environment.current = null; target.dispose();
    };
  }, [gl, scene]);
  useLayoutEffect(() => {
    scene.environment = mode === "current" ? null : environment.current?.texture ?? null;
    scene.environmentIntensity = mode === "current" ? 1 : 0.8;
    scene.userData.materialStudy = mode;
  }, [mode, scene]);
  return null;
}
