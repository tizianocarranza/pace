// Assertions against matched browser captures, including actual rendered pixels.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const directory = process.env.PACE_REVIEW_DIR || 'assets/reviews/phase4-optics';
const read = async file => JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
const { frames, errors } = await read('report.json');
const before = await read('baseline/report.json');
assert.deepEqual(errors, [], 'no browser or shader errors');
for (const phase of ['idle', 'running', 'lap']) {
  const off = frames[`${phase}-off`], haze = frames[`${phase}-haze`], on = frames[`${phase}-on`];
  for (const field of ['time', 'travel', 'camera', 'projection', 'pose', 'morphs', 'environment', 'materials', 'renderer']) {
    // Phase 5 deliberately changes the speed curve and passing cadence. Only
    // idle still has the same historical pose; on/off must always match live.
    if (phase === 'idle') assert.deepEqual(off[field], before.frames[`${phase}-pilot`][field], `${phase}: Phase 3 ${field} preserved`);
    assert.deepEqual(haze[field], off[field], `${phase}: haze preserves ${field}`);
    assert.deepEqual(on[field], off[field], `${phase}: softness preserves ${field}`);
  }
  if (phase === 'idle') {
    assert.equal(off.stats.calls, before.frames[`${phase}-pilot`].stats.calls);
    assert.equal(off.stats.triangles, before.frames[`${phase}-pilot`].stats.triangles);
  }
  assert.deepEqual(off.stats.passes, haze.stats.passes, 'haze requires no render targets');
  assert(!off.stats.passes.some(p => p.name.includes('near')), 'off bypasses the foreground passes');
  assert(on.stats.calls <= off.stats.calls + 3, 'bounded extra screen draws');
  assert(on.stats.triangles <= off.stats.triangles + 3, 'no added world geometry');
}
const allowed = new Set(['Pace / optical background', 'Pace / rear fold', 'Pace / complete fold', 'Pace / near coverage', 'Pace / near blur']);
for (const [name, frame] of Object.entries(frames)) {
  assert.equal(frame.renderer.glError, 0, `${name}: clean WebGL state`);
  assert(frame.opticalState.autoClear && frame.opticalState.defaultTarget, `${name}: main renderer restored`);
  assert.equal(frame.nearCapture, 0, `${name}: capture uniform reset`);
  assert(frame.nearVisible, `${name}: foreground visibility restored`);
  assert(frame.opticalState.meshes.every(m => m.visible && m.fullRange && m.drawStart === 0));
  assert(frame.stats.memory.textures <= 12, `${name}: only two additional color textures`);
  assert(frame.stats.passes.length <= 5);
  for (const pass of frame.stats.passes) {
    assert(allowed.has(pass.name), `${name}: known render target`);
    assert(pass.width <= 1024 && pass.height <= 1024 && pass.samples === 0, 'bounded bandwidth');
  }
}
for (const key of ['createTexture', 'createFramebuffer', 'createBuffer'])
  assert.equal(frames['pilot-frame-180'].allocations[key], frames['lap-on'].allocations[key], 'stable resources through wrap and toggles');

const crop = async (file, rect) => sharp(path.join(directory, file)).extract(rect).removeAlpha().raw().toBuffer();
for (const [label, rect] of [
  ['Pip eyes/body', { left: 700, top: 675, width: 95, height: 48 }],
  ['HTML sentence', { left: 410, top: 240, width: 710, height: 92 }],
  ['white field', { left: 300, top: 80, width: 930, height: 140 }],
]) {
  const off = await crop('idle-off.png', rect), on = await crop('idle-on.png', rect);
  assert(off.equals(on), `${label} remains pixel-identical`);
}
const near = { left: 100, top: 400, width: 160, height: 170 };
const highFrequency = pixels => {
  let energy = 0;
  for (let y = 1; y < near.height - 1; y++) for (let x = 1; x < near.width - 1; x++) {
    const i = (y * near.width + x) * 3;
    for (let c = 0; c < 3; c++) energy += Math.abs(pixels[i + c - 3] + pixels[i + c + 3] - 2 * pixels[i + c]);
  }
  return energy;
};
const sharpNear = highFrequency(await crop('idle-haze.png', near));
const softNear = highFrequency(await crop('idle-on.png', near));
assert(softNear < sharpNear * 0.8, 'foreground edge energy is visibly reduced');
console.log(`Atmosphere review passed: preserved camera/Pip/materials/motion, crisp focal pixels and HTML, two bounded targets, stable allocations. Near edge energy ${(softNear / sharpNear).toFixed(3)} of haze-only.`);
