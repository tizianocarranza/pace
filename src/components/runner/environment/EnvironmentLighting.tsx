"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { WORLD_LIGHT } from "./worldLighting";
import { lerpTheme, sceneTheme } from "./sceneTheme";

/** Day → night: the studio key becomes a cool, dimmer moon; the warm rim stays and leads. */
const LIGHT = {
  ambient: [0.2, 0.1],
  hemisphere: [0.45, 0.3],
  key: [2.3, 1.05],
  warm: [0.7, 0.95],
  cool: [0.7, 0.55],
} as const;
const COLOR = {
  sky: [new THREE.Color("#ffffff"), new THREE.Color("#8a9cff")],
  ground: [new THREE.Color("#aab4f4"), new THREE.Color("#141c48")],
  key: [new THREE.Color(WORLD_LIGHT.key.color), new THREE.Color("#c9d4ff")],
} as const;
const mix = ([day, night]: readonly [number, number]) => THREE.MathUtils.lerp(day, night, sceneTheme.night);

/** Quiet real-light counterpart to the world's shared shader illumination. */
export function EnvironmentLighting() {
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemisphere = useRef<THREE.HemisphereLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const warm = useRef<THREE.DirectionalLight>(null);
  const cool = useRef<THREE.DirectionalLight>(null);

  // Slot 0, after NightMix (-0.75) has moved the night mix this frame.
  useFrame(() => {
    if (!ambient.current || !hemisphere.current || !key.current || !warm.current || !cool.current) return;
    ambient.current.intensity = mix(LIGHT.ambient);
    hemisphere.current.intensity = mix(LIGHT.hemisphere);
    lerpTheme(hemisphere.current.color, COLOR.sky[0], COLOR.sky[1]);
    lerpTheme(hemisphere.current.groundColor, COLOR.ground[0], COLOR.ground[1]);
    key.current.intensity = mix(LIGHT.key);
    lerpTheme(key.current.color, COLOR.key[0], COLOR.key[1]);
    warm.current.intensity = mix(LIGHT.warm);
    cool.current.intensity = mix(LIGHT.cool);
  });

  return (
    <group name="PaceEnvironmentLighting">
      <ambientLight ref={ambient} intensity={LIGHT.ambient[0]} />
      {/* Periwinkle floor bounce plus warm/cool rims give Pip colored volume. */}
      <hemisphereLight ref={hemisphere} args={["#ffffff", "#aab4f4", LIGHT.hemisphere[0]]} />
      <directionalLight ref={key} {...WORLD_LIGHT.key} intensity={LIGHT.key[0]} />
      <directionalLight ref={warm} {...WORLD_LIGHT.warm} intensity={LIGHT.warm[0]} />
      <directionalLight ref={cool} {...WORLD_LIGHT.cool} intensity={LIGHT.cool[0]} />
    </group>
  );
}
