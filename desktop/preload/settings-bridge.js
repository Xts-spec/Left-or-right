'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const config = ipcRenderer.sendSync('cockpit:getConfigSync');
contextBridge.exposeInMainWorld('__GATEWAY_URL__', config.gatewayUrl || '');
contextBridge.exposeInMainWorld('__GATEWAY_KEY__', config.gatewayApiKey || '');
contextBridge.exposeInMainWorld('__APP_SETTINGS__', true);
ipcRenderer.on('settings:navigate', (_event, section) => {
  if (['models', 'study', 'briefing', 'shortcuts', 'assets'].includes(section)) window.location.hash = section;
});
