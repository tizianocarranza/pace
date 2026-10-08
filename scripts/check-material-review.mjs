// Validate the captured comparison, not a second copy of the renderer.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const report = JSON.parse(await readFile('assets/reviews/phase2-materials/report.json', 'utf8'));
assert.deepEqual(report.errors, [], 'browser and shader compilation must be clean');
for (const phase of ['idle', 'running', 'lap']) {
  const current = report.frames[`${phase}-current`];
  const shared = report.frames[`${phase}-shared`];
  const pilot = report.frames[`${phase}-pilot`];
  for (const frame of [shared, pilot]) {
    for (const key of ['time', 'travel', 'camera', 'projection', 'pose', 'morphs']) {
      assert.deepEqual(frame[key], current[key], `${phase}: identical ${key}`);
    }
    assert.equal(frame.stats.memory.geometries, current.stats.memory.geometries);
    assert.equal(frame.renderer.output, 'srgb');
    assert.equal(frame.renderer.exposure, 1);
  }
  assert.deepEqual(pilot.environment, shared.environment, 'same illumination isolates materials');
  const optical = pilot.materials.filter(m => m.name.startsWith('Pilot /'));
  assert.equal(optical.length, 3, 'pilot must remain limited to three surfaces');
  assert.equal(optical.filter(m => m.transmission > 0).length, 2);
  for (const material of optical) {
    assert.equal(material.opacity, 1, 'do not substitute alpha blending for transmission');
    assert.equal(material.depthWrite, true);
    assert.equal(material.toneMapped, true);
  }
  const pipBefore = current.materials.filter(m => m.name.startsWith('Pip'));
  assert.deepEqual(pilot.materials.filter(m => m.name.startsWith('Pip')), pipBefore,
    'Pip retains its existing opaque material');
  assert(pipBefore.length > 0);
}
const frames = Object.values(report.frames);
assert(frames.every(f => f.stats.memory.textures <= 5), 'no growing per-frame texture pool');
assert(frames.every(f => f.stats.passes.length <= 1), 'only one shared transmission target');
const late = report.frames['pilot-frame-735'];
const toggled = report.frames['lap-pilot'];
for (const key of ['createTexture', 'createFramebuffer', 'createBuffer']) {
  assert.equal(late.allocations[key], toggled.allocations[key], 'warmed comparison switches reuse GPU resources');
}
console.log('Material review passed: matched camera/pose/travel, unchanged Pip, three pilot surfaces, shared lighting, bounded targets and allocation-free warmed switches.');
