'use strict';

function selectedDisplays(config, displays, primary) {
  const ids = new Set((Array.isArray(config.captureDisplayIds) ? config.captureDisplayIds : [config.captureDisplayId]).filter(Boolean).map(String));
  const selected = displays.filter((display) => ids.has(String(display.id)));
  return selected.length ? selected : [primary];
}

function updateCaptureOptions(config, patch, displays) {
  if (patch.displayIds !== undefined) {
    if (!Array.isArray(patch.displayIds) || !patch.displayIds.length) throw new Error('请至少选择一个显示器');
    const ids = [...new Set(patch.displayIds.map(String))];
    if (ids.some((id) => !displays.some((display) => String(display.id) === id))) throw new Error('显示器已断开，请重新选择');
    config.captureDisplayIds = ids;
  }
  if (patch.mode !== undefined) {
    if (!['area', 'full'].includes(patch.mode)) throw new Error('无效的截图模式');
    config.screenshotMode = patch.mode;
  }
}

async function captureDisplayBatch({ displays, selected, interactive, selectRegion, captureScreenshot }) {
  const images = [];
  for (const display of selected) {
    const rect = interactive ? await selectRegion(display) : null;
    if (interactive && !rect) return [];
    const displayIndex = displays.findIndex((item) => item.id === display.id) + 1;
    const shot = await captureScreenshot({ interactive: false, rect, displayIndex });
    images.push({ mime: shot.mime, data: shot.data.toString('base64') });
  }
  return images;
}

module.exports = { selectedDisplays, updateCaptureOptions, captureDisplayBatch };
