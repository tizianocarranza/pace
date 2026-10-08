import { BufferAttribute, BufferGeometry } from "three";
import { IMPULSE_CAPACITY } from "./worldInteractions";

export const MOTE_COUNT = 32;
// Coordinates in the authored landscape, not Pip's coordinate system. Low paths
// follow the shelves; raised paths connect the fold/bridge regions behind him.
export const ENERGY_PATHS = [
  [-29, -3.0, 11, 0.08], [-16, -6.0, 12, 1.2], [-4, -1.7, 10, 0.10],
  [8, -4.5, 13, 0.8], [21, -2.2, 12, 0.06], [32, -7.0, 9, 1.1],
] as const;

/** One immutable batch: six paths, sparse motes and the existing contact slots. */
export function createEnergyGeometry() {
  const positions: number[] = [], origins: number[] = [], styles: number[] = [], indices: number[] = [];
  function strip(segments: number, x: number, y: number, z: number,
    kind: number, seed: number, length: number, lift: number) {
    const start = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      for (const side of [-1, 1]) {
        positions.push(i / segments, side, 0);
        origins.push(x, y, z);
        styles.push(kind, seed, length, lift);
      }
      if (i < segments) {
        const a = start + i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  ENERGY_PATHS.forEach(([x, z, length, lift], i) => strip(64, x, 0, z, 0, i * 0.381, length, lift));
  for (let i = 0; i < MOTE_COUNT; i++) {
    const seed = (i * 0.61803398875) % 1;
    const z = -1.3 - ((i * 0.41421356) % 1) * 10;
    strip(1, -35 + i * 70 / MOTE_COUNT, 0.28 + seed * 1.55, z, 1, seed, 0.022 + seed * 0.018, 0);
  }
  for (let i = 0; i < IMPULSE_CAPACITY; i++) strip(1, 0, 0, 0, 2, i, 0, 0);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("energyOrigin", new BufferAttribute(new Float32Array(origins), 3));
  geometry.setAttribute("energyStyle", new BufferAttribute(new Float32Array(styles), 4));
  geometry.setIndex(indices);
  return geometry;
}
