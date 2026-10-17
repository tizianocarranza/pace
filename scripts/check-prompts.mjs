import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const directory = path.resolve('node_modules/.cache/pace-prompts-check');
await fs.mkdir(directory, { recursive: true });
const source = await fs.readFile('src/data/prompts.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
await fs.writeFile(path.join(directory, 'prompts.mjs'), compiled);
const { PROMPTS, LENGTH_BOUNDS, lengthOf, promptsFor, pickPrompt } =
  await import(pathToFileURL(path.join(directory, 'prompts.mjs')));

// Characters each language may use: what its keyboards type in one key or a dead key.
const ALLOWED = {
  en: /^[A-Za-z0-9 ,.;:'-]+$/,
  es: /^[A-Za-z0-9áéíóúüñ ,.;:'-]+$/,
};
const MIN_PER_MODE = 15;

const problems = [];
for (const [language, prompts] of Object.entries(PROMPTS)) {
  const seen = new Set();
  for (const text of prompts) {
    const label = `${language} "${text.slice(0, 40)}…" (${text.length})`;
    if (seen.has(text)) problems.push(`${label}: duplicate`);
    seen.add(text);
    if (!ALLOWED[language].test(text)) problems.push(`${label}: character outside ${ALLOWED[language]}`);
    if (text !== text.normalize('NFC')) problems.push(`${label}: not NFC`);
    if (text !== text.trim() || text.includes('  ')) problems.push(`${label}: stray spaces`);
    if (lengthOf(text) === null) problems.push(`${label}: between lengths ${JSON.stringify(LENGTH_BOUNDS)}`);
  }
  for (const length of Object.keys(LENGTH_BOUNDS)) {
    const count = promptsFor({ language, length }).length;
    if (count < MIN_PER_MODE) problems.push(`${language}:${length}: only ${count} prompts`);
  }
}
assert.deepEqual(problems, [], `\n${problems.join('\n')}`);

// Never the avoided prompts; the most recent wins when the pool is too small for all.
const mode = { language: 'es', length: 'medium' };
const pool = promptsFor(mode);
for (let i = 0; i < 200; i++) {
  const recent = pool.slice(0, 8);
  assert.ok(!recent.includes(pickPrompt(mode, recent)));
}
const everything = [...pool, pool[0]];
for (let i = 0; i < 50; i++) assert.notEqual(pickPrompt(mode, everything), pool[0]);
assert.equal(pickPrompt(mode, [], () => 0), pool[0]);
assert.equal(pickPrompt(mode, [], () => 0.9999), pool.at(-1));

const sizes = Object.keys(PROMPTS).flatMap(language =>
  Object.keys(LENGTH_BOUNDS).map(length => `${language}:${length} ${promptsFor({ language, length }).length}`));
console.log(`prompts ok (${sizes.join(', ')})`);
