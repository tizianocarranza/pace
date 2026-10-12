// Validate Phase 3's matched browser evidence against the frozen Phase 2 scene.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const directory = process.env.PACE_REVIEW_DIR || 'assets/reviews/phase3-geometry';
const read = async file => JSON.parse(await readFile(path.join(directory, file), 'utf8'));
const before = await read('baseline/report.json'), after = await read('report.json');
assert.deepEqual(after.errors, [], 'no browser/shader errors');
for (const phase of ['idle', 'running', 'lap']) {
  const old = before.frames[`${phase}-pilot`], next = after.frames[`${phase}-pilot`];
  for (const field of ['time', 'travel', 'camera', 'projection', 'pose', 'morphs', 'environment', 'materials'])
    assert.deepEqual(next[field], old[field], `${phase}: preserve ${field}`);
  assert.deepEqual(next.renderer, old.renderer, `${phase}: same renderer and no WebGL errors`);
  assert(next.stats.calls <= old.stats.calls, `${phase}: no extra draws`);
  assert(next.stats.triangles <= old.stats.triangles, `${phase}: no extra submitted geometry`);
  assert(next.stats.memory.geometries <= old.stats.memory.geometries, `${phase}: no extra mesh buffers`);
  assert.equal(next.stats.memory.textures, old.stats.memory.textures, `${phase}: no additional texture storage`);
  assert.deepEqual(next.stats.passes, old.stats.passes, `${phase}: optical architecture preserved`);
}
for (const key of ['createTexture', 'createFramebuffer', 'createBuffer']) {
  assert.equal(after.frames['pilot-frame-180'].allocations[key], after.frames['lap-pilot'].allocations[key],
    'warmed resources remain stable through the world wrap and mode switches');
}
const anchors = source => {
  const ast = ts.createSourceFile('landscape.ts', source, ts.ScriptTarget.Latest, true);
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'FORMATIONS') result = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert(result, 'formation anchors are declared'); return result;
};
assert.equal(anchors(await readFile('src/components/runner/environment/landscape.ts', 'utf8')),
  anchors(await readFile(path.join(directory, 'baseline/landscape.ts.txt'), 'utf8')),
  'approved formation names, positions and dimensional anchors remain unchanged');
console.log('Geometry review passed: locked camera/anchors, unchanged Pip/materials/light/travel, reduced submissions, same optical targets and stable warmed allocations.');
