// Validate the captured comparison, not a second copy of the renderer.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const directory = process.env.PACE_REVIEW_DIR || 'assets/reviews/phase2-materials';
const report = JSON.parse(await readFile(path.join(directory, 'report.json'), 'utf8'));
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
    assert.equal(material.blending, 0, 'optical color must not use alpha blending');
  }
  const pipBefore = current.materials.filter(m => m.name.startsWith('Pip'));
  assert.deepEqual(pilot.materials.filter(m => m.name.startsWith('Pip')), pipBefore,
    'Pip retains its existing opaque material');
  assert(pipBefore.length > 0);
}
const frames = Object.values(report.frames);
assert(frames.every(f => f.stats.memory.textures <= 10), 'three color/depth targets within a fixed texture pool');
assert(frames.every(f => f.stats.passes.length <= 3), 'at most background, rear-fold and complete-fold targets');
assert(frames.every(f => f.stats.calls <= 52), 'captured traversal submission budget');
for (const frame of frames) {
  assert.equal(frame.renderer.glError, 0, 'WebGL must not reject an optical draw');
  assert.equal(frame.opticalState.autoClear, true);
  assert.equal(frame.opticalState.defaultTarget, true, 'offscreen target restored before main frame');
  for (const mesh of frame.opticalState.meshes) {
    assert.equal(mesh.visible, true, 'capture must restore scene visibility');
    assert.equal(mesh.drawStart, 0);
    assert.equal(mesh.fullRange, true, 'capture must restore both fold lobes');
  }
  for (const target of frame.stats.passes) {
    assert(['Pace / optical background', 'Pace / rear fold', 'Pace / complete fold'].includes(target.name));
    assert(Math.max(target.width, target.height) <= 1024);
  }
}
assert.equal(report.frames['pilot-frame-360'].stats.passes.length, 0, 'skip optical capture when both pilot objects leave view');
const late = report.frames['pilot-frame-735'];
const toggled = report.frames['lap-pilot'];
for (const key of ['createTexture', 'createFramebuffer', 'createBuffer']) {
  assert.equal(report.frames['pilot-frame-180'].allocations[key], late.allocations[key],
    'the warmed traversal must not recreate GPU resources');
  assert.equal(late.allocations[key], toggled.allocations[key], 'warmed comparison switches reuse GPU resources');
}
console.log('Material review passed: matched camera/pose/travel, unchanged Pip, three pilot surfaces, shared lighting, bounded targets and allocation-free warmed switches.');

const baselineArgument = process.argv.find(arg => arg === '--baseline' || arg.startsWith('--baseline='));
if (baselineArgument) {
  const baselineDirectory = baselineArgument.split('=')[1] || 'baseline';
  const baseline = JSON.parse(await readFile(path.join(directory, baselineDirectory, 'report.json'), 'utf8'));
  for (const phase of ['idle', 'running', 'lap']) {
    const before = baseline.frames[`${phase}-pilot`];
    const after = report.frames[`${phase}-pilot`];
    for (const key of ['time', 'travel', 'camera', 'projection', 'pose', 'morphs', 'environment']) {
      assert.deepEqual(after[key], before[key], `refinement preserves ${phase} ${key}`);
    }
    assert.equal(after.stats.memory.geometries, before.stats.memory.geometries, 'no new scene geometry');
    assert(after.stats.calls <= before.stats.calls * 1.3, 'layered capture draw overhead stays below 30% of native pilot');
    assert(after.stats.triangles <= before.stats.triangles * 1.15, 'layered capture triangle overhead stays below 15%');
    if (process.argv.includes('--same-submissions')) {
      for (const key of ['calls', 'triangles', 'memory', 'passes']) {
        assert.deepEqual(after.stats[key], before.stats[key], `material refinement preserves ${phase} ${key}`);
      }
    }
  }
  console.log('Pilot baseline passed: identical camera, pose, lighting, travel and geometry count; bounded layered-capture overhead.');
  if (process.argv.includes('--same-submissions')) console.log('Submission check passed: identical draws, triangles, render targets and GPU resource counts.');
  if (process.argv.includes('--nested-fold-budget')) {
    for (const [name, after] of Object.entries(report.frames)) {
      if (!name.includes('pilot')) continue;
      const before = baseline.frames[name];
      assert(before, `${name}: preceding pilot capture exists`);
      const extra = after.stats.passes.some(p => p.name === 'Pace / complete fold') ? 1 : 0;
      assert.equal(after.stats.calls, before.stats.calls + extra, `${name}: only one extra fold draw`);
      assert.equal(after.stats.triangles, before.stats.triangles + extra * 6144,
        `${name}: only the existing full sheet is resubmitted`);
      assert.equal(after.stats.memory.geometries, before.stats.memory.geometries);
      assert.equal(after.stats.memory.textures, before.stats.memory.textures + 2);
      assert.equal(after.stats.passes.length, before.stats.passes.length + extra);
    }
    console.log('Nested-fold budget passed: one existing-sheet draw when captured, one additional color/depth pair, no geometry growth.');
  }
}
