// Showcase capture: a short, silent 4:5 video of a full run, for social posts.
//
//   node scripts/capture-showcase.mjs [options]
//
//   --url=https://pace-ten-blush.vercel.app   page to capture (or http://localhost:3000)
//   --wpm=100            typing speed the run settles into (it starts a little slower)
//   --fps=30             30 or 60
//   --no-typo            type the prompt without the single mistake
//   --no-outro           end on the night scene, without the closing card
//   --label=...          text under the closing card (default: the URL's host)
//   --chrome=PATH        Chrome or Edge executable, if it is not found on its own
//   --gpu                render with the GPU instead of SwiftShader (faster, less predictable)
//
// The page's clock is stepped like review-composition.mjs: performance.now, Date.now,
// timers, CSS animations and transitions all follow a virtual time that advances exactly
// 1/60 s per frame, so the video is perfectly smooth however slow the machine is.
// Frames go to assets/reviews/showcase/ (Git-ignored); with ffmpeg on the PATH they are
// encoded to assets/reviews/showcase/pace-showcase.mp4.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const flag = name => process.argv.includes(`--${name}`);

const url = arg('url', 'https://pace-ten-blush.vercel.app/');
const targetWpm = Number(arg('wpm', 100));
const fps = Number(arg('fps', 30)) === 60 ? 60 : 30;
const typo = !flag('no-typo');
const outro = !flag('no-outro');
const label = arg('label', new URL(url).host);
// 4:5 at 1080×1350: an 864×1080 layout (desktop breakpoints) rendered at 1.25×.
const width = 864, height = 1080, scale = 1.25;

const output = path.resolve(process.env.PACE_SHOWCASE_DIR ?? 'assets/reviews/showcase');
const framesDir = path.join(output, 'frames');
await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });

function findChrome() {
  const given = arg('chrome');
  if (given) return given;
  const env = process.env;
  const candidates = process.platform === 'win32' ? [
    `${env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find(p => p && existsSync(p));
  if (!found) throw Error('Chrome not found: pass --chrome="C:/path/to/chrome.exe"');
  return found;
}

// Deterministic randomness: the same rhythm on every capture.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const NEIGHBOURS = { a: 's', b: 'v', c: 'x', d: 's', e: 'r', f: 'd', g: 'f', h: 'g', i: 'o', j: 'h', k: 'j',
  l: 'k', m: 'n', n: 'b', o: 'i', p: 'o', q: 'w', r: 'e', s: 'a', t: 'r', u: 'y', v: 'c', w: 'e', x: 'z',
  y: 't', z: 'x' };

/** A human rhythm: starts near 3/4 of the target speed, settles in, a little slower after
 * spaces, with one wrong neighbouring key near the middle. Times are virtual ms. */
function keySchedule(text, start) {
  const rand = mulberry32(11);
  const keys = [];
  let at = start;
  let typoAt = -1;
  if (typo) for (let i = Math.floor(text.length * 0.45); i < text.length; i++) {
    if (/[a-z]/.test(text[i])) { typoAt = i; break; }
  }
  for (let i = 0; i < text.length; i++) {
    const ramp = 1 - (1 - Math.min(1, i / 16)) ** 2;
    const wpm = targetWpm * (0.72 + 0.28 * ramp);
    let gap = (60000 / (wpm * 5)) * (0.7 + rand() * 0.6);
    if (text[i - 1] === ' ') gap *= 1.2;
    if (i === typoAt) {
      keys.push({ at, key: NEIGHBOURS[text[i]] });
      at += 240 + rand() * 90;
    }
    keys.push({ at, key: text[i] });
    at += gap;
  }
  return keys;
}

// Runs in the page before any of its scripts.
const SETUP = `
  try { localStorage.setItem('pace-theme', 'day'); localStorage.setItem('pace-mode', 'en:short'); } catch {}
  window.reviewTime = 0;
  const epoch = Date.now();
  performance.now = () => window.reviewTime;
  Date.now = () => epoch + window.reviewTime;

  // Timers on the virtual clock. Long ones from the start (so a slow capture never trips
  // the intro's fallback), all of them once the capture begins.
  const real = { st: setTimeout.bind(window), ct: clearTimeout.bind(window),
    si: setInterval.bind(window), ci: clearInterval.bind(window) };
  const timers = new Map();
  let nextId = 1e7;
  window.__virtual = false;
  window.setTimeout = (fn, delay = 0, ...args) => {
    if (!window.__virtual && delay < 1000) return real.st(fn, delay, ...args);
    const id = ++nextId; timers.set(id, { fn, args, at: window.reviewTime + delay, every: 0 }); return id;
  };
  window.setInterval = (fn, delay = 0, ...args) => {
    if (!window.__virtual) return real.si(fn, delay, ...args);
    const id = ++nextId; const every = Math.max(1, delay);
    timers.set(id, { fn, args, at: window.reviewTime + every, every }); return id;
  };
  window.clearTimeout = id => { if (timers.has(id)) timers.delete(id); else real.ct(id); };
  window.clearInterval = id => { if (timers.has(id)) timers.delete(id); else real.ci(id); };
  const runTimers = () => {
    for (let guard = 0; guard < 1000; guard++) {
      let due = null;
      for (const [id, t] of timers) if (t.at <= window.reviewTime && (!due || t.at < due[1].at)) due = [id, t];
      if (!due) return;
      const [id, t] = due;
      if (t.every) t.at += t.every; else timers.delete(id);
      if (typeof t.fn === 'function') try { t.fn(...t.args); } catch (e) { console.error(e); }
    }
  };

  // CSS animations, transitions and Web Animations: paused and placed at their own
  // virtual age on every frame.
  const born = new WeakMap();
  const syncAnimations = () => {
    for (const a of document.getAnimations()) {
      let start = born.get(a);
      if (start === undefined) { start = window.reviewTime; born.set(a, start); try { a.pause(); } catch {} }
      const age = window.reviewTime - start;
      const end = a.effect?.getComputedTiming?.().endTime;
      try {
        if (Number.isFinite(end) && age >= end) { if (a.playState !== 'finished') a.finish(); }
        else a.currentTime = age;
      } catch {}
    }
  };
  // Hold everything at age 0 while the page loads.
  const hold = () => { syncAnimations(); if (!window.__virtual) requestAnimationFrame(hold); };
  requestAnimationFrame(hold);

  // Keys: dispatched like the hardware keyboard the game listens to on window.
  window.__keys = [];
  const runKeys = () => {
    while (window.__keys.length && window.__keys[0].at <= window.reviewTime) {
      const { key } = window.__keys.shift();
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    }
  };

  window.__step = async (substeps) => {
    for (let i = 0; i < substeps; i++) {
      window.reviewTime += 1000 / 60;
      runKeys(); runTimers(); syncAnimations();
      await new Promise(requestAnimationFrame);
    }
    syncAnimations();
  };
`;

const chromePath = findChrome();
const profile = path.join(os.tmpdir(), `pace-showcase-${process.pid}`);
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--mute-audio', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ...(flag('gpu') ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
  `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
let frame = 0;
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0].trim(); } catch { await sleep(150); }
  }
  if (!port) throw Error('Chrome did not start');
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch { /* starting */ }
    if (!target) await sleep(200);
  }
  if (!target) throw Error('Chrome debugger unavailable');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const promise = pending.get(message.id); pending.delete(message.id);
      if (message.error) promise.reject(Error(JSON.stringify(message.error))); else promise.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.exception?.description);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id; pending.set(next, { resolve, reject });
    socket.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };

  await call('Runtime.enable'); await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: SETUP });
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  await call('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  console.log(`Opening ${url}`);
  await call('Page.navigate', { url });

  // Ready: the scene has drawn (its layer is switching to visible) and the fonts are in.
  let ready = false;
  for (let i = 0; i < 300 && !ready; i++) {
    try {
      ready = await evaluate(`!!document.querySelector('canvas') && !!document.querySelector('.fixed.opacity-100 canvas')
        && document.fonts.status === 'loaded' && !!document.querySelector('main p[lang]')`);
    } catch { /* navigating */ }
    if (!ready) await sleep(200);
  }
  if (!ready) throw Error(`The scene never became ready: ${await evaluate(`JSON.stringify({ href: location.href,
    canvas: !!document.querySelector('canvas'), layer: document.querySelector('canvas')?.closest('.fixed')?.className,
    fonts: document.fonts.status, prompt: !!document.querySelector('main p[lang]') })`).catch(e => e.message)}`);
  await sleep(400);

  const substeps = 60 / fps;
  const shot = async () => {
    const { data } = await call('Page.captureScreenshot', { format: 'jpeg', quality: 93 });
    await writeFile(path.join(framesDir, `frame_${String(frame).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
    frame++;
    if (frame % fps === 0) process.stdout.write(`\r  ${(frame / fps).toFixed(0)} s captured`);
  };
  const step = async () => { await evaluate(`__step(${substeps})`); await shot(); };
  const hold = async seconds => { for (let i = 0; i < Math.round(seconds * fps); i++) await step(); };
  const until = async (condition, maxSeconds) => {
    for (let i = 0; i < maxSeconds * fps; i++) { if (await evaluate(condition)) return true; await step(); }
    return false;
  };
  const mouse = (type, x, y) => call('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });

  await evaluate('window.__virtual = true');
  await shot();

  // 1. Intro: the scene fades in, the big bang, Pip runs in.
  console.log('Intro');
  await hold(4.2);
  await until(`document.documentElement.dataset.genesis === 'done'`, 4);
  await hold(0.5);

  // 2. The run.
  const text = await evaluate(`document.querySelector('main p[lang]').getAttribute('aria-label')`);
  const keys = keySchedule(text, 0);
  console.log(`\nTyping "${text}" (${keys.length} keys, ~${(keys.at(-1).at / 1000).toFixed(1)} s)`);
  await evaluate(`window.__keys = ${JSON.stringify(keys)}.map(k => ({ ...k, at: k.at + reviewTime }))`);

  // 3. Pip runs off and the results draw in.
  const results = `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'try again')`;
  if (!await until(results, 40)) throw Error('The results never appeared');
  console.log('\nResults');
  await hold(3.8);

  // 4. Back to the world, then night.
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'try again').click()`);
  await hold(1.4);
  const sun = await evaluate(`(() => { const r = document.querySelector('.celestial-toggle').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  console.log('\nNight');
  await mouse('mouseMoved', sun.x - 60, sun.y + 80); await step();
  await mouse('mouseMoved', sun.x, sun.y);
  await hold(0.6);
  await mouse('mousePressed', sun.x, sun.y); await mouse('mouseReleased', sun.x, sun.y);
  await hold(0.5);
  await mouse('mouseMoved', sun.x - 260, sun.y + 420);
  await hold(outro ? 2.6 : 3.4);

  // 5. Closing card over the night scene.
  if (outro) {
    console.log('\nOutro');
    await evaluate(`(() => {
      const card = document.createElement('div');
      card.id = 'showcase-outro';
      card.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;color:var(--ink);background:color-mix(in srgb, var(--page) 62%, transparent);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);opacity:0;pointer-events:none';
      card.innerHTML = '<div style="font-size:76px;font-weight:500;letter-spacing:-0.045em;line-height:1">pace.</div>'
        + '<div style="font-size:21px;letter-spacing:-0.01em;color:var(--muted)">a typing game where Pip runs as fast as you type</div>'
        + '<div style="margin-top:22px;font-size:15px;letter-spacing:0.03em;color:var(--muted)">' + ${JSON.stringify(label)} + '</div>';
      document.body.append(card);
    })()`);
    const fade = Math.round(0.9 * fps);
    for (let i = 1; i <= fade; i++) {
      const t = i / fade, eased = 1 - (1 - t) ** 3;
      await evaluate(`document.getElementById('showcase-outro').style.opacity = ${eased}`);
      await step();
    }
    await hold(2.4);
  }

  console.log(`\n${frame} frames (${(frame / fps).toFixed(1)} s) in ${framesDir}`);
  if (errors.length) console.log('Page errors:', errors);
  void call('Browser.close'); await sleep(200);
} catch (error) {
  console.error('\n', error);
  process.exitCode = 1;
} finally {
  socket?.close();
  chrome.kill();
}

if (!process.exitCode) {
  const video = path.join(output, 'pace-showcase.mp4');
  const ffmpeg = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps),
    '-i', path.join(framesDir, 'frame_%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video], { stdio: 'inherit' });
  if (ffmpeg.error) console.log('ffmpeg not found: zip the frames folder, or install ffmpeg (winget install Gyan.FFmpeg) and run again.');
  else if (ffmpeg.status === 0) console.log(`Video: ${video}`);
}
