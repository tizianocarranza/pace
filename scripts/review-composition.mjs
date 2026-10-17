// Local development review only. Clock-stepped captures compare identical motion
// and terrain coordinates. The app's simulator supplies speed without fake typing.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const output = path.resolve(process.env.PACE_REVIEW_DIR ?? 'assets/reviews/composition');
await mkdir(output, { recursive: true });
const quick = process.argv.includes('--quick');
const mobile = process.argv.includes('--mobile');
const night = process.argv.includes('--night');
const simulatedWpm = Number(process.argv.find(a => a.startsWith('--wpm='))?.split('=')[1] ?? 60);
const width = mobile ? 390 : 1536, height = mobile ? 844 : 1024;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9225', '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
  `--user-data-dir=${path.join(os.tmpdir(), `pace-composition-${process.pid}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { width, height, frames: {}, errors: [] };
let socket;
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch('http://127.0.0.1:9225/json/list')).json()).find(t => t.type === 'page'); } catch { /* Chrome starting */ }
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
  await call('Runtime.enable'); await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    try { localStorage.setItem('pace-theme', '${night ? 'night' : 'day'}'); } catch {}
    window.reviewTime=0; const epoch=Date.now(); performance.now=()=>window.reviewTime; Date.now=()=>epoch+window.reviewTime;
    window.reviewBuffers={created:0,deleted:0};
    for(const [method,key] of [['createBuffer','created'],['deleteBuffer','deleted']]){const p=WebGL2RenderingContext.prototype, original=p[method];p[method]=function(...args){window.reviewBuffers[key]++;return original.apply(this,args);};}
  ` });
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const advance = frames => evaluate(`(async()=>{for(let i=0;i<${frames};i++){reviewTime+=1000/60;await new Promise(requestAnimationFrame);}await new Promise(requestAnimationFrame);})()`);
  const shot = async name => {
    const png = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(output, `${name}.png`), Buffer.from(png.data, 'base64'));
    report.frames[name] = await evaluate(`(()=>{const {camera,scene,renderer}=window.__paceReview;const terrain=scene.getObjectByName('WorldLightTrails');return {time:reviewTime,travel:terrain.material.uniforms.uTravel.value,energy:terrain.material.uniforms.uEnergy.value.toArray(),camera:camera.toJSON(),buffers:reviewBuffers,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,text:document.querySelector('main section p')?.textContent,wpm:document.querySelector('span.text-3xl')?.textContent};})()`);
    console.log(name, 'travel', report.frames[name].travel.toFixed(3));
  };
  await call('Page.navigate', { url: 'http://localhost:3000/' });
  for (let i = 0; i < 100; i++) {
    // The canvas fades in once the scene has drawn (Runner's SceneReady); wait it out.
    if (await evaluate(`!!window.__paceReview?.scene.getObjectByName('PipBody') && !!document.querySelector('aside summary') && getComputedStyle(document.querySelector('canvas').closest('.fixed')).opacity==='1'`)) break;
    await sleep(150);
  }
  await sleep(500);
  // The clock is stepped, so play the intro (big bang, then Pip running in: ~3.1 s) first.
  await advance(240);
  const prefix = `${mobile ? 'mobile' : 'desktop'}${night ? '-night' : ''}`;
  await shot(`${prefix}-idle`);
  await evaluate(`const box=document.querySelector('aside input[type=checkbox]');box.closest('aside').querySelector('details').open=true;box.click();Array.from(box.closest('aside').querySelectorAll('button')).find(b=>b.textContent==='${simulatedWpm}').click();document.querySelectorAll('aside').forEach(a=>a.style.visibility='hidden');`);
  await sleep(100);
  await advance(120); await shot(`${prefix}-02`);
  await advance(60); await shot(`${prefix}-03`);
  if (!quick) {
    await evaluate(`window.recorded=[];window.recorder=new MediaRecorder(document.querySelector('canvas').captureStream(30),{mimeType:'video/webm',videoBitsPerSecond:2200000});recorder.ondataavailable=e=>recorded.push(e.data);recorder.start();`);
    for (const second of [6, 9, 12, 15, 18]) { await advance(180); await shot(`${prefix}-${second.toString().padStart(2,'0')}`); }
    const video = await evaluate(`new Promise(resolve=>{recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(recorded,{type:'video/webm'}));};recorder.stop();})`);
    await writeFile(path.join(output, `${prefix}-traversal.webm`), Buffer.from(video, 'base64'));
  }
  await writeFile(path.join(output, `${prefix}-${quick ? 'quick' : 'review'}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ errors: report.errors, output }));
  void call('Browser.close'); await sleep(150);
  process.exitCode = report.errors.length ? 1 : 0;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { socket?.close(); chrome.kill(); }
