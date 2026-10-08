import { MathUtils, PerspectiveCamera } from "three";

export const COMPOSITION_STUDIES = {
  a: { name: "A · distant perspective", fov: 30, foregroundDepth: 0.46, azimuth: 0 },
  b: { name: "B · oblique close perspective", fov: 42, foregroundDepth: 0.58, azimuth: 0.35 },
  c: { name: "C · oblique wide perspective", fov: 56, foregroundDepth: 0.66, azimuth: 0.50 },
} as const;
export type CompositionStudy = keyof typeof COMPOSITION_STUDIES;
export const DEFAULT_COMPOSITION: CompositionStudy = "b";

/** Near objects recycle after their complete bounds leave the viewport. This
 * changes staging only; the world's integrated travel distance is untouched. */
export function nearPassX(distance: number, halfWidth: number, radius: number, offset: number, rate: number) {
  const halfPeriod = halfWidth + radius + 1.5;
  return MathUtils.euclideanModulo(offset - distance * rate + halfPeriod, halfPeriod * 2) - halfPeriod;
}

/** Solve a projected height without allocating vectors; includes lens shift/yaw. */
export function heightAtScreen(camera: PerspectiveCamera, z: number, screenY: number, x = 0) {
  const v = camera.matrixWorldInverse.elements, p = camera.projectionMatrix.elements;
  const slope = p[9] + 1 - 2 * screenY;
  return -(p[5] * (v[1] * x + v[9] * z + v[13]) + slope * (v[2] * x + v[10] * z + v[14]) + p[13])
    / (p[5] * v[5] + slope * v[6]);
}

/** Full-viewport shot: paired lens/dolly studies hold Pip's screen size constant.
 * The projection shift is measured against this viewport, not a legacy strip. */
export function frameComposition(camera: PerspectiveCamera, width: number, height: number, study: CompositionStudy) {
  const config = COMPOSITION_STUDIES[study];
  const pipHeight = Math.min(MathUtils.clamp(height * 0.14, 108, 155), width * 0.24);
  const focalPixels = height / (2 * Math.tan(MathUtils.degToRad(config.fov / 2)));
  const distance = focalPixels * 1.84 / pipHeight;
  camera.fov = config.fov;
  camera.position.set(distance * Math.cos(0.18) * Math.sin(config.azimuth),
    distance * Math.sin(0.18), distance * Math.cos(0.18) * Math.cos(config.azimuth));
  camera.lookAt(0, 0, 0);
  camera.near = 0.1;
  camera.far = 150;
  camera.setViewOffset(width, height, 0, -height * 0.18, width, height);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
