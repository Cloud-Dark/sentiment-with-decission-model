#!/usr/bin/env node
// Downloads the ggmlc `laya` binary (Windows x86_64, Vulkan backend) into bin/.
// Vulkan is used because the pre-built CUDA binaries only cover sm80/86/89,
// while the target GPU (GTX 1650) is sm75.
//
// Usage: node scripts/setup.js [--force]
// Env:   LAYA_RELEASE_URL to override the zip URL.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'bin');
const EXE_NAME = process.platform === 'win32' ? 'laya.exe' : 'laya';
const EXE_PATH = path.join(BIN_DIR, EXE_NAME);
const ZIP_URL =
  process.env.LAYA_RELEASE_URL ||
  'https://github.com/monatis/ggmlc/releases/download/v0.9.6/laya-windows-x86_64-vulkan.zip';

function log(msg) {
  console.log(`[setup] ${msg}`);
}

async function download(url, dest) {
  log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  log(`Saved ${(buf.length / 1024 / 1024).toFixed(1)} MB to ${path.relative(ROOT, dest)}`);
}

function extractZip(zipPath, destDir) {
  log(`Extracting to ${path.relative(ROOT, destDir)}/`);
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' }
    );
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'inherit' });
  }
}

// The zip may contain a top-level folder; find laya.exe and hoist its folder's
// contents (exe + DLLs) into bin/.
function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return p;
    if (entry.isDirectory()) {
      const found = findFile(p, name);
      if (found) return found;
    }
  }
  return null;
}

async function setup({ force = false } = {}) {
  if (!force && fs.existsSync(EXE_PATH)) {
    log(`${path.relative(ROOT, EXE_PATH)} already present, skipping.`);
    return EXE_PATH;
  }
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const zipPath = path.join(BIN_DIR, 'laya.zip');
  const tmpDir = path.join(BIN_DIR, '_extract');
  try {
    await download(ZIP_URL, zipPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    extractZip(zipPath, tmpDir);
    const exe = findFile(tmpDir, EXE_NAME);
    if (!exe) throw new Error(`${EXE_NAME} not found inside the archive`);
    const srcDir = path.dirname(exe);
    for (const entry of fs.readdirSync(srcDir)) {
      const dest = path.join(BIN_DIR, entry);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(path.join(srcDir, entry), dest);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
  }
  if (!fs.existsSync(EXE_PATH)) throw new Error(`${EXE_PATH} missing after extraction`);
  log(`Installed ${path.relative(ROOT, EXE_PATH)}`);
  return EXE_PATH;
}

module.exports = { setup, EXE_PATH, BIN_DIR };

if (require.main === module) {
  setup({ force: process.argv.includes('--force') }).catch((err) => {
    console.error(`[setup] ERROR: ${err.message}`);
    process.exit(1);
  });
}
