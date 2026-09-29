# Backend

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

Backend adalah satu berkas `server.js` (Express 5). Tugasnya: menyajikan `public/`, mengelola proses anak `laya daemon` (stdin/stdout, tanpa port), dan menyediakan API `/api/*`. Arsitektur ada di [05_ARCHITECTURE.md](05_ARCHITECTURE.md); konfigurasi di [16_CONFIG_REFERENCE.md](16_CONFIG_REFERENCE.md).

## Konvensi umum

- Body permintaan dan respons berupa JSON (`express.json`, batas 20 MB), kecuali ekspor yang mengembalikan berkas XLSX.
- Galat selalu berbentuk `{"error": "<pesan Bahasa Indonesia>"}`, kadang disertai field status.
- Tidak ada autentikasi (lihat R-08 di [10_RISK_REGISTER.md](10_RISK_REGISTER.md)).
- Endpoint yang butuh laya mengembalikan **503** saat model belum siap atau sedang diganti:

  ```json
  { "error": "Memuat model ...", "message": "Memuat model ...", "switching": false }
  ```

## Ringkasan endpoint

| Metode | Path | Sukses | Galat |
| --- | --- | --- | --- |
| GET | `/api/status` | 200 | - |
| POST | `/api/model` | 200 / 202 | 400, 503 |
| GET | `/api/presets` | 200 | 502, 503 |
| GET | `/api/presets/:name` | 200 | 404, 502, 503 |
| GET | `/api/templates` | 200 | - |
| GET | `/api/templates/:id` | 200 | 404 |
| POST | `/api/templates` | 200 | 400, 409, 500 |
| DELETE | `/api/templates/:id` | 204 | 404, 409, 500 |
| POST | `/api/score` | 200 | 400, 502, 503 |
| POST | `/api/export` | 200 (XLSX) | 400, 500 |
| POST | `/api/benchmark` | 200 (NDJSON) | 400, 409, 502, 503 |
| POST | `/api/benchmark/cancel` | 200 | - |
| POST | `/api/benchmark/export` | 200 (XLSX) | 400, 500 |

Selama benchmark berjalan, `/api/score`, `/api/model`, dan `/api/benchmark` mengembalikan **409** `{"error": "Benchmark sedang berjalan, tunggu atau batalkan dulu."}` (untuk `/api/benchmark`: `{"error": "Benchmark sedang berjalan"}`).

## GET /api/status

```json
{
  "ready": true,
  "model": "laya_multilingual_q8_0.gguf",
  "device": "vulkan:1",
  "message": "Model siap: laya_multilingual_q8_0.gguf (device: vulkan:1)",
  "switching": false,
  "models": [
    { "file": "laya_multilingual_q8_0.gguf", "size_mb": 345, "active": true },
    { "file": "laya_multilingual_ud_q4_k_m.gguf", "size_mb": 499.7, "active": false }
  ]
}
```

`models` dibaca ulang dari `models/` pada setiap panggilan, diurutkan berdasarkan nama.

Field `benchmark` bernilai `null` saat tidak ada benchmark. Saat benchmark berjalan isinya `{"running": true, "index": 2, "total": 7, "file": "laya_multilingual_ud_q4_k_m.gguf", "stage": "loading"}`. Nilai `stage`: `preparing` (pemeriksaan duplikat, `index` = -1), `loading`, `scoring`, `restoring`. Selama benchmark, `message` berawalan `Benchmark model i/N: <file>… `.

## POST /api/model

Mengganti model aktif tanpa restart. Pilihan hanya disimpan di memori.

Permintaan: `{"file": "laya_multilingual_ud_q4_k_m.gguf"}`. Nilai harus nama berkas polos (tanpa path atau `..`) yang ada di `models/`.

| Kode | Kondisi | Body |
| --- | --- | --- |
| 202 | Penggantian dimulai; UI melakukan polling `/api/status` | body status |
| 200 | Model yang diminta sudah aktif atau sedang dimuat | body status |
| 400 | Nama berkas tidak valid | `{"error": "File model tidak valid. ...", ...status}` |
| 503 | `bin/laya.exe` belum ada | `{"error": "laya.exe belum siap, coba lagi nanti.", ...status}` |

Proses penggantian: hentikan proses lama (tutup stdin, `kill()` setelah 3 detik, `taskkill /T /F` setelah 15 detik; permintaan tertunda ditolak), deteksi GPU, jalankan daemon dengan model baru, lalu tunggu baris ready.

## GET /api/presets

Daftar preset dari snapshot `presets/laya-presets.json` (salinan `GET /v1/presets` laya, dibaca sekali saat boot; diperbarui dengan `npm run presets:sync`). Endpoint tetap mengembalikan 503 saat model belum siap. Jika snapshot tidak dapat dibaca, endpoint preset mengembalikan 502 `Gagal memuat preset: ...`.

```json
[
  { "name": "email", "title": "Email triage", "blurb": "...", "state_key": "body", "question_count": 7 }
]
```

Nilai `title`/`blurb` berasal dari snapshot preset laya; contoh di atas ilustratif.

## GET /api/presets/:name

Preset lengkap untuk dimuat ke editor. `state` adalah contoh state dari snapshot preset laya; UI memakainya sebagai placeholder `extra_state`.

```json
{
  "name": "email",
  "title": "...",
  "blurb": "...",
  "state_key": "body",
  "state": { "from": "...", "subject": "...", "body": "..." },
  "questions": { "category": { "type": "choice", "instructions": "...", "criteria": { } } }
}
```

404: `{"error": "Preset tidak dikenal: <name>."}`.

## GET /api/templates

Ringkasan template, bawaan lebih dulu.

```json
[
  {
    "id": "ulasan-produk",
    "title": "Ulasan produk",
    "description": "...",
    "builtin": true,
    "question_count": 4,
    "updated_at": "2026-09-28T00:00:00.000Z"
  }
]
```

## GET /api/templates/:id

Isi lengkap template (skema di [16_CONFIG_REFERENCE.md](16_CONFIG_REFERENCE.md#skema-json-template)). 404 jika id tidak valid atau berkas tidak ada: `{"error": "Template tidak ditemukan: <id>"}`.

## POST /api/templates

Membuat atau menimpa template.

```json
{
  "id": "moderasi-kustom",
  "title": "Moderasi kustom",
  "description": "",
  "state_key": "text",
  "extra_state": {},
  "include_sentiment": false,
  "questions": {
    "spam": { "type": "noul", "instructions": "Is this comment spam?" }
  }
}
```

- Tanpa `id`: id dibuat dari `title` (slug maksimal 56 karakter, fallback `template`); jika sudah ada ditambah `-2`, `-3`, dan seterusnya.
- Dengan `id`: berkas yang sama ditimpa.
- Server mengisi `builtin: false` dan `updated_at`. Respons 200 berisi template yang tersimpan.

| Kode | Kondisi |
| --- | --- |
| 400 | Pelanggaran [aturan validasi](specs/2026-09-28-preset-template-editor-design.md#aturan-validasi) atau format `id` tidak valid |
| 409 | `{"error": "Template bawaan tidak bisa ditimpa, simpan dengan nama lain"}` |
| 500 | Gagal menulis berkas |

## DELETE /api/templates/:id

204 tanpa body. 404 jika tidak ada; 409 `{"error": "Template bawaan tidak bisa dihapus"}`; 500 jika gagal menghapus.

## POST /api/score

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `texts` | array | Wajib. String atau angka; di-trim, yang kosong dibuang. Maksimal 256 setelah disaring. |
| `mode` | string | `sentiment3` (default), `binary`, `scale5`, `preset`, `custom` |
| `preset` | string | Wajib untuk `preset` |
| `include_sentiment` | boolean | Untuk `preset`; default `true`. Untuk `custom` diambil dari template. |
| `extra_state` | object | Untuk `preset`. Kunci sama dengan `state_key` preset dihapus. |
| `template_id` | string | Untuk `custom`: template tersimpan |
| `template` | object | Untuk `custom`: template inline (didahulukan atas `template_id`) |

Contoh permintaan:

```json
{ "mode": "custom", "template_id": "ulasan-produk", "texts": ["Barangnya bagus, pengiriman cepat"] }
```

Contoh respons (dipersingkat):

```json
{
  "mode": "custom",
  "model": "laya_multilingual_q8_0.gguf",
  "preset": null,
  "preset_title": null,
  "include_sentiment": true,
  "results": [
    {
      "index": 0,
      "text": "Barangnya bagus, pengiriman cepat",
      "label": "positive",
      "score": 0.93,
      "value": 0.93,
      "confidence": 0.95,
      "act": 1,
      "options": [{ "key": "positive", "text": "Positif", "prob": 0.95 }],
      "questions": [
        {
          "id": "aspect",
          "type": "choice",
          "instructions": "...",
          "headline": "pengiriman",
          "value": 0.71,
          "winner": "pengiriman",
          "confidence": 0.71,
          "act": 1,
          "options": [{ "key": "pengiriman", "text": "pengiriman", "prob": 0.71 }]
        }
      ]
    }
  ],
  "average": { "score": 0.93, "label": "positive", "value": 0.93, "count": 1, "options": [], "confidence": 0.95, "questions": [] },
  "latency_ms": 180,
  "usage": { "input_tokens": 341, "output_tokens": 0, "latency_ms": 175.2, "total_tokens": 341 },
  "template_id": "ulasan-produk",
  "template_title": "Ulasan produk",
  "extra_state": {}
}
```

Angka di atas ilustratif. Catatan bentuk:

- `index` berbasis 0.
- Mode sentimen: `questions` berisi satu pertanyaan `sentiment`.
- Preset/custom tanpa sentimen: `label`, `score`, `value`, `confidence`, `act`, `options` bernilai `null`, dan `average` hanya berisi `count` dan `questions` selain field null tersebut.
- `headline`: kunci pemenang (`choice`), `P(true)=0.xxxx` (`noul`), atau level harapan (`score`).
- `template_id`/`template_title` hanya ada pada `custom`; `extra_state` pada `preset` dan `custom`.
- `latency_ms` adalah waktu total di server. `usage` adalah jumlah `usage` dari setiap permintaan daemon (satu per teks); `usage.latency_ms` hanya waktu inferensi laya. `total_tokens` = `input_tokens` + `output_tokens`, dipakai UI untuk meta "N token".

Aturan skor per mode:

| Mode | Skor | Nilai (`value`) | Label per teks | Label rata-rata |
| --- | --- | --- | --- | --- |
| `sentiment3` | P(pos) - P(neg) | sama dengan skor | pilihan model | > 0,15 positif, < -0,15 negatif |
| `binary` | 2p - 1 | p = P(positif) | p >= 0,5 positif | rata-rata p >= 0,5 |
| `scale5` | (rating - 3) / 2 | rating 1-5 = level + 1 | >= 3,5 positif, <= 2,5 negatif | sama, dari rata-rata rating |

| Kode | Pesan |
| --- | --- |
| 400 | `Body harus berupa {"texts": string[]}`; `Mode tidak dikenal: ...`; `Mode preset butuh field "preset" (nama preset).`; `Mode custom butuh field "template" (objek) atau "template_id".`; `Template tidak ditemukan: ...`; galat validasi; `Tidak ada teks yang valid untuk dinilai.`; `Maksimal 256 teks per permintaan (diterima N).`; `Preset tidak dikenal: ...` |
| 502 | `Gagal memuat preset: ...`; `Gagal menilai teks: ...` |
| 503 | Model belum siap atau sedang diganti |

Pemanggilan laya: satu permintaan daemon `{"id", "state", "questions"}` per teks, berurutan, dengan timeout 120 detik per teks ([ADR-010](11_DECISIONS.md#adr-010-laya-daemon-via-stdio-alih-alih-serve)). Mode preset mengirim `questions` eksplisit dari snapshot. Galat daemon `{"id","error"}` menjadi 502 dengan pesan `laya: <pesan>`. State per teks: `{...extra_state tanpa nilai "", [state_key]: teks}`.

## POST /api/export

Body adalah respons `/api/score` apa adanya (minimal `results[]`). Respons berupa XLSX dengan `Content-Disposition: attachment`.

| Mode | Nama berkas |
| --- | --- |
| `sentiment3`/`binary`/`scale5` | `sentiment-YYYYMMDD-HHmmss.xlsx` |
| `preset` | `preset-<nama>-<ts>.xlsx` |
| `custom` | `template-<id atau custom>-<ts>.xlsx` |

| Sheet | Isi |
| --- | --- |
| Results | Satu baris per teks. Mode preset/custom: kolom `<id>` dan `<id> conf` per pertanyaan. |
| Summary | Rata-rata, aturan skor, model, dan untuk preset/custom baris `State tetap: <kunci>` |
| Detail | No, Teks, Pertanyaan, Tipe, Jawaban, Confidence, Act, Opsi, Prob (%) |

Galat: 400 `Body harus berupa respons /api/score (results[]).`; 500 `Gagal membuat file Excel: ...`.

## POST /api/benchmark

Menjalankan teks dan mode yang sama pada beberapa model secara berurutan: muat model, nilai semua teks, lanjut ke model berikutnya, lalu pulihkan model awal.

Body sama dengan `/api/score` (`texts`, `mode`, `preset`, `template`/`template_id`, `extra_state`, `include_sentiment`), ditambah:

| Field | Tipe | Keterangan |
| --- | --- | --- |
| `models` | array | Opsional. Nama berkas `.gguf` di `models/`. Bawaan: semua `*.gguf`, urutan sama dengan `/api/status`. Nama tidak valid menghasilkan 400. |
| `include_duplicates` | boolean | Bawaan `false`: berkas dengan isi identik dilewati. |

Validasi body dilakukan sebelum streaming (400/502 JSON seperti `/api/score`). Kode lain sebelum streaming: 409 jika benchmark lain berjalan, 503 jika `laya.exe` belum ada atau model sedang dimuat/diganti.

Respons: `Content-Type: application/x-ndjson; charset=utf-8`, satu objek JSON per baris, dikirim segera setiap peristiwa terjadi:

| `type` | Field lain |
| --- | --- |
| `start` | `total`, `original_model`, `mode`, `texts`, `models: [{file, size_mb, duplicate_of}]` |
| `model_skipped` | `index`, `file`, `reason: "duplicate"`, `duplicate_of` |
| `model_loading` | `index`, `file` |
| `model_loaded` | `index`, `file`, `device`, `load_ms` |
| `model_scoring` | `index`, `file` |
| `model_result` | `index`, `file`, `device`, `load_ms`, `score_ms`, `ms_per_text`, `result` (respons `/api/score` persis) |
| `model_error` | `index`, `file`, `stage: "load" \| "score"`, `error` |
| `done` | `cancelled`, `restored_model`, `total_ms`, dan `error` jika model awal gagal dimuat ulang |

Catatan perilaku:

- **Duplikat**: berkas dengan ukuran sama di-hash md5 (streaming). Hash di-cache di memori per nama berkas, ukuran, dan mtime. Berkas pertama menurut urutan menjadi berkas kanonis. Hashing dilakukan sebelum peristiwa `start`.
- **Perangkat**: ditentukan sekali di awal (`laya info` bila `auto`) dan dipakai untuk semua model.
- **Model rusak**: jika laya keluar sebelum baris ready dengan galat muat/metadata di stderr (misalnya `Missing 'ggmlc.graph_spec' metadata`), tidak ada percobaan ulang di CPU. Pesan: `Model gagal dimuat: metadata 'ggmlc.graph_spec' tidak ada di file GGUF (bukan model laya ggmlc yang lengkap).` Benchmark berlanjut ke model berikutnya. Crash lain tetap mendapat fallback CPU.
- **`load_ms`** mencakup pemuatan sampai baris ready, tanpa waktu menghentikan proses lama. **`score_ms`** sama dengan `result.latency_ms`.
- **Pemulihan**: setelah selesai, galat, atau pembatalan, model awal dimuat ulang (dengan fallback CPU normal). Peristiwa `done` dikirim setelah pemulihan siap.
- **Pembatalan**: `POST /api/benchmark/cancel` atau koneksi klien yang terputus sebelum `done`. Benchmark berhenti setelah langkah berjalan (muat atau nilai) selesai.

Terukur pada GTX 1650 (`vulkan:1`), 4 teks `sentiment3`, 7 berkas (3 hasil, 2 duplikat, 2 galat): total sekitar 29-32 detik termasuk hashing dan pemulihan; muat 2,9-4,3 detik per model; analisis 460-550 ms (sekitar 115-140 ms per teks).

## POST /api/benchmark/cancel

Selalu mengembalikan `{"ok": true}`, juga saat tidak ada benchmark.

## POST /api/benchmark/export

Body:

```json
{
  "mode": "sentiment3",
  "texts": ["..."],
  "preset": null,
  "preset_title": null,
  "template_id": null,
  "template_title": null,
  "runs": [ { "type": "model_result", "index": 0, "file": "...", "result": { } } ]
}
```

`runs` berisi peristiwa `model_result`, `model_error`, dan `model_skipped` apa adanya (peristiwa lain diabaikan). Nama berkas: `benchmark-<mode>-YYYYMMDD-HHmmss.xlsx`.

| Sheet | Isi |
| --- | --- |
| Ringkasan | Blok judul (tanggal, mode, preset/template, jumlah teks, perangkat), lalu satu baris per model: No, Model, Ukuran MB, Status (`OK`/`Gagal`/`Duplikat dari X`), Perangkat, Muat (ms), Analisis (ms), ms/teks, Rata-rata skor, jumlah per label (jika ada sentimen), Kesepakatan dengan mayoritas (%), Error. Header tebal dan dibekukan, dengan autofilter. |
| Perbandingan | Satu baris per teks: No, Teks, Mayoritas (jika ada sentimen), lalu per model OK kolom `<model> · label` dan `<model> · skor`. Mode preset/custom menambah satu kolom per pertanyaan (`<model> · <id>`) berisi headline (pemenang atau angka). Sel label diwarnai: hijau muda positif, merah muda negatif, abu-abu netral. |
| `<model>` | Satu sheet per model OK (nama berkas tanpa `.gguf`, maksimal 31 karakter, unik) dengan baris per teks yang sama seperti sheet Results pada `/api/export`. |

Label mayoritas per teks dihitung dari model OK (label sentimen, atau pemenang pertanyaan `choice` pertama jika tanpa sentimen); hasil seri tidak dihitung. Kesepakatan = persentase teks (yang memiliki mayoritas) di mana label model sama dengan mayoritas.

Galat: 400 `Body harus berisi runs[] (event model_result / model_error / model_skipped).` atau `Mode tidak dikenal: ...`; 500 `Gagal membuat file Excel: ...`.

## Siklus hidup proses laya

1. Unduh `bin/laya.exe` jika belum ada.
2. Tunggu model di `models/` (polling 5 detik) dan tunggu ukuran berkas stabil.
3. Tentukan perangkat (`laya info` bila `auto`).
4. `laya daemon <model> --device <dev>` dengan cwd `bin/` dan stdio `pipe`. Tidak ada port.
5. Tunggu baris stdout `{"status":"ready"}`, timeout 10 menit. Device yang dilaporkan adalah device yang diminta.
6. Permintaan dikirim satu per satu lewat stdin (antrean per proses) dan dicocokkan dengan `String(id)`. Baris stdout non-JSON dicatat dengan prefiks `[laya]`, stderr dengan `[laya!]`.
7. Jika crash pada perangkat non-CPU, ulangi sekali dengan `cpu`. Permintaan tertunda saat proses berhenti ditolak. Jika proses keluar sebelum ready, pesan galat diambil dari baris stderr terakhir laya. Pada benchmark, galat muat/metadata tidak diulang di CPU.
8. Saat server berhenti, stdin ditutup lalu proses anak dihentikan. Jika server Node mati paksa, daemon keluar sendiri karena stdin tertutup.
