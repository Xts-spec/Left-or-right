import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createWindowVisibility}=require('../desktop/main/window-visibility.js');
function setup(){
  const window=visible=>{
    const record={visible,destroyed:false,hiddenSignals:0,isDestroyed(){return this.destroyed;},isVisible(){return this.visible;},hide(){this.visible=false;},showInactive(){this.visible=true;}};
    record.webContents={send:channel=>{assert.equal(channel,'app:privacy-hidden');record.hiddenSignals+=1;}};
    return record;
  };
  const main=window(true),settings=window(true),armed=[];
  const api=createWindowVisibility({getMainWindow:()=>main,getSettingsWindow:()=>settings,setInteractive:value=>armed.push(value)});
  return {main,settings,armed,api};
}

test('one visibility action hides both app windows, and restores only previously visible ones',()=>{
  const {main,settings,api}=setup();api.toggle();assert.equal(main.visible,false);assert.equal(settings.visible,false);
  api.toggle();assert.equal(main.visible,true);assert.equal(settings.visible,true);
  settings.visible=false;api.toggle();api.toggle();assert.equal(main.visible,true);assert.equal(settings.visible,false);
});

test('hiding and capture explicitly dismiss private popups in every owned window',()=>{
  const {main,settings,api}=setup();api.hideAll();assert.equal(main.hiddenSignals,1);assert.equal(settings.hiddenSignals,1);
  api.toggle();api.beginCapture();assert.equal(main.hiddenSignals,2);assert.equal(settings.hiddenSignals,2);
});

test('holding the modifier never reveals a privacy-hidden app',()=>{
  const {main,settings,armed,api}=setup();api.hideAll();api.modifierChanged(true);
  assert.equal(main.visible,false);assert.equal(settings.visible,false);assert.equal(armed.at(-1),false);
  api.toggle();assert.equal(main.visible,true);assert.equal(armed.at(-1),true);
  api.modifierChanged(false);assert.equal(armed.at(-1),false);
});

test('capture suspends interaction and hides settings as well as the overlay',()=>{
  const {main,settings,armed,api}=setup();api.modifierChanged(true);const snapshot=api.beginCapture();
  assert.equal(main.visible,false);assert.equal(settings.visible,false);assert.equal(armed.at(-1),false);
  api.modifierChanged(true);assert.equal(main.visible,false);assert.equal(armed.at(-1),false);
  api.modifierChanged(false);api.endCapture(snapshot);
  assert.equal(main.visible,true);assert.equal(settings.visible,true);assert.equal(armed.at(-1),false);
});

test('explicit hide during a capture prevents automatic window restoration',()=>{
  const {main,settings,api}=setup();const snapshot=api.beginCapture();api.toggle();api.endCapture(snapshot);
  assert.equal(main.visible,false);assert.equal(settings.visible,false);
  api.toggle();assert.equal(main.visible,true);assert.equal(settings.visible,true);
});

test('old settings-show requests are invalidated by privacy hide and capture',()=>{
  const {api}=setup();const version=api.version();assert.equal(api.canShow(version),true);
  const snapshot=api.beginCapture();assert.equal(api.canShow(version),false);api.endCapture(snapshot);assert.equal(api.canShow(version),true);
  api.hideAll();assert.equal(api.canShow(version),false);
});

test('a settings window closed while hidden is not recreated by the visibility shortcut',()=>{
  const {main,settings,api}=setup();api.hideAll();settings.destroyed=true;api.toggle();assert.equal(main.visible,true);assert.equal(settings.visible,false);
});
