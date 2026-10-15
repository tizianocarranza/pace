import { MathUtils, PerspectiveCamera } from "three";

/** Approved Study B: an oblique close perspective. */
export const COMPOSITION = { fov: 42, azimuth: 0.35 } as const;

/** Full-viewport shot: the lens/dolly pair holds Pip's screen size constant.
 * The projection shift is measured against this viewport, not a legacy strip. */
export function frameComposition(camera: PerspectiveCamera, width: number, height: number) {
  const pipHeight = Math.min(MathUtils.clamp(height * 0.14, 108, 155), width * 0.24);
  const focalPixels = height / (2 * Math.tan(MathUtils.degToRad(COMPOSITION.fov / 2)));
  const distance = focalPixels * 1.84 / pipHeight;
  camera.fov = COMPOSITION.fov;
  camera.position.set(distance * Math.cos(0.18) * Math.sin(COMPOSITION.azimuth),
    distance * Math.sin(0.18), distance * Math.cos(0.18) * Math.cos(COMPOSITION.azimuth));
  camera.lookAt(0, 0, 0);
  camera.near = 0.1;
  camera.far = 150;
  camera.setViewOffset(width, height, 0, -height * 0.18, width, height);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
