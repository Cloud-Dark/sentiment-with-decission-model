# Technical Requirements Document (TRD)

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

## Stack

| Lapisan | Teknologi | Sumber |
| --- | --- | --- |
| Runtime | Node.js `>=18` (`engines` di `package.json`; memakai `fetch` global). Diuji dengan Node v24.18.0. | `package.json` |
| Web server | Express `^5.2.1` di atas `http.createServer` | `server.js` |
| Excel | ExcelJS `^4.4.0` | `server.js` |
| Mesin inferensi | `laya.exe` ggmlc v0.9.6, build `laya-windows-x86_64-vulkan.zip` | `scripts/setup.js` |
| Model | Laya multilingual GGUF (`q8_0`, `ud_q4_k_m`, `f16`) | `models/README.md` |
| Frontend | Satu berkas HTML + CSS + JavaScript ES5 tanpa dependensi eksternal | `public/index.html` |

## Kebutuhan teknis

| ID | Kebutuhan |
| --- | --- |
| TR-001 | Server web mendengarkan pada `PORT` (bawaan 3000). Jika `PORT` tidak diset dan port sibuk, coba hingga 20 port berikutnya. Jika `PORT` diset dan sibuk, keluar dengan kode 1. |
| TR-002 | Saat boot, jika `bin/laya.exe` tidak ada, unduh otomatis lewat `scripts/setup.js`. |
| TR-003 | Pilih model sesuai urutan `LAYA_MODEL` > `q8_0` > `ud_q4_k_m`/`q4_k_m` > `f16` > `*.gguf` lain (urut nama). Jika belum ada model, periksa `models/` setiap 5 detik dan tunggu ukuran file stabil (dicek per 2 detik) sebelum memuat. |
| TR-004 | Jalankan `laya.exe daemon <model> --device <device>` sebagai proses anak dengan `cwd` = `bin/` dan stdio `pipe`. Komunikasi lewat stdin/stdout berupa JSON satu objek per baris; laya tidak membuka port. stderr diteruskan ke konsol dengan prefiks `[laya!]`; baris stdout yang bukan JSON dicatat dengan prefiks `[laya]` ([ADR-010](11_DECISIONS.md#adr-010-laya-daemon-via-stdio-alih-alih-serve)). |
| TR-005 | Model dianggap siap saat daemon menulis baris `{"status":"ready",...}` ke stdout, dengan batas waktu 10 menit. Jika proses berhenti sebelum itu, penantian selesai tanpa status siap. |
| TR-006 | Jika laya berhenti tak terduga pada device selain `cpu`, muat ulang sekali dengan `--device cpu`. |
| TR-007 | Pemilihan GPU otomatis (lihat bagian [Pemilihan perangkat GPU](#pemilihan-perangkat-gpu)). |
| TR-008 | Aplikasi hanya membuka port web (`PORT`). Port laya (`LAYA_PORT`) dihapus sejak ADR-010; env tersebut diabaikan bila masih diset. |
| TR-009 | Penggantian model memakai penghitung generasi (`state.gen`) agar peluncuran usang tidak menjalankan proses; proses lama dihentikan dengan menutup stdin (daemon keluar saat EOF), `kill()` setelah 3 detik, lalu `taskkill /T /F` setelah 15 detik. |
| TR-010 | Penilaian mengirim satu permintaan daemon per teks secara berurutan (daemon tidak mendukung batch). Antrean per proses memastikan hanya satu permintaan yang berjalan; tiap permintaan memiliki timeout 120 detik; semua permintaan tertunda ditolak jika proses berhenti. |
| TR-011 | Batas: 256 teks per permintaan, 1..32 pertanyaan per template, 2..16 opsi/level per pertanyaan, instruksi dan deskripsi maksimal 1000 karakter, `extra_state` maksimal 32 field dan 10000 karakter per nilai, body JSON maksimal 20 MB. |
| TR-012 | Template disimpan sebagai `templates/<id>.json` dengan penulisan atomik (berkas sementara lalu rename). Folder dibaca ulang di setiap permintaan. |
| TR-013 | Definisi preset dibaca sekali saat boot dari snapshot `presets/laya-presets.json` (salinan `GET /v1/presets` laya). Snapshot diperbarui dengan `npm run presets:sync` saat laya di-upgrade. |
| TR-014 | Semua pesan galat API berbahasa Indonesia dalam bentuk `{"error": "..."}`. |
| TR-015 | Frontend membangun DOM hanya lewat `textContent` (tanpa `innerHTML`) untuk mencegah XSS dari teks input. |
| TR-016 | Proses anak dihentikan (stdin ditutup lalu `kill()`) saat `exit`, `SIGINT`, `SIGTERM`, `SIGHUP`, dan `SIGBREAK`. Jika server Node mati paksa, daemon keluar sendiri karena stdin-nya tertutup. |

## Integrasi laya daemon

Server berbicara ke `laya.exe daemon` lewat stdin/stdout, satu objek JSON per baris (UTF-8, diakhiri `\n`). stdout dibaca dengan buffer baris sehingga potongan data parsial ditangani. Protokol berikut diverifikasi pada ggmlc v0.9.6:

| Arah | Bentuk | Keterangan |
| --- | --- | --- |
| stdout (sekali) | `{"status":"ready","model":"laya"}` | Model selesai dimuat. Tidak memuat device; device yang dilaporkan adalah device yang diminta saat spawn. |
| stdin | `{"id":n,"state":{...},"questions":{...}}` | Satu state per permintaan. `id` selalu angka. |
| stdout | `{"model","family","route","answers":{<id>: answer},"usage":{input_tokens, output_tokens, latency_ms},"id":n}` | `answers` berbentuk sama dengan `/v1/decide` pada `laya serve`. |
| stdout | `{"id":n,"error":"..."}` | Galat per permintaan, misalnya `missing questions`. Menjadi galat `laya: <pesan>`. |

Catatan protokol:

- Tidak ada batch: permintaan dengan `states:[...]` hanya menjawab satu state. Server mengirim teks satu per satu.
- Pencocokan respons memakai `String(id)` karena daemon dapat mengembalikan `id` sebagai string.
- `{"id":n,"preset":"<nama>","state":{...}}` juga didukung daemon, tetapi server selalu mengirim `questions` eksplisit dari snapshot agar `extra_state` dan `include_sentiment` berperilaku sama seperti sebelumnya.
- Daemon tidak dapat menampilkan daftar preset. Definisi preset diambil dari `presets/laya-presets.json`.
- `usage` tiap permintaan dijumlahkan dan dikembalikan sebagai `usage` pada respons `/api/score` (`input_tokens`, `output_tokens`, `latency_ms`, `total_tokens`).

### Bentuk jawaban

`choice` (terverifikasi):

```json
{ "type": "choice", "choice": "negative", "confidence": 0.50,
  "probabilities": { "positive": 0.0075, "neutral": 0.49, "negative": 0.50 },
  "action": { "act_probability": 1 } }
```

`noul` (teramati): `noul` adalah P(true); tidak ada objek `probabilities`.

```json
{ "type": "noul", "noul": 0.9218, "confidence": 0.9218, "action": { "act_probability": 1 } }
```

`score` (teramati): `score` adalah level harapan (0..n-1).

```json
{ "type": "score", "score": 3.5271, "confidence": 0.655,
  "legend": { "0": "...", "4": "..." },
  "probabilities": { "0": 0.012, "4": 0.8367 },
  "action": { "act_probability": 1 } }
```

Parser bersifat defensif: `probabilities` juga diterima sebagai `probs`/`scores`, berupa array `[label, p]` atau `{label, probability}`. Probabilitas dinormalisasi jika totalnya menyimpang lebih dari 0,01 dari 1. `act_probability` yang hilang dianggap 1. Semua angka dibulatkan ke 4 desimal.

### Normalisasi ke bentuk pertanyaan generik

Setiap hasil memuat `questions[]` dengan bentuk `{id, type, instructions, headline, value, winner, confidence, act, options: [{key, text, prob}]}`:

| Tipe | `value` | `headline` |
| --- | --- | --- |
| `choice` | Probabilitas pemenang | Kunci pemenang |
| `noul` | P(true) | `P(true)=0.4390` |
| `score` | Level harapan (0-based) | Level dengan 4 desimal, misalnya `1.9238` |

## Batasan

| Batas | Nilai | Asal |
| --- | --- | --- |
| Teks per permintaan | 256 | `MAX_TEXTS`, dipertahankan dari batas `/v1/decide/batch` laya sebelumnya |
| Opsi `choice` / level `score` | 2..16 | `max_opts` GGUF yang dipakai; 17 opsi menghasilkan 422 dari laya |
| Pertanyaan per template | 1..32 | `MAX_QUESTIONS` |
| Panjang instruksi / deskripsi | 1000 karakter | `MAX_INSTRUCTIONS`, `MAX_CRITERION` |
| Field `extra_state` | 32, nilai 10000 karakter | `MAX_EXTRA_STATE_KEYS`, `MAX_EXTRA_STATE_VALUE` |
| Body JSON | 20 MB | `express.json({ limit: '20mb' })` |

## Pemilihan perangkat GPU

- `LAYA_DEVICE` selain `auto` diteruskan apa adanya (misalnya `vulkan:0`, `vulkan:1`, `cpu`).
- Untuk `auto`, server menjalankan `laya.exe info <model>` (timeout 120 detik) dan mem-parsing baris `ggml_vulkan: N = <nama> | uma: X`. Jika ada lebih dari satu perangkat, dipilih perangkat pertama dengan `uma: 0` (GPU diskrit) sebagai `vulkan:N`. Selain itu tetap `auto`.
- Alasan: `--device auto` bawaan laya memilih perangkat Vulkan 0, yang di laptop sering berupa iGPU. Terukur: Intel UHD sekitar 2,4 detik vs GTX 1650 sekitar 0,13 detik untuk batch 10 teks. Lihat [ADR-002](11_DECISIONS.md#adr-002-pemilihan-gpu-diskrit-otomatis-lewat-laya-info).
- Perangkat aktif yang dilaporkan adalah nilai yang diminta saat spawn (baris ready daemon tidak memuat device).

## Keamanan

- Tidak ada autentikasi. Server mendengarkan pada semua antarmuka (default `http.Server.listen(port)` tanpa host). laya tidak membuka port sama sekali (stdio). Aplikasi harus dipakai lokal saja ([10_RISK_REGISTER.md](10_RISK_REGISTER.md)).
- Path traversal dicegah: id template harus cocok `^[a-z0-9][a-z0-9-]{0,63}$`; nama model harus basename tanpa `..` dan ada di `models/`.

## Dokumen terkait

[05_ARCHITECTURE.md](05_ARCHITECTURE.md), [16_CONFIG_REFERENCE.md](16_CONFIG_REFERENCE.md), [21_BACKEND.md](21_BACKEND.md).
