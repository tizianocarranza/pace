import { BufferAttribute, BufferGeometry } from "three";
// Coordinates in the authored landscape, not Pip's coordinate system. Low paths
// follow the shelves; raised paths connect the fold/bridge regions behind him.
export const ENERGY_PATHS = [
  [-29, -3.0, 11, 0.08], [-16, -6.0, 12, 1.2], [-4, -1.7, 10, 0.10],
  [8, -4.5, 13, 0.8], [21, -2.2, 12, 0.06], [32, -7.0, 9, 1.1],
] as const;

/** One immutable path batch. Motes/contact glow had no useful gameplay-scale contribution. */
export function createEnergyGeometry() {
  const positions: number[] = [], origins: number[] = [], styles: number[] = [], indices: number[] = [];
  function strip(segments: number, x: number, y: number, z: number,
    seed: number, length: number, lift: number) {
    const start = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      for (const side of [-1, 1]) {
        positions.push(i / segments, side, 0);
        origins.push(x, y, z);
        styles.push(seed, length, lift);
      }
      if (i < segments) {
        const a = start + i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  ENERGY_PATHS.forEach(([x, z, length, lift], i) => strip(64, x, 0, z, i * 0.381, length, lift));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("energyOrigin", new BufferAttribute(new Float32Array(origins), 3));
  geometry.setAttribute("energyStyle", new BufferAttribute(new Float32Array(styles), 3));
  geometry.setIndex(indices);
  geometry.userData.pathIndexCount = ENERGY_PATHS.length * 64 * 6;
  return geometry;
}
