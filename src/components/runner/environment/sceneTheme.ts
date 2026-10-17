import * as THREE from "three";

/** The world's night mix, 0 (day) → 1 (night). NightMix damps it toward the page theme
 * at frame priority −0.75; the world's uniforms (−0.5) and Pip's lights and materials (0)
 * read it the same frame. A mutable signal, never React state. */
export const sceneTheme = { night: 0 };

/** The page behind the world: the canvas clear color and what the ground dissolves into. */
export const PAGE_COLOR = { day: new THREE.Color("#ffffff"), night: new THREE.Color("#0b1024") };

/** Pip's image-based light: a bright studio by day, a dim one under the moon. */
export const ENVIRONMENT_INTENSITY = { day: 0.8, night: 0.26 };

/** Writes `a → b` by the night mix into `target`, without allocating. */
export function lerpTheme(target: THREE.Color, day: THREE.Color, night: THREE.Color) {
  return target.lerpColors(day, night, sceneTheme.night);
}
