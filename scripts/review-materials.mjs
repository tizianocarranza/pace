// Development-only, matched-clock material review. No production instrumentation.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const output=path.resolve('assets/reviews/phase2-materials');
await mkdir(output,{recursive:true});
const quick=process.argv.includes('--quick');
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--remote-debugging-port=9226','--no-first-run','--no-default-browser-check',
  '--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling',
  `--user-data-dir=${path.join(os.tmpdir(),`pace-materials-${process.pid}`)}`,'about:blank'
],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let socket;
const report={frames:{},errors:[]};
try{
  let target;
  for(let i=0;i<60&&!target;i++){
    try{target=(await(await fetch('http://127.0.0.1:9226/json/list')).json()).find(t=>t.type==='page');}catch{}
    if(!target)await sleep(200);
  }
  if(!target)throw Error('Chrome debugger unavailable');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  let id=0;const pending=new Map();
  socket.addEventListener('message',e=>{
    const m=JSON.parse(e.data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown'||m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')report.errors.push(m.params);
  });
  const call=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await call('Runtime.enable');await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.reviewTime=0;const epoch=Date.now();performance.now=()=>reviewTime;Date.now=()=>epoch+reviewTime;
    window.allocations={};for(const kind of ['Texture','Framebuffer','Buffer'])for(const op of ['create','delete']){
      const name=op+kind,p=WebGL2RenderingContext.prototype,fn=p[name];allocations[name]=0;p[name]=function(...args){allocations[name]++;return fn.apply(this,args);};
    }
  `});
  await call('Emulation.setDeviceMetricsOverride',{width:1536,height:1024,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://localhost:3000/?materials=current'});
  for(let i=0;i<150;i++){
    if(await evaluate(`!!window.__paceReview?.scene.getObjectByName('PipBody') && !!document.querySelector('[data-material-review]')`))break;
    await sleep(150);
  }
  await sleep(600);
  await evaluate(`(()=>{
    const renderer=__paceReview.renderer,render=renderer.render.bind(renderer),setTarget=renderer.setRenderTarget.bind(renderer);
    renderer.info.autoReset=false;window.renderPasses=[];
    renderer.setRenderTarget=function(target,...args){if(target)renderPasses.push({name:target.texture.name,width:target.width,height:target.height,samples:target.samples,type:target.texture.type});return setTarget(target,...args);};
    renderer.render=function(...args){renderer.info.reset();renderPasses=[];render(...args);window.reviewStats={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:{...renderer.info.memory},programs:renderer.info.programs.length,passes:renderPasses};};
    document.querySelector('[data-material-review] details').open=true;
    document.querySelectorAll('aside').forEach(a=>a.style.visibility='hidden');
  })()`);
  const advance=frames=>evaluate(`(async()=>{for(let i=0;i<${frames};i++){reviewTime+=1000/60;await new Promise(requestAnimationFrame);}await new Promise(requestAnimationFrame);})()`);
  const mode=async value=>{
    await evaluate(`Array.from(document.querySelectorAll('[data-material-review] button')).find(b=>b.textContent===${JSON.stringify({current:'Current',shared:'Shared light',pilot:'Pilot'}[value])}).click()`);
    await sleep(350);await evaluate('new Promise(requestAnimationFrame)');
  };
  const shot=async(name,clip)=>{
    const png=await call('Page.captureScreenshot',{format:'png',...(clip?{clip}:{} )});
    await writeFile(path.join(output,`${name}.png`),Buffer.from(png.data,'base64'));
    report.frames[name]=await evaluate(`(()=>{
      const {scene,camera,renderer}=__paceReview,mats=new Map();scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])mats.set(m.uuid,{name:m.name,type:m.type,roughness:m.roughness,transmission:m.transmission,thickness:m.thickness,ior:m.ior,opacity:m.opacity,depthWrite:m.depthWrite,toneMapped:m.toneMapped});});
      const body=scene.getObjectByName('PipBody');return {mode:scene.userData.materialStudy,time:reviewTime,travel:scene.getObjectByName('NearMineralFragment').material.uniforms.uTravel.value,
        camera:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),pose:body.skeleton.boneMatrices.slice(),morphs:body.morphTargetInfluences.slice(),
        stats:reviewStats,allocations:{...allocations},materials:[...mats.values()],environment:scene.environment?{name:scene.environment.name,width:scene.environment.image.width,height:scene.environment.image.height,intensity:scene.environmentIntensity}:null,
        renderer:{output:renderer.outputColorSpace,tone:renderer.toneMapping,exposure:renderer.toneMappingExposure,transmissionScale:renderer.transmissionResolutionScale}};
    })()`);
    console.log(name,JSON.stringify(report.frames[name].stats));
  };
  const closeups=async name=>{
    for(const [role,object]of [['sheet','WesternFold'],['mineral','SuspendedStone']]){
      const clip=await evaluate(`(()=>{const o=__paceReview.scene.getObjectByName('${object}'),c=__paceReview.camera; o.geometry.computeBoundingBox();const b=o.geometry.boundingBox,v=o.position.clone();let l=1536,t=1024,r=0,d=0;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){v.set(x,y,z).applyMatrix4(o.matrixWorld).project(c);const px=(v.x+1)*768,py=(1-v.y)*512;l=Math.min(l,px);r=Math.max(r,px);t=Math.min(t,py);d=Math.max(d,py);}l=Math.max(0,Math.floor(l-20));t=Math.max(0,Math.floor(t-20));r=Math.min(1536,Math.ceil(r+20));d=Math.min(1024,Math.ceil(d+20));return{x:l,y:t,width:r-l,height:d-t,scale:2};})()`);
      await shot(`${name}-${role}`,clip);
    }
    await shot(`${name}-ground`,{x:350,y:690,width:820,height:170,scale:2});
    await shot(`${name}-pip`,{x:530,y:555,width:490,height:280,scale:2});
  };
  for(const value of ['current','shared','pilot']){await mode(value);await shot(`idle-${value}`);await closeups(`idle-${value}`);}
  // Enable only the existing WPM simulator; gameplay statistics stay untouched.
  await evaluate(`(()=>{const box=document.querySelector('aside input[type=checkbox]');box.closest('aside').querySelector('details').open=true;box.click();Array.from(box.closest('aside').querySelectorAll('button')).find(b=>b.textContent==='60').click();})()`);
  await sleep(100);await advance(45);
  for(const value of ['current','shared','pilot']){await mode(value);await shot(`running-${value}`);}
  if(!quick){
    await evaluate(`window.chunks=[];window.recorder=new MediaRecorder(document.querySelector('canvas').captureStream(30),{mimeType:'video/webm',videoBitsPerSecond:2800000});recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();`);
    for(const frame of [180,360,540,735]){await advance(frame-Math.round(await evaluate('reviewTime*60/1000')));await shot(`pilot-frame-${frame}`);}
    const video=await evaluate(`new Promise(resolve=>{recorder.onstop=()=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};recorder.stop();})`);
    await writeFile(path.join(output,'pilot-motion.webm'),Buffer.from(video,'base64'));
    for(const value of ['current','shared','pilot']){await mode(value);await shot(`lap-${value}`);}
  }
  await writeFile(path.join(output,quick?'quick.json':'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({errors:report.errors,output}));
  void call('Browser.close');await sleep(150);process.exitCode=report.errors.length?1:0;
}catch(e){console.error(e);process.exitCode=1;}finally{socket?.close();chrome.kill();}
