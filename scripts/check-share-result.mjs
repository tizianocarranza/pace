import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const directory = path.resolve('node_modules/.cache/pace-share-check');
await fs.mkdir(directory, { recursive: true });
for (const [source, name] of [['src/lib/runMode.ts', 'runMode.mjs'], ['src/lib/shareResult.ts', 'shareResult.mjs']]) {
  const compiled = ts.transpileModule(await fs.readFile(source, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText.replace('"@/lib/runMode"', '"./runMode.mjs"');
  await fs.writeFile(path.join(directory, name), compiled);
}
const { resultSlug, parseResultSlug } = await import(pathToFileURL(path.join(directory, 'shareResult.mjs')));

const result = { wpm: 87, accuracy: 96, mode: { language: 'es', length: 'long' } };
assert.equal(resultSlug(result), '87-96-es-long');
assert.deepEqual(parseResultSlug('87-96-es-long'), result);
assert.deepEqual(parseResultSlug(resultSlug({ ...result, wpm: 0, accuracy: 100 })), { ...result, wpm: 0, accuracy: 100 });

// Beyond three digits the link carries the cap, and still opens.
assert.equal(resultSlug({ ...result, wpm: 1500 }), '999-96-es-long');
assert.equal(parseResultSlug('999-96-es-long').wpm, 999);

// Anything else is not a result.
for (const slug of ['', 'abc', '87-101-es-long', '1000-96-es-long', '87-96-fr-long', '87-96-es-huge',
  '87.5-96-es-long', '-1-96-es-long', '87-96-es-long-extra', '87-96-ES-long']) {
  assert.equal(parseResultSlug(slug), null, slug);
}

console.log('share result ok');
