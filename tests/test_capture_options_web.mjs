import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const quickSource=fs.readFileSync(new URL('../web/modules/quick-settings.js',import.meta.url),'utf8');
const homeSource=fs.readFileSync(new URL('../web/modules/home.js',import.meta.url),'utf8');

class Element {
  constructor(tag='div') { this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.dataset={};this.value='';this.checked=false;this.disabled=false;this.textContent='';this.style={}; }
  addEventListener(type,callback) { this.listeners[type]=callback; }
  replaceChildren(...children) { this.children=[...children]; }
  append(...children) { this.children.push(...children); }
  querySelector() { return new Element(); }
  querySelectorAll(selector) {
    const all=this.children.flatMap(child=>[child,...child.querySelectorAll('all')]);
    if(selector==='all')return all;
    return all.filter(child=>child.tagName==='INPUT'&&child.type==='radio'&&(!selector.includes(':checked')||child.checked));
  }
}
function quickModule() {
  const elements=new Map();
  const byId=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const calls=[];
  const backend={mode:'area',displayId:'1',displays:[{id:1,label:'内建屏',width:1512,height:982},{id:2,label:'外接屏',width:1920,height:1080}]};
  const sandbox={
    document:{getElementById:byId,querySelector:()=>null,createElement:tag=>new Element(tag),addEventListener(){}},
    window:{addEventListener(){},location:{origin:'http://localhost'},cockpit:{
      setCaptureOptions:async patch=>{calls.push(patch);Object.assign(backend,patch);return {...backend,saved:true};},
      getConfig:async()=>({captureOptions:backend}),
    }},
    state:{},applyDisplay(){},ResizeObserver:class{observe(){}},Option:class{},innerHeight:720,
  };
  const context=vm.createContext(sandbox);
  vm.runInContext(quickSource.replace(/^import .*;$/gm,'').replaceAll('export async function','async function'),context);
  sandbox.config={captureOptions:backend};
  vm.runInContext('hydrateCapture(config)',context);
  return {elements,byId,calls,backend,sandbox,run:code=>vm.runInContext(code,context)};
}

test('running displays share one radio group with a single backend selection',()=>{
  const {byId}=quickModule();
  const list=byId('quickDisplay');
  const inputs=list.querySelectorAll('input[type="radio"]');
  assert.deepEqual(inputs.map(input=>input.value),['1','2']);
  assert.deepEqual(inputs.map(input=>input.checked),[true,false]);
  assert.equal(new Set(inputs.map(input=>input.name)).size,1);
  assert.equal(inputs[0].name,'quickRunDisplay');
  assert.equal(list.children[0].textContent,'运行显示器');
  assert.equal(list.disabled,false);
});

test('choosing another running display sends only one string displayId',async()=>{
  const {byId,calls}=quickModule();
  const list=byId('quickDisplay');
  const second=list.querySelectorAll('input[type="radio"]')[1];second.checked=true;
  await list.listeners.change({target:second});
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{displayId:'2'}]);
  assert.deepEqual(list.querySelectorAll('input[type="radio"]:checked').map(input=>input.value),['2']);
  assert.equal(list.disabled,false);
  assert.match(byId('quickSettingsStatus').textContent,/截图跟随 App/);
});

test('unchecked and unrelated changes cannot send an empty or multiple-display update',async()=>{
  const {byId,calls}=quickModule();
  const list=byId('quickDisplay');const first=list.querySelectorAll('input[type="radio"]')[0];first.checked=false;
  await list.listeners.change({target:first});
  await list.listeners.change({target:{type:'checkbox',checked:true,value:'2'}});
  assert.equal(calls.length,0);
});

test('effective backend selection replaces disconnected display options',async()=>{
  const {byId,backend,sandbox}=quickModule();
  sandbox.window.cockpit.setCaptureOptions=async()=>({mode:'full',displayId:'2',displays:[backend.displays[1]],saved:true});
  const list=byId('quickDisplay');const second=list.querySelectorAll('input[type="radio"]')[1];second.checked=true;
  await list.listeners.change({target:second});
  assert.deepEqual(list.querySelectorAll('input[type="radio"]').map(input=>[input.value,input.checked]),[['2',true]]);
  assert.equal(byId('quickCaptureMode').value,'full');
});

test('failed display moves restore the effective selection returned by the app',async()=>{
  const {byId,sandbox,calls}=quickModule();
  sandbox.window.cockpit.setCaptureOptions=async()=>{throw Error('显示器已断开');};
  const list=byId('quickDisplay');const second=list.querySelectorAll('input[type="radio"]')[1];second.checked=true;
  await list.listeners.change({target:second});
  assert.equal(calls.length,0);
  assert.deepEqual(list.querySelectorAll('input[type="radio"]:checked').map(input=>input.value),['1']);
  assert.match(byId('quickSettingsStatus').textContent,/显示器已断开/);
  assert.equal(list.disabled,false);
});

test('display names are rendered as literal text and browser-only capture remains disabled',()=>{
  const {byId,backend,run}=quickModule();backend.displays[0].label='<img src=x onerror=alert(1)>';
  run('hydrateCapture(config)');
  assert.match(byId('quickDisplay').children[1].children[1].textContent,/^<img src=x onerror=alert\(1\)>/);
  run('hydrateCapture({})');
  assert.equal(byId('quickDisplay').disabled,true);
  assert.equal(byId('quickCaptureMode').disabled,true);
});

function captureModule() {
  const sandbox={pending:[],sessionGeneration:1,savingSession:false,streaming:false,nextShotId:1,shotsExpanded:false,renders:0,status:'',
    renderPending(){sandbox.renders+=1;},setStatus(text){sandbox.status=text;}};
  const context=vm.createContext(sandbox);
  vm.runInContext(homeSource.slice(homeSource.indexOf('function addShots('),homeSource.indexOf('function readImageFile(')),context);
  return {sandbox,run:code=>vm.runInContext(code,context)};
}
const image={mime:'image/png',data:'cG5n'};

test('capture receives old single-image payloads and the complete new batch',()=>{
  const {sandbox,run}=captureModule();sandbox.one=image;sandbox.batch={images:[image,image]};
  run('receiveCapture(one);receiveCapture(batch)');
  assert.equal(sandbox.pending.length,3);
  assert.deepEqual(sandbox.pending.map(shot=>shot.id),['1','2','3']);
  assert.equal(sandbox.renders,2);
});

test('an over-capacity batch is rejected atomically with a visible count hint',()=>{
  const {sandbox,run}=captureModule();sandbox.batch={images:[image,image]};
  sandbox.pending.push(...Array.from({length:7},(_,i)=>({id:String(i)})));
  run('receiveCapture(batch)');
  assert.equal(sandbox.pending.length,7);
  assert.equal(sandbox.renders,0);
  assert.match(sandbox.status,/2 张图.*7 张.*8 张图/);
});

test('the eighth image slot is accepted but a ninth single image is rejected',()=>{
  const {sandbox,run}=captureModule();sandbox.batch={images:[image,image]};sandbox.one=image;
  sandbox.pending.push(...Array.from({length:6},(_,i)=>({id:String(i)})));
  run('receiveCapture(batch);receiveCapture(one)');
  assert.equal(sandbox.pending.length,8);
  assert.equal(sandbox.renders,1);
  assert.match(sandbox.status,/8 张图/);
});

test('malformed batches do not partially enqueue valid images',()=>{
  const {sandbox,run}=captureModule();sandbox.batch={images:[image,{}]};
  run('receiveCapture(batch)');
  assert.equal(sandbox.pending.length,0);
  assert.match(sandbox.status,/截图数据不完整/);
});

test('reset rejects old-generation work but accepts a new capture event',()=>{
  const {sandbox,run}=captureModule();sandbox.batch={images:[image,image]};sandbox.sessionGeneration=2;
  run('receiveCapture(batch,1)');assert.equal(sandbox.pending.length,0);
  run('receiveCapture(batch,sessionGeneration)');assert.equal(sandbox.pending.length,2);
});

test('saving and streaming reject a whole batch without losing only one image',()=>{
  const {sandbox,run}=captureModule();sandbox.batch={images:[image,image]};sandbox.savingSession=true;
  run('receiveCapture(batch)');assert.equal(sandbox.pending.length,0);
  sandbox.savingSession=false;sandbox.streaming=true;
  run('receiveCapture(batch)');assert.equal(sandbox.pending.length,0);
  assert.match(sandbox.status,/正在生成回答/);
});

function armedModule() {
  const classes=new Set(['liuwa-armed']);let armedHandler;let resolve;
  const classList={remove:name=>classes.delete(name),add:name=>classes.add(name),toggle(name,on){if(on)classes.add(name);else classes.delete(name);}};
  const cockpit={onArmed:handler=>{armedHandler=handler;},getConfig:()=>new Promise(r=>{resolve=r;})};
  const sandbox={document:{documentElement:{classList},body:{classList}},state:{},applyHotkeyHints(){},applyTheme(){},applyDisplay(){}};
  const context=vm.createContext(sandbox);sandbox.cockpit=cockpit;
  vm.runInContext(homeSource.slice(homeSource.indexOf('function wireDesktop('),homeSource.indexOf('\nwindow.cycleTheme')),context);
  vm.runInContext('wireDesktop(cockpit)',context);
  return {classes,armed:value=>armedHandler(value),resolve:config=>resolve(config)};
}

test('desktop boot starts unarmed and hydrates the initial native armed state',async()=>{
  const {classes,resolve}=armedModule();assert.equal(classes.has('liuwa-armed'),false);
  resolve({armed:true,display:{}});await Promise.resolve();
  assert.equal(classes.has('liuwa-armed'),true);
});

test('a newer native armed event wins over a late startup config response',async()=>{
  const {classes,armed,resolve}=armedModule();armed(false);resolve({armed:true,display:{}});await Promise.resolve();
  assert.equal(classes.has('liuwa-armed'),false);
});
