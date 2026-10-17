"use client";

/* The scene background and environment intensity are renderer-owned values that
 * StudioEnvironment sets up and restores; this only blends them each frame. */
/* eslint-disable react-hooks/immutability */

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { theme } from "@/lib/theme";
import { ENVIRONMENT_INTENSITY, PAGE_COLOR, sceneTheme } from "./sceneTheme";

const target = () => (theme.get() === "night" ? 1 : 0);

/** Owns the world's night mix: damped toward the page theme so switching crossfades the
 * world in ~0.6 s (instantly under reduced motion). Frame slot −0.75: after Pip's
 * controller, before the environment reads it. */
export function NightMix() {
  const { scene } = useThree();
  const reduced = useRef(false);

  useLayoutEffect(() => {
    // The first frame already shows the right theme: no crossfade on load.
    sceneTheme.night = target();
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { reduced.current = query.matches; };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useFrame((_, delta) => {
    const goal = target();
    sceneTheme.night = reduced.current ? goal
      : THREE.MathUtils.damp(sceneTheme.night, goal, 6, THREE.MathUtils.clamp(delta, 0, 0.05));
    if (Math.abs(sceneTheme.night - goal) < 0.001) sceneTheme.night = goal;
    if (scene.background instanceof THREE.Color) {
      scene.background.lerpColors(PAGE_COLOR.day, PAGE_COLOR.night, sceneTheme.night);
    }
    scene.environmentIntensity = THREE.MathUtils.lerp(
      ENVIRONMENT_INTENSITY.day, ENVIRONMENT_INTENSITY.night, sceneTheme.night);
  }, -0.75);

  return null;
}
