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
for (const name of ['pipContacts', 'pipMotion', 'worldInteractions', 'composition']) {
  const source = await fs.readFile(`src/components/runner/${name === 'worldInteractions' ? 'environment/' : ''}${name}.ts`, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  await fs.writeFile(path.join(compiled, `${name}.mjs`), outputText
    .replace('"./pipContacts"', '"./pipContacts.mjs"').replace('"../pipContacts"', '"./pipContacts.mjs"'));
}
const { PipMotion } = await import(pathToFileURL(path.join(compiled, 'pipMotion.mjs')));
const { frameComposition } = await import(pathToFileURL(path.join(compiled, 'composition.mjs')));
const { WorldInteractions, IMPULSE_CAPACITY } = await import(pathToFileURL(path.join(compiled, 'worldInteractions.mjs')));
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
  const motion = new PipMotion(model, placement, gltf.animations);
  let now = 10_000;
  let lastCorrect = now;
  let errors = 0;
  const body = model.getObjectByName('PipBody');
  const tick = (dt = 1 / 60, intensity = 0.8, status = 'running', typing = true, sustainedInput = false) => {
    now += dt * 1000;
    if (typing) lastCorrect = now;
    const width = 2 * camera.position.length() / camera.projectionMatrix.elements[0];
    return motion.update(dt, intensity, lastCorrect, errors, status, now, camera, width, sustainedInput);
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

for (const { width, height, study } of [[390, 844], [1536, 1024], [2560, 1080]]
  .flatMap(([width, height]) => ['a', 'b', 'c'].map(study => ({ width, height, study })))) {
  const aspect = width / height;
  const f = fixture(aspect);
  frameComposition(f.camera, width, height, study);
  f.error(); f.tick();
  let completions = 0;
  for (let i = 0; i < 360; i++) if (f.tick(1 / 60, 0.2, 'finished')) completions++;
  assert.equal(completions, 1, 'exactly one finish callback even when finishing during stumble');
  const leftEdge = new THREE.Vector3(f.placement.position.x - 1.65, 0, 0).project(f.camera);
  assert(leftEdge.x > 1, 'entire silhouette leaves the viewport before results');
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

{
  const f = fixture();
  // No keystrokes for twenty seconds: held visual input must still drive the real controller.
  for (let i = 0; i < 1200; i++) f.tick(1 / 60, 0.94, 'running', false, true);
  assert(f.motion.signals.speed > 0.93 && f.motion.signals.intent === 0.94);
  assert.equal(f.motion.signals.stumble, 0);
  assert(f.placement.visible && f.placement.position.x === 0, 'simulation never triggers the finish exit');
  const movingSpeed = f.motion.signals.speed;
  f.tick(1 / 60, 0, 'running', false, true);
  assert(f.motion.signals.speed > 0 && f.motion.signals.speed < movingSpeed, 'slider to zero decelerates');
  for (let i = 0; i < 180; i++) f.tick(1 / 60, 0, 'running', false, true);
  assert(f.motion.signals.speed < 0.001);
  for (let i = 0; i < 120; i++) f.tick(1 / 60, 0.94, 'running', false, true);
  for (let i = 0; i < 180; i++) f.tick(1 / 60, 0.94, 'running', false, false);
  assert(f.motion.signals.speed < 0.001, 'disabling the override restores genuine input age');
  f.tick(1 / 60, 0, 'idle', false);
  assert.equal(f.motion.signals.intent, 0);
  f.motion.dispose();
}
console.log('Visual simulation passed: sustained real-GLB motion without keystrokes, zero-speed deceleration, no finish/stumble, and real-input recovery.');

for (const fps of [30, 60, 120]) {
  const f = fixture(), interaction = new WorldInteractions(), world = { distance: 0 };
  const slots = [...interaction.impulses], uniforms = [...interaction.packed];
  let emissions = 0, contacts = 0;
  for (let frame = 0; frame < fps * 8; frame++) {
    f.tick(1 / fps, 0.94, 'running', false, true);
    interaction.update(1 / fps, f.motion.signals, world, 'running');
    for (const foot of f.motion.signals.contacts.feet) if (foot.impact > 0) {
      contacts++;
      assert(foot.grounded, 'a landing event is grounded');
    }
    const emitted = interaction.impulses.filter(impulse => impulse.strength > 0 && impulse.age === 0);
    emissions += emitted.length;
    assert.equal(emitted.length, f.motion.signals.contacts.feet.filter(foot => foot.impact > 0).length,
      'one physical impulse per real animated landing');
    // A second consumer update of the same pose must not duplicate a landing.
    interaction.update(0, f.motion.signals, world, 'running');
    assert.equal(interaction.impulses.filter(impulse => impulse.strength > 0 && impulse.age === 0).length, emitted.length);
  }
  assert.equal(emissions, contacts); assert(contacts > 20);
  assert.equal(interaction.impulses.length, IMPULSE_CAPACITY);
  interaction.impulses.forEach((slot, i) => assert.equal(slot, slots[i], 'pooled impulse objects reused'));
  interaction.packed.forEach((uniform, i) => assert.equal(uniform, uniforms[i], 'uniform vectors reused'));
  f.error(); f.tick(); interaction.update(1 / fps, f.motion.signals, world, 'running');
  assert.equal(interaction.impulses.filter(impulse => impulse.kind === 'stumble' && impulse.strength > 0).length, 1);
  const sequence = f.motion.signals.stumbleSequence;
  for (let i = 0; i < 8; i++) { f.error(); f.tick(); interaction.update(1 / fps, f.motion.signals, world, 'running'); }
  assert.equal(f.motion.signals.stumbleSequence, sequence, 'rapid mistakes do not repeat the physical stumble');
  // Advancing through the terrain wrap moves a live impulse left without recycling it.
  const event = interaction.impulses.find(impulse => impulse.strength > 0);
  const oldX = event.position.x;
  world.distance += 0.2;
  interaction.update(0, f.motion.signals, world, 'running');
  assert(Math.abs(event.position.x - (oldX - 0.2)) < 1e-10);
  f.motion.signals.reducedMotion = true;
  interaction.update(1 / fps, f.motion.signals, world, 'running');
  assert(interaction.packed.every(value => value.z === 0), 'reduced motion suppresses all physical responses');
  f.motion.signals.reducedMotion = false;
  interaction.update(1 / fps, f.motion.signals, world, 'running');
  assert(interaction.packed.every(value => value.z === 0), 'old contacts are not replayed after resuming');
  f.tick(1 / fps, 0, 'idle', false);
  interaction.update(1 / fps, f.motion.signals, world, 'idle');
  assert(interaction.packed.every(value => value.z === 0));
  f.motion.dispose();
}
console.log('World contact passed: real GLB landings at 30/60/120 Hz, grounded hysteresis, exactly-once pooled impulses, one disturbance per stumble, attached travel, reduced motion and reset.');
