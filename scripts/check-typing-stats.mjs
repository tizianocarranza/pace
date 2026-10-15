import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const directory = path.resolve('node_modules/.cache/pace-typing-check');
await fs.mkdir(directory, { recursive: true });
const source = await fs.readFile('src/lib/typingStats.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
await fs.writeFile(path.join(directory, 'typingStats.mjs'), compiled);
const { liveWpm, averageWpm, accuracy, LIVE_WINDOW_MS } = await import(pathToFileURL(path.join(directory, 'typingStats.mjs')));

/** Samples the live WPM every frame for a steady stream of correct keys, then a pause. */
function run(wpm, typingMs, pauseMs = 0) {
  const interval = 60_000 / (wpm * 5);
  const keys = [];
  for (let t = 0; t < typingMs; t += interval) keys.push(t);
  const samples = [];
  for (let now = 0; now <= typingMs + pauseMs; now += 1000 / 60) {
    const typed = keys.filter(time => time <= now);
    const recent = typed.filter(time => now - time < LIVE_WINDOW_MS);
    samples.push({ now, keyed: typed.length, wpm: liveWpm(recent, now, 0, typed.length) });
  }
  return { samples, keyEnd: keys.at(-1) };
}

for (const target of [30, 60, 90]) {
  const { samples } = run(target, 12_000);
  // Close to the real pace from the first second, not a 4 s ramp.
  for (const s of samples.filter(s => s.now >= 1000)) {
    assert(Math.abs(s.wpm - target) <= Math.max(4, target * 0.08), `${target} WPM read ${s.wpm} at ${s.now.toFixed(0)} ms`);
  }
  // Steady: within ±1 once the window is full (no 3-WPM flicker).
  for (const s of samples.filter(s => s.now >= 5500)) {
    assert(Math.abs(s.wpm - target) <= 1, `${target} WPM steady read ${s.wpm} at ${s.now.toFixed(0)} ms`);
  }
}

// After the last key the reading only falls, gently, and reaches 0 within the window.
{
  const { samples, keyEnd } = run(60, 8000, 6000);
  const after = samples.filter(s => s.now > keyEnd);
  for (let i = 1; i < after.length; i++) {
    assert(after[i].wpm <= after[i - 1].wpm, 'decay is monotonic');
    assert(after[i - 1].wpm - after[i].wpm <= 2, 'decay glides');
  }
  assert.equal(after.at(-1).wpm, 0);
  assert.equal(liveWpm([], keyEnd + LIVE_WINDOW_MS, 0, 40), 0);
}

// Edge cases.
assert.equal(liveWpm([], 0, null, 0), 0);
assert.equal(liveWpm([0], 100, 0, 1), 0, 'one key is not a pace');
assert(liveWpm([0, 200], 200, 0, 2) <= 70, 'second key cannot read as a sprint');

// Results keep the original rules.
assert.equal(averageWpm(0, 0, 60_000), 0);
assert.equal(averageWpm(300, 0, 60_000), 60);
assert.equal(averageWpm(300, null, 60_000), 0);
assert.equal(averageWpm(300, 0, null), 0);
assert.equal(averageWpm(5, 1000, 1000), 0);
assert.equal(accuracy(0, 0), 100);
assert.equal(accuracy(9, 10), 90);
assert.equal(accuracy(2, 3), 67);

console.log('typing stats ok');
