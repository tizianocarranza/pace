import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const directory = path.resolve('node_modules/.cache/pace-speed-check');
await fs.mkdir(directory, { recursive: true });
const source = await fs.readFile('src/lib/visualSpeed.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
await fs.writeFile(path.join(directory, 'visualSpeed.mjs'), compiled);
const { wpmToIntensity, resolveVisualSpeed } = await import(pathToFileURL(path.join(directory, 'visualSpeed.mjs')));
assert.equal(wpmToIntensity(0), 0);
for (const invalid of [-1, NaN, Infinity, -Infinity]) assert.equal(wpmToIntensity(invalid), 0);
assert(wpmToIntensity(10) > 0.2);
assert(wpmToIntensity(30) > 0.5 && wpmToIntensity(30) < 0.65);
assert(wpmToIntensity(45) > 0.75);
assert(wpmToIntensity(60) > 0.94);
assert.equal(wpmToIntensity(65), 1);
assert.equal(wpmToIntensity(90), wpmToIntensity(120));
let previous = 0;
for (let wpm = 0; wpm <= 120; wpm += 0.5) {
  const intensity = wpmToIntensity(wpm);
  assert(intensity >= previous && intensity <= 1);
  assert(intensity - previous < 0.03, 'fine slider changes never jump visual modes');
  previous = intensity;
}
for (const wpm of [0, 15, 30, 45, 60, 90]) {
  const simulated = resolveVisualSpeed(0, 'idle', wpm);
  assert.equal(simulated.intensity, resolveVisualSpeed(wpm, 'running', null).intensity);
  assert.equal(simulated.status, 'running', 'zero simulator input coasts rather than resetting the world');
  assert(simulated.sustainedInput, 'simulation remains active without keystrokes');
  assert.deepEqual(resolveVisualSpeed(23, 'finished', wpm), resolveVisualSpeed(23, 'finished', null), 'real finish wins');
}
assert.deepEqual(resolveVisualSpeed(0, 'idle', null), {
  effectiveWpm: 0, intensity: 0, sustainedInput: false, status: 'idle',
});
assert.equal(resolveVisualSpeed(30, 'running', null).effectiveWpm, 30);
console.table([0, 10, 15, 30, 45, 60, 65, 90].map(wpm => ({ wpm, intensity: Number(wpmToIntensity(wpm).toFixed(3)) })));
console.log('Visual speed passed: continuous calibrated range, shared real/simulated mapping, zero-speed coasting, finish precedence and return to real input.');
