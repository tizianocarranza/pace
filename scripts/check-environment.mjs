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
  ['floorWarmth', 'src/components/runner/environment/floorWarmth.ts'],
  ['landscapeShaders', 'src/components/runner/environment/landscapeShaders.ts'],
  ['atmosphere', 'src/components/runner/environment/atmosphere.ts'],
  ['landscapeMaterials', 'src/components/runner/environment/landscapeMaterials.ts'],
  ['worldMotion', 'src/components/runner/environment/worldMotion.ts'],
  ['visualSpeed', 'src/lib/visualSpeed.ts'],
  ['worldInteractions', 'src/components/runner/environment/worldInteractions.ts'],
  ['worldEnergy', 'src/components/runner/environment/worldEnergy.ts'],
  ['trailShaders', 'src/components/runner/environment/trailShaders.ts'],
  ['composition', 'src/components/runner/composition.ts'],
  ['worldGenesis', 'src/components/runner/environment/worldGenesis.ts'],
]) {
  const source = await fs.readFile(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  await fs.writeFile(path.join(compiled, `${name}.mjs`), outputText
    .replace('"../pipContacts"', '"./pipContacts.mjs"')
    .replace(/"\.\/(landscape|landscapeShaders|worldLighting|terrainProfile|worldMotion|worldInteractions|worldEnergy|atmosphere|floorWarmth|worldGenesis)"/g, '"./$1.mjs"'));
}
const { LandscapeMotion, WORLD_PERIOD, GROUND_Y, terrainHeight, createTerrain } =
  await import(pathToFileURL(path.join(compiled, 'landscape.mjs')));
const { PIP_FLOOR_Y } = await import(pathToFileURL(path.join(compiled, 'pipContacts.mjs')));
const { createLandscapeMaterials } = await import(pathToFileURL(path.join(compiled, 'landscapeMaterials.mjs')));
const { updateLightingUniforms } = await import(pathToFileURL(path.join(compiled, 'worldLighting.mjs')));
const { MAX_WORLD_VELOCITY } = await import(pathToFileURL(path.join(compiled, 'worldMotion.mjs')));
const { wpmToIntensity } = await import(pathToFileURL(path.join(compiled, 'visualSpeed.mjs')));

// Lighting must remain attached during scrolling/wrap, sharing the same mutable uniforms.
const materials = createLandscapeMaterials();
const lighting = materials.terrain.uniforms;
const lightObjects = Object.values(lighting).map(uniform => uniform.value);
const illuminationWorld = new LandscapeMotion();
for (let travel = 0; travel < WORLD_PERIOD * 2; travel += 0.5) {
  illuminationWorld.travel = travel % WORLD_PERIOD;
  updateLightingUniforms(lighting, illuminationWorld);
  for (const [x, uniform] of [[-7.8, 'uWarmPool'], [5.5, 'uCoolPool'], [2, 'uAmberPool']]) {
    assert.equal(lighting[uniform].value.x, illuminationWorld.wrapX(x), 'bounce stays attached across wrap');
  }
  assert(Math.abs(lighting.uTransmittedPool.value.x - lighting.uWarmPool.value.x - 4.18) < 1e-12);
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
assert(terrain.positions.every(Number.isFinite));
assert(terrain.normals.every(Number.isFinite));
assert.equal(terrain.positions.length, terrain.normals.length);
assert(terrain.indices.every(i => i < terrain.positions.length / 3), 'indices address existing vertices');
const triangles = terrain.indices.length / 3;
assert(triangles < 90_000, 'bounded geometry budget');

const motion = { speed: 0.8, active: true, reducedMotion: false };
const results = [];
for (const fps of [30, 60, 120]) {
  const world = new LandscapeMotion();
  for (let i = 0; i < fps * 90; i++) {
    world.update(1 / fps, motion, 'running');
    assert(world.travel >= 0 && world.travel < WORLD_PERIOD);
    assert(Math.abs(world.wrapX(0)) <= WORLD_PERIOD / 2);
  }
  results.push(world.travel);
}
assert(results.every(n => Math.abs(n - results[0]) < 1e-9), 'frame-rate independent travel through multiple loops');
const world = new LandscapeMotion();
world.update(1 / 60, motion, 'idle'); assert.equal(world.travel, 0, 'idle is a still, complete world');
for (let i = 0; i < 120; i++) world.update(1 / 60, motion, 'running');
assert(world.travel > 0);
const paused = world.travel;
const frozenLag = world.lag, frozenIntensity = world.intensity;
for (let i = 0; i < 120; i++) world.update(1 / 60, { ...motion, reducedMotion: true }, 'running');
assert.equal(world.travel, paused, 'reduced motion freezes environmental travel immediately');
assert.equal(world.lag, frozenLag); assert.equal(world.intensity, frozenIntensity);
for (let i = 0; i < 60; i++) world.update(1 / 60, { ...motion, active: false }, 'finished');
assert.equal(world.visibility, 1, 'after the exit the big bang collapses the world; no global fade');
for (let i = 0; i < 240; i++) world.update(1 / 60, { ...motion, active: false, reducedMotion: true }, 'finished');
assert(world.visibility < 0.001, 'reduced motion: results clear the world with a fade');
world.update(1 / 60, motion, 'idle');
assert.equal(world.travel, 0); assert.equal(world.velocity, 0); assert.equal(world.visibility, 1);
world.update(NaN, null, 'idle'); assert(Number.isFinite(world.travel));

// Intro: the world travels with Pip's run-in in idle. The big bang reveals it, so it is
// never globally faded, except under reduced motion, where it fades in from white instead.
{
  const intro = new LandscapeMotion();
  const arriving = { speed: 1, intent: 1, active: true, arriving: true, arrivalSequence: 1, reducedMotion: false };
  intro.update(1 / 60, arriving, 'idle');
  assert(intro.visibility === 1 && intro.travel > 0, 'an arrival travels in idle; the big bang reveals the world');
  const reduced = new LandscapeMotion();
  reduced.update(1 / 60, { ...arriving, reducedMotion: true }, 'idle');
  assert(reduced.visibility < 0.1, 'reduced motion: the world fades in from white');
  for (let i = 0; i < 120; i++) reduced.update(1 / 60, { ...arriving, reducedMotion: true }, 'idle');
  assert(reduced.visibility > 0.99);
  for (let i = 0; i < 120; i++) intro.update(1 / 60, arriving, 'idle');
  const settled = { ...arriving, speed: 0, intent: 0, active: false, arriving: false };
  for (let i = 0; i < 480; i++) intro.update(1 / 60, settled, 'idle');
  const rest = intro.travel;
  intro.update(1 / 60, settled, 'idle');
  assert(intro.visibility > 0.99 && Math.abs(intro.travel - rest) < 1e-6, 'one arrival is consumed once, then the world rests');
}

// Big bang: a singularity, then a wave front that reveals every visible ground point,
// identical at any frame rate, played once per arrival and skipped under reduced motion.
{
  const { WorldGenesis, GENESIS_BANG, GENESIS_RADIUS, GENESIS_SETTLE, GENESIS_EXPANSION } =
    await import(pathToFileURL(path.join(compiled, 'worldGenesis.mjs')));
  const idle = new WorldGenesis();
  idle.update(1 / 60, { arrivalSequence: 0, reducedMotion: false });
  assert(!idle.active && idle.value.x > 1000 && idle.progress === 1 && idle.arrivals === 0, 'without an arrival the world is complete');
  const traces = [];
  for (const fps of [30, 60, 120]) {
    const genesis = new WorldGenesis();
    const motion = { arrivalSequence: 1, reducedMotion: false };
    const trace = [];
    let t = 0;
    let previousRadius = 0;
    while (t < GENESIS_BANG + GENESIS_SETTLE + 0.5) {
      genesis.update(1 / fps, motion);
      t += 1 / fps;
      const [radius, core, sinceBang, front] = genesis.value.toArray();
      if (t < GENESIS_BANG - 1e-9) {
        assert(genesis.active && radius === 0 && sinceBang < 0 && genesis.progress === 0, 'the singularity comes before the world');
      } else if (genesis.active) {
        assert(radius >= previousRadius && radius < GENESIS_RADIUS && front <= 1 && core >= 0, 'the front only expands');
        assert(Math.abs(genesis.progress * GENESIS_RADIUS - radius) < 1e-9, 'the page expands on the same curve as the ground');
        previousRadius = radius;
      }
      for (const sample of [0.1, 0.3, GENESIS_BANG + 0.2, GENESIS_BANG + 1.2]) {
        if (Math.abs(t - sample) < 0.5 / fps) trace.push([radius, core, front]);
      }
    }
    assert(!genesis.active && genesis.value.x > 1000 && genesis.value.w === 0, 'the intro ends with a complete world');
    traces.push(trace.flat());
  }
  assert(traces.every(trace => trace.every((v, i) => Math.abs(v - traces[1][i]) < 0.08 * Math.max(1, Math.abs(traces[1][i])))),
    'the big bang plays the same at 30/60/120 Hz');
  // The visible ground ends where surfacePresence crops it (|x| ≤ 35, z ≥ −37).
  const settledRadius = GENESIS_RADIUS * (1 - Math.exp(-(GENESIS_SETTLE - 0.05) / GENESIS_EXPANSION));
  assert(settledRadius - (1.5 + 0.12 * settledRadius) > Math.hypot(35, 37), 'the front has passed every visible point before it ends');
  const once = new WorldGenesis();
  const motion = { arrivalSequence: 1, reducedMotion: false };
  for (let i = 0; i < 60 * 4; i++) once.update(1 / 60, motion);
  once.update(1 / 60, motion);
  assert(!once.active, 'an arrival plays the big bang once');
  motion.arrivalSequence = 2;
  once.update(1 / 60, motion);
  assert(once.active && once.value.x === 0, 'the next arrival (Try again) plays it again');
  const calm = new WorldGenesis();
  calm.update(1 / 60, { arrivalSequence: 1, reducedMotion: true });
  assert(!calm.active && calm.value.x > 1000 && calm.progress === 1, 'reduced motion: no burst, a complete world');
  assert.equal(calm.arrivals, 1, 'a skipped arrival still counts, so the page shows its UI');
  assert.equal(once.arrivals, 2);
}
// Collapse: once Pip has exited, the world falls back into the core and stays empty
// until the next arrival; the page is not touched. Same at any frame rate.
{
  const { WorldGenesis, GENESIS_COLLAPSE } = await import(pathToFileURL(path.join(compiled, 'worldGenesis.mjs')));
  const ends = [];
  for (const fps of [30, 60, 120]) {
    const genesis = new WorldGenesis();
    const running = { arrivalSequence: 0, reducedMotion: false, active: true };
    for (let i = 0; i < fps; i++) genesis.update(1 / fps, running, 'finished');
    assert(!genesis.active && genesis.value.x > 1000, 'the world stays while Pip is still running off');
    const exited = { ...running, active: false };
    let previous = Infinity, t = 0, flare = 0;
    while (genesis.active || t === 0) {
      genesis.update(1 / fps, exited, 'finished');
      t += 1 / fps;
      if (!genesis.active) break;
      assert(!genesis.expanding, 'the collapse leaves the page alone');
      assert(genesis.value.x <= previous + 1e-9, 'the world only falls inward');
      previous = genesis.value.x;
      flare = Math.max(flare, genesis.value.y);
      assert(t < 3, 'the collapse ends');
    }
    assert(t > GENESIS_COLLAPSE && flare > 1, 'the core flares once the world has fallen into it');
    assert(genesis.value.x === 0 && genesis.value.y === 0, 'collapsed: an empty page behind the results');
    for (let i = 0; i < fps; i++) genesis.update(1 / fps, exited, 'finished');
    assert(!genesis.active && genesis.value.x === 0, 'it stays collapsed');
    genesis.update(1 / fps, { ...exited, arrivalSequence: 1 }, 'idle');
    assert(genesis.active && genesis.expanding && genesis.value.x === 0, 'Try again is born again from the core');
    ends.push(t);
  }
  assert(ends.every(t => Math.abs(t - ends[1]) < 1 / 30 + 1e-9), `the collapse lasts the same at any frame rate: ${ends}`);
  const calm = new WorldGenesis();
  calm.update(1 / 60, { arrivalSequence: 0, reducedMotion: true, active: false }, 'finished');
  assert(!calm.active && calm.value.x > 1000, 'reduced motion: no collapse (the world fades instead)');
}
console.log('Big bang passed: singularity, monotonic reveal past the visible ground, collapse after the exit, 30/60/120 Hz, once per arrival, replay and reduced motion.');

// Verify the player-facing momentum envelope, not just constant-speed integration.
const envelopes = [];
assert(Math.abs(wpmToIntensity(60) * MAX_WORLD_VELOCITY - 6) < 0.15, '60 retains established traversal pace');
assert(wpmToIntensity(90) / wpmToIntensity(60) > 1.25, '90 adds cadence without a style threshold');
for (const fps of [30, 60, 120]) {
  const journey = new LandscapeMotion();
  for (const wpm of [15, 30, 45, 60, 90, 0]) {
    const intent = wpmToIntensity(wpm);
    for (let i = 0; i < fps * 2; i++) journey.update(1 / fps, { ...motion, intent }, 'running');
    if (intent > 0) assert(Math.abs(journey.velocity - intent * MAX_WORLD_VELOCITY) < 0.02);
  }
  assert(journey.intensity > 0 && journey.intensity < 0.006, 'less than 0.6% momentum remains after two seconds coasting');
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
assert.equal(idle.travel, 0, 'idle world stays still');
const beforeFinish = clean.distance;
clean.update(1 / 60, { ...motion, intent: 1 }, 'finished');
assert(clean.distance > beforeFinish && clean.visibility === 1, 'travel supports the existing finish exit');
console.log('World momentum passed: calibrated 15/30/45/60/90 WPM envelope, 30/60/120 Hz acceleration/coasting, independent stumble, still idle, reduced-motion pose freeze and finish continuity.');

const { frameComposition } = await import(pathToFileURL(path.join(compiled, 'composition.mjs')));
for (const [width, height] of [[390, 844], [1536, 1024], [2560, 1080]]) {
  const camera = new THREE.PerspectiveCamera();
  frameComposition(camera, width, height);
  const center = new THREE.Vector3().project(camera);
  assert(Math.abs((1 - center.y) / 2 - 0.68) < 1e-10, 'Pip occupies the composed world opening');
  const travelPixels = [0, -5, -24].map(z => {
    const a = new THREE.Vector3(2, 0, z).project(camera);
    const b = new THREE.Vector3(1, 0, z).project(camera);
    return (a.x - b.x) * width / 2;
  });
  assert(travelPixels[0] > travelPixels[1] && travelPixels[1] > travelPixels[2]);
}
console.log(`Landscape passed: ${triangles} triangles, safe physical lane, periodic terrain, 30/60/120 Hz travel and composed framing.`);

// Energy reads the actual momentum model. Exercise sustained input, coast, accepted
// errors and suppression without altering any physical/contact signal.
const { WorldEnergy } = await import(pathToFileURL(path.join(compiled, 'worldEnergy.mjs')));
const { LIGHT_TRAILS, TRAIL_ENTRY_WIDTH } = await import(pathToFileURL(path.join(compiled, 'trailShaders.mjs')));
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
  const levels = [], tiers = [];
  let trail = energy.trailDistance;
  for (const wpm of [15, 30, 45, 60, 90]) {
    signal.intent = wpmToIntensity(wpm); advance(7);
    levels.push(value.x); tiers.push(energy.tier);
    assert(energy.trailDistance > trail, 'the ribbon clock only moves forward');
    trail = energy.trailDistance;
  }
  assert(levels.every((n, i) => !i || n > levels[i - 1]), 'smoothly increasing vocabulary');
  assert(tiers.every((n, i) => !i || n > tiers[i - 1]), 'ribbon tiers rise with pace');
  // Settled tiers turn into a readable ribbon count (more than half faded in).
  const ribbons = tiers.map(tier => LIGHT_TRAILS.filter(([, , , , , entry]) => tier >= entry + TRAIL_ENTRY_WIDTH / 2).length);
  assert.deepEqual(ribbons, [1, 2, 3, 5, 7], 'ribbon count steps with pace');
  assert(levels[0] < 0.12 && levels[3] > 0.8, 'subtle 15; established energy at 60');
  assert(levels[4] / levels[3] > 1.15 && levels[4] / levels[3] < 1.25, '90 has restrained headroom within the same vocabulary');
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
  assert.equal(energy.tier, 0, 'reduced motion keeps no ribbons');
  signal.reducedMotion = false;
  energy.update(1 / fps, signal, world, 'running');
  assert.equal(value.w, 0, 'suppressed errors do not replay');
  energy.update(1 / fps, signal, world, 'idle');
  assert.deepEqual(value.toArray(), [0, 0, 0, 0]); assert.equal(energy.phase, 0);
  assert.equal(energy.tier, 0); assert.equal(energy.trailDistance, 0, 'idle resets the ribbon clock');
}
assert(Math.max(...snapshots) - Math.min(...snapshots) < 0.002, 'frame-rate independent energy');
console.log('Energy passed: calibrated progression, ribbon tiers, bounded memory, acceleration, error recovery, reduced motion, reset and 30/60/120 Hz.');
