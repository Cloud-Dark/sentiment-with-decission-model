#!/usr/bin/env node
// Refreshes presets/laya-presets.json, the snapshot of laya's built-in presets.
// `laya daemon` (used by server.js) cannot list presets, so this script temporarily runs
// `laya serve <gguf> --port <free random port>` on 127.0.0.1, fetches GET /v1/presets, writes the
// array to presets/laya-presets.json and stops only the process it started.
//
// Usage: node scripts/sync-presets.js [model.gguf]    (npm run presets:sync)
// Env:   LAYA_MODEL (model file, default: first *.gguf with q8_0 > q4_k_m > f16 in models/),
//        LAYA_DEVICE (default cpu: presets do not depend on the device, and cpu avoids the GPU)
'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execFile } = require('child_process');
const { EXE_PATH } = require('./setup');

const ROOT = path.resolve(__dirname, '..');
const MODELS_DIR = path.join(ROOT, 'models');
const OUT_FILE = path.join(ROOT, 'presets', 'laya-presets.json');
const READY_TIMEOUT_MS = 10 * 60 * 1000;

function log(msg) {
  console.log(`[presets] ${msg}`);
}

function pickModel() {
  const arg = process.argv[2] || process.env.LAYA_MODEL;
  if (arg) {
    for (const p of [path.resolve(ROOT, arg), path.join(MODELS_DIR, arg)]) if (fs.existsSync(p)) return p;
    throw new Error(`Model tidak ditemukan: ${arg}`);
  }
  const files = fs.readdirSync(MODELS_DIR).filter((f) => f.toLowerCase().endsWith('.gguf'));
  const rank = (f) => {
    const n = f.toLowerCase();
    if (n.includes('q8_0')) return 0;
    if (n.includes('q4_k_m')) return 1;
    if (n.includes('f16')) return 2;
    return 3;
  };
  files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  if (!files.length) throw new Error('Tidak ada file .gguf di models/');
  return path.join(MODELS_DIR, files[0]);
}

// Lets the OS pick a free port on 127.0.0.1, then releases it for laya.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', () => resolve());
    if (process.platform === 'win32') execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {});
    else child.kill();
    setTimeout(resolve, 5000);
  });
}

async function main() {
  if (!fs.existsSync(EXE_PATH)) throw new Error(`${EXE_PATH} belum ada. Jalankan "npm run setup".`);
  const model = pickModel();
  const device = process.env.LAYA_DEVICE || 'cpu';
  const port = await freePort();
  const args = ['serve', model, '--port', String(port), '--device', device];
  log(`Menjalankan: ${EXE_PATH} ${args.join(' ')}`);
  const child = spawn(EXE_PATH, args, { cwd: path.dirname(EXE_PATH), stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));
  const onSignal = () => stop(child).then(() => process.exit(1));
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + READY_TIMEOUT_MS;
    for (;;) {
      if (child.exitCode !== null) throw new Error(`laya berhenti (code=${child.exitCode}).\n${stderr}`);
      if (Date.now() > deadline) throw new Error('Timeout menunggu laya siap.');
      try {
        await getJson(`${base}/health`, 3000);
        break;
      } catch {
        await sleep(1000);
      }
    }
    const body = await getJson(`${base}/v1/presets`, 30000);
    const list = Array.isArray(body) ? body : body?.presets;
    if (!Array.isArray(list) || !list.length) throw new Error('Respons /v1/presets bukan array preset.');
    for (const p of list) {
      if (!p || typeof p.name !== 'string' || !p.questions || typeof p.questions !== 'object') {
        throw new Error(`Preset tidak valid di respons: ${JSON.stringify(p).slice(0, 200)}`);
      }
    }
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    const before = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : null;
    const text = `${JSON.stringify(list, null, 2)}\n`;
    fs.writeFileSync(OUT_FILE, text, 'utf8');
    const same = before !== null && JSON.stringify(JSON.parse(before)) === JSON.stringify(list);
    log(`${list.length} preset ditulis ke ${path.relative(ROOT, OUT_FILE)} (${same ? 'tidak ada perubahan isi' : 'isi berubah'}): ${list.map((p) => p.name).join(', ')}`);
  } finally {
    await stop(child);
  }
}

main().catch((err) => {
  console.error(`[presets] Gagal: ${err.message}`);
  process.exit(1);
});
