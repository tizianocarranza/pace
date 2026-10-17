// Local development review only. Plays one clock-stepped session (intro, idle, simulated
// speed, first theme toggle, night, real typing to the finish, results) and records how long
// each frame took in wall-clock time, a synchronous WebGL render time, and Chrome's
// script/layout/style durations. Compare runs of the same mode against each other.
// SwiftShader (default) has a large fixed cost per frame and hides shader changes; use
// --gpu (the machine's GPU) with --dpr=2 or 3 to see fragment work.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const output = path.resolve(process.env.PACE_REVIEW_DIR ?? 'assets/reviews/perf');
await mkdir(output, { recursive: true });
const label = process.argv.find(a => a.startsWith('--label='))?.split('=')[1] ?? 'perf';
const mobile = process.argv.includes('--mobile');
// --gpu renders on the machine's GPU (ANGLE's default backend) instead of SwiftShader.
const gpu = process.argv.includes('--gpu');
// --url=http://localhost:3001/ measures a production build (next build && next start -p 3001).
// Production has no simulator or scene handle: the simulated-speed phases and the WebGL
// timing are skipped, the typing and results phases remain.
const url = process.argv.find(a => a.startsWith('--url='))?.slice(6) ?? 'http://localhost:3000/';
const dpr = Number(process.argv.find(a => a.startsWith('--dpr='))?.split('=')[1] ?? 1);
const width = mobile ? 390 : 1536, height = mobile ? 844 : 1024;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9226', '--no-first-run', '--no-default-browser-check',
  ...(gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
  '--disable-background-timer-throttling',
  `--user-data-dir=${path.join(os.tmpdir(), `pace-perf-${process.pid}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { label, width, height, dpr, phases: {}, errors: [] };
let socket;
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9226/json/list')).json()).find(t => t.type === 'page'); } catch { /* Chrome starting */ }
    if (!target) await sleep(200);
  }
  if (!target) throw Error('Chrome debugger unavailable');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const promise = pending.get(message.id); pending.delete(message.id);
      if (message.error) promise.reject(Error(JSON.stringify(message.error))); else promise.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown' ||
      (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')) report.errors.push(message.params);
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
  await call('Runtime.enable'); await call('Page.enable'); await call('Performance.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    try { localStorage.setItem('pace-theme', 'day'); } catch {}
    window.realNow = performance.now.bind(performance);
    window.reviewTime=0; const epoch=Date.now(); performance.now=()=>window.reviewTime; Date.now=()=>epoch+window.reviewTime;
    // Steps the clock one 60 Hz frame at a time; onFrame(i) runs before each step. Every
    // 10th frame also times one extra synchronous render of the same scene (readPixels
    // waits for the rasterizer), which isolates WebGL cost from compositing and vsync.
    const pixel = new Uint8Array(4);
    window.stepFrames = async (frames, onFrame) => {
      const times = [], renders = [];
      for (let i = 0; i < frames; i++) {
        onFrame?.(i);
        const start = realNow();
        reviewTime += 1000/60;
        await new Promise(requestAnimationFrame);
        times.push(realNow() - start);
        if (i % 10 === 5 && window.__paceReview) {
          const { renderer, scene, camera } = window.__paceReview, gl = renderer.getContext();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          const begin = realNow();
          renderer.render(scene, camera);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          renders.push(realNow() - begin);
        }
      }
      return { times, renders };
    };
  ` });
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
  const metrics = async () => Object.fromEntries((await call('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const stats = times => {
    const sorted = [...times].sort((a, b) => a - b);
    const at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    // Hitches: frames over 20 ms, by index within the phase.
    const hitches = times.flatMap((t, i) => t > 20 ? [[i, +t.toFixed(1)]] : []);
    return { frames: times.length, p50: +at(0.5).toFixed(2), p95: +at(0.95).toFixed(2), max: +sorted.at(-1).toFixed(2), hitches };
  };
  const phase = async (name, frames, onFrame = 'undefined') => {
    const before = await metrics();
    const { times, renders } = await evaluate(`stepFrames(${frames}, ${onFrame})`);
    const after = await metrics();
    const ms = key => +(((after[key] ?? 0) - (before[key] ?? 0)) * 1000 / times.length).toFixed(3);
    const render = await evaluate(`(()=>{const r=window.__paceReview?.renderer.info.render;return r?{draws:r.calls,triangles:r.triangles,programs:window.__paceReview.renderer.info.programs.length}:{};})()`);
    report.phases[name] = { ...stats(times), webgl: renders.length ? stats(renders) : null, perFrame: { script: ms('ScriptDuration'),
      layout: ms('LayoutDuration'), style: ms('RecalcStyleDuration'), task: ms('TaskDuration') }, ...render };
    const p = report.phases[name];
    console.log(name.padEnd(10), `frame p50 ${p.p50} p95 ${p.p95} max ${p.max}`.padEnd(38),
      `webgl p50 ${p.webgl?.p50 ?? '-'}`.padEnd(17), `script ${p.perFrame.script}`.padEnd(15), `draws ${p.draws ?? '-'} programs ${p.programs ?? '-'}`, p.hitches.length ? `hitches ${JSON.stringify(p.hitches)}` : '');
  };
  await call('Page.navigate', { url });
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`!!document.querySelector('canvas') && getComputedStyle(document.querySelector('canvas').closest('.fixed')).opacity==='1'`)) break;
    await sleep(150);
  }
  await sleep(500);
  await evaluate(`document.querySelectorAll('aside').forEach(a=>a.style.visibility='hidden')`);
  await phase('intro', 240);
  await phase('idle', 120);
  // --no-sim skips the simulated phases, so typing is the first run (as in production).
  const dev = !process.argv.includes('--no-sim') && await evaluate(`!!window.__paceReview && !!document.querySelector('aside summary')`);
  const simulate = wpm => evaluate(`(()=>{const box=document.querySelector('aside input[type=checkbox]');box.closest('aside').querySelector('details').open=true;if(${wpm === null}){if(box.checked)box.click();return;}if(!box.checked)box.click();Array.from(box.closest('aside').querySelectorAll('button')).find(b=>b.textContent==='${wpm}').click();})()`);
  if (dev) {
    await simulate(60); await sleep(100);
    await phase('sim-60', 180);
    await simulate(90); await sleep(100);
    await phase('sim-90', 180);
  }
  await evaluate(`document.querySelector('.celestial-toggle').click()`);
  await phase('toggle', 120);
  await phase(dev ? 'night-90' : 'night', 180);
  if (dev) { await simulate(null); await sleep(100); }
  // Real keys at ~72 WPM (one character every 10 frames) until the prompt is done.
  const prompt = await evaluate(`document.querySelector('main section p').textContent`);
  await phase('typing', prompt.length * 10,
    `i => { if (i % 10 === 0) { const key = ${JSON.stringify(prompt)}[i / 10]; window.dispatchEvent(new KeyboardEvent('keydown', { key })); } }`);
  // Pip runs off screen, then the results mount.
  for (let i = 0; i < 40 && !(await evaluate(`!!document.querySelector('main section button')`)); i++) await evaluate('stepFrames(30)');
  await phase('results', 180);
  report.renderer = await evaluate(`(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);})()`);
  console.log('renderer', report.renderer);
  await writeFile(path.join(output, `${label}${mobile ? '-mobile' : ''}${gpu ? '-gpu' : ''}${dpr !== 1 ? `-dpr${dpr}` : ''}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ errors: report.errors.length, output }));
  void call('Browser.close'); await sleep(150);
  process.exitCode = report.errors.length ? 1 : 0;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { socket?.close(); chrome.kill(); }
