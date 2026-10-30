import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { selectedDisplays, updateCaptureOptions, captureDisplayBatch } = require('../desktop/main/capture-options.js');
const displays = [{ id: 1 }, { id: 2 }];

test('two screens can be selected, persisted, and restored as string ids', () => {
  const config = {};
  updateCaptureOptions(config, { mode: 'full', displayIds: ['1', '2'] }, displays);
  assert.deepEqual(config.captureDisplayIds, ['1', '2']);
  assert.deepEqual(selectedDisplays(config, displays, displays[0]), displays);
});

test('existing single-screen preferences migrate and disconnected screens fall back', () => {
  assert.deepEqual(selectedDisplays({ captureDisplayId: '2' }, displays, displays[0]), [displays[1]]);
  assert.deepEqual(selectedDisplays({ captureDisplayIds: ['2', 'lost'] }, displays, displays[0]), [displays[1]]);
  assert.deepEqual(selectedDisplays({ captureDisplayIds: ['lost'] }, displays, displays[0]), [displays[0]]);
  assert.throws(() => updateCaptureOptions({}, { displayIds: [] }, displays), /至少选择/);
  assert.throws(() => updateCaptureOptions({}, { displayIds: ['lost'] }, displays), /断开/);
});

test('full-screen capture produces one image per selected display in screen order', async () => {
  const calls = [];
  const images = await captureDisplayBatch({
    displays, selected: displays, interactive: false,
    selectRegion: async () => { throw Error('should not select a region'); },
    captureScreenshot: async options => { calls.push(options); return { mime: 'image/png', data: Buffer.from(String(options.displayIndex)) }; },
  });
  assert.deepEqual(calls.map(c => c.displayIndex), [1, 2]);
  assert.deepEqual(images.map(c => Buffer.from(c.data, 'base64').toString()), ['1', '2']);
});

test('region capture waits for each screen selection before starting the next', async () => {
  const events = [];
  await captureDisplayBatch({
    displays, selected: displays, interactive: true,
    selectRegion: async display => { events.push(`select-${display.id}`); return { width: 10, height: 10 }; },
    captureScreenshot: async options => { events.push(`capture-${options.displayIndex}`); return { mime: 'image/png', data: Buffer.from('image') }; },
  });
  assert.deepEqual(events, ['select-1', 'capture-1', 'select-2', 'capture-2']);
});

test('cancelling the second region discards the entire capture batch', async () => {
  const images = await captureDisplayBatch({
    displays, selected: displays, interactive: true,
    selectRegion: async display => display.id === 1 ? { width: 10, height: 10 } : null,
    captureScreenshot: async () => ({ mime: 'image/png', data: Buffer.from('image') }),
  });
  assert.deepEqual(images, []);
});
