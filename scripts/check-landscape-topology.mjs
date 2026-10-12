// Geometric regression checks on the production profiles, not their equations.
// The environment check compiles the TypeScript and verifies clearance/rooting.
import './check-environment.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
// Dynamic import runs after the compiler/check above; never read a stale cache.
const { FORMATIONS, createFormation } = await import('../node_modules/.cache/pace-landscape-check/landscape.mjs');

const epsilon = 1e-6;
const ray = new THREE.Ray(), direction = new THREE.Vector3(), hit = new THREE.Vector3();
function crosses(a, b) {
  // Adjacent triangles, seam duplicates and intentionally shared tips can touch.
  if (a.points.some(p => b.points.some(q => p.distanceToSquared(q) < epsilon * epsilon))) return false;
  for (const [source, target] of [[a, b], [b, a]]) {
    for (let edge = 0; edge < 3; edge++) {
      const start = source.points[edge], end = source.points[(edge + 1) % 3];
      direction.subVectors(end, start);
      const length = direction.length();
      if (length < epsilon) continue;
      ray.set(start, direction.divideScalar(length));
      if (ray.intersectTriangle(...target.points, false, hit)) {
        const distance = hit.distanceTo(start);
        if (distance > epsilon && distance < length - epsilon) return true;
      }
    }
  }
  return false;
}

for (const form of FORMATIONS.filter(f => f.kind !== 'stone')) {
  const data = createFormation(form), triangles = [];
  for (let index = 0; index < data.indices.length; index += 3) {
    const points = Array.from({ length: 3 }, (_, i) =>
      new THREE.Vector3().fromArray(data.positions, data.indices[index + i] * 3));
    if (new THREE.Triangle(...points).getArea() < epsilon) continue;
    triangles.push({ points, bounds: new THREE.Box3().setFromPoints(points),
      layer: form.kind === 'fold' ? Math.floor(index / (64 * 24 * 6)) : 0 });
  }
  triangles.sort((a, b) => a.bounds.min.x - b.bounds.min.x);
  let within = 0, between = 0;
  for (let i = 0; i < triangles.length; i++) {
    const a = triangles[i];
    for (let j = i + 1; j < triangles.length && triangles[j].bounds.min.x <= a.bounds.max.x; j++) {
      const b = triangles[j];
      if (!a.bounds.intersectsBox(b.bounds) || !crosses(a, b)) continue;
      if (a.layer === b.layer) within++; else between++;
    }
  }
  console.log(`${form.name}: ${within} internal crossings; ${between} crossings between lobes.`);
  assert.equal(within, 0, `${form.name}: no transverse self-intersections`);
  assert.equal(between, 0, `${form.name}: fold lobes must not cut through each other`);
}
console.log('Topology passed: no transverse intersections away from shared seams/tips. Coplanar overlaps are not classified by this check.');
