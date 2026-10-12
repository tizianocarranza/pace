import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.env.PACE_REVIEW_DIR || 'assets/reviews/phase5-energy';
const stages = ['running', 'frame-360', 'frame-540', 'frame-735', 'frame-960', 'lap'];
const metrics = [];
const pixels = async file => sharp(file).removeAlpha().raw().toBuffer();
assert((await pixels(path.join(root, 'baseline/idle-on.png'))).equals(
  await pixels(path.join(root, '60/idle-on.png'))), 'approved Phase 4 idle remains pixel-identical');
let steady60;
for (const speed of [60, 90]) {
  const directory = path.join(root, String(speed));
  const { frames, errors } = JSON.parse(await fs.readFile(path.join(directory, 'report.json'), 'utf8'));
  assert.deepEqual(errors, [], `${speed}: no browser/shader errors`);
  for (const stage of stages) {
    const off = frames[`${stage}-off`], surfaces = frames[`${stage}-surfaces`], on = frames[`${stage}-on`];
    for (const value of [surfaces, on]) {
      for (const key of ['time', 'travel', 'camera', 'projection', 'pose', 'morphs', 'materials', 'renderer'])
        assert.deepEqual(value[key], off[key], `${speed}/${stage}: matched ${key}`);
      assert.deepEqual(value.stats.passes, off.stats.passes, 'energy adds no render targets');
    }
    assert.deepEqual(off.energy, [0, 0, 0, 0]);
    assert.deepEqual(on.energy, surfaces.energy, 'same energy controller for both modes');
    assert(!off.lightBatch && !surfaces.lightBatch && on.lightBatch);
    assert.equal(surfaces.stats.calls, off.stats.calls, 'surface energy has no draw overhead');
    assert(on.stats.calls <= off.stats.calls + 2, 'one path batch, optionally included in optical capture');
    assert(on.stats.triangles <= off.stats.triangles + 1536);
    const a = await pixels(path.join(directory, `${stage}-off.png`));
    const b = await pixels(path.join(directory, `${stage}-on.png`));
    const surfacePixels = await pixels(path.join(directory, `${stage}-surfaces.png`));
    let changed = 0, rise = 0, pathPixels = 0;
    for (let i = 0; i < a.length; i += 3) {
      const x = (i / 3) % 1536, y = Math.floor(i / 3 / 1536);
      if (y < 220 || (y < 330 && x > 410 && x < 1120)) {
        assert.equal(a[i], b[i], 'HTML and empty white field unaffected');
        assert.equal(a[i + 1], b[i + 1]); assert.equal(a[i + 2], b[i + 2]);
      }
      if (y < 330 || y > 900) continue;
      let d = 0;
      for (let c = 0; c < 3; c++) { d = Math.max(d, Math.abs(a[i + c] - b[i + c])); rise += (b[i + c] - a[i + c]) / 3; }
      if (d > 3) changed++;
      if (Math.max(Math.abs(b[i]-surfacePixels[i]), Math.abs(b[i+1]-surfacePixels[i+1]), Math.abs(b[i+2]-surfacePixels[i+2])) > 3) pathPixels++;
    }
    const meanRise = rise / (1536 * 571);
    assert(changed > 1000, `${speed}/${stage}: energy has a visible contribution`);
    assert(meanRise < 4, `${speed}/${stage}: no broad exposure increase`);
    assert(pathPixels > 100, `${speed}/${stage}: retained paths have visible benefit`);
    metrics.push({ speed, stage, changedPixels: changed, pathPixels, meanBrightnessRise: +meanRise.toFixed(3) });
  }
  for (const frame of Object.values(frames)) {
    assert.equal(frame.renderer.glError, 0);
    assert.equal(frame.nearCapture, 0);
    assert(frame.opticalState.autoClear && frame.opticalState.defaultTarget);
    assert(frame.stats.memory.textures <= 12 && frame.stats.passes.length <= 5);
  }
  for (const key of ['createTexture', 'createFramebuffer', 'createBuffer'])
    assert.equal(frames['frame-360-on'].allocations[key], frames['lap-on'].allocations[key], 'stable warmed resources');
  assert(frames['error-on'].energy[3] > 0.8, 'real key error interrupts local energy');
  assert(frames['recovered-on'].energy[3] < 0.04, 'graceful local recovery');
  assert(Math.abs(frames['error-on'].momentum[0] - frames['lap-on'].momentum[0]) < 0.001, 'error does not stop world travel');
  assert(frames['coast-on'].energy[0] > 0.4, 'light persists briefly when slowing');
  assert(frames['stopped-on'].energy[0] < 0.002, 'no persistent glow at rest');
  assert.equal(frames['idle-on'].lightBatch, false, 'idle stays quiet');
  if (speed === 60) steady60 = frames['lap-on'];
  else {
    assert(frames['lap-on'].energy[0] > steady60.energy[0] + 0.15, 'sprint adds energy headroom');
    assert(frames['lap-on'].momentum[0] > steady60.momentum[0] + 0.18, 'sprint adds traversal headroom');
  }
}
await fs.writeFile(path.join(root, 'metrics.json'), JSON.stringify(metrics, null, 2));
const mobile = JSON.parse(await fs.readFile(path.join(root, 'mobile90/mobile-review.json'), 'utf8'));
assert.deepEqual(mobile.errors, []);
assert(mobile.occlusion.b.length >= 30, 'sample a full mobile sprint traversal');
assert(mobile.occlusion.b.every(sample => sample.eyeBlocked === 0), 'preserve eyes throughout sprint');
console.table(metrics);
console.log('Phase 5 passed: visible sustained energy, sprint headroom, bounded brightness/resources, unchanged matched pose/UI, real error recovery and coasting.');
