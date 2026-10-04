// Exercise the visual controller against the real GLB, without a browser or a
// second animation implementation. Run: node scripts/check-pip-motion.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const compiled = path.resolve('node_modules/.cache/pace-motion-check');
await fs.mkdir(compiled, { recursive: true });
for (const name of ['pipContacts', 'pipMotion']) {
  const source = await fs.readFile(`src/components/runner/${name}.ts`, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  await fs.writeFile(path.join(compiled, `${name}.mjs`), outputText.replace('"./pipContacts"', '"./pipContacts.mjs"'));
}
const { PipMotion } = await import(pathToFileURL(path.join(compiled, 'pipMotion.mjs')));
const data = await fs.readFile('public/models/pip.glb');
const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');

function fixture(aspect = 7.5) {
  const model = clone(gltf.scene);
  const placement = new THREE.Group();
  const center = new THREE.Group();
  placement.add(center); center.add(model);
  center.position.sub(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
  camera.position.set(0, 1.2, 6); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const width = 2 * camera.position.length() * Math.tan(Math.PI / 12) * aspect;
  const motion = new PipMotion(model, placement, gltf.animations);
  let now = 10_000;
  let lastCorrect = now;
  let errors = 0;
  const body = model.getObjectByName('PipBody');
  const tick = (dt = 1 / 60, intensity = 0.8, status = 'running', typing = true) => {
    now += dt * 1000;
    if (typing) lastCorrect = now;
    return motion.update(dt, intensity, lastCorrect, errors, status, now, camera, width);
  };
  return { motion, placement, model, camera, body, tick, error: () => { errors++; } };
}

for (const fps of [30, 60, 120]) {
  const f = fixture();
  let compression = 0;
  for (let i = 0; i < fps * 4; i++) {
    f.tick(1 / fps, 1);
    compression = Math.max(compression, f.body.morphTargetInfluences[0]);
  }
  assert(f.motion.signals.speed > 0.99);
  for (const foot of f.motion.signals.contacts.feet) {
    assert(foot.sequence >= 7 && foot.sequence <= 11, `real landings at ${fps}Hz: ${foot.sequence}`);
    assert(foot.point.y > -0.90, 'feet stay near the floor');
  }
  assert(compression > 0.025 && compression <= 0.18, 'bounded landing compression');
  assert(f.body.morphTargetInfluences[1] > 0.20 && f.body.morphTargetInfluences[1] <= 0.30);
  for (let i = 0; i < fps * 2.5; i++) f.tick(1 / fps, 1, 'running', false);
  assert(f.motion.signals.speed < 0.025, 'coasts to a stop while statistical WPM is still high');
  for (let i = 0; i < fps * 3; i++) f.tick(1 / fps, 1, 'running', false);
  const steps = f.motion.signals.contacts.feet.map(foot => foot.sequence);
  for (let i = 0; i < fps; i++) f.tick(1 / fps, 1, 'running', false);
  assert.deepEqual(f.motion.signals.contacts.feet.map(foot => foot.sequence), steps, 'no idle impacts');
  f.motion.dispose();
}

{
  const f = fixture();
  for (let i = 0; i < 120; i++) f.tick();
  f.error(); f.tick();
  const firstDip = f.motion.signals.speed;
  let reachedMiddle = false;
  let recovered = false;
  for (let i = 0; i < 90; i++) {
    if (i < 35 && i % 4 === 0) f.error();
    f.tick();
    if (f.motion.signals.stumble > 0.8) reachedMiddle = true;
    if (i > 60 && f.motion.signals.stumble === 0) recovered = true;
  }
  assert(firstDip < 0.65, 'error interrupts momentum');
  assert(reachedMiddle && recovered, 'rapid mistakes do not restart or lock the stumble');
  assert(f.motion.signals.speed > 0.75, 'typing restores momentum after recovery');
  f.motion.dispose();
}

for (const aspect of [390 / 192, 1440 / 192, 2560 / 192]) {
  const f = fixture(aspect);
  f.error(); f.tick();
  let completions = 0;
  for (let i = 0; i < 360; i++) if (f.tick(1 / 60, 0.2, 'finished')) completions++;
  assert.equal(completions, 1, 'exactly one finish callback even when finishing during stumble');
  const leftEdge = new THREE.Vector3(f.placement.position.x - 1.65, 0, 0).project(f.camera);
  assert(leftEdge.x > 1.08, 'entire silhouette leaves the viewport before results');
  f.model.updateWorldMatrix(true, false); f.model.updateMatrixWorld(true);
  let leftmost = Infinity;
  const projected = new THREE.Vector3();
  f.model.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, projected).applyMatrix4(mesh.matrixWorld).project(f.camera);
      leftmost = Math.min(leftmost, projected.x);
    }
  });
  assert(leftmost > 1, `actual deformed GLB silhouette exited at aspect ${aspect}: ${leftmost}`);
  assert(!f.motion.signals.active && !f.motion.signals.contacts.ready && !f.placement.visible);
  f.tick(1 / 60, 0, 'idle', false);
  assert.equal(f.placement.position.x, 0);
  assert(f.placement.visible && f.motion.signals.contacts.ready);
  assert.equal(f.body.morphTargetInfluences[0], 0);
  assert.equal(f.body.morphTargetInfluences[1], 0);
  assert.deepEqual(f.motion.signals.contacts.feet.map(foot => foot.sequence), [0, 0]);
  f.motion.dispose();
}

{
  const f = fixture();
  f.motion.signals.reducedMotion = true;
  for (let i = 0; i < 180; i++) f.tick(1 / 60, 1);
  assert.deepEqual(f.body.morphTargetInfluences, [0, 0]);
  assert.deepEqual(f.motion.signals.contacts.feet.map(foot => foot.sequence), [0, 0]);
  f.tick(30, NaN, 'running', false);
  assert(Number.isFinite(f.motion.signals.speed));
  f.motion.dispose();
}
console.log('Pip motion: real-foot contacts at 30/60/120 Hz, coasting, repeated errors, recovery, viewport exit, reset and reduced motion passed.');
