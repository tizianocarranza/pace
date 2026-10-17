// Local development review only. Plays one clock-stepped session (intro, idle, simulated
// speed, first theme toggle, night, real typing to the finish, results) and records how long
// each frame took in wall-clock time, plus Chrome's script/layout/style/paint durations.
// SwiftShader rasterizes on the CPU, so frame time tracks fragment work: compare runs of
// the same build against each other, never against real GPU FPS.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const output = path.resolve(process.env.PACE_REVIEW_DIR ?? 'assets/reviews/perf');
await mkdir(output, { recursive: true });
const label = process.argv.find(a => a.startsWith('--label='))?.split('=')[1] ?? 'perf';
const mobile = process.argv.includes('--mobile');
const width = mobile ? 390 : 1536, height = mobile ? 844 : 1024;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9226', '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
  `--user-data-dir=${path.join(os.tmpdir(), `pace-perf-${process.pid}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { label, width, height, phases: {}, errors: [] };
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
    // Steps the clock one 60 Hz frame at a time; onFrame(i) runs before each step.
    window.stepFrames = async (frames, onFrame) => {
      const times = [];
      for (let i = 0; i < frames; i++) {
        onFrame?.(i);
        const start = realNow();
        reviewTime += 1000/60;
        await new Promise(requestAnimationFrame);
        times.push(realNow() - start);
      }
      return times;
    };
  ` });
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const metrics = async () => Object.fromEntries((await call('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const stats = times => {
    const sorted = [...times].sort((a, b) => a - b);
    const at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    return { frames: times.length, p50: +at(0.5).toFixed(2), p95: +at(0.95).toFixed(2), max: +sorted.at(-1).toFixed(2) };
  };
  const phase = async (name, frames, onFrame = 'undefined') => {
    const before = await metrics();
    const times = await evaluate(`stepFrames(${frames}, ${onFrame})`);
    const after = await metrics();
    const ms = key => +(((after[key] ?? 0) - (before[key] ?? 0)) * 1000 / times.length).toFixed(3);
    const render = await evaluate(`(()=>{const r=window.__paceReview.renderer.info.render;return {draws:r.calls,triangles:r.triangles};})()`);
    report.phases[name] = { ...stats(times), perFrame: { script: ms('ScriptDuration'), layout: ms('LayoutDuration'),
      style: ms('RecalcStyleDuration'), task: ms('TaskDuration') }, ...render };
    const p = report.phases[name];
    console.log(name.padEnd(12), `p50 ${p.p50}ms  p95 ${p.p95}ms  max ${p.max}ms  script ${p.perFrame.script}ms  draws ${p.draws}`);
  };
  await call('Page.navigate', { url: 'http://localhost:3000/' });
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`!!window.__paceReview?.scene.getObjectByName('PipBody') && !!document.querySelector('aside summary') && getComputedStyle(document.querySelector('canvas').closest('.fixed')).opacity==='1'`)) break;
    await sleep(150);
  }
  await sleep(500);
  await evaluate(`document.querySelectorAll('aside').forEach(a=>a.style.visibility='hidden')`);
  await phase('intro', 240);
  await phase('idle', 120);
  const simulate = wpm => evaluate(`(()=>{const box=document.querySelector('aside input[type=checkbox]');box.closest('aside').querySelector('details').open=true;if(${wpm === null}){if(box.checked)box.click();return;}if(!box.checked)box.click();Array.from(box.closest('aside').querySelectorAll('button')).find(b=>b.textContent==='${wpm}').click();})()`);
  await simulate(60); await sleep(100);
  await phase('sim-60', 180);
  await simulate(90); await sleep(100);
  await phase('sim-90', 180);
  await evaluate(`document.querySelector('.celestial-toggle').click()`);
  await phase('toggle', 120);
  await phase('night-90', 180);
  await simulate(null); await sleep(100);
  // Real keys at ~72 WPM (one character every 10 frames) until the prompt is done.
  const prompt = await evaluate(`document.querySelector('main section p').textContent`);
  await phase('typing', prompt.length * 10,
    `i => { if (i % 10 === 0) { const key = ${JSON.stringify(prompt)}[i / 10]; window.dispatchEvent(new KeyboardEvent('keydown', { key })); } }`);
  // Pip runs off screen, then the results mount.
  for (let i = 0; i < 40 && !(await evaluate(`!!document.querySelector('main section button')`)); i++) await evaluate('stepFrames(30)');
  await phase('results', 180);
  await writeFile(path.join(output, `${label}${mobile ? '-mobile' : ''}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ errors: report.errors.length, output }));
  void call('Browser.close'); await sleep(150);
  process.exitCode = report.errors.length ? 1 : 0;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { socket?.close(); chrome.kill(); }
