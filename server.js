'use strict';

// Sentiment scoring backend.
// - Serves the static frontend from public/
// - Manages a child `laya.exe daemon` process (ggmlc Laya decision model) over stdin/stdout JSON
//   lines; laya opens no port, so the web port is the only one the app listens on
// - Exposes /api/status, /api/model, /api/presets[/:name], /api/templates[/:id], /api/score, /api/export,
//   /api/benchmark[/cancel|/export] (run the same texts on every model in models/, one by one)
// - Scoring modes: sentiment3 (choice), binary (noul), scale5 (score rubric 1..5), "preset"
//   (a question set from the presets/laya-presets.json snapshot of laya /v1/presets, optionally
//   plus the sentiment3 question) and "custom"
//   (a template from templates/<id>.json or an unsaved inline one; same output shape as preset)
// - Every result carries a generic questions[] array so the UI can render any mode the same way

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const express = require('express');
const ExcelJS = require('exceljs');
const { setup, EXE_PATH } = require('./scripts/setup');

const ROOT = __dirname;
const MODELS_DIR = path.join(ROOT, 'models');
const PORT = Number(process.env.PORT) || 3000;
// When a port is not set explicitly and is busy, try the next few ports instead of failing.
const PORT_TRIES = 20;
const LAYA_DEVICE = process.env.LAYA_DEVICE || 'auto';
const MAX_TEXTS = 256; // kept from the old laya /v1/decide/batch limit
const MODEL_POLL_MS = 5000;
const READY_TIMEOUT_MS = 10 * 60 * 1000; // model load on first run can be slow
const REQUEST_TIMEOUT_MS = 2 * 60 * 1000; // one daemon request (one text)
const PRESETS_FILE = path.join(ROOT, 'presets', 'laya-presets.json');

// Average label thresholds: the average score is mean(P(pos) - P(neg)) in [-1, 1].
//   avg >  0.15  -> positive
//   avg < -0.15  -> negative
//   otherwise    -> neutral
const AVG_POSITIVE_THRESHOLD = 0.15;
const AVG_NEGATIVE_THRESHOLD = -0.15;

// scale5: average rating (1..5) -> label. >= 3.5 positive, <= 2.5 negative, otherwise neutral.
const SCALE_POSITIVE_THRESHOLD = 3.5;
const SCALE_NEGATIVE_THRESHOLD = 2.5;

const LABELS = ['positive', 'neutral', 'negative'];

// Every sentiment mode asks a single question with id "sentiment" against state {"text": t}.
// (Preset mode is not in this table: its questions come from presets/laya-presets.json.)
// Each mode defines:
//   question        - laya/TypeSafe question definition
//   options         - [{key, text}] in rubric order (text in Bahasa Indonesia, shown in UI + Excel)
//   valueHeader     - Excel column header for `value` (null = same as score, skip the column)
//   scoreRule / averageRule - human-readable rules written to the Excel Summary sheet
// Answers are parsed per mode by PARSERS (parseChoice / parseNoul / parseScore) into
//   {label, score (-1..1), value, confidence, act, options:[{key,text,prob}]}
const MODES = {
  sentiment3: {
    question: {
      type: 'choice',
      instructions: 'What is the sentiment of this text?',
      // Wording tuned on the multilingual Q4 model: spelling out "average / so-so / mixed" as
      // neutral stops lukewarm texts ("biasa saja") from being pushed to negative.
      criteria: {
        // Sarcasm: "genuine" praise vs. ironic praise, so "mantap, bayar mahal dapetnya sampah" is
        // not scored positive just because it contains a praise word.
        positive: 'Clearly positive: genuine praise, satisfaction, happiness, or recommendation.',
        neutral:
          'Neutral: factual information, a question, an average or so-so opinion, or mixed feelings without a clear positive or negative lean.',
        negative:
          'Clearly negative: complaint, anger, disappointment, or criticism, including sarcastic or ironic praise that actually complains.',
      },
    },
    options: [
      { key: 'positive', text: 'Positif' },
      { key: 'neutral', text: 'Netral' },
      { key: 'negative', text: 'Negatif' },
    ],
    valueHeader: null,
    scoreRule: 'P(positif) - P(negatif)',
    averageRule: `skor > ${AVG_POSITIVE_THRESHOLD} positive, < ${AVG_NEGATIVE_THRESHOLD} negative, selain itu neutral`,
  },
  binary: {
    question: {
      type: 'noul',
      instructions: 'Is the overall sentiment of this text positive?',
      criteria: {
        false: 'the text is negative / expresses dissatisfaction',
        true: 'the text is positive / expresses satisfaction',
      },
    },
    options: [
      { key: 'negative', text: 'Negatif' },
      { key: 'positive', text: 'Positif' },
    ],
    valueHeader: 'P(positif)',
    scoreRule: '2 * P(positif) - 1',
    averageRule: 'rata-rata P(positif) >= 0.5 positive, selain itu negative',
  },
  scale5: {
    question: {
      type: 'score',
      instructions: 'How positive or negative is the sentiment of this text?',
      // Rubric levels 0..4 (laya labels array criteria by index). Short labels such as
      // "very negative" / "neutral" pushed factual texts to level 0 on the multilingual model;
      // describing the writer's state and spelling out "facts / question / so-so / mixed" as
      // neutral keeps factual and lukewarm texts near the middle.
      criteria: [
        'Very negative: the writer is angry, furious, or deeply disappointed.',
        'Negative: the writer is dissatisfied, complains, or criticizes something.',
        'Neutral: the text only states facts or information, asks a question, or gives an average, so-so, or mixed opinion with no clear lean.',
        'Positive: the writer is satisfied, pleased, or approves of something.',
        'Very positive: the writer is delighted, enthusiastic, or strongly recommends something.',
      ],
    },
    options: [
      { key: '1', text: '1: sangat negatif' },
      { key: '2', text: '2: negatif' },
      { key: '3', text: '3: netral / campuran' },
      { key: '4', text: '4: positif' },
      { key: '5', text: '5: sangat positif' },
    ],
    valueHeader: 'Rating (1-5)',
    scoreRule: '(rating - 3) / 2',
    averageRule: `rata-rata rating >= ${SCALE_POSITIVE_THRESHOLD} positive, <= ${SCALE_NEGATIVE_THRESHOLD} negative, selain itu neutral`,
  },
};
const DEFAULT_MODE = 'sentiment3';

// ---------------------------------------------------------------------------
// Laya child process management
// ---------------------------------------------------------------------------

const state = {
  ready: false,
  model: null, // basename of the gguf
  modelPath: null,
  device: null,
  message: 'Memulai server...',
  error: null,
  child: null,
  triedCpuFallback: false,
  // Benchmark loads: a child that exits before ready with a load/metadata error is not retried on cpu.
  skipCpuFallbackOnLoadError: false,
  fallbackLaunch: null, // promise of the CPU fallback launch() started by the exit handler
  shuttingDown: false,
  switching: false, // true while POST /api/model is stopping the old child / loading the new one
  gen: 0, // bumped on every model switch; a stale launch() sees the mismatch and does not spawn
};

function log(...args) {
  console.log('[server]', ...args);
}

function setStatus(message, extra = {}) {
  state.message = message;
  Object.assign(state, extra);
  log(message);
}

// Preference: env LAYA_MODEL > q8_0 > ud_q4_k_m > f16 > any other *.gguf
function findModel() {
  if (process.env.LAYA_MODEL) {
    const p = path.resolve(ROOT, process.env.LAYA_MODEL);
    if (fs.existsSync(p)) return p;
    const inModels = path.join(MODELS_DIR, process.env.LAYA_MODEL);
    if (fs.existsSync(inModels)) return inModels;
    log(`LAYA_MODEL=${process.env.LAYA_MODEL} tidak ditemukan, mencari di models/`);
  }
  let files = [];
  try {
    files = fs.readdirSync(MODELS_DIR).filter((f) => f.toLowerCase().endsWith('.gguf'));
  } catch {
    return null;
  }
  if (!files.length) return null;
  const rank = (f) => {
    const n = f.toLowerCase();
    if (n.includes('q8_0')) return 0;
    if (n.includes('ud_q4_k_m') || n.includes('q4_k_m')) return 1;
    if (n.includes('f16')) return 2;
    return 3;
  };
  files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return path.join(MODELS_DIR, files[0]);
}

// All *.gguf files in models/, sorted by name (rescanned on every call).
function listModels() {
  let files = [];
  try {
    files = fs.readdirSync(MODELS_DIR).filter((f) => f.toLowerCase().endsWith('.gguf'));
  } catch {
    return [];
  }
  files.sort((a, b) => a.localeCompare(b));
  return files.map((file) => {
    let size = 0;
    try {
      size = fs.statSync(path.join(MODELS_DIR, file)).size;
    } catch {
      /* file vanished between readdir and stat */
    }
    return { file, size_mb: Math.round((size / (1024 * 1024)) * 10) / 10, active: file === state.model };
  });
}

// Wait until the model file stops growing (user may still be copying/downloading it).
async function waitForStableFile(p) {
  let prev = -1;
  for (;;) {
    let size;
    try {
      size = fs.statSync(p).size;
    } catch {
      return false;
    }
    if (size > 0 && size === prev) return true;
    prev = size;
    await sleep(2000);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pipeLogs(stream, prefix, onLine = null) {
  let buf = '';
  stream.setEncoding('utf8');
  const emit = (line) => {
    console.log(`${prefix} ${line}`);
    if (onLine) onLine(line);
  };
  stream.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) if (line.trim()) emit(line);
  });
  stream.on('end', () => {
    if (buf.trim()) emit(buf);
  });
}

// Load/metadata failures laya reports on stderr before the ready line, e.g.
//   "[laya] skip <path>: Missing 'ggmlc.graph_spec' metadata in GGUF file"
// They fail the same way on cpu, so a benchmark does not retry them there.
const LOAD_ERROR_RE = /missing\b|metadata|gguf|failed to (load|open|read)|invalid|unsupported|not a valid|no such file|\bskip\b/i;

function isLoadError(child) {
  return !child.isReady && LOAD_ERROR_RE.test(child.stderrTail.join('\n'));
}

// Bahasa Indonesia message for a child that exited before its ready line.
function loadErrorMessage(child, code, signal) {
  const raw =
    child.stderrTail
      .map((l) => l.replace(/^\[laya\]\s*/, '').trim())
      .filter(Boolean)
      .pop() || '';
  const m = raw.match(/Missing '([^']+)' metadata/i);
  if (m) return `Model gagal dimuat: metadata '${m[1]}' tidak ada di file GGUF (bukan model laya ggmlc yang lengkap).`;
  if (raw) return `Model gagal dimuat (laya.exe berhenti, code=${code}): ${raw}`;
  return `laya.exe berhenti (code=${code}, signal=${signal})`;
}

// `laya daemon <gguf> --device X` protocol (stdin/stdout, one JSON object per line; no port):
//   stdout line 1: {"status":"ready","model":"laya"} once the model is loaded
//   request:  {"id":n,"state":{...},"questions":{...}}
//   response: {"model","family","route","answers":{<qid>:{...}},"usage":{...},"id":n}
//   error:    {"id":n,"error":"..."}
// There is no batch: requests are written one at a time (a promise chain per child) and matched
// by String(id), since the daemon may echo the id as a string. stderr carries laya's logs.
function startLaya(modelPath, device) {
  const args = ['daemon', modelPath, '--device', device];
  log(`Menjalankan: ${EXE_PATH} ${args.join(' ')}`);
  const child = spawn(EXE_PATH, args, {
    cwd: path.dirname(EXE_PATH),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  state.child = child;
  child.pending = new Map(); // String(id) -> {resolve, reject, timer}
  child.nextId = 1;
  child.chain = Promise.resolve(); // serializes requests: one in flight at a time
  child.readyWaiters = [];
  child.isReady = false;
  child.failed = false;
  child.stderrTail = []; // last stderr lines, for load error messages
  child.stdin.on('error', (err) => log(`laya stdin error: ${err.message}`));
  pipeLogs(child.stderr, '[laya!]', (line) => {
    child.stderrTail.push(line);
    if (child.stderrTail.length > 8) child.stderrTail.shift();
  });
  readJsonLines(child);

  child.on('error', (err) => {
    state.error = err.message;
    setStatus(`Gagal menjalankan laya.exe: ${err.message}`, { ready: false });
    failChild(child, new Error(`laya.exe error: ${err.message}`));
  });

  child.on('exit', (code, signal) => {
    // Before the ready line, 'exit' can fire before stderr is drained: wait for it (max 500 ms)
    // so the load error message and isLoadError() see laya's last lines.
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(t);
      onExit(code, signal);
    };
    const t = setTimeout(finish, 500);
    if (child.isReady || child.stderr.readableEnded) finish();
    else child.stderr.once('end', finish);
  });
  const onExit = (code, signal) => {
    const early = !child.isReady;
    failChild(child, new Error(`laya.exe berhenti (code=${code}, signal=${signal})`));
    const wasCurrent = state.child === child;
    if (wasCurrent) state.child = null;
    // Intentional stop (server shutdown or model switch) or an already-replaced child:
    // no crash message, no CPU fallback.
    if (state.shuttingDown || child.intentionalStop || !wasCurrent) return;
    const wasReady = state.ready;
    state.ready = false;
    state.error = early ? loadErrorMessage(child, code, signal) : `laya.exe berhenti (code=${code}, signal=${signal})`;
    log(state.error);
    const skipFallback = state.skipCpuFallbackOnLoadError && isLoadError(child);
    if (device !== 'cpu' && !state.triedCpuFallback && !skipFallback) {
      state.triedCpuFallback = true;
      setStatus(`laya.exe crash di device "${device}", memuat ulang dengan device cpu...`);
      state.fallbackLaunch = launch(modelPath, 'cpu');
    } else {
      setStatus(
        `Model gagal berjalan: ${state.error.replace(/\.$/, '')}${wasReady ? '' : '. Periksa log konsol server.'}`
      );
    }
  };
  return child;
}

// Line-buffered stdout reader (handles partial chunks). The ready line wakes waitForReady();
// responses settle the pending request with the same String(id); non-JSON lines are logged.
function readJsonLines(child) {
  let buf = '';
  child.stdout.setEncoding('utf8');
  const handle = (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      console.log(`[laya] ${line}`);
      return;
    }
    if (msg && msg.status === 'ready' && msg.id === undefined) {
      child.isReady = true;
      for (const w of child.readyWaiters.splice(0)) w(msg);
      return;
    }
    const key = msg && msg.id !== undefined && msg.id !== null ? String(msg.id) : null;
    const entry = key !== null ? child.pending.get(key) : undefined;
    if (!entry) {
      console.log(`[laya] (tanpa pasangan) ${line.slice(0, 300)}`);
      return;
    }
    child.pending.delete(key);
    clearTimeout(entry.timer);
    if (msg.error) entry.reject(new Error(`laya: ${typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error)}`));
    else entry.resolve(msg);
  };
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      handle(line);
    }
  });
  child.stdout.on('end', () => {
    if (buf) handle(buf);
    buf = '';
  });
}

// Rejects every pending request of a child and releases anyone waiting for its ready line.
function failChild(child, err) {
  if (child.failed) return;
  child.failed = true;
  for (const w of child.readyWaiters.splice(0)) w(false);
  for (const entry of child.pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(err);
  }
  child.pending.clear();
}

// Resolves with the ready message, false if the child exits first, null on timeout.
function waitForReady(child, timeoutMs = READY_TIMEOUT_MS) {
  if (child.isReady) return Promise.resolve({ status: 'ready' });
  if (child.failed || child.exitCode !== null) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (v) => {
      clearTimeout(t);
      resolve(v);
    };
    const t = setTimeout(() => {
      child.readyWaiters = child.readyWaiters.filter((w) => w !== done);
      resolve(null);
    }, timeoutMs);
    child.readyWaiters.push(done);
  });
}

// One request ({state, questions} or {preset, state}) to the current daemon. Requests are queued
// per child so only one is in flight at a time; each has its own timeout.
function layaRequest(payload, timeoutMs = REQUEST_TIMEOUT_MS) {
  const child = state.child;
  if (!child || !child.isReady || child.failed) return Promise.reject(new Error('laya.exe belum siap'));
  const run = () =>
    new Promise((resolve, reject) => {
      if (child.failed || child.exitCode !== null) return reject(new Error('laya.exe sudah berhenti'));
      const id = child.nextId++;
      const key = String(id);
      const timer = setTimeout(() => {
        if (child.pending.delete(key)) reject(new Error(`timeout ${timeoutMs} ms menunggu jawaban laya (id ${id})`));
      }, timeoutMs);
      child.pending.set(key, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`, (err) => {
        if (err && child.pending.delete(key)) {
          clearTimeout(timer);
          reject(new Error(`gagal mengirim ke laya: ${err.message}`));
        }
      });
    });
  const p = child.chain.then(run, run);
  child.chain = p.catch(() => {});
  return p;
}

// laya's "--device auto" picks Vulkan device 0, which on laptops is often the integrated GPU
// (measured here: Intel UHD ~2.4 s vs GTX 1650 ~0.13 s for a 10-text batch). For "auto" we run
// `laya info` once, parse the "ggml_vulkan: N = <name> | uma: X" lines and pick the first
// discrete GPU (uma: 0). Falls back to "auto" if nothing can be parsed.
function resolveDevice(requested, modelPath) {
  if (requested !== 'auto') return Promise.resolve(requested);
  return new Promise((resolve) => {
    execFile(EXE_PATH, ['info', modelPath], { cwd: path.dirname(EXE_PATH), timeout: 120000, windowsHide: true },
      (err, stdout, stderr) => {
        const text = `${stdout || ''}\n${stderr || ''}`;
        const devices = [...text.matchAll(/ggml_vulkan:\s*(\d+)\s*=\s*([^|\r\n]+)\|\s*uma:\s*(\d)/g)].map((m) => ({
          index: Number(m[1]),
          name: m[2].trim(),
          uma: m[3] === '1',
        }));
        const discrete = devices.find((d) => !d.uma);
        if (discrete && devices.length > 1) {
          log(`Device auto -> vulkan:${discrete.index} (${discrete.name})`);
          resolve(`vulkan:${discrete.index}`);
        } else {
          resolve('auto');
        }
      });
  });
}

async function launch(modelPath, device, gen = state.gen, statusPrefix = '') {
  if (gen !== state.gen) return;
  state.ready = false;
  state.model = path.basename(modelPath);
  state.modelPath = modelPath;
  state.device = null;
  setStatus(`${statusPrefix}Memuat model ${state.model} (device: ${device})...`);
  const child = startLaya(modelPath, device);
  const ready = await waitForReady(child);
  if (!ready) {
    if (ready === null && state.child === child && child.exitCode === null) {
      setStatus('Timeout menunggu laya.exe siap. Periksa log konsol server.');
    }
    return;
  }
  if (state.child !== child) return; // replaced (model switch) while loading
  // The daemon's ready line carries no device: report the device it was started with.
  state.device = device;
  state.error = null;
  setStatus(`${statusPrefix}Model siap: ${state.model} (device: ${state.device})`, { ready: true });
}

// Stop the current laya child on purpose and wait for it to exit: close stdin first (the daemon
// exits on EOF), kill after 3 s, taskkill the tree after timeoutMs. The exit handler sees
// child.intentionalStop and skips the crash message / CPU fallback.
function stopChild(timeoutMs = 15000) {
  const child = state.child;
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    state.child = null;
    return Promise.resolve();
  }
  child.intentionalStop = true;
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      if (state.child === child) state.child = null;
      resolve();
    };
    const t = setTimeout(() => {
      // Did not exit in time: force kill the whole tree (Windows) and move on.
      if (process.platform === 'win32') execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {});
      else child.kill('SIGKILL');
      setTimeout(done, 1000);
    }, timeoutMs);
    child.once('exit', done);
    try {
      child.stdin.end();
    } catch {
      /* ignore */
    }
    const k = setTimeout(() => {
      try {
        if (child.exitCode === null && child.signalCode === null) child.kill();
      } catch {
        /* ignore */
      }
    }, 3000);
    child.once('exit', () => clearTimeout(k));
  });
}

// Switch the active model (POST /api/model runs it in the background; the UI polls /api/status).
// Options (used by the benchmark):
//   device                     - already-resolved device, skips `laya info`
//   skipCpuFallbackOnLoadError - no CPU retry when the model fails to load (bad/missing metadata)
//   statusPrefix               - prepended to every status message of this switch
// Resolves {ok, error, device, load_ms} once the model (or its CPU fallback) is ready or has failed.
// load_ms covers device detection + load, not stopping the old child.
async function switchModel(modelPath, opts = {}) {
  const gen = ++state.gen;
  const pre = opts.statusPrefix || '';
  state.switching = true;
  state.ready = false;
  state.model = path.basename(modelPath);
  state.modelPath = modelPath;
  state.device = null;
  state.error = null;
  state.triedCpuFallback = false;
  state.skipCpuFallbackOnLoadError = opts.skipCpuFallbackOnLoadError === true;
  state.fallbackLaunch = null;
  let t0 = Date.now();
  try {
    setStatus(`${pre}Mengganti model ke ${state.model}: menghentikan model lama...`);
    await stopChild();
    if (gen !== state.gen) {
      // superseded by a newer switch request
      return { ok: false, error: 'Digantikan oleh penggantian model lain.', device: null, load_ms: 0 };
    }
    t0 = Date.now();
    setStatus(`${pre}Mendeteksi GPU & memuat model ${state.model}...`);
    const device = opts.device || (await resolveDevice(LAYA_DEVICE, modelPath));
    await launch(modelPath, device, gen, pre);
    // A crash before ready may have started a CPU fallback launch (exit handler): wait for it too.
    while (!state.ready && state.fallbackLaunch && gen === state.gen) {
      const p = state.fallbackLaunch;
      state.fallbackLaunch = null;
      await p;
    }
    const ok = gen === state.gen && state.ready;
    return { ok, error: ok ? null : state.error || state.message, device: state.device, load_ms: Date.now() - t0 };
  } catch (err) {
    state.error = err.message;
    setStatus(`${pre}Gagal mengganti model: ${err.message}`, { ready: false });
    return { ok: false, error: err.message, device: null, load_ms: Date.now() - t0 };
  } finally {
    if (gen === state.gen) {
      state.switching = false;
      state.skipCpuFallbackOnLoadError = false;
    }
  }
}

async function boot() {
  // Ensure binary
  if (!fs.existsSync(EXE_PATH)) {
    setStatus('Mengunduh laya.exe (sekali saja)...');
    try {
      await setup();
    } catch (err) {
      state.error = err.message;
      setStatus(`Gagal mengunduh laya.exe: ${err.message}. Jalankan "npm run setup" manual.`);
      return;
    }
  }

  // Wait for a model file. A POST /api/model during boot takes over (state.gen changes).
  const bootGen = state.gen;
  let modelPath = findModel();
  if (!modelPath) {
    setStatus('Model .gguf belum ada di folder models/. Taruh file model di sana (dicek tiap 5 detik).', {
      model: null,
    });
    while (!modelPath && !state.shuttingDown && !state.gen) {
      await sleep(MODEL_POLL_MS);
      modelPath = findModel();
    }
    if (state.shuttingDown || state.gen !== bootGen) return; // a model was picked via /api/model
    setStatus(`Model ditemukan: ${path.basename(modelPath)}, menunggu file selesai disalin (load)...`);
    await waitForStableFile(modelPath);
  }
  setStatus(`Mendeteksi GPU & memuat model ${path.basename(modelPath)}...`, { model: path.basename(modelPath) });
  if (state.gen !== bootGen) return;
  const device = await resolveDevice(LAYA_DEVICE, modelPath);
  await launch(modelPath, device, bootGen);
}

function shutdown() {
  if (state.shuttingDown) return;
  state.shuttingDown = true;
  const child = state.child;
  if (child && child.exitCode === null) {
    try {
      child.stdin.end();
    } catch {
      /* ignore */
    }
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
}
process.on('exit', shutdown);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => {
    shutdown();
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function num(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Probabilities as a {key: p} map. Laya returns an object; also accept an array of
// [label, p] or {label, probability} to be defensive.
function probMap(answer) {
  const out = {};
  const raw = answer?.probabilities ?? answer?.probs ?? answer?.scores;
  if (Array.isArray(raw)) {
    raw.forEach((item, i) => {
      if (Array.isArray(item)) out[String(item[0]).toLowerCase()] = num(item[1]);
      else if (item && typeof item === 'object') {
        const k = String(item.label ?? item.choice ?? item.name ?? i).toLowerCase();
        out[k] = num(item.probability ?? item.p ?? item.score);
      } else out[String(i)] = num(item);
    });
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) out[k.toLowerCase()] = num(v);
  }
  return out;
}

// action.act_probability (1 if missing)
function actOf(answer) {
  const a = answer?.action?.act_probability ?? answer?.act_probability;
  return a === undefined || a === null ? 1 : round4(num(a));
}

function optionsWith(mode, probs) {
  return MODES[mode].options.map((o, i) => ({ key: o.key, text: o.text, prob: round4(num(probs[i])) }));
}

// sentiment3 - choice answer (verified):
//   { type:"choice", choice:"negative", confidence:0.50,
//     probabilities:{positive:0.0075, neutral:..., negative:...}, action:{act_probability:1} }
function parseChoice(answer) {
  const p = probMap(answer);
  const out = { positive: num(p.positive), neutral: num(p.neutral), negative: num(p.negative) };
  const total = out.positive + out.neutral + out.negative;
  let label = String(answer?.choice ?? answer?.label ?? '').toLowerCase();
  if (total > 0) {
    if (Math.abs(total - 1) > 0.01) for (const k of LABELS) out[k] /= total;
  } else if (LABELS.includes(label)) {
    out[label] = 1; // no probabilities returned: trust the choice
  }
  if (!LABELS.includes(label)) label = LABELS.reduce((a, b) => (out[b] > out[a] ? b : a));
  const score = round4(out.positive - out.negative);
  const confidence =
    answer?.confidence !== undefined ? num(answer.confidence) : Math.max(out.positive, out.neutral, out.negative);
  return {
    label,
    score,
    value: score,
    confidence: round4(confidence),
    act: actOf(answer),
    options: optionsWith('sentiment3', [out.positive, out.neutral, out.negative]),
  };
}

// binary - noul answer (observed on laya):
//   { type:"noul", noul:0.9218, confidence:0.9218, action:{act_probability:1} }
// `noul` is P(true); no probabilities object is returned, but {false, true} is accepted if present.
function parseNoul(answer) {
  let pTrue;
  if (answer?.noul !== undefined && answer?.noul !== null && typeof answer.noul !== 'object') {
    pTrue = num(answer.noul);
  } else {
    const p = probMap(answer);
    if (p.true !== undefined || p.false !== undefined) {
      const t = num(p.true);
      const f = num(p.false);
      pTrue = t + f > 0 ? t / (t + f) : 0.5;
    } else if (typeof answer?.value === 'boolean') {
      pTrue = answer.value ? 1 : 0;
    } else {
      pTrue = num(answer?.probability ?? answer?.p ?? 0.5);
    }
  }
  pTrue = clamp(pTrue, 0, 1);
  const confidence = answer?.confidence !== undefined ? num(answer.confidence) : Math.max(pTrue, 1 - pTrue);
  return {
    label: pTrue >= 0.5 ? 'positive' : 'negative',
    score: round4(2 * pTrue - 1),
    value: round4(pTrue),
    confidence: round4(confidence),
    act: actOf(answer),
    options: optionsWith('binary', [1 - pTrue, pTrue]),
  };
}

function labelForRating(rating) {
  if (rating >= SCALE_POSITIVE_THRESHOLD) return 'positive';
  if (rating <= SCALE_NEGATIVE_THRESHOLD) return 'negative';
  return 'neutral';
}

// scale5 - score answer (observed on laya):
//   { type:"score", score:3.5271 /* expected level 0..4 */, confidence:0.655,
//     legend:{"0":"...", ..., "4":"..."}, probabilities:{"0":0.012, ..., "4":0.8367},
//     action:{act_probability:1} }
// rating (1..5) = expected level + 1.
function parseScore(answer) {
  const n = MODES.scale5.options.length;
  const p = probMap(answer);
  const probs = [];
  for (let i = 0; i < n; i++) probs.push(num(p[String(i)]));
  const total = probs.reduce((a, b) => a + b, 0);
  if (total > 0 && Math.abs(total - 1) > 0.01) for (let i = 0; i < n; i++) probs[i] /= total;
  let level;
  if (answer?.score !== undefined && answer?.score !== null) level = num(answer.score);
  else if (total > 0) level = probs.reduce((acc, q, i) => acc + q * i, 0);
  else level = (n - 1) / 2;
  const rating = clamp(level + 1, 1, n);
  const confidence = answer?.confidence !== undefined ? num(answer.confidence) : Math.max(...probs);
  return {
    label: labelForRating(rating),
    score: round4((rating - 3) / 2),
    value: round4(rating),
    confidence: round4(confidence),
    act: actOf(answer),
    options: optionsWith('scale5', probs),
  };
}

const PARSERS = { sentiment3: parseChoice, binary: parseNoul, scale5: parseScore };

// ---------------------------------------------------------------------------
// Generic questions (every mode) - lets the UI render any question set the same way:
//   { id, type:"choice"|"noul"|"score", instructions,
//     headline,   // Studio-style: choice -> winning key; noul -> "P(true)=0.4390"; score -> level "1.9238"
//     value,      // choice: prob of the winner; noul: P(true); score: expected level (0-based)
//     winner,     // key of the highest-prob option
//     confidence, act, options:[{key, text, prob}] }
// ---------------------------------------------------------------------------

function argmaxKey(options) {
  let best = null;
  for (const o of options) if (!best || o.prob > best.prob) best = o;
  return best ? best.key : '';
}

function headlineOf(type, value, winner) {
  if (type === 'choice') return winner;
  if (type === 'noul') return `P(true)=${value.toFixed(4)}`;
  return value.toFixed(4);
}

// Option keys of a choice question: criteria keys (object) in their original order, otherwise
// the probability keys laya returned.
function choiceKeys(q, answer) {
  if (q?.criteria && typeof q.criteria === 'object' && !Array.isArray(q.criteria)) return Object.keys(q.criteria);
  const raw = answer?.probabilities;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return Object.keys(raw);
  return Object.keys(probMap(answer));
}

// Number of levels of a score question: criteria array > legend > probabilities.
function scoreLevels(q, answer) {
  if (Array.isArray(q?.criteria) && q.criteria.length) return q.criteria.length;
  const legend = answer?.legend && typeof answer.legend === 'object' ? Object.keys(answer.legend).length : 0;
  return legend || Object.keys(probMap(answer)).length;
}

// Builds a generic question from a laya answer. `texts` (optional) overrides the option texts in
// option order (used by the sentiment modes for their Bahasa Indonesia labels).
function genericQuestion(id, q, answer, texts = null) {
  const type = q.type;
  const confidence = answer?.confidence;
  let options;
  let value;
  if (type === 'choice') {
    const p = probMap(answer);
    const keys = choiceKeys(q, answer);
    const probs = keys.map((k) => num(p[String(k).toLowerCase()]));
    const total = probs.reduce((a, b) => a + b, 0);
    const chosen = String(answer?.choice ?? '');
    if (total > 0 && Math.abs(total - 1) > 0.01) for (let i = 0; i < probs.length; i++) probs[i] /= total;
    else if (total <= 0 && keys.includes(chosen)) probs[keys.indexOf(chosen)] = 1;
    options = keys.map((k, i) => ({ key: String(k), text: texts?.[i] ?? String(k), prob: round4(probs[i]) }));
    value = options.length ? Math.max(...options.map((o) => o.prob)) : 0;
  } else if (type === 'noul') {
    const pTrue = parseNoul(answer).value;
    options = [
      { key: 'false', text: texts?.[0] ?? 'false', prob: round4(1 - pTrue) },
      { key: 'true', text: texts?.[1] ?? 'true', prob: round4(pTrue) },
    ];
    value = pTrue;
  } else {
    const n = scoreLevels(q, answer);
    const p = probMap(answer);
    const probs = [];
    for (let i = 0; i < n; i++) probs.push(num(p[String(i)]));
    const total = probs.reduce((a, b) => a + b, 0);
    if (total > 0 && Math.abs(total - 1) > 0.01) for (let i = 0; i < n; i++) probs[i] /= total;
    if (answer?.score !== undefined && answer?.score !== null) value = num(answer.score);
    else if (total > 0) value = probs.reduce((acc, x, i) => acc + x * i, 0);
    else value = (n - 1) / 2;
    const legend = answer?.legend || {};
    options = probs.map((x, i) => {
      const desc = legend[String(i)] ?? (Array.isArray(q.criteria) ? q.criteria[i] : '');
      return { key: String(i), text: texts?.[i] ?? `${i}: ${desc ?? ''}`, prob: round4(x) };
    });
  }
  value = round4(value);
  const winner = argmaxKey(options);
  return {
    id,
    type,
    instructions: q.instructions ?? '',
    headline: headlineOf(type, value, winner),
    value,
    winner,
    confidence: round4(confidence !== undefined ? num(confidence) : Math.max(0, ...options.map((o) => o.prob))),
    act: actOf(answer),
    options,
  };
}

function sentimentQuestion(mode, answer) {
  return genericQuestion('sentiment', MODES[mode].question, answer, MODES[mode].options.map((o) => o.text));
}

// Top-level sentiment fields when a result has no sentiment question (preset mode without it).
const NULL_SENTIMENT = { label: null, score: null, value: null, confidence: null, act: null, options: null };

// ---------------------------------------------------------------------------
// Presets: snapshot of laya GET /v1/presets in presets/laya-presets.json (the daemon cannot list
// them). Loaded once at boot; refresh it with `npm run presets:sync` after upgrading laya.
// ---------------------------------------------------------------------------

const PRESET_MODE = 'preset';
let presetSnapshot = { list: [] }; // {list} or {error}

function loadPresetSnapshot() {
  const rel = path.relative(ROOT, PRESETS_FILE);
  try {
    const body = JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf8'));
    const list = (Array.isArray(body) ? body : body?.presets ?? []).filter(
      (p) => p && typeof p.name === 'string' && p.questions && typeof p.questions === 'object'
    );
    presetSnapshot = { list };
    log(`Preset dimuat dari ${rel}: ${list.length} preset`);
  } catch (err) {
    presetSnapshot = { error: `snapshot preset ${rel} tidak bisa dibaca (${err.message}). Jalankan "npm run presets:sync".` };
    log(presetSnapshot.error);
  }
}
loadPresetSnapshot();

// Full laya preset objects: [{name, title, blurb, state_key, state, questions}].
async function getPresets() {
  if (presetSnapshot.error) throw new Error(presetSnapshot.error);
  return presetSnapshot.list;
}

function presetSummary(p) {
  return {
    name: p.name,
    title: p.title ?? p.name,
    blurb: p.blurb ?? '',
    state_key: p.state_key,
    question_count: Object.keys(p.questions).length,
  };
}

// ---------------------------------------------------------------------------
// Question-set validation (shared by templates and custom scoring)
// ---------------------------------------------------------------------------

const QUESTION_TYPES = ['choice', 'noul', 'score'];
const QUESTION_ID_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 32;
const MAX_OPTS = 16; // laya.max_opts of the shipped GGUFs (17 options -> laya 422)
const MAX_INSTRUCTIONS = 1000;
const MAX_CRITERION = 1000;
const MAX_EXTRA_STATE_KEYS = 32;
const MAX_EXTRA_STATE_VALUE = 10000;

class ValidationError extends Error {}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Validates and normalizes one question. Choice criteria values null/undefined -> "" (laya treats
// null and "" the same: the option key alone is used). Noul criteria with both sides empty are
// dropped. Throws ValidationError with a Bahasa Indonesia message.
function normalizeQuestion(id, q) {
  const where = `Pertanyaan "${id}"`;
  if (!isPlainObject(q)) throw new ValidationError(`${where} harus berupa objek.`);
  if (!QUESTION_TYPES.includes(q.type)) {
    throw new ValidationError(`${where}: tipe "${q.type}" tidak valid. Pilihan: ${QUESTION_TYPES.join(', ')}.`);
  }
  if (typeof q.instructions !== 'string' || !q.instructions.trim()) {
    throw new ValidationError(`${where}: instruksi (instructions) wajib diisi.`);
  }
  const instructions = q.instructions.trim();
  if (instructions.length > MAX_INSTRUCTIONS) {
    throw new ValidationError(`${where}: instruksi maksimal ${MAX_INSTRUCTIONS} karakter.`);
  }
  const out = { type: q.type, instructions };
  if (q.type === 'choice') {
    if (!isPlainObject(q.criteria)) {
      throw new ValidationError(`${where}: tipe choice butuh criteria berupa objek {opsi: deskripsi}.`);
    }
    const entries = Object.entries(q.criteria);
    if (entries.length < 2 || entries.length > MAX_OPTS) {
      throw new ValidationError(`${where}: tipe choice butuh 2 sampai ${MAX_OPTS} opsi (diterima ${entries.length}).`);
    }
    const criteria = {};
    for (const [key, desc] of entries) {
      const k = key.trim();
      if (!k || k.length > 64) throw new ValidationError(`${where}: nama opsi harus 1-64 karakter.`);
      if (Object.prototype.hasOwnProperty.call(criteria, k)) throw new ValidationError(`${where}: opsi "${k}" duplikat.`);
      if (desc !== null && desc !== undefined && typeof desc !== 'string') {
        throw new ValidationError(`${where}: deskripsi opsi "${k}" harus berupa teks.`);
      }
      const d = (desc ?? '').trim();
      if (d.length > MAX_CRITERION) throw new ValidationError(`${where}: deskripsi opsi "${k}" maksimal ${MAX_CRITERION} karakter.`);
      criteria[k] = d;
    }
    out.criteria = criteria;
  } else if (q.type === 'noul') {
    if (q.criteria !== undefined && q.criteria !== null) {
      const keys = isPlainObject(q.criteria) ? Object.keys(q.criteria) : null;
      if (!keys || keys.length !== 2 || !keys.includes('false') || !keys.includes('true')) {
        throw new ValidationError(`${where}: criteria tipe noul harus tepat berisi kunci "false" dan "true".`);
      }
      const f = q.criteria.false ?? '';
      const t = q.criteria.true ?? '';
      if (typeof f !== 'string' || typeof t !== 'string') {
        throw new ValidationError(`${where}: deskripsi "false"/"true" harus berupa teks.`);
      }
      if (f.trim() || t.trim()) {
        if (!f.trim() || !t.trim()) {
          throw new ValidationError(`${where}: isi kedua deskripsi "false" dan "true", atau kosongkan keduanya.`);
        }
        if (f.trim().length > MAX_CRITERION || t.trim().length > MAX_CRITERION) {
          throw new ValidationError(`${where}: deskripsi maksimal ${MAX_CRITERION} karakter.`);
        }
        out.criteria = { false: f.trim(), true: t.trim() };
      }
    }
  } else {
    if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > MAX_OPTS) {
      throw new ValidationError(`${where}: tipe score butuh criteria berupa daftar 2 sampai ${MAX_OPTS} level.`);
    }
    out.criteria = q.criteria.map((c, i) => {
      if (typeof c !== 'string' || !c.trim()) throw new ValidationError(`${where}: level ${i} tidak boleh kosong.`);
      if (c.trim().length > MAX_CRITERION) throw new ValidationError(`${where}: level ${i} maksimal ${MAX_CRITERION} karakter.`);
      return c.trim();
    });
  }
  return out;
}

// Flat {key: string|number|boolean}. Returns a normalized copy ({} when missing).
function normalizeExtraState(extra) {
  if (extra === undefined || extra === null) return {};
  if (!isPlainObject(extra)) throw new ValidationError('extra_state harus berupa objek {nama: nilai}.');
  const entries = Object.entries(extra);
  if (entries.length > MAX_EXTRA_STATE_KEYS) {
    throw new ValidationError(`extra_state maksimal ${MAX_EXTRA_STATE_KEYS} field.`);
  }
  const out = {};
  for (const [key, v] of entries) {
    const k = key.trim();
    if (!k || k.length > 64) throw new ValidationError('Nama field extra_state harus 1-64 karakter.');
    if (!['string', 'number', 'boolean'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v))) {
      throw new ValidationError(`extra_state "${k}" harus berupa teks, angka, atau boolean.`);
    }
    if (typeof v === 'string' && v.length > MAX_EXTRA_STATE_VALUE) {
      throw new ValidationError(`extra_state "${k}" maksimal ${MAX_EXTRA_STATE_VALUE} karakter.`);
    }
    out[k] = v;
  }
  return out;
}

// Validates the scoring part of a template: state_key, extra_state, include_sentiment, questions.
// Returns {state_key, extra_state, include_sentiment, questions} (normalized).
function validateQuestionSet(t) {
  if (!isPlainObject(t)) throw new ValidationError('Template harus berupa objek JSON.');
  const stateKey = typeof t.state_key === 'string' ? t.state_key.trim() : '';
  if (!stateKey || stateKey.length > 64) throw new ValidationError('state_key wajib diisi (1-64 karakter).');
  const includeSentiment = t.include_sentiment !== false;
  if (!isPlainObject(t.questions)) throw new ValidationError('questions harus berupa objek {id: pertanyaan}.');
  const ids = Object.keys(t.questions);
  if (ids.length < MIN_QUESTIONS || ids.length > MAX_QUESTIONS) {
    throw new ValidationError(`Jumlah pertanyaan harus ${MIN_QUESTIONS} sampai ${MAX_QUESTIONS} (diterima ${ids.length}).`);
  }
  const questions = {};
  for (const id of ids) {
    if (!QUESTION_ID_RE.test(id)) {
      throw new ValidationError(
        `ID pertanyaan "${id}" tidak valid: gunakan huruf, angka, dan underscore, diawali huruf/underscore, maksimal 64 karakter.`
      );
    }
    if (id === 'sentiment' && includeSentiment) {
      throw new ValidationError(
        'ID pertanyaan "sentiment" bentrok dengan pertanyaan sentimen bawaan. Ganti ID-nya atau matikan include_sentiment.'
      );
    }
    questions[id] = normalizeQuestion(id, t.questions[id]);
  }
  const extraState = normalizeExtraState(t.extra_state);
  delete extraState[stateKey]; // the input text always wins
  return { state_key: stateKey, extra_state: extraState, include_sentiment: includeSentiment, questions };
}

// ---------------------------------------------------------------------------
// Templates (templates/<id>.json)
// ---------------------------------------------------------------------------

const TEMPLATES_DIR = path.join(ROOT, 'templates');
const TEMPLATE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const CUSTOM_MODE = 'custom';

// preset and custom both score a question set (+ optional sentiment3) and share the same output.
function isQuestionSetMode(mode) {
  return mode === PRESET_MODE || mode === CUSTOM_MODE;
}

function isTemplateId(id) {
  return typeof id === 'string' && TEMPLATE_ID_RE.test(id);
}

function templatePath(id) {
  if (!isTemplateId(id)) throw new ValidationError(`ID template tidak valid: ${id}`);
  return path.join(TEMPLATES_DIR, `${id}.json`);
}

function slugify(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56)
    .replace(/-+$/g, '');
}

// Reads templates/<id>.json; null if missing or unreadable. The id always comes from the file name.
function readTemplate(id) {
  let text;
  try {
    text = fs.readFileSync(templatePath(id), 'utf8');
  } catch {
    return null;
  }
  try {
    const t = JSON.parse(text);
    if (!isPlainObject(t)) return null;
    return { ...t, id, builtin: t.builtin === true };
  } catch (err) {
    log(`Template ${id}.json rusak: ${err.message}`);
    return null;
  }
}

function listTemplates() {
  let files = [];
  try {
    files = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const list = [];
  for (const f of files) {
    const id = f.slice(0, -5);
    if (!isTemplateId(id)) continue;
    const t = readTemplate(id);
    if (!t) continue;
    list.push({
      id,
      title: String(t.title ?? id),
      description: String(t.description ?? ''),
      builtin: t.builtin,
      question_count: isPlainObject(t.questions) ? Object.keys(t.questions).length : 0,
      updated_at: t.updated_at ?? null,
    });
  }
  list.sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.title.localeCompare(b.title, 'id'));
  return list;
}

// Full validation for saving. Returns the normalized template (without id/builtin/updated_at).
function validateTemplate(t) {
  if (!isPlainObject(t)) throw new ValidationError('Template harus berupa objek JSON.');
  const title = typeof t.title === 'string' ? t.title.trim() : '';
  if (!title || title.length > 120) throw new ValidationError('Judul (title) wajib diisi, maksimal 120 karakter.');
  if (t.description !== undefined && t.description !== null && typeof t.description !== 'string') {
    throw new ValidationError('Deskripsi harus berupa teks.');
  }
  const description = (t.description ?? '').trim();
  if (description.length > 1000) throw new ValidationError('Deskripsi maksimal 1000 karakter.');
  const set = validateQuestionSet(t);
  return {
    title,
    description,
    state_key: set.state_key,
    extra_state: set.extra_state,
    include_sentiment: set.include_sentiment,
    questions: set.questions,
  };
}

// Write via a temp file + rename so a crash never leaves a half-written template.
function writeTemplate(template) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  const file = templatePath(template.id);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------
// laya calls
// ---------------------------------------------------------------------------

// Asks `questions` for every state, one daemon request per state (the daemon has no batch).
// Returns one answers map ({id: answer}) per state. When `usage` is given, each response's usage
// (input_tokens, output_tokens, latency_ms) is added to it.
async function decideAll(states, questions, usage = null) {
  const out = [];
  for (const s of states) {
    const resp = await layaRequest({ state: s, questions });
    if (!resp?.answers || typeof resp.answers !== 'object') throw new Error('laya response missing answers');
    if (usage && resp.usage && typeof resp.usage === 'object') {
      for (const k of ['input_tokens', 'output_tokens', 'latency_ms']) usage[k] = round4(num(usage[k]) + num(resp.usage[k]));
    }
    out.push(resp.answers);
  }
  return out;
}

function sentimentAnswerOf(answers) {
  return answers?.sentiment ?? answers?.[Object.keys(answers || {})[0]];
}

async function scoreTexts(texts, mode, usage = null) {
  const answersList = await decideAll(texts.map((text) => ({ text })), { sentiment: MODES[mode].question }, usage);
  const parse = PARSERS[mode];
  return answersList.map((answers) => {
    const a = sentimentAnswerOf(answers);
    if (!a) throw new Error('laya response missing sentiment answer');
    return { ...parse(a), questions: [sentimentQuestion(mode, a)] };
  });
}

// Sarcasm correction for preset/custom sets that ask a noul question with id "sarcasm" next to the
// sentiment question. The sentiment question reads praise words literally, so a sarcastic text
// ("mantap, udah bayar mahal dapetnya sampah") comes back positive. When P(sarcasm) >= the
// threshold and the label is positive, that share of P(positive) is moved to P(negative):
//   pos' = pos * (1 - pS), neg' = neg + pos * pS, label = argmax.
// The model's own answer is kept in sentiment_raw.
const SARCASM_QUESTION_ID = 'sarcasm';
const SARCASM_THRESHOLD = 0.5;

function applySarcasm(top, qs) {
  const sq = qs.find((q) => q.id === SARCASM_QUESTION_ID && q.type === 'noul');
  if (!sq || top.label !== 'positive') return top;
  const pS = num(sq.value);
  if (pS < SARCASM_THRESHOLD) return top;
  const p = Object.fromEntries(top.options.map((o) => [o.key, o.prob]));
  const moved = p.positive * pS;
  p.positive -= moved;
  p.negative += moved;
  const label = LABELS.reduce((a, b) => (p[b] > p[a] ? b : a));
  const score = round4(p.positive - p.negative);
  const options = optionsWith('sentiment3', [p.positive, p.neutral, p.negative]);
  const sent = qs.find((q) => q.id === 'sentiment');
  if (sent) {
    sent.options = sent.options.map((o) => ({ ...o, prob: round4(num(p[o.key])) }));
    sent.winner = argmaxKey(sent.options);
    sent.value = round4(Math.max(...sent.options.map((o) => o.prob)));
    sent.headline = headlineOf(sent.type, sent.value, sent.winner);
    sent.adjusted = 'sarcasm';
  }
  const { label: rawLabel, score: rawScore, options: rawOptions } = top;
  return {
    ...top,
    label,
    score,
    value: score,
    confidence: round4(Math.max(p.positive, p.neutral, p.negative)),
    options,
    sarcasm_adjusted: true,
    sentiment_raw: { label: rawLabel, score: rawScore, options: rawOptions },
  };
}

// Preset / custom mode: each text goes into {...extraState, [state_key]: text} (the preset's own
// example-state fields are left out unless passed as extraState).
// With includeSentiment the sentiment3 question is asked in the same call under id "sentiment".
async function scorePreset(texts, preset, includeSentiment, extraState = {}, usage = null) {
  const questions = {};
  if (includeSentiment) questions.sentiment = MODES.sentiment3.question;
  for (const [id, q] of Object.entries(preset.questions)) if (id !== 'sentiment' || !includeSentiment) questions[id] = q;
  // Blank string fields (e.g. an unfilled "from"/"subject" placeholder) are not sent.
  const fixed = Object.fromEntries(Object.entries(extraState).filter(([, v]) => v !== ''));
  const answersList = await decideAll(
    texts.map((text) => ({ ...fixed, [preset.state_key]: text })),
    questions,
    usage
  );
  return answersList.map((answers) => {
    const qs = [];
    let top = NULL_SENTIMENT;
    if (includeSentiment) {
      const a = answers.sentiment;
      if (!a) throw new Error('laya response missing sentiment answer');
      top = parseChoice(a);
      qs.push(sentimentQuestion('sentiment3', a));
    }
    for (const [id, q] of Object.entries(questions)) {
      if (includeSentiment && id === 'sentiment') continue;
      const a = answers[id];
      if (!a) throw new Error(`laya response missing answer "${id}"`);
      qs.push(genericQuestion(id, q, a));
    }
    if (includeSentiment) top = applySarcasm(top, qs);
    return { ...top, questions: qs };
  });
}

function labelForAverage(score) {
  if (score > AVG_POSITIVE_THRESHOLD) return 'positive';
  if (score < AVG_NEGATIVE_THRESHOLD) return 'negative';
  return 'neutral';
}

// Option probability of a result/average, matched by key (falls back to position).
function optionProb(r, key, i) {
  const list = Array.isArray(r?.options) ? r.options : [];
  return num((list.find((x) => String(x?.key) === key) ?? list[i])?.prob);
}

// Means of score, value, confidence and each option probability. The average label is
// derived per mode from the mean headline number:
//   sentiment3: mean score with the +-0.15 thresholds
//   binary:     mean P(positif) >= 0.5
//   scale5:     mean rating >= 3.5 / <= 2.5
function buildAverage(results, mode, hasSentiment = true) {
  const n = results.length;
  const mean = (f) => (n ? round4(results.reduce((a, r) => a + num(f(r)), 0) / n) : 0);
  const questions = averageQuestions(results);
  const isSet = isQuestionSetMode(mode);
  if (isSet && !hasSentiment) return { ...NULL_SENTIMENT, count: n, questions };
  const sentMode = isSet ? 'sentiment3' : mode;
  const score = mean((r) => r.score);
  const value = mean((r) => r.value);
  let label;
  if (sentMode === 'binary') label = value >= 0.5 ? 'positive' : 'negative';
  else if (sentMode === 'scale5') label = labelForRating(value);
  else label = labelForAverage(score);
  return {
    score,
    label,
    value,
    count: n,
    options: MODES[sentMode].options.map((o, i) => ({ key: o.key, text: o.text, prob: mean((r) => optionProb(r, o.key, i)) })),
    confidence: mean((r) => r.confidence),
    questions,
  };
}

// Per question id (in first-seen order): mean option probs, confidence, act and value; the headline
// is recomputed from the means (choice winner = argmax of mean probs).
function averageQuestions(results) {
  const groups = new Map();
  for (const r of results) {
    for (const q of Array.isArray(r?.questions) ? r.questions : []) {
      if (!q || typeof q.id !== 'string') continue;
      if (!groups.has(q.id)) groups.set(q.id, []);
      groups.get(q.id).push(q);
    }
  }
  return [...groups.values()].map((list) => {
    const first = list[0];
    const n = list.length;
    const mean = (f) => round4(list.reduce((a, q) => a + num(f(q)), 0) / n);
    const firstOpts = Array.isArray(first.options) ? first.options : [];
    const options = firstOpts.map((o, i) => ({
      key: String(o.key),
      text: o.text,
      prob: mean((q) => optionProb(q, String(o.key), i)),
    }));
    const winner = argmaxKey(options);
    const value = mean((q) => q.value);
    return {
      id: first.id,
      type: first.type,
      instructions: first.instructions ?? '',
      headline: headlineOf(first.type, value, winner),
      value,
      winner,
      confidence: mean((q) => q.confidence),
      act: mean((q) => (q.act === undefined || q.act === null ? 1 : q.act)),
      options,
      count: n,
    };
  });
}

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(ROOT, 'public')));

// The running benchmark (null when idle). See the Benchmark section below.
let bench = null;
const BENCH_BUSY = 'Benchmark sedang berjalan, tunggu atau batalkan dulu.';

function benchBusy(res) {
  return res.status(409).json({ error: BENCH_BUSY });
}

function statusBody() {
  return {
    ready: state.ready,
    model: state.model,
    device: state.device,
    message: state.message,
    switching: state.switching,
    models: listModels(),
    benchmark: bench
      ? { running: true, index: bench.index, total: bench.total, file: bench.file, stage: bench.stage }
      : null,
  };
}

app.get('/api/status', (req, res) => {
  res.json(statusBody());
});

// Switch the active model. Responds right away (202); the UI polls /api/status.
// The choice lives in memory only (a restart goes back to the default pick).
app.post('/api/model', (req, res) => {
  if (bench) return benchBusy(res);
  const file = req.body?.file;
  // Only a bare *.gguf file name that currently exists in models/ (no path traversal).
  const valid =
    typeof file === 'string' &&
    file === path.basename(file) &&
    !file.includes('..') &&
    listModels().some((m) => m.file === file);
  if (!valid) {
    return res
      .status(400)
      .json({ error: 'File model tidak valid. Pilih salah satu file .gguf di folder models/.', ...statusBody() });
  }
  if (file === state.model && (state.ready || state.switching)) return res.json(statusBody());
  if (!fs.existsSync(EXE_PATH)) {
    return res.status(503).json({ error: 'laya.exe belum siap, coba lagi nanti.', ...statusBody() });
  }
  switchModel(path.join(MODELS_DIR, file)).catch((err) => log(`Switch error: ${err.message}`));
  res.status(202).json(statusBody());
});

function notReady(res) {
  return res.status(503).json({ error: state.message, message: state.message, switching: state.switching });
}

// Preset list from the snapshot: [{name, title, blurb, state_key, question_count}].
app.get('/api/presets', async (req, res) => {
  if (state.switching || !state.ready) return notReady(res);
  try {
    res.json((await getPresets()).map(presetSummary));
  } catch (err) {
    log(`Presets error: ${err.message}`);
    res.status(502).json({ error: `Gagal memuat preset: ${err.message}` });
  }
});

// Full laya preset {name, title, blurb, state_key, state, questions} so the UI can load it into the
// template editor (extra_state = state minus state_key).
app.get('/api/presets/:name', async (req, res) => {
  if (state.switching || !state.ready) return notReady(res);
  let list;
  try {
    list = await getPresets();
  } catch (err) {
    log(`Presets error: ${err.message}`);
    return res.status(502).json({ error: `Gagal memuat preset: ${err.message}` });
  }
  const p = list.find((x) => x.name === req.params.name);
  if (!p) return res.status(404).json({ error: `Preset tidak dikenal: ${req.params.name}.` });
  res.json({
    name: p.name,
    title: p.title ?? p.name,
    blurb: p.blurb ?? '',
    state_key: p.state_key,
    state: isPlainObject(p.state) ? p.state : {},
    questions: p.questions,
  });
});

// Template list: [{id, title, description, builtin, question_count, updated_at}], built-ins first.
app.get('/api/templates', (req, res) => {
  res.json(listTemplates());
});

app.get('/api/templates/:id', (req, res) => {
  const id = req.params.id;
  const t = isTemplateId(id) ? readTemplate(id) : null;
  if (!t) return res.status(404).json({ error: `Template tidak ditemukan: ${id}` });
  res.json(t);
});

// Create or overwrite. Without an id, the id is derived from the title (with -2, -3... on collision).
// Built-in templates cannot be overwritten (409).
app.post('/api/templates', (req, res) => {
  const body = req.body;
  let clean;
  try {
    clean = validateTemplate(body);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    throw err;
  }
  let id = body.id;
  if (id !== undefined && id !== null && id !== '') {
    if (!isTemplateId(id)) {
      return res.status(400).json({
        error: 'ID template tidak valid: gunakan huruf kecil, angka, dan tanda "-", diawali huruf/angka, maksimal 64 karakter.',
      });
    }
    const existing = readTemplate(id);
    if (existing?.builtin) {
      return res.status(409).json({ error: 'Template bawaan tidak bisa ditimpa, simpan dengan nama lain' });
    }
  } else {
    const base = slugify(clean.title) || 'template';
    id = base;
    for (let i = 2; fs.existsSync(templatePath(id)); i++) id = `${base}-${i}`;
  }
  const template = { id, ...clean, builtin: false, updated_at: new Date().toISOString() };
  try {
    writeTemplate(template);
  } catch (err) {
    log(`Template save error: ${err.message}`);
    return res.status(500).json({ error: `Gagal menyimpan template: ${err.message}` });
  }
  res.json(template);
});

app.delete('/api/templates/:id', (req, res) => {
  const id = req.params.id;
  const t = isTemplateId(id) ? readTemplate(id) : null;
  if (!t) return res.status(404).json({ error: `Template tidak ditemukan: ${id}` });
  if (t.builtin) return res.status(409).json({ error: 'Template bawaan tidak bisa dihapus' });
  try {
    fs.unlinkSync(templatePath(id));
  } catch (err) {
    return res.status(500).json({ error: `Gagal menghapus template: ${err.message}` });
  }
  res.status(204).end();
});

// Request-level error with an HTTP status (400 validation, 502 preset snapshot, ...).
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Validates a /api/score (or /api/benchmark) body and resolves everything scoring needs, without
// touching laya: {mode, texts, preset, template, includeSentiment, extraState}. Throws HttpError.
async function prepareScoreJob(reqBody) {
  const raw = reqBody?.texts;
  if (!Array.isArray(raw)) throw new HttpError(400, 'Body harus berupa {"texts": string[]}');
  const mode = reqBody?.mode ?? DEFAULT_MODE;
  if (typeof mode !== 'string' || (!MODES[mode] && !isQuestionSetMode(mode))) {
    throw new HttpError(
      400,
      `Mode tidak dikenal: ${mode}. Pilihan: ${[...Object.keys(MODES), PRESET_MODE, CUSTOM_MODE].join(', ')}.`
    );
  }
  const isPreset = mode === PRESET_MODE;
  const isCustom = mode === CUSTOM_MODE;
  const presetName = reqBody?.preset;
  if (isPreset && (typeof presetName !== 'string' || !presetName)) {
    throw new HttpError(400, 'Mode preset butuh field "preset" (nama preset).');
  }
  let includeSentiment = reqBody?.include_sentiment !== false;
  // Custom mode: an inline (possibly unsaved) template, or a saved one by template_id.
  let template = null;
  let extraState = {};
  try {
    if (isPreset) extraState = normalizeExtraState(reqBody?.extra_state);
    if (isCustom) {
      let src = reqBody?.template;
      const templateId = reqBody?.template_id;
      if (!isPlainObject(src)) {
        if (!isTemplateId(templateId)) {
          throw new HttpError(400, 'Mode custom butuh field "template" (objek) atau "template_id".');
        }
        src = readTemplate(templateId);
        if (!src) throw new HttpError(400, `Template tidak ditemukan: ${templateId}`);
      }
      const set = validateQuestionSet(src);
      const id = isTemplateId(src.id) ? src.id : isTemplateId(templateId) ? templateId : null;
      template = {
        id,
        title: typeof src.title === 'string' && src.title.trim() ? src.title.trim() : id || 'Template kustom',
        ...set,
      };
      includeSentiment = set.include_sentiment;
      extraState = set.extra_state;
    }
  } catch (err) {
    if (err instanceof ValidationError) throw new HttpError(400, err.message);
    throw err;
  }
  const texts = raw
    .filter((t) => typeof t === 'string' || typeof t === 'number')
    .map((t) => String(t).trim())
    .filter(Boolean);
  if (!texts.length) throw new HttpError(400, 'Tidak ada teks yang valid untuk dinilai.');
  if (texts.length > MAX_TEXTS) {
    throw new HttpError(400, `Maksimal ${MAX_TEXTS} teks per permintaan (diterima ${texts.length}).`);
  }
  let preset = null;
  if (isPreset) {
    try {
      preset = (await getPresets()).find((p) => p.name === presetName) || null;
    } catch (err) {
      log(`Presets error: ${err.message}`);
      throw new HttpError(502, `Gagal memuat preset: ${err.message}`);
    }
    if (!preset) throw new HttpError(400, `Preset tidak dikenal: ${presetName}.`);
    delete extraState[preset.state_key]; // the input text always wins
  }
  return { mode, texts, preset, template, includeSentiment, extraState };
}

// Scores a prepared job on the currently loaded model and returns the /api/score response body.
// Throws on laya errors (the route maps them to 502).
async function runScoreJob(job) {
  const { mode, texts, preset, template, includeSentiment, extraState } = job;
  const isPreset = mode === PRESET_MODE;
  const isCustom = mode === CUSTOM_MODE;
  const t0 = Date.now();
  const model = state.model;
  let scored;
  const usage = { input_tokens: 0, output_tokens: 0, latency_ms: 0 };
  if (isPreset) scored = await scorePreset(texts, preset, includeSentiment, extraState, usage);
  else if (isCustom) scored = await scorePreset(texts, template, includeSentiment, extraState, usage);
  else scored = await scoreTexts(texts, mode, usage);
  // index is 0-based (frontend displays index + 1)
  const results = scored.map((s, index) => ({ index, text: texts[index], ...s }));
  const isSet = isPreset || isCustom;
  const body = {
    mode,
    model,
    preset: preset ? preset.name : null,
    preset_title: preset ? preset.title ?? preset.name : null,
    include_sentiment: isSet ? includeSentiment : true,
    results,
    average: buildAverage(results, mode, !isSet || includeSentiment),
    latency_ms: Date.now() - t0,
    // Summed over the per-text daemon requests; total_tokens feeds the editor's "N token" meta.
    usage: { ...usage, total_tokens: usage.input_tokens + usage.output_tokens },
  };
  if (isCustom) {
    body.template_id = template.id;
    body.template_title = template.title;
  }
  if (isSet) body.extra_state = extraState;
  return body;
}

app.post('/api/score', async (req, res) => {
  if (bench) return benchBusy(res);
  let job;
  try {
    job = await prepareScoreJob(req.body);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
  if (state.switching || !state.ready) return notReady(res);
  try {
    res.json(await runScoreJob(job));
  } catch (err) {
    log(`Scoring error: ${err.message}`);
    res.status(502).json({ error: `Gagal menilai teks: ${err.message}` });
  }
});

function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Results + Summary sheets for the sentiment modes (sentiment3 / binary / scale5).
function addSentimentSheets(wb, { results, average, mode, model, body }) {
  const def = MODES[mode];
  addSentimentResultsSheet(wb, 'Results', { results, average, mode });

  const sum = wb.addWorksheet('Summary');
  sum.columns = [
    { header: 'Metric', key: 'k', width: 34 },
    { header: 'Value', key: 'v', width: 40 },
  ];
  sum.getRow(1).font = { bold: true };
  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const r of results) if (counts[r.label] !== undefined) counts[r.label]++;
  // [metric, value, numFmt?]
  const rows = [
    ['Mode', mode],
    ['Model', model],
    ['Jumlah teks', results.length],
    ['Label rata-rata', String(average.label ?? '')],
    [`Skor rata-rata (${def.scoreRule})`, num(average.score), '0.0000'],
  ];
  if (def.valueHeader) {
    rows.push([`Rata-rata ${def.valueHeader}`, num(average.value), mode === 'binary' ? '0.00%' : '0.00']);
  }
  def.options.forEach((o, i) => rows.push([`Rata-rata ${o.text}`, optionProb(average, o.key, i), '0.00%']));
  rows.push(['Rata-rata confidence', num(average.confidence), '0.00%']);
  rows.push(['Jumlah positive', counts.positive]);
  if (mode !== 'binary') rows.push(['Jumlah neutral', counts.neutral]);
  rows.push(
    ['Jumlah negative', counts.negative],
    ['Latency (ms)', body.latency_ms !== undefined ? num(body.latency_ms) : ''],
    ['Device', state.device || ''],
    ['Diekspor', new Date().toISOString()],
    ['Aturan label rata-rata', def.averageRule]
  );
  for (const [k, v, fmt] of rows) {
    const row = sum.addRow({ k, v });
    if (fmt) row.getCell('v').numFmt = fmt;
  }
}

// Per-text sheet of a sentiment mode: No, Teks, Label, Skor (-1..1), [value column per mode],
// one % column per option, Confidence, Act, plus an average row. sentiment3 has no value column
// (value === Skor). Also used for the per-model sheets of the benchmark export.
function addSentimentResultsSheet(wb, name, { results, average, mode }) {
  const def = MODES[mode];
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  const columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Teks', key: 'text', width: 70 },
    { header: 'Label', key: 'label', width: 12 },
    { header: 'Skor (-1..1)', key: 'score', width: 12 },
  ];
  if (def.valueHeader) columns.push({ header: def.valueHeader, key: 'value', width: 14 });
  def.options.forEach((o, i) => columns.push({ header: o.text, key: `opt${i}`, width: 18 }));
  columns.push({ header: 'Confidence', key: 'conf', width: 12 }, { header: 'Act', key: 'act', width: 10 });
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };

  const rowOf = (r, i) => {
    const row = {
      no: Number.isInteger(r.index) ? r.index + 1 : i + 1,
      text: String(r.text ?? ''),
      label: String(r.label ?? ''),
      score: num(r.score),
      conf: num(r.confidence),
      act: r.act === undefined || r.act === null ? 1 : num(r.act),
    };
    if (def.valueHeader) row.value = num(r.value);
    def.options.forEach((o, j) => (row[`opt${j}`] = optionProb(r, o.key, j)));
    return row;
  };
  results.forEach((r, i) => {
    const row = ws.addRow(rowOf(r, i));
    row.getCell('text').alignment = { wrapText: true, vertical: 'top' };
  });
  const avgData = rowOf(average, 0);
  avgData.no = '';
  avgData.text = `Rata-rata (${num(average.count) || results.length} teks)`;
  avgData.act = '';
  if (average.confidence === undefined) avgData.conf = '';
  const avgRow = ws.addRow(avgData);
  avgRow.font = { bold: true };
  avgRow.border = { top: { style: 'thin' } };
  ws.getColumn('score').numFmt = '0.0000';
  if (mode === 'binary') ws.getColumn('value').numFmt = '0.00%';
  if (mode === 'scale5') ws.getColumn('value').numFmt = '0.00';
  def.options.forEach((o, i) => (ws.getColumn(`opt${i}`).numFmt = '0.00%'));
  ws.getColumn('conf').numFmt = '0.00%';
  ws.getColumn('act').numFmt = '0.00%';
  return ws;
}

// Headline as an Excel cell value: choice -> winning key; noul -> P(true); score -> expected level.
function headlineCell(q) {
  if (!q) return '';
  return q.type === 'choice' ? String(q.winner ?? q.headline ?? '') : num(q.value);
}

function questionsOf(r) {
  return Array.isArray(r?.questions) ? r.questions.filter((q) => q && typeof q.id === 'string') : [];
}

// Results + Summary sheets for preset mode: No, Teks, [Label, Skor if the sentiment question is
// included], then per preset question "<id>" (headline) and "<id> conf", plus an average row.
function addPresetSheets(wb, { results, average, model, body }) {
  const { avgQuestions, hasSentiment } = addPresetResultsSheet(wb, 'Results', { results, average });

  const sum = wb.addWorksheet('Summary');
  sum.columns = [
    { header: 'Metric', key: 'k', width: 34 },
    { header: 'Value', key: 'v', width: 40 },
  ];
  sum.getRow(1).font = { bold: true };
  const isCustom = body.mode === CUSTOM_MODE;
  const rows = isCustom
    ? [
        ['Mode', CUSTOM_MODE],
        ['Template', String(body.template_id ?? '') || '(belum disimpan)'],
        ['Judul template', String(body.template_title ?? '')],
      ]
    : [
        ['Mode', PRESET_MODE],
        ['Preset', String(body.preset ?? '')],
        ['Judul preset', String(body.preset_title ?? '')],
      ];
  const extra = isPlainObject(body.extra_state) ? Object.entries(body.extra_state) : [];
  for (const [k, v] of extra) rows.push([`State tetap: ${k}`, String(v)]);
  rows.push(
    ['Model', model],
    ['Jumlah teks', results.length],
    ['Sentimen disertakan', hasSentiment ? 'ya' : 'tidak']
  );
  if (hasSentiment) {
    rows.push(
      ['Label sentimen rata-rata', String(average?.label ?? '')],
      [`Skor sentimen rata-rata (${MODES.sentiment3.scoreRule})`, num(average?.score), '0.0000']
    );
  }
  for (const q of avgQuestions) {
    if (q.id === 'sentiment') continue;
    rows.push([`Rata-rata ${q.id} (${q.type})`, headlineCell(q), q.type === 'choice' ? undefined : '0.0000']);
  }
  rows.push(
    ['Latency (ms)', body.latency_ms !== undefined ? num(body.latency_ms) : ''],
    ['Device', state.device || ''],
    ['Diekspor', new Date().toISOString()]
  );
  for (const [k, v, fmt] of rows) {
    const row = sum.addRow({ k, v });
    if (fmt) row.getCell('v').numFmt = fmt;
  }
}

// Question order across results (first seen: sentiment first, then the preset/template order).
function questionOrder(results, extra = []) {
  const order = [];
  const types = {};
  for (const q of [...results.flatMap(questionsOf), ...extra]) {
    if (!types[q.id]) {
      types[q.id] = q.type;
      order.push(q.id);
    }
  }
  return { order, types };
}

// Per-text sheet of preset/custom mode (also the per-model sheets of the benchmark export).
// Returns {avgQuestions, hasSentiment} for the Summary sheet.
function addPresetResultsSheet(wb, name, { results, average }) {
  const avgQuestions = Array.isArray(average?.questions) ? average.questions : averageQuestions(results);
  const { order, types } = questionOrder(results, avgQuestions);
  const hasSentiment = order.includes('sentiment');
  const ids = order.filter((id) => id !== 'sentiment');

  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  const columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Teks', key: 'text', width: 70 },
  ];
  if (hasSentiment) {
    columns.push({ header: 'Label', key: 'label', width: 12 }, { header: 'Skor (-1..1)', key: 'score', width: 12 });
  }
  ids.forEach((id, i) => {
    columns.push({ header: id, key: `q${i}`, width: Math.max(12, id.length + 4) });
    columns.push({ header: `${id} conf`, key: `c${i}`, width: Math.max(10, id.length + 7) });
  });
  ws.columns = columns;
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };

  const rowOf = (qs) => {
    const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
    const row = {};
    ids.forEach((id, i) => {
      row[`q${i}`] = headlineCell(byId[id]);
      row[`c${i}`] = byId[id] ? num(byId[id].confidence) : '';
    });
    return row;
  };
  results.forEach((r, i) => {
    const row = ws.addRow({
      no: Number.isInteger(r.index) ? r.index + 1 : i + 1,
      text: String(r.text ?? ''),
      ...(hasSentiment ? { label: String(r.label ?? ''), score: r.score === null ? '' : num(r.score) } : {}),
      ...rowOf(questionsOf(r)),
    });
    row.getCell('text').alignment = { wrapText: true, vertical: 'top' };
  });
  const avgRow = ws.addRow({
    no: '',
    text: `Rata-rata (${num(average?.count) || results.length} teks)`,
    ...(hasSentiment ? { label: String(average?.label ?? ''), score: num(average?.score) } : {}),
    ...rowOf(avgQuestions),
  });
  avgRow.font = { bold: true };
  avgRow.border = { top: { style: 'thin' } };
  if (hasSentiment) ws.getColumn('score').numFmt = '0.0000';
  ids.forEach((id, i) => {
    if (types[id] === 'noul') ws.getColumn(`q${i}`).numFmt = '0.0000';
    if (types[id] === 'score') ws.getColumn(`q${i}`).numFmt = '0.0000';
    ws.getColumn(`c${i}`).numFmt = '0.00%';
  });
  return { avgQuestions, hasSentiment };
}

// Detail sheet (all modes), long format: one row per option of every question of every text.
function addDetailSheet(wb, results) {
  const ws = wb.addWorksheet('Detail', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Teks', key: 'text', width: 50 },
    { header: 'Pertanyaan', key: 'qid', width: 18 },
    { header: 'Tipe', key: 'type', width: 8 },
    { header: 'Jawaban', key: 'answer', width: 18 },
    { header: 'Confidence', key: 'conf', width: 12 },
    { header: 'Act', key: 'act', width: 10 },
    { header: 'Opsi', key: 'opt', width: 40 },
    { header: 'Prob (%)', key: 'prob', width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
  results.forEach((r, i) => {
    const no = Number.isInteger(r.index) ? r.index + 1 : i + 1;
    for (const q of questionsOf(r)) {
      for (const o of Array.isArray(q.options) ? q.options : []) {
        ws.addRow({
          no,
          text: String(r.text ?? ''),
          qid: q.id,
          type: q.type,
          answer: String(q.headline ?? ''),
          conf: num(q.confidence),
          act: q.act === undefined || q.act === null ? 1 : num(q.act),
          opt: String(o.text ?? o.key ?? ''),
          prob: num(o.prob),
        });
      }
    }
  });
  ws.getColumn('conf').numFmt = '0.00%';
  ws.getColumn('act').numFmt = '0.00%';
  ws.getColumn('prob').numFmt = '0.00%';
}

app.post('/api/export', async (req, res) => {
  const body = req.body || {};
  const results = Array.isArray(body.results) ? body.results : null;
  if (!results || !results.length) return res.status(400).json({ error: 'Body harus berupa respons /api/score (results[]).' });
  const isPreset = isQuestionSetMode(body.mode); // preset and custom share the preset sheets
  const mode = isPreset || MODES[body.mode] ? body.mode : DEFAULT_MODE;
  const hasSentiment = !isPreset || results.some((r) => questionsOf(r).some((q) => q.id === 'sentiment'));
  const average =
    body.average && typeof body.average === 'object' ? body.average : buildAverage(results, mode, hasSentiment);
  const model = typeof body.model === 'string' && body.model ? body.model : state.model || '';

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'sentiment-with-decision-model';
    wb.created = new Date();

    if (isPreset) addPresetSheets(wb, { results, average, model, body });
    else addSentimentSheets(wb, { results, average, mode, model, body });
    addDetailSheet(wb, results);

    const buf = await wb.xlsx.writeBuffer();
    let prefix = 'sentiment';
    if (body.mode === CUSTOM_MODE) {
      prefix = `template-${isTemplateId(body.template_id) ? body.template_id : 'custom'}`;
    } else if (isPreset) {
      const presetTag = String(body.preset ?? '').replace(/[^A-Za-z0-9_-]/g, '');
      if (presetTag) prefix = `preset-${presetTag}`;
    }
    const filename = `${prefix}-${timestamp()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buf));
  } catch (err) {
    log(`Export error: ${err.message}`);
    res.status(500).json({ error: `Gagal membuat file Excel: ${err.message}` });
  }
});

// ---------------------------------------------------------------------------
// Benchmark: run the same texts + mode on every model in models/, one model at a time.
// POST /api/benchmark streams NDJSON events; /api/benchmark/cancel stops after the current step;
// /api/benchmark/export turns the received events into a comparison workbook.
// While a run is active, /api/score, /api/model and /api/benchmark answer 409 and /api/status
// reports {benchmark: {running, index, total, file, stage}}. The original model is always restored.
// ---------------------------------------------------------------------------

// md5 of a file's content, cached by file + size + mtime (hashing ~600 MB takes 1-2 s).
const md5Cache = new Map();

function md5File(p) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    fs.createReadStream(p, { highWaterMark: 4 * 1024 * 1024 })
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

async function fileDigest(file) {
  const p = path.join(MODELS_DIR, file);
  const st = fs.statSync(p);
  const hit = md5Cache.get(file);
  if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.md5;
  const md5 = await md5File(p);
  md5Cache.set(file, { size: st.size, mtimeMs: st.mtimeMs, md5 });
  return md5;
}

// Validates the optional `models` field: bare *.gguf names that exist in models/. Returns the
// listModels() entries, sorted like listModels and without repeated names. Throws HttpError.
function benchmarkModelList(requested) {
  const all = listModels();
  if (requested === undefined || requested === null) return all;
  if (!Array.isArray(requested) || !requested.length) {
    throw new HttpError(400, 'Field "models" harus berupa daftar nama file .gguf di folder models/.');
  }
  for (const f of requested) {
    if (typeof f !== 'string' || f !== path.basename(f) || f.includes('..') || !all.some((m) => m.file === f)) {
      throw new HttpError(400, `File model tidak valid: ${String(f)}. Pilih file .gguf yang ada di folder models/.`);
    }
  }
  return all.filter((m) => requested.includes(m.file));
}

// Adds duplicate_of to each model: same size and same md5 as an earlier file (sort order) -> that
// file is the canonical one. Only files sharing a size with another file are hashed.
async function markDuplicates(models) {
  const bySize = new Map();
  for (const m of models) {
    let size = -1;
    try {
      size = fs.statSync(path.join(MODELS_DIR, m.file)).size;
    } catch {
      /* vanished: never a duplicate */
    }
    m.duplicate_of = null;
    if (size < 0) continue;
    if (!bySize.has(size)) bySize.set(size, []);
    bySize.get(size).push(m);
  }
  for (const group of bySize.values()) {
    if (group.length < 2) continue;
    const seen = new Map(); // md5 -> canonical file
    for (const m of group) {
      let md5;
      try {
        md5 = await fileDigest(m.file);
      } catch (err) {
        log(`Gagal menghitung md5 ${m.file}: ${err.message}`);
        continue;
      }
      if (seen.has(md5)) m.duplicate_of = seen.get(md5);
      else seen.set(md5, m.file);
    }
  }
  return models;
}

app.post('/api/benchmark', async (req, res) => {
  if (bench) return res.status(409).json({ error: 'Benchmark sedang berjalan' });
  let job;
  let models;
  try {
    job = await prepareScoreJob(req.body);
    models = benchmarkModelList(req.body?.models);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
  if (bench) return res.status(409).json({ error: 'Benchmark sedang berjalan' }); // raced during the await
  if (!models.length) return res.status(400).json({ error: 'Tidak ada file model .gguf di folder models/.' });
  if (!fs.existsSync(EXE_PATH)) return res.status(503).json({ error: 'laya.exe belum siap, coba lagi nanti.' });
  // A model that is being switched/loaded right now would race with the benchmark's own loads.
  if (state.switching || (state.child && !state.ready)) return notReady(res);
  const includeDuplicates = req.body?.include_duplicates === true;

  const t0 = Date.now();
  const originalModel = state.model;
  const run = { index: -1, total: models.length, file: null, stage: 'preparing', cancelled: false };
  bench = run;

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  // A client that goes away before "done" cancels the run (res 'close' fires on disconnect; the
  // request's own 'close' already fires once the body has been read).
  res.on('close', () => {
    if (!res.writableEnded && bench === run && !run.cancelled) {
      log('Benchmark: klien terputus, membatalkan...');
      run.cancelled = true;
    }
  });
  const emit = (event) => {
    if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };

  const total = models.length;
  let restored = null;
  let restoreError = null;
  try {
    setStatus(`Benchmark: memeriksa duplikat ${total} model...`);
    await markDuplicates(models);
    const device = await resolveDevice(
      LAYA_DEVICE,
      path.join(MODELS_DIR, originalModel && fs.existsSync(path.join(MODELS_DIR, originalModel)) ? originalModel : models[0].file)
    );
    emit({
      type: 'start',
      total,
      original_model: originalModel,
      mode: job.mode,
      texts: job.texts,
      models: models.map((m) => ({ file: m.file, size_mb: m.size_mb, duplicate_of: m.duplicate_of })),
    });

    for (let i = 0; i < total && !run.cancelled; i++) {
      const { file } = models[i];
      const pre = `Benchmark model ${i + 1}/${total}: ${file}… `;
      Object.assign(run, { index: i, file });
      if (models[i].duplicate_of && !includeDuplicates) {
        emit({ type: 'model_skipped', index: i, file, reason: 'duplicate', duplicate_of: models[i].duplicate_of });
        continue;
      }
      run.stage = 'loading';
      emit({ type: 'model_loading', index: i, file });
      const loaded = await switchModel(path.join(MODELS_DIR, file), {
        device,
        skipCpuFallbackOnLoadError: true,
        statusPrefix: pre,
      });
      if (!loaded.ok) {
        emit({ type: 'model_error', index: i, file, stage: 'load', error: loaded.error || 'Model gagal dimuat.' });
        continue;
      }
      emit({ type: 'model_loaded', index: i, file, device: loaded.device, load_ms: loaded.load_ms });
      if (run.cancelled) break;
      run.stage = 'scoring';
      setStatus(`${pre}menilai ${job.texts.length} teks...`);
      emit({ type: 'model_scoring', index: i, file });
      try {
        const result = await runScoreJob(job);
        emit({
          type: 'model_result',
          index: i,
          file,
          device: loaded.device,
          load_ms: loaded.load_ms,
          score_ms: result.latency_ms,
          ms_per_text: round4(result.latency_ms / job.texts.length),
          result,
        });
      } catch (err) {
        log(`Benchmark scoring error (${file}): ${err.message}`);
        emit({ type: 'model_error', index: i, file, stage: 'score', error: `Gagal menilai teks: ${err.message}` });
      }
    }
  } catch (err) {
    log(`Benchmark error: ${err.message}`);
    emit({ type: 'model_error', index: run.index, file: run.file, stage: run.stage === 'scoring' ? 'score' : 'load', error: `Benchmark gagal: ${err.message}` });
  } finally {
    // Restore the model that was active before the run (normal load, CPU fallback allowed).
    run.stage = 'restoring';
    run.file = originalModel;
    if (originalModel && fs.existsSync(path.join(MODELS_DIR, originalModel))) {
      if (state.model !== originalModel || !state.ready) {
        const r = await switchModel(path.join(MODELS_DIR, originalModel), {
          statusPrefix: `Benchmark selesai, memulihkan ${originalModel}… `,
        });
        if (!r.ok) restoreError = `Model awal ${originalModel} gagal dimuat ulang: ${r.error}`;
      }
      // Plain status message again (drop the benchmark prefix).
      if (!restoreError && state.ready) setStatus(`Model siap: ${state.model} (device: ${state.device})`);
      restored = originalModel;
    } else if (originalModel) {
      restoreError = `Model awal ${originalModel} tidak ada lagi di folder models/.`;
    }
    bench = null;
    const done = { type: 'done', cancelled: run.cancelled, restored_model: restored, total_ms: Date.now() - t0 };
    if (restoreError) done.error = restoreError;
    log(`Benchmark selesai (${done.total_ms} ms${run.cancelled ? ', dibatalkan' : ''})`);
    emit(done);
    if (!res.writableEnded) res.end();
  }
});

app.post('/api/benchmark/cancel', (req, res) => {
  if (bench && !bench.cancelled) {
    bench.cancelled = true;
    log('Benchmark: dibatalkan oleh pengguna, berhenti setelah langkah saat ini...');
  }
  res.json({ ok: true });
});

// --- Benchmark export --------------------------------------------------------------------------

const LABEL_TEXT = { positive: 'Positif', neutral: 'Netral', negative: 'Negatif' };
const LABEL_FILL = { positive: 'FFD9F2D9', negative: 'FFF8D7D7', neutral: 'FFE7E6E6' };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };

function modelShortName(file) {
  return String(file ?? '').replace(/\.gguf$/i, '');
}

// Excel sheet names: max 31 chars, none of []:*?/\ , unique (case-insensitive).
function uniqueSheetName(base, used) {
  const clean = String(base).replace(/[[\]:*?/\\]/g, '_').replace(/^'+|'+$/g, '').trim() || 'Model';
  let name = clean.slice(0, 31);
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    const suffix = `~${n}`;
    name = `${clean.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

// The label compared across models for one result row: the sentiment label if present, otherwise
// the winner of the first choice question ('' when neither exists).
function comparableLabel(r) {
  if (r && typeof r.label === 'string' && r.label) return r.label;
  const q = questionsOf(r).find((x) => x.type === 'choice');
  return q ? String(q.winner ?? '') : '';
}

// Most frequent non-empty label; '' on a tie or when nothing is present.
function majorityOf(labels) {
  const counts = new Map();
  for (const l of labels) if (l) counts.set(l, (counts.get(l) || 0) + 1);
  let best = '';
  let bestN = 0;
  let tie = false;
  for (const [l, n] of counts) {
    if (n > bestN) {
      best = l;
      bestN = n;
      tie = false;
    } else if (n === bestN) tie = true;
  }
  return tie ? '' : best;
}

function fillLabelCell(cell, label) {
  const argb = LABEL_FILL[label];
  if (argb) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

app.post('/api/benchmark/export', async (req, res) => {
  const body = req.body || {};
  const runs = Array.isArray(body.runs) ? body.runs.filter(isPlainObject) : [];
  if (!runs.length) {
    return res.status(400).json({ error: 'Body harus berisi runs[] (event model_result / model_error / model_skipped).' });
  }
  const mode = typeof body.mode === 'string' && (MODES[body.mode] || isQuestionSetMode(body.mode)) ? body.mode : null;
  if (!mode) return res.status(400).json({ error: `Mode tidak dikenal: ${body.mode}.` });
  const isSet = isQuestionSetMode(mode);
  const texts = Array.isArray(body.texts) ? body.texts.map((t) => String(t ?? '')) : [];

  // One row per model, in the order received (the benchmark order).
  const sizes = Object.fromEntries(listModels().map((m) => [m.file, m.size_mb]));
  const rows = runs
    .filter((r) => ['model_result', 'model_error', 'model_skipped'].includes(r.type))
    .sort((a, b) => num(a.index) - num(b.index));
  const ok = rows.filter((r) => r.type === 'model_result' && Array.isArray(r.result?.results));
  const nTexts = texts.length || Math.max(0, ...ok.map((r) => r.result.results.length));
  const textAt = (t) => texts[t] ?? String(ok.find((r) => r.result.results[t])?.result.results[t]?.text ?? '');
  const hasSentiment = ok.some((r) => r.result.results.some((x) => typeof x.label === 'string' && x.label));
  const labelKeys = mode === 'binary' ? ['positive', 'negative'] : LABELS;
  for (const r of ok) {
    for (const x of r.result.results) if (hasSentiment && x.label && !labelKeys.includes(x.label)) labelKeys.push(x.label);
  }

  // Majority label per text across OK models, and each model's agreement with it.
  const majority = [];
  for (let t = 0; t < nTexts; t++) majority.push(majorityOf(ok.map((r) => comparableLabel(r.result.results[t]))));
  const agreement = (r) => {
    let n = 0;
    let same = 0;
    for (let t = 0; t < nTexts; t++) {
      if (!majority[t]) continue;
      n++;
      if (comparableLabel(r.result.results[t]) === majority[t]) same++;
    }
    return n ? round4(same / n) : '';
  };
  const devices = [...new Set(ok.map((r) => r.device).filter(Boolean))];

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'sentiment-with-decision-model';
    wb.created = new Date();
    const used = new Set(['ringkasan', 'perbandingan']);

    // 1. Ringkasan: title block + one row per model.
    const sum = wb.addWorksheet('Ringkasan');
    const title = [
      ['Benchmark model', ''],
      ['Tanggal', new Date().toLocaleString('id-ID')],
      ['Mode', mode],
    ];
    if (mode === PRESET_MODE) title.push(['Preset', `${body.preset ?? ''}${body.preset_title ? ` (${body.preset_title})` : ''}`]);
    if (mode === CUSTOM_MODE) {
      title.push(['Template', `${body.template_id ?? '(belum disimpan)'}${body.template_title ? ` (${body.template_title})` : ''}`]);
    }
    title.push(['Jumlah teks', nTexts], ['Perangkat', devices.join(', ') || '-']);
    for (const [k, v] of title) sum.addRow([k, v]);
    sum.getCell('A1').font = { bold: true, size: 14 };
    for (let r = 2; r <= title.length; r++) sum.getCell(`A${r}`).font = { bold: true };
    sum.addRow([]);

    const cols = [
      ['No', 5],
      ['Model', 38],
      ['Ukuran MB', 11],
      ['Status', 30],
      ['Perangkat', 11],
      ['Muat (ms)', 10],
      ['Analisis (ms)', 13],
      ['ms/teks', 10],
      ['Rata-rata skor', 14],
    ];
    if (hasSentiment) for (const l of labelKeys) cols.push([LABEL_TEXT[l] ?? l, 10]);
    cols.push(['Kesepakatan dengan mayoritas (%)', 18], ['Error', 60]);
    const headerRow = sum.addRow(cols.map((c) => c[0]));
    const headerNo = headerRow.number;
    headerRow.font = { bold: true };
    headerRow.alignment = { wrapText: true, vertical: 'middle' };
    headerRow.eachCell((c) => (c.fill = HEADER_FILL));
    cols.forEach(([, w], i) => (sum.getColumn(i + 1).width = w));
    sum.getColumn(1).width = Math.max(14, cols[0][1]); // also holds the title block labels

    rows.forEach((r, i) => {
      const file = String(r.file ?? '');
      const size = r.size_mb ?? sizes[file] ?? '';
      let status;
      if (r.type === 'model_result') status = 'OK';
      else if (r.type === 'model_skipped') status = `Duplikat dari ${r.duplicate_of ?? '?'}`;
      else status = 'Gagal';
      const res0 = r.type === 'model_result' ? r.result : null;
      const vals = [
        i + 1,
        file,
        size,
        status,
        r.device ?? '',
        res0 ? num(r.load_ms) : '',
        res0 ? num(r.score_ms) : '',
        res0 ? num(r.ms_per_text) : '',
        res0 && res0.average?.score !== null && res0.average?.score !== undefined ? num(res0.average.score) : '',
      ];
      if (hasSentiment) {
        for (const l of labelKeys) vals.push(res0 ? res0.results.filter((x) => x.label === l).length : '');
      }
      vals.push(res0 && ok.includes(r) ? agreement(r) : '');
      vals.push(r.type === 'model_error' ? `${r.stage ? `[${r.stage}] ` : ''}${r.error ?? ''}` : '');
      const row = sum.addRow(vals);
      row.alignment = { vertical: 'top' };
      row.getCell(cols.length).alignment = { wrapText: true, vertical: 'top' };
      if (status === 'OK') row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LABEL_FILL.positive } };
      else if (status === 'Gagal') row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LABEL_FILL.negative } };
    });
    const lastRow = headerNo + rows.length;
    for (let r = headerNo + 1; r <= lastRow; r++) {
      sum.getCell(r, 3).numFmt = '0.0';
      for (const c of [6, 7, 8]) sum.getCell(r, c).numFmt = '0';
      sum.getCell(r, 9).numFmt = '0.000';
      sum.getCell(r, cols.length - 1).numFmt = '0.0%';
    }
    sum.views = [{ state: 'frozen', ySplit: headerNo }];
    sum.autoFilter = { from: { row: headerNo, column: 1 }, to: { row: lastRow, column: cols.length } };

    // 2. Perbandingan: one row per text, per OK model label + score (and question headlines).
    const cmp = wb.addWorksheet('Perbandingan', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
    const cmpCols = [
      { header: 'No', width: 5 },
      { header: 'Teks', width: 50 },
    ];
    if (hasSentiment) cmpCols.push({ header: 'Mayoritas', width: 12, kind: 'majority' });
    for (const r of ok) {
      const short = modelShortName(r.file);
      const { order } = questionOrder(r.result.results);
      if (hasSentiment) {
        cmpCols.push({ header: `${short} · label`, width: 14, kind: 'label', run: r });
        cmpCols.push({ header: `${short} · skor`, width: 12, kind: 'score', run: r });
      }
      if (isSet) {
        for (const qid of order.filter((id) => id !== 'sentiment')) {
          cmpCols.push({ header: `${short} · ${qid}`, width: Math.max(14, qid.length + 6), kind: 'question', run: r, qid });
        }
      }
    }
    cmp.columns = cmpCols.map((c) => ({ header: c.header, width: c.width }));
    const cmpHead = cmp.getRow(1);
    cmpHead.font = { bold: true };
    cmpHead.alignment = { wrapText: true, vertical: 'middle' };
    cmpHead.eachCell((c) => (c.fill = HEADER_FILL));
    for (let t = 0; t < nTexts; t++) {
      const vals = cmpCols.map((c, ci) => {
        if (ci === 0) return t + 1;
        if (ci === 1) return textAt(t);
        if (c.kind === 'majority') return majority[t] || '(seri)';
        const x = c.run.result.results[t];
        if (!x) return '';
        if (c.kind === 'label') return String(x.label ?? '');
        if (c.kind === 'score') return x.score === null || x.score === undefined ? '' : num(x.score);
        return headlineCell(questionsOf(x).find((q) => q.id === c.qid));
      });
      const row = cmp.addRow(vals);
      row.alignment = { vertical: 'top' };
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
      cmpCols.forEach((c, ci) => {
        const cell = row.getCell(ci + 1);
        if (c.kind === 'label' || c.kind === 'majority') fillLabelCell(cell, cell.value);
        if (c.kind === 'score' || (c.kind === 'question' && typeof cell.value === 'number')) cell.numFmt = '0.000';
      });
    }
    if (nTexts) cmp.autoFilter = { from: { row: 1, column: 1 }, to: { row: nTexts + 1, column: cmpCols.length } };

    // 3. One sheet per OK model, same per-text rows as the normal export's Results sheet.
    for (const r of ok) {
      const name = uniqueSheetName(modelShortName(r.file), used);
      const results = r.result.results;
      const hasSent = !isSet || results.some((x) => questionsOf(x).some((q) => q.id === 'sentiment'));
      const average = isPlainObject(r.result.average) ? r.result.average : buildAverage(results, mode, hasSent);
      if (isSet) addPresetResultsSheet(wb, name, { results, average });
      else addSentimentResultsSheet(wb, name, { results, average, mode });
    }

    const buf = await wb.xlsx.writeBuffer();
    const filename = `benchmark-${mode}-${timestamp()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buf));
  } catch (err) {
    log(`Benchmark export error: ${err.message}`);
    res.status(500).json({ error: `Gagal membuat file Excel: ${err.message}` });
  }
});

// Plain http server instead of app.listen(): Express 5 routes listen errors into the
// once-only callback, which would break retrying the next port.
let webPort = PORT;
const httpServer = require('http').createServer(app);
httpServer.on('listening', () => {
  log(`Buka http://localhost:${webPort}`);
  boot().catch((err) => {
    state.error = err.message;
    setStatus(`Error saat inisialisasi: ${err.message}`);
  });
});
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && !process.env.PORT && webPort < PORT + PORT_TRIES) {
    log(`Port ${webPort} sudah dipakai, mencoba ${webPort + 1}...`);
    httpServer.listen(++webPort);
    return;
  }
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${webPort} sudah dipakai. Set env PORT lain, mis. PORT=3001 npm start`);
  } else {
    console.error('[server] HTTP error:', err.message);
  }
  shutdown();
  process.exit(1);
});
httpServer.listen(webPort);
