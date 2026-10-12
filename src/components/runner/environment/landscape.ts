import * as THREE from "three";
export { LandscapeMotion } from "./worldMotion";
import { GROUND_Y, WORLD_PERIOD, terrainHeight } from "./terrainProfile";
export { GROUND_Y, WORLD_PERIOD, terrainHeight } from "./terrainProfile";

const TAU = Math.PI * 2;
// The approved composition compresses formations vertically about GROUND_Y.
// Author terrain attachment in inverse-scaled space so roots still meet it.
export const FORMATION_HEIGHT_SCALE = 0.78;
const formationGround = (x: number, z: number) =>
  GROUND_Y + (terrainHeight(x, z) - GROUND_Y) / FORMATION_HEIGHT_SCALE;

export type MeshData = { positions: Float32Array; normals: Float32Array; indices: Uint32Array };
export function surface(columns: number, rows: number, sample: (u: number, v: number) => [number, number, number]): MeshData {
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

type Formation = {
  name: string; kind: "fold" | "arch" | "stone";
  x: number; z: number; width: number; height: number; depth: number; tint: number;
  lift?: number;
};

// Off-center, unequal scales and spacing: a landscape slice, not a ring of motifs.
export const FORMATIONS: readonly Formation[] = [
  { name: "FarFold", kind: "fold", x: -15, z: -23, width: 18, height: 7, depth: 5, tint: 0.2 },
  { name: "DistantBridge", kind: "arch", x: -2, z: -24, width: 6.5, height: 6.5, depth: 1.5, tint: 0.15 },
  { name: "WesternFold", kind: "fold", x: -7.8, z: -4.2, width: 11, height: 5.4, depth: 3.6, tint: 0.35 },
  { name: "EasternBridge", kind: "arch", x: 5.5, z: -4.5, width: 3.8, height: 5.5, depth: 1.1, tint: 0.65 },
  { name: "BeyondTheBend", kind: "fold", x: 22, z: -6, width: 12, height: 5.3, depth: 4, tint: 0.4 },
  { name: "OuterBridge", kind: "arch", x: -26, z: -7, width: 4, height: 5, depth: 1.2, tint: 0.45 },
  { name: "SuspendedStone", kind: "stone", x: -4.9, z: -3.5, width: 0.55, height: 0.85, depth: 0.48, lift: 3.4, tint: 0.85 },
  { name: "DistantStone", kind: "stone", x: 2, z: -12, width: 0.8, height: 1.05, depth: 0.7, lift: 5.2, tint: 0.5 },
  { name: "FarStone", kind: "stone", x: 24, z: -9, width: 0.65, height: 0.85, depth: 0.6, lift: 4, tint: 0.75 },
];

/** Near banks continue out of frame. Their inner edges stay outside the character corridor. */
export function createNearBank(right: boolean) {
  return surface(72, 32, (u, v) => {
    const crest = Math.sin(u * Math.PI) ** 1.45;
    const wave = Math.sin(v * Math.PI) ** 1.3;
    const pleat = 1 + 0.25 * Math.sin(v * TAU * 1.5 + u * 2.5);
    const x = (u - 0.5) * 9 + crest * wave * (right ? -0.75 : 0.65);
    const height = crest * wave * pleat * (right ? 3.8 : 2.9);
    const curl = crest * wave * Math.sin(v * Math.PI * 1.5) * 0.8;
    return [x, GROUND_Y - 0.06 + height, (v - 0.5) * 2.7 + curl];
  });
}

/** Merge connected/overlapping lobes into the original draw, rather than adding objects. */
function joinSurfaces(parts: MeshData[]): MeshData {
  const count = parts.reduce((total, part) => total + part.positions.length, 0);
  const positions = new Float32Array(count), normals = new Float32Array(count);
  const indices = new Uint32Array(parts.reduce((total, part) => total + part.indices.length, 0));
  let vertexOffset = 0, indexOffset = 0;
  for (const part of parts) {
    positions.set(part.positions, vertexOffset); normals.set(part.normals, vertexOffset);
    for (let i = 0; i < part.indices.length; i++) indices[indexOffset + i] = part.indices[i] + vertexOffset / 3;
    vertexOffset += part.positions.length; indexOffset += part.indices.length;
  }
  return { positions, normals, indices };
}

export function createFormation(form: Formation) {
  if (form.kind === "stone") {
    return surface(30, 16, (u, v) => {
      const theta = u * TAU, phi = v * Math.PI;
      const sector = TAU / 5;
      const facet = Math.cos(Math.PI / 5) / Math.cos((theta % sector) - sector / 2);
      const taper = Math.sin(phi) ** 0.78 * (1.12 - v * 0.36);
      const turn = theta + v * 0.95;
      return [Math.cos(turn) * taper * form.width * facet + Math.cos(phi) * form.height * 0.3,
        (form.lift ?? 0) + Math.cos(phi) * form.height,
        Math.sin(turn) * taper * form.depth * facet + Math.sin(phi * 1.5) * form.depth * 0.26];
    });
  }
  if (form.kind === "arch") {
    const distant = form.z < -15;
    const outer = form.name === "OuterBridge";
    return surface(80, 16, (u, v) => {
      const angle = u * Math.PI;
      const rise = Math.sin(angle);
      // A broad loaded shoulder and a narrow return, rather than a uniform tube.
      // OuterBridge is a lower, wider vault; the distant arch stays restrained.
      const shoulder = Math.exp(-(((u - (outer ? 0.66 : 0.28)) / 0.22) ** 2));
      const breadth = 0.14 + 0.42 * (1 - rise) ** 2 + shoulder * (distant ? 0.22 : 0.75);
      const section = v * TAU;
      const turn = (outer ? -0.65 : 0.85) * Math.sin(angle) - 0.25;
      const across = Math.cos(section) * breadth;
      const depth = Math.sin(section) * form.depth * (0.13 + 0.22 * rise);
      const radial = across * Math.cos(turn) - depth * Math.sin(turn);
      const x = Math.cos(angle) * form.width + rise * form.width * (outer ? -0.14 : 0.24)
        + radial * Math.cos(angle);
      const z = across * Math.sin(turn) + depth * Math.cos(turn)
        + rise * Math.sin(angle * 1.4 + (outer ? 1.1 : 0.2)) * (distant ? 0.3 : 0.72);
      const height = rise ** (outer ? 0.72 : 1.05) * (1 + (outer ? -0.13 : 0.10) * Math.cos(angle))
        * form.height * (outer ? 0.84 : 1);
      return [x, formationGround(form.x + x, form.z + z) - 0.14 + height + radial * rise, z];
    });
  }
  const layers = form.z < -15 ? 1 : 2;
  const western = form.name === "WesternFold";
  const far = form.name === "FarFold";
  return joinSurfaces(Array.from({ length: layers }, (_, layer) => surface(64, 24, (u, v) => {
    const span = Math.sin(u * Math.PI);
    const shifted = u + span * (western ? 0.16 : far ? -0.08 : -0.17);
    const envelope = Math.sin(shifted * Math.PI) ** (western ? 1.65 : 1.15);
    // A tall leading sail trails into a low lip. Other regions reverse the
    // balance instead of repeating the same notch at a different scale.
    const cross = 0.32 + 0.68 * Math.sin(v * Math.PI * 0.78);
    const shoulder = 1 - (western ? 0.16 : 0.09) * Math.exp(-(((u - 0.74) / 0.18) ** 2));
    const height = envelope * cross * shoulder * form.height * (layer ? 0.48 : 1);
    const x = (u - 0.5) * form.width * (layer ? 0.88 : 1)
      + span * ((western ? 0.85 : -0.55) + (v - 0.5) * 0.4);
    const widthTaper = 0.12 + 0.88 * span ** 0.8;
    const z = (v - 0.5) * form.depth * widthTaper * (layer ? 0.62 : 1)
      + span * (western ? 0.65 : -0.35) + envelope * Math.sin(v * Math.PI) * 0.12
      - layer * form.depth * 0.9;
    return [x, formationGround(form.x + x, form.z + z) - 0.07 + height, z];
  })));
}


