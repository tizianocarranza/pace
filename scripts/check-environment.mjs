// Exercise production terrain and motion without a browser or a duplicate controller.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

const compiled = path.resolve('node_modules/.cache/pace-landscape-check');
await fs.mkdir(compiled, { recursive: true });
for (const [name, file] of [
  ['pipContacts', 'src/components/runner/pipContacts.ts'],
  ['terrainProfile', 'src/components/runner/environment/terrainProfile.ts'],
  ['landscape', 'src/components/runner/environment/landscape.ts'],
  ['worldLighting', 'src/components/runner/environment/worldLighting.ts'],
  ['landscapeShaders', 'src/components/runner/environment/landscapeShaders.ts'],
  ['landscapeMaterials', 'src/components/runner/environment/landscapeMaterials.ts'],
  ['detailClusters', 'src/components/runner/environment/detailClusters.ts'],
  ['worldMotion', 'src/components/runner/environment/worldMotion.ts'],
  ['visualSpeed', 'src/lib/visualSpeed.ts'],
  ['worldInteractions', 'src/components/runner/environment/worldInteractions.ts'],
  ['worldEnergy', 'src/components/runner/environment/worldEnergy.ts'],
  ['energyGeometry', 'src/components/runner/environment/energyGeometry.ts'],
  ['composition', 'src/components/runner/composition.ts'],
]) {
  const source = await fs.readFile(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  await fs.writeFile(path.join(compiled, `${name}.mjs`), outputText
    .replace('"../pipContacts"', '"./pipContacts.mjs"')
    .replace(/"\.\/(landscape|landscapeShaders|worldLighting|terrainProfile|worldMotion|worldInteractions|worldEnergy)"/g, '"./$1.mjs"'));
}
const { LandscapeMotion, FORMATIONS, WORLD_PERIOD, GROUND_Y, terrainHeight, createTerrain, createFormation, createNearBank } =
  await import(pathToFileURL(path.join(compiled, 'landscape.mjs')));
const { PIP_FLOOR_Y } = await import(pathToFileURL(path.join(compiled, 'pipContacts.mjs')));
const { createLandscapeMaterials } = await import(pathToFileURL(path.join(compiled, 'landscapeMaterials.mjs')));
const { updateLightingUniforms } = await import(pathToFileURL(path.join(compiled, 'worldLighting.mjs')));
const { MAX_WORLD_VELOCITY, FOREGROUND_RATE, FRAGMENT_RATE, depthMultiplier } =
  await import(pathToFileURL(path.join(compiled, 'worldMotion.mjs')));
const { wpmToIntensity } = await import(pathToFileURL(path.join(compiled, 'visualSpeed.mjs')));

// Lighting must remain attached during scrolling/wrap, sharing the same mutable uniforms.
const materials = createLandscapeMaterials();
const lighting = materials.terrain.uniforms;
const lightObjects = Object.values(lighting).map(uniform => uniform.value);
for (const material of Object.values(materials)) assert.equal(material.uniforms, lighting);
const illuminationWorld = new LandscapeMotion();
for (let travel = 0; travel < WORLD_PERIOD * 2; travel += 0.5) {
  illuminationWorld.travel = travel % WORLD_PERIOD;
  updateLightingUniforms(lighting, illuminationWorld);
  for (const [name, uniform] of [['WesternFold', 'uWarmPool'], ['EasternBridge', 'uCoolPool'], ['DistantStone', 'uAmberPool']]) {
    const form = FORMATIONS.find(form => form.name === name);
    assert.equal(lighting[uniform].value.x, illuminationWorld.formationX(form.x), 'bounce stays attached across wrap');
  }
  Object.values(lighting).forEach((uniform, index) => assert.equal(uniform.value, lightObjects[index], 'uniform vectors are reused'));
}
for (const material of Object.values(materials)) material.dispose();

// Level ground supports the full walking/finish corridor at every travel phase.
for (let x = -72; x <= 72; x += 0.5) {
  for (let z = -0.8; z <= 0.8; z += 0.1) {
    assert(Math.abs(terrainHeight(x, z) - GROUND_Y) < 1e-12);
    assert(terrainHeight(x, z) < PIP_FLOOR_Y, 'preserve the contact-shadow clearance');
  }
  for (let z = -36; z <= 4; z += 0.5) {
    assert(Math.abs(terrainHeight(x, z) - terrainHeight(x + WORLD_PERIOD, z)) < 1e-12, 'terrain loops without a seam');
  }
}

const terrain = createTerrain();
const shapes = FORMATIONS.map(createFormation);
const banks = [createNearBank(false), createNearBank(true)];
let triangles = 0;
for (const data of [terrain, ...shapes, ...banks]) {
  assert(data.positions.every(Number.isFinite));
  assert(data.normals.every(Number.isFinite));
  assert.equal(data.positions.length, data.normals.length);
  assert(data.indices.every(i => i < data.positions.length / 3), 'indices address existing vertices');
  triangles += data.indices.length / 3;
}
assert(triangles < 90_000, 'bounded geometry budget');

const { DETAIL_REGIONS, createDetailBatches, createDetailGeometry } =
  await import(pathToFileURL(path.join(compiled, 'detailClusters.mjs')));
const batches = createDetailBatches();
assert.deepEqual(batches, createDetailBatches(), 'art-directed placements are deterministic');
assert(batches.length <= 9, 'detail draws stay bounded by shared geometry/finish pairs');
const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
let detailTriangles = createDetailGeometry('mineral').indices.length / 3;
let details = 0;
for (const batch of batches) {
  const data = createDetailGeometry(batch.shape);
  assert(data.positions.every(Number.isFinite));
  assert(data.normals.every(Number.isFinite));
  assert(data.indices.every(i => i < data.positions.length / 3));
  const count = batch.matrices.length / 16;
  details += count;
  detailTriangles += count * data.indices.length / 3;
  for (let instance = 0; instance < count; instance++) {
    matrix.fromArray(batch.matrices, instance * 16);
    assert(matrix.determinant() > 0, 'nondegenerate instance transforms');
    for (let i = 0; i < data.positions.length; i += 3) {
      point.fromArray(data.positions, i).applyMatrix4(matrix);
      assert(Math.abs(point.z) > 0.85, 'physical lane stays clear on both sides; projected overlap is permitted');
      if (batch.shape === 'mineral') continue;
      const root = terrainHeight(point.x, point.z);
      for (const travel of [0, 7, 39, 71]) {
        const world = new LandscapeMotion(); world.travel = travel;
        const wrapped = point.x + world.formationX(matrix.elements[12]) - matrix.elements[12];
        assert(Math.abs(root - terrainHeight(wrapped + travel, point.z)) < 1e-10,
          'instanced sheets and filament roots remain attached across wraps');
      }
    }
  }
}
assert(details < 45 && detailTriangles < 16_000, 'bounded detail and triangle counts');
assert(DETAIL_REGIONS.filter(region => Math.abs(region.x) > 15).length >= 2,
  'authored regions continue beyond the starting view');
console.log(`Details passed: ${details} instances, ${batches.length + 1} draws including the near fragment, ${detailTriangles} triangles; shared buffers, deterministic placement, clear corridor and rooted looping geometry.`);

// Both tapered ends of every folded layer remain rooted throughout travel and wrap.
FORMATIONS.forEach((form, index) => {
  if (form.kind !== 'fold') return;
  const p = shapes[index].positions;
  for (const offset of [0, 7, 39, 71]) {
    const world = new LandscapeMotion(); world.travel = offset;
    const x = world.formationX(form.x);
    const layerVertices = 65 * 25;
    for (let layer = 0; layer < p.length / 3 / layerVertices; layer++) {
      for (let row = 0; row <= 24; row++) for (const end of [0, 64]) {
        const at = (layer * layerVertices + row * 65 + end) * 3;
        const ground = terrainHeight(x + p[at] + offset, form.z + p[at + 2]);
        assert(Math.abs(p[at + 1] - (ground - 0.07)) < 0.00002, 'fold roots travel with the ground');
      }
    }
  }
});

const motion = { speed: 0.8, active: true, reducedMotion: false };
const results = [];
for (const fps of [30, 60, 120]) {
  const world = new LandscapeMotion();
  for (let i = 0; i < fps * 90; i++) {
    world.update(1 / fps, motion, 'running');
    assert(world.travel >= 0 && world.travel < WORLD_PERIOD);
    for (const form of FORMATIONS) assert(Math.abs(world.formationX(form.x)) <= WORLD_PERIOD / 2);
  }
  results.push(world.travel);
}
assert(results.every(n => Math.abs(n - results[0]) < 1e-9), 'frame-rate independent travel through multiple loops');
const world = new LandscapeMotion();
world.update(1 / 60, motion, 'idle'); assert.equal(world.travel, 0, 'idle is a still, complete world');
for (let i = 0; i < 120; i++) world.update(1 / 60, motion, 'running');
assert(world.travel > 0);
const paused = world.travel;
const frozenPhase = world.phase, frozenLag = world.lag, frozenIntensity = world.intensity;
for (let i = 0; i < 120; i++) world.update(1 / 60, { ...motion, reducedMotion: true }, 'running');
assert.equal(world.travel, paused, 'reduced motion freezes environmental travel immediately');
assert.equal(world.phase, frozenPhase, 'ambient motion freezes without resetting the visible pose');
assert.equal(world.lag, frozenLag); assert.equal(world.intensity, frozenIntensity);
for (let i = 0; i < 240; i++) world.update(1 / 60, { ...motion, active: false }, 'finished');
assert(world.visibility < 0.001, 'results clear the world after Pip exits');
world.update(1 / 60, motion, 'idle');
assert.equal(world.travel, 0); assert.equal(world.velocity, 0); assert.equal(world.visibility, 1);
world.update(NaN, null, 'idle'); assert(Number.isFinite(world.travel));

// Verify the player-facing momentum envelope, not just constant-speed integration.
const envelopes = [];
for (const fps of [30, 60, 120]) {
  const journey = new LandscapeMotion();
  for (const wpm of [15, 30, 45, 60, 90, 0]) {
    const intent = wpmToIntensity(wpm);
    for (let i = 0; i < fps * 2; i++) journey.update(1 / fps, { ...motion, intent }, 'running');
    if (intent > 0) assert(Math.abs(journey.velocity - intent * MAX_WORLD_VELOCITY) < 0.02);
  }
  assert(journey.velocity > 0 && journey.velocity < 0.04, 'small coasting tail after input ends');
  envelopes.push(journey.distance);
}
assert(envelopes.every(distance => Math.abs(distance - envelopes[0]) < 1e-9), 'acceleration/deceleration is frame-rate independent');
const clean = new LandscapeMotion(), stumble = new LandscapeMotion();
for (let i = 0; i < 120; i++) {
  clean.update(1 / 60, { ...motion, intent: 0.75, speed: 0.75 }, 'running');
  stumble.update(1 / 60, { ...motion, intent: 0.75, speed: 0.1, stumble: 1 }, 'running');
}
assert.equal(clean.distance, stumble.distance, 'character errors do not introduce an environment error response');
const idle = new LandscapeMotion();
for (let i = 0; i < 120; i++) idle.update(1 / 60, null, 'idle');
assert.equal(idle.travel, 0); assert(idle.phase > 0, 'idle world remains gently alive without traversing');
const beforeFinish = clean.distance;
clean.update(1 / 60, { ...motion, intent: 1 }, 'finished');
assert(clean.distance > beforeFinish && clean.visibility === 1, 'travel supports the existing finish exit');
// Ten minutes of traversal: foreground recycling is outside every tested viewport,
// and secondary phases wrap periodically rather than accumulating GPU time error.
for (const width of [3, 12, 40]) {
  const journey = new LandscapeMotion();
  let previous = journey.foregroundX(width, width, FOREGROUND_RATE);
  for (let i = 0; i < 60 * 600; i++) {
    journey.update(1 / 60, { ...motion, intent: 1 }, 'running');
    const x = journey.foregroundX(width, width, FOREGROUND_RATE);
    if (x > previous + 1) assert(Math.abs(previous) > width + 5 && Math.abs(x) > width + 5, 'near wrap stays offscreen with geometry margin');
    else assert(x <= previous, 'foreground enters from ahead and exits behind');
    assert(journey.phase >= 0 && journey.phase < Math.PI * 2);
    previous = x;
  }
}
assert(depthMultiplier(-24) < depthMultiplier(-5) && depthMultiplier(-5) < depthMultiplier(0));
assert(depthMultiplier(1.4) * FOREGROUND_RATE > depthMultiplier(0));
assert(FRAGMENT_RATE !== FOREGROUND_RATE, 'foreground passes do not repeat in lockstep');
console.log('World momentum passed: calibrated 15/30/45/60/90 WPM envelope, 30/60/120 Hz acceleration/coasting, independent stumble, calm idle, reduced-motion pose freeze, finish continuity and ten-minute offscreen recycling.');

// Replace the historical 192px lock with comparable paired lens/dolly studies.
const { frameComposition, COMPOSITION_STUDIES, nearPassX, heightAtScreen } =
  await import(pathToFileURL(path.join(compiled, 'composition.mjs')));
for (const [width, height] of [[390, 844], [1536, 1024], [2560, 1080]]) {
  const heights = [];
  for (const study of Object.keys(COMPOSITION_STUDIES)) {
  const camera = new THREE.PerspectiveCamera();
  frameComposition(camera, width, height, study);
  const center = new THREE.Vector3().project(camera);
  assert(Math.abs((1 - center.y) / 2 - 0.68) < 1e-10, 'Pip occupies the composed world opening');
  const top = new THREE.Vector3(0, 0.9, 0).project(camera);
  const foot = new THREE.Vector3(0, -0.88, 0).project(camera);
  heights.push((top.y - foot.y) * height / 2);
  const travelPixels = [0, -5, -24].map(z => {
    const a = new THREE.Vector3(2, 0, z).project(camera);
    const b = new THREE.Vector3(1, 0, z).project(camera);
    return (a.x - b.x) * width / 2;
  });
  assert(travelPixels[0] > travelPixels[1] && travelPixels[1] > travelPixels[2]);
  const z = camera.position.z * COMPOSITION_STUDIES[study].foregroundDepth;
  assert(z - 1.8 > 0.85, 'near geometry is physically outside the running lane');
  for (const screenY of [0.47, 0.69]) for (const x of [-10, 0, 10]) {
    const projected = new THREE.Vector3(x, heightAtScreen(camera, z, screenY, x), z).project(camera);
    assert(Math.abs((1 - projected.y) / 2 - screenY) < 1e-10, 'near composition anchors follow the lens');
  }
  const halfWidth = (camera.position.z - z) / camera.projectionMatrix.elements[0];
  const radius = 6 * Math.min(1.8, halfWidth / 4.7);
  let previous = nearPassX(0, halfWidth, radius, halfWidth, FOREGROUND_RATE);
  for (let distance = 0.1; distance < 600; distance += 0.1) {
    const x = nearPassX(distance, halfWidth, radius, halfWidth, FOREGROUND_RATE);
    if (x > previous) assert(Math.abs(previous) > halfWidth + radius && x > halfWidth + radius,
      'complete near objects recycle offscreen');
    previous = x;
  }
  }
  assert(Math.max(...heights) / Math.min(...heights) < 1.03, 'camera comparisons preserve subject scale, not the old composition');
}
console.log(`Landscape passed: ${triangles} triangles, safe physical lane, periodic terrain, rooted source geometry, 30/60/120 Hz travel, three paired camera studies, near recycling and composed framing.`);

// Energy reads the actual momentum model. Exercise sustained input, coast, accepted
// errors and suppression without altering any physical/contact signal.
const { WorldEnergy } = await import(pathToFileURL(path.join(compiled, 'worldEnergy.mjs')));
const { createEnergyGeometry, MOTE_COUNT, ENERGY_PATHS } = await import(pathToFileURL(path.join(compiled, 'energyGeometry.mjs')));
const snapshots = [];
for (const fps of [30, 60, 120]) {
  const energy = new WorldEnergy(), world = new LandscapeMotion();
  const value = energy.value;
  const signal = { intent: 0, active: true, reducedMotion: false, stumbleSequence: 0 };
  const advance = seconds => {
    for (let f = 0; f < seconds * fps; f++) {
      world.update(1 / fps, signal, 'running');
      energy.update(1 / fps, signal, world, 'running');
      assert.equal(energy.value, value, 'reuse the optical uniform storage');
      assert(value.toArray().every(n => Number.isFinite(n) && n >= 0 && n <= 1));
    }
  };
  advance(1); assert.equal(value.x, 0, 'quiet world has exactly no energy');
  const levels = [];
  for (const wpm of [15, 30, 45, 60, 90]) {
    signal.intent = wpmToIntensity(wpm); advance(7);
    levels.push(value.x);
  }
  assert(levels.every((n, i) => !i || n > levels[i - 1]), 'smoothly increasing vocabulary');
  assert(levels[0] < 0.12 && levels[3] > 0.85, 'subtle 15; full experience at 60');
  assert(levels[4] / levels[3] < 1.2, '90 intensifies rather than changes the vocabulary');
  signal.stumbleSequence++; advance(1 / fps);
  assert.equal(value.w, 1, 'one accepted error interrupts continuity');
  const velocity = world.velocity;
  advance(1);
  assert(value.w < 0.04, 'smooth recovery without repeated interruption');
  assert(Math.abs(world.velocity - velocity) < 0.001, 'optical response cannot change physical velocity');
  signal.intent = 0; advance(0.25);
  assert(value.x > 0.5, 'coasting retains a short light memory');
  advance(7); assert(value.x < 0.00001 && value.y < 0.02, 'no indefinite accumulation');
  signal.intent = wpmToIntensity(15); advance(4);
  signal.intent = wpmToIntensity(60); advance(0.25);
  assert(value.z > 0.12, 'acceleration supplies a restrained passing catch');
  advance(5); assert(value.z < 0.005, 'steady movement is distinct from acceleration');
  snapshots.push(value.x);
  signal.reducedMotion = true; signal.stumbleSequence++;
  energy.update(1 / fps, signal, world, 'running');
  assert.deepEqual(value.toArray(), [0, 0, 0, 0]);
  signal.reducedMotion = false;
  energy.update(1 / fps, signal, world, 'running');
  assert.equal(value.w, 0, 'suppressed errors do not replay');
  energy.update(1 / fps, signal, world, 'idle');
  assert.deepEqual(value.toArray(), [0, 0, 0, 0]); assert.equal(energy.phase, 0);
}
assert(Math.max(...snapshots) - Math.min(...snapshots) < 0.002, 'frame-rate independent energy');
const energyGeometry = createEnergyGeometry();
assert.equal(MOTE_COUNT, 32); assert.equal(ENERGY_PATHS.length, 6);
assert.equal(energyGeometry.index.count / 3, 848, 'one fixed inexpensive optical batch');
for (const attr of Object.values(energyGeometry.attributes)) assert(attr.array.every(Number.isFinite));
for (const index of energyGeometry.index.array) assert(index < energyGeometry.attributes.position.count);
assert(ENERGY_PATHS.every(([, z]) => z < -1.15), 'all paths behind the foot corridor');
energyGeometry.dispose();
console.log('Energy passed: calibrated progression, bounded memory, acceleration, error recovery, reduced motion, reset, 30/60/120 Hz and one 848-triangle batch.');
