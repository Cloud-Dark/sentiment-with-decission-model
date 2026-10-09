#!/usr/bin/env node
// Downloads the ggmlc `laya` binary into bin/, picking the right build for the
// current OS. Vulkan is used by default because the pre-built CUDA binaries
// only cover sm80/86/89, while the target GPU (GTX 1650) is sm75.
//
// Supported:
//   Windows x64  -> laya-windows-x86_64-vulkan.zip   (laya.exe + DLLs)
//   Linux x64    -> laya-linux-x86_64-vulkan.tar.gz  (laya)
//   macOS arm64  -> laya-macos-arm64-metal.tar.gz    (laya)
//
// Usage: node scripts/setup.js [--force]
// Env:   LAYA_RELEASE_URL  override the archive URL (.zip or .tar.gz)
//        LAYA_VARIANT      override the backend, e.g. "cuda-sm86" (default: vulkan / metal)
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSION = 'v0.9.6';
const BASE_URL = `https://github.com/monatis/ggmlc/releases/download/${VERSION}`;

const ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'bin');
const IS_WIN = process.platform === 'win32';
const EXE_NAME = IS_WIN ? 'laya.exe' : 'laya';
const EXE_PATH = path.join(BIN_DIR, EXE_NAME);

function log(msg) {
  console.log(`[setup] ${msg}`);
}

// Pick the release asset for this OS/arch.
function resolveAsset() {
  const key = `${process.platform}-${process.arch}`;
  const targets = {
    'win32-x64': { os: 'windows-x86_64', variant: 'vulkan', ext: 'zip' },
    'linux-x64': { os: 'linux-x86_64', variant: 'vulkan', ext: 'tar.gz' },
    'darwin-arm64': { os: 'macos-arm64', variant: 'metal', ext: 'tar.gz' },
  };
  const t = targets[key];
  if (!t) {
    throw new Error(
      `Platform ${key} tidak didukung oleh release ${VERSION}. ` +
        `Set LAYA_RELEASE_URL secara manual atau build laya dari source.`
    );
  }
  const variant = process.env.LAYA_VARIANT || t.variant;
  return `${BASE_URL}/laya-${t.os}-${variant}.${t.ext}`;
}

const ARCHIVE_URL = process.env.LAYA_RELEASE_URL || resolveAsset();
const IS_TAR = /\.(tar\.gz|tgz)$/i.test(ARCHIVE_URL);

async function download(url, dest) {
  log(`Platform: ${process.platform}-${process.arch}`);
  log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  log(`Saved ${(buf.length / 1024 / 1024).toFixed(1)} MB to ${path.relative(ROOT, dest)}`);
}

function extractArchive(archivePath, destDir) {
  log(`Extracting to ${path.relative(ROOT, destDir)}/`);
  fs.mkdirSync(destDir, { recursive: true });
  if (IS_TAR) {
    // tar is available on Linux, macOS, and Windows 10+.
    execFileSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' });
  } else if (IS_WIN) {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' }
    );
  } else {
    execFileSync('unzip', ['-o', archivePath, '-d', destDir], { stdio: 'inherit' });
  }
}

// The archive may contain a top-level folder; find the binary and hoist its
// folder's contents (binary + any DLLs/.so files) into bin/.
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

// On Linux, warn about missing shared libraries (e.g. libvulkan.so.1).
function checkLinuxDeps(exePath) {
  if (process.platform !== 'linux') return;
  try {
    const out = execFileSync('ldd', [exePath], { encoding: 'utf8' });
    const missing = out
      .split('\n')
      .filter((l) => l.includes('not found'))
      .map((l) => l.trim().split(/\s+/)[0]);
    if (missing.length) {
      log(`PERINGATAN: library berikut tidak ditemukan: ${missing.join(', ')}`);
      if (missing.some((m) => m.startsWith('libvulkan'))) {
        log('  Ubuntu/Debian: sudo apt install libvulkan1 mesa-vulkan-drivers');
      }
      if (missing.some((m) => m.startsWith('libgomp'))) {
        log('  Ubuntu/Debian: sudo apt install libgomp1');
      }
    }
  } catch {
    // ldd unavailable; skip the check.
  }
}

async function setup({ force = false } = {}) {
  if (!force && fs.existsSync(EXE_PATH)) {
    log(`${path.relative(ROOT, EXE_PATH)} already present, skipping.`);
    return EXE_PATH;
  }
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const archivePath = path.join(BIN_DIR, IS_TAR ? 'laya.tar.gz' : 'laya.zip');
  const tmpDir = path.join(BIN_DIR, '_extract');
  try {
    await download(ARCHIVE_URL, archivePath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    extractArchive(archivePath, tmpDir);
    const exe = findFile(tmpDir, EXE_NAME);
    if (!exe) {
      throw new Error(
        `${EXE_NAME} not found inside the archive. ` +
          `Pastikan URL cocok dengan OS kamu (${process.platform}): ${ARCHIVE_URL}`
      );
    }
    const srcDir = path.dirname(exe);
    for (const entry of fs.readdirSync(srcDir)) {
      const dest = path.join(BIN_DIR, entry);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(path.join(srcDir, entry), dest);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(archivePath, { force: true });
  }
  if (!fs.existsSync(EXE_PATH)) throw new Error(`${EXE_PATH} missing after extraction`);
  if (!IS_WIN) fs.chmodSync(EXE_PATH, 0o755);
  checkLinuxDeps(EXE_PATH);
  log(`Installed ${path.relative(ROOT, EXE_PATH)}`);
  return EXE_PATH;
}

module.exports = { setup, EXE_PATH, EXE_NAME, BIN_DIR };

if (require.main === module) {
  setup({ force: process.argv.includes('--force') }).catch((err) => {
    console.error(`[setup] ERROR: ${err.message}`);
    process.exit(1);
  });
}
