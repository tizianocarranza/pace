import * as THREE from "three";
export { LandscapeMotion } from "./worldMotion";
import { GROUND_Y, WORLD_PERIOD } from "./terrainProfile";
export { GROUND_Y, WORLD_PERIOD, terrainHeight } from "./terrainProfile";

type MeshData = { positions: Float32Array; normals: Float32Array; indices: Uint32Array };
function surface(columns: number, rows: number, sample: (u: number, v: number) => [number, number, number]): MeshData {
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const indices = new Uint32Array(columns * rows * 6);
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    positions.set(sample(i / columns, j / rows), (j * (columns + 1) + i) * 3);
  }
  let cursor = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + columns + 1;
    indices.set([a, b, a + 1, a + 1, b, b + 1], cursor); cursor += 6;
  }
  // Temporary CPU geometry only; construction never occurs in the frame loop.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const normals = new Float32Array(geometry.getAttribute("normal").array);
  geometry.dispose();
  return { positions, normals, indices };
}

export function createTerrain() {
  // Spend existing vertices on the readable middle distance, not the white horizon.
  return surface(240, 112, (u, v) => {
    const z = v < 0.32 ? -38 + v / 0.32 * 29 : -9 + (v - 0.32) / 0.68 * 13;
    // Extend the footprint of the existing near strip, with identical topology
    // and unchanged samples in the physical lane. No extra surface is introduced.
    return [(u - 0.5) * WORLD_PERIOD, GROUND_Y, z > 1.6 ? 1.6 + (z - 1.6) * 3.5 : z];
  });
}
