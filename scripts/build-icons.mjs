// Rasterizes src/app/icon.svg into src/app/favicon.ico (16/32/48 PNG entries) and
// src/app/apple-icon.png. Run after changing the SVG: node scripts/build-icons.mjs
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

// sharp ships with next; resolve it through next so no extra dependency is needed.
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [require.resolve('next')] }));

const svg = await fs.readFile('src/app/icon.svg', 'utf8');
const raster = (source, size) =>
  sharp(Buffer.from(source), { density: Math.ceil(size * 72 / 64 * 4) }).resize(size, size).png().toBuffer();

const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map(size => raster(svg, size)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((size, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngs[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return entry;
});
await fs.writeFile('src/app/favicon.ico', Buffer.concat([header, ...entries, ...pngs]));

// iOS wants an opaque square and rounds it itself: the gradient fills the whole tile.
const square = svg.replace('<circle cx="32" cy="32" r="32" fill="url(#sky)"/>', '<rect width="64" height="64" fill="url(#sky)"/>');
if (square === svg) throw Error('icon.svg: background circle not found');
await sharp(await raster(square, 180)).flatten({ background: '#4a74e6' }).png().toFile('src/app/apple-icon.png');

console.log('icons ok (favicon.ico 16/32/48, apple-icon.png 180)');
