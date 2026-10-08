// Local development review only. Clock-stepped captures compare identical motion
// and terrain coordinates. The app's simulator supplies speed without fake typing.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const output = path.resolve(process.env.PACE_REVIEW_DIR ?? 'assets/reviews/phase1-composition');
await mkdir(output, { recursive: true });
const quick = process.argv.includes('--quick');
const mobile = process.argv.includes('--mobile');
const width = mobile ? 390 : 1536, height = mobile ? 844 : 1024;
const studies = process.env.PACE_STUDIES?.split(',') ?? ['a', 'b', 'c'];
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9225', '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
  `--user-data-dir=${path.join(os.tmpdir(), `pace-composition-${process.pid}`)}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { width, height, frames: {}, occlusion: {}, errors: [] };
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
    window.reviewTime=0; const epoch=Date.now(); performance.now=()=>window.reviewTime; Date.now=()=>epoch+window.reviewTime;
    window.reviewBuffers={created:0,deleted:0};
    for(const [method,key] of [['createBuffer','created'],['deleteBuffer','deleted']]){const p=WebGL2RenderingContext.prototype, original=p[method];p[method]=function(...args){window.reviewBuffers[key]++;return original.apply(this,args);};}
  ` });
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const advance = frames => evaluate(`(async()=>{for(let i=0;i<${frames};i++){reviewTime+=1000/60;await new Promise(requestAnimationFrame);if(i%30===0)window.sampleOcclusion();}await new Promise(requestAnimationFrame);})()`);
  const shot = async name => {
    const png = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(output, `${name}.png`), Buffer.from(png.data, 'base64'));
    report.frames[name] = await evaluate(`(()=>{const {camera,scene,renderer}=window.__paceReview;const terrain=scene.getObjectByName('ContinuousTerrain');return {time:reviewTime,travel:terrain.material.uniforms.uTravel.value,energy:terrain.material.uniforms.uEnergy.value.toArray(),camera:camera.toJSON(),buffers:reviewBuffers,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,text:document.querySelector('main section p')?.textContent,wpm:document.querySelector('span.text-3xl')?.textContent};})()`);
    console.log(name, 'travel', report.frames[name].travel.toFixed(3));
  };
  for (const study of studies) {
    await call('Page.navigate', { url: `http://localhost:3000/?compositionReview=1&composition=${study}&materials=current` });
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!window.__paceReview?.scene.getObjectByName('PipBody') && !!document.querySelector('aside summary')`)) break;
      await sleep(150);
    }
    await sleep(500);
    // CPU raycasts cover the three near meshes; GPU-displaced details are reviewed
    // in the captures. Sample the animated body and eye vertices, not a safety halo.
    await evaluate(`window.occlusionSamples=[];window.sampleOcclusion=()=>{
      const {camera,scene,raycaster}=__paceReview;
      const foreground=['NearWesternBank','NearEasternBank','NearMineralFragment'].map(n=>scene.getObjectByName(n)).filter(Boolean);
      const body=scene.getObjectByName('PipBody');
      const eyes=[];scene.traverse(o=>{if(o.isMesh && /eye/i.test(o.name))eyes.push(o);});
      scene.updateMatrixWorld(true);
      const v=camera.position.clone(), ndc=v.clone();
      let bodySamples=0,bodyBlocked=0,eyeSamples=0,eyeBlocked=0;
      for(const mesh of [body,...eyes]){
        const isEye=mesh!==body;
        if(mesh.isSkinnedMesh)mesh.skeleton.update();
        const count=mesh.geometry.attributes.position.count;
        for(let i=0;i<count;i+=Math.max(1,Math.floor(count/(isEye?24:120)))){
          mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);ndc.copy(v).project(camera);
          raycaster.setFromCamera(ndc,camera);
          // Only assess vertices on the visible surface, not the back of the head.
          const surface=raycaster.intersectObjects([body,...eyes],false)[0];
          if(!surface || surface.point.distanceTo(v)>.055)continue;
          const hit=raycaster.intersectObjects(foreground,false)[0];
          const blocked=hit && hit.distance<surface.distance-.01;
          if(isEye){eyeSamples++;if(blocked)eyeBlocked++;}
          else {bodySamples++;if(blocked)bodyBlocked++;}
        }
      }
      occlusionSamples.push({time:reviewTime,bodySamples,bodyBlocked,eyeSamples,eyeBlocked});
    };`);
    const prefix = `${mobile ? 'mobile' : 'desktop'}-${study}`;
    await shot(`${prefix}-idle`);
    await evaluate(`document.querySelector('aside summary').click();document.querySelector('aside input[type=checkbox]').click();Array.from(document.querySelectorAll('aside button')).find(b=>b.textContent==='60').click();document.querySelector('aside').style.visibility='hidden';`);
    await sleep(100);
    await advance(120); await shot(`${prefix}-02`);
    await advance(60); await shot(`${prefix}-03`);
    // Neutral shader switch, held by the harness for the identical camera/pose.
    await evaluate(`(()=>{const u=__paceReview.scene.getObjectByName('ContinuousTerrain').material.uniforms.uCompositionGray;Object.defineProperty(u,'value',{configurable:true,get:()=>1,set:()=>{}});})()`);
    await sleep(100); await shot(`${prefix}-03-gray`);
    await evaluate(`Object.defineProperty(__paceReview.scene.getObjectByName('ContinuousTerrain').material.uniforms.uCompositionGray,'value',{configurable:true,writable:true,value:0})`);
    if (process.argv.includes('--overlap')) {
      // B's desktop near-bank overlap peaks around 6.5 simulated seconds.
      await advance(211); await shot(`${prefix}-overlap`);
    }
    if (!quick) {
      await evaluate(`window.recorded=[];window.recorder=new MediaRecorder(document.querySelector('canvas').captureStream(30),{mimeType:'video/webm',videoBitsPerSecond:2200000});recorder.ondataavailable=e=>recorded.push(e.data);recorder.start();`);
      for (const second of [6, 9, 12, 15, 18]) { await advance(180); await shot(`${prefix}-${second.toString().padStart(2,'0')}`); }
      const video = await evaluate(`new Promise(resolve=>{recorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(recorded,{type:'video/webm'}));};recorder.stop();})`);
      await writeFile(path.join(output, `${prefix}-traversal.webm`), Buffer.from(video, 'base64'));
    }
    report.occlusion[study] = await evaluate('window.occlusionSamples');
    await writeFile(path.join(output, `${prefix}-report.json`), JSON.stringify({ frames: report.frames, occlusion: report.occlusion, errors: report.errors }, null, 2));
  }
  await writeFile(path.join(output, `${mobile ? 'mobile' : 'desktop'}-${quick ? 'quick' : 'review'}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ errors: report.errors, output }));
  void call('Browser.close'); await sleep(150);
  process.exitCode = report.errors.length ? 1 : 0;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { socket?.close(); chrome.kill(); }
