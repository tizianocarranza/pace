import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const directory = path.resolve('node_modules/.cache/pace-history-check');
await fs.mkdir(directory, { recursive: true });
const source = await fs.readFile('src/lib/runHistory.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
await fs.writeFile(path.join(directory, 'runHistory.mjs'), compiled);
const { recordRun, loadRuns, RUNS_KEY } = await import(pathToFileURL(path.join(directory, 'runHistory.mjs')));

const memory = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), map };
};
const run = (at, wpm) => ({ at, wpm, accuracy: 97, time: 12, peak: wpm + 8, consistency: 90 });

// First run: saved, nothing to compare with.
const storage = memory();
let progress = recordRun(storage, run(1, 50));
assert.equal(progress.previousBest, null);
assert.equal(progress.average, null);
assert.equal(progress.isBest, false);
assert.deepEqual(progress.recent.map(r => r.wpm), [50]);

// Better run: new best, compared with the average before it.
progress = recordRun(storage, run(2, 60));
assert.equal(progress.previousBest, 50);
assert.equal(progress.average, 50);
assert.equal(progress.isBest, true);

// Same run again (strict-mode double mount): stored once, same answer.
const again = recordRun(storage, run(2, 60));
assert.deepEqual(again, progress);
assert.equal(loadRuns(storage).length, 2);

// Slower run: not a best; average of the previous runs.
progress = recordRun(storage, run(3, 52));
assert.equal(progress.isBest, false);
assert.equal(progress.previousBest, 60);
assert.equal(progress.average, 55);

// Equal to the best is not a new best.
assert.equal(recordRun(storage, run(4, 60)).isBest, false);

// Cap and recent window.
for (let i = 5; i < 200; i++) recordRun(storage, run(i, 40 + (i % 7)));
assert.equal(loadRuns(storage).length, 150);
progress = recordRun(storage, run(300, 45));
assert.equal(progress.recent.length, 10);
assert.equal(progress.recent.at(-1).at, 300);

// Modes compare only with themselves; runs saved without a mode are English short.
const modes = memory();
const inMode = (at, wpm, mode) => ({ ...run(at, wpm), mode });
recordRun(modes, run(1, 80));
recordRun(modes, inMode(2, 40, 'es:long'));
progress = recordRun(modes, inMode(3, 70, 'en:short'));
assert.equal(progress.previousBest, 80);
assert.deepEqual(progress.recent.map(r => r.at), [1, 3]);
progress = recordRun(modes, inMode(4, 50, 'es:long'));
assert.equal(progress.previousBest, 40);
assert.equal(progress.average, 40);
assert.equal(progress.isBest, true);
assert.deepEqual(progress.recent.map(r => r.at), [2, 4]);
assert.equal(recordRun(modes, inMode(5, 30, 'es:short')).previousBest, null);
assert.equal(loadRuns(modes).length, 5);
modes.setItem(RUNS_KEY, JSON.stringify([inMode(1, 40, 7)]));
assert.equal(loadRuns(modes).length, 0);

// Corrupt or foreign data reads as empty; invalid entries are dropped.
const corrupt = memory();
corrupt.setItem(RUNS_KEY, '{nope');
assert.deepEqual(loadRuns(corrupt), []);
corrupt.setItem(RUNS_KEY, JSON.stringify([run(1, 40), { at: 2, wpm: 'fast' }, null]));
assert.equal(loadRuns(corrupt).length, 1);

// Storage that throws (private mode, quota): no crash, still compares.
const broken = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('quota'); } };
progress = recordRun(broken, run(1, 50));
assert.equal(progress.previousBest, null);

console.log('run history ok');
