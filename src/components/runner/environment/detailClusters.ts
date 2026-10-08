import * as THREE from "three";
import { surface, type MeshData } from "./landscape";
import { terrainHeight } from "./terrainProfile";

type Shape = "mineral" | "sheet" | "lens" | "filament";
type Finish = "stone" | "warmStone" | "fold" | "warmFold" | "foreground" | "arch";
// Position relative to a named region, height above its terrain, three radii, yaw/lean.
type Placement = readonly [number, number, number, number, number, number, number?, number?];
type Detail = { shape: Shape; finish: Finish; at: Placement };
type Region = { name: string; x: number; z: number; details: readonly Detail[] };

/** Authored relationships, not a scatter field. Gaps between regions are intentional. */
export const DETAIL_REGIONS: readonly Region[] = [
  { name: "Western fold sediment", x: -7.8, z: -4.2, details: [
    { shape: "sheet", finish: "fold", at: [-2.1, 1.8, 0, 2.3, 0.72, 0.62, -0.3] },
    { shape: "sheet", finish: "warmFold", at: [0.4, 2.3, 0, 1.65, 0.46, 0.5, 0.2] },
    { shape: "mineral", finish: "stone", at: [-2.8, 0.8, 1.85, 0.38, 0.53, 0.29, 0.4, -0.4] },
    { shape: "mineral", finish: "stone", at: [-1.5, 6.0, 0.16, 0.22, 0.34, 0.25, -0.7, 0.7] },
    { shape: "mineral", finish: "warmStone", at: [0.9, 1.9, 0.22, 0.18, 0.16, 0.21, 0.5] },
    { shape: "mineral", finish: "stone", at: [1.1, -1.6, 3.75, 0.16, 0.21, 0.15, 0.2, 0.3] },
    { shape: "mineral", finish: "foreground", at: [-3.6, -2.2, 3.1, 0.26, 0.3, 0.22, -0.4] },
    { shape: "filament", finish: "arch", at: [-0.2, -1.7, 0, 7.8, 3.1, 1.2, 0.15] },
  ] },
  { name: "Bridge mineral shelf", x: 5.5, z: -4.5, details: [
    { shape: "sheet", finish: "fold", at: [2.7, 1.6, 0, 2.8, 0.95, 0.75, 0.3] },
    { shape: "sheet", finish: "fold", at: [3.7, 2.3, 0, 1.4, 0.42, 0.36, 0.15] },
    { shape: "lens", finish: "arch", at: [-0.9, 3.1, 0, 1.35, 0.055, 0.28, -0.1] },
    { shape: "mineral", finish: "stone", at: [2.9, 0.8, 1.85, 0.43, 0.59, 0.36, -0.5, 0.65] },
    { shape: "mineral", finish: "stone", at: [3.8, 6.3, 0.19, 0.32, 0.3, 0.29, 1.1, -0.2] },
    { shape: "mineral", finish: "stone", at: [1.4, 2.5, 0.13, 0.19, 0.24, 0.19, 0.5] },
    { shape: "mineral", finish: "warmStone", at: [2.2, -0.7, 3.7, 0.26, 0.3, 0.24, -0.4, 0.2] },
    { shape: "mineral", finish: "foreground", at: [4.6, -3.6, 3.1, 0.18, 0.23, 0.17, 0.8] },
    { shape: "filament", finish: "warmFold", at: [3.8, -0.4, 0, 5.2, 2.1, 0.9, -0.5] },
  ] },
  { name: "Path edge deposits", x: 0, z: -1.7, details: [
    { shape: "lens", finish: "arch", at: [-3.4, 0.15, 0, 1.1, 0.085, 0.42, 0.15] },
    { shape: "sheet", finish: "fold", at: [-2.9, 3.2, 0, 1.15, 0.23, 0.35, -0.3] },
    { shape: "mineral", finish: "warmStone", at: [-2.7, 0.2, 0.08, 0.12, 0.12, 0.1, 0.3] },
    { shape: "lens", finish: "foreground", at: [2.5, 3.2, 0, 0.8, 0.07, 0.34, -0.3] },
    { shape: "mineral", finish: "stone", at: [2.9, 3.4, 0.11, 0.13, 0.2, 0.13, -0.5, 0.6] },
  ] },
  { name: "Far suspended seam", x: -1, z: -15, details: [
    { shape: "mineral", finish: "foreground", at: [-4.8, -1.5, 3.6, 0.35, 0.48, 0.3, 0.6] },
    { shape: "mineral", finish: "stone", at: [1.5, 0.2, 4.7, 0.22, 0.34, 0.25, -0.2, 0.5] },
    { shape: "mineral", finish: "foreground", at: [4.9, -3.8, 3.8, 0.3, 0.4, 0.26, 0.8] },
  ] },
  { name: "Beyond the bend strata", x: 22, z: -6, details: [
    { shape: "sheet", finish: "fold", at: [-3, 2.3, 0, 2.7, 0.8, 0.65, -0.2] },
    { shape: "lens", finish: "arch", at: [-1.2, 3, 0, 1.9, 0.12, 0.6, 0.1] },
    { shape: "mineral", finish: "stone", at: [-2.2, 7.8, 0.15, 0.32, 0.4, 0.3, 0.6] },
    { shape: "mineral", finish: "foreground", at: [-4.1, 0.7, 2.6, 0.5, 0.64, 0.39, 0.7, -0.4] },
    { shape: "mineral", finish: "warmStone", at: [-2.3, -1.8, 3.8, 0.18, 0.24, 0.17, -0.8] },
    { shape: "mineral", finish: "stone", at: [2.8, 2.6, 0.12, 0.18, 0.22, 0.16, 0.3] },
  ] },
  { name: "Outer bridge outcrop", x: -26, z: -7, details: [
    { shape: "sheet", finish: "fold", at: [2.6, 2.3, 0, 2.3, 0.8, 0.7, 0.1] },
    { shape: "sheet", finish: "warmFold", at: [4.1, 2.7, 0, 1.5, 0.43, 0.4, -0.3] },
    { shape: "mineral", finish: "stone", at: [2.9, 1, 2.4, 0.38, 0.55, 0.32, 0.8, 0.4] },
    { shape: "mineral", finish: "stone", at: [4.2, 8.8, 0.15, 0.3, 0.3, 0.24, -0.6] },
    { shape: "mineral", finish: "foreground", at: [0.8, -2.1, 3.3, 0.19, 0.29, 0.22, 0.3] },
    { shape: "filament", finish: "arch", at: [1.2, 1.2, 0, 6.2, 2.4, 0.8, -0.2] },
  ] },
];

export function createDetailGeometry(shape: Shape): MeshData {
  if (shape === "mineral") return surface(10, 6, (u, v) => {
    const a = u * Math.PI * 2 + v * 0.85, p = v * Math.PI;
    const radius = Math.sin(p) ** 0.8 * (1.12 - v * 0.35);
    return [Math.cos(a) * radius + Math.cos(p) * 0.22,
      Math.cos(p), Math.sin(a) * radius];
  });
  if (shape === "sheet") return surface(24, 8, (u, v) => {
    const lift = Math.sin(u * Math.PI) ** 1.6;
    return [u - 0.5 + lift * v * 0.14,
      lift * (0.3 + 0.7 * Math.sin(v * Math.PI * 0.85)) - 0.025,
      (v - 0.5) * (0.15 + 0.85 * lift) + lift * Math.sin(v * Math.PI * 1.5) * 0.3];
  });
  if (shape === "lens") return surface(32, 6, (u, v) => {
    const a = u * Math.PI * 2, r = v;
    return [Math.cos(a) * r * (1 + 0.1 * Math.sin(a * 3)),
      Math.sin(r * Math.PI) ** 2 + 0.4,
      Math.sin(a) * r];
  });
  // A narrow, solid elliptical section; both tips disappear into the terrain.
  return surface(64, 6, (u, v) => {
    const rise = Math.sin(u * Math.PI), a = v * Math.PI * 2;
    return [u - 0.5, rise ** 0.9 * (1 + 0.22 * Math.cos(u * Math.PI)) + Math.cos(a) * 0.008 - 0.04,
      Math.sin(u * Math.PI * 2) * 0.55 + Math.sin(a) * 0.035];
  });
}

/** One static instance buffer per geometry/material pair. Travel happens in the shader. */
export function createDetailBatches() {
  const batches = new Map<string, { shape: Shape; finish: Finish; matrices: number[]; motion: number[] }>();
  const transform = new THREE.Object3D();
  for (const region of DETAIL_REGIONS) for (const detail of region.details) {
    const { shape, finish, at } = detail;
    const key = `${shape}/${finish}`;
    let batch = batches.get(key);
    if (!batch) { batch = { shape, finish, matrices: [], motion: [] }; batches.set(key, batch); }
    const x = region.x + at[0], z = region.z + at[1];
    transform.position.set(x, shape === "mineral" ? terrainHeight(x, z) + at[2] : 0, z);
    transform.scale.set(at[3], at[4], at[5]);
    transform.rotation.set(0, at[6] ?? 0, at[7] ?? 0);
    transform.updateMatrix();
    batch.matrices.push(...transform.matrix.elements);
    // Only suspended minerals drift; embedded pieces remain part of the ground.
    batch.motion.push(shape === "mineral" && at[2] > 1.2 ? 1 : shape === "filament" ? 2 : 0,
      x * 0.73 + z * 0.41);
  }
  return Array.from(batches, ([name, batch]) => ({ ...batch, name,
    matrices: new Float32Array(batch.matrices), motion: new Float32Array(batch.motion) }));
}
