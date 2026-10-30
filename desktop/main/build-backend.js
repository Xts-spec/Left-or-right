'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

module.exports = async function buildBackend() {
  const root = path.resolve(__dirname, '..', '..');
  const venv = path.join(root, '.venv', 'bin', 'python');
  const python = process.env.DESKTOP_PYTHON || (fs.existsSync(venv) ? venv : 'python3');
  const result = spawnSync(python, [path.join(root, 'scripts', 'build_desktop_backend.py')], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Local service packaging failed; install the desktop Python dependencies first.');
};
