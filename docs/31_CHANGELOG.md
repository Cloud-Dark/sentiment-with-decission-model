# Changelog

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/). Versi `package.json` masih `1.0.0` dan belum ada tag rilis, sehingga entri dikelompokkan per commit. Aturan rilis: [standards/07_RELEASE_STANDARD.md](standards/07_RELEASE_STANDARD.md).

## [Unreleased]

### Added

- Benchmark model ([FR-015](03_FRD.md#fr-015-benchmark-model)): `POST /api/benchmark` (streaming NDJSON; memuat setiap model di `models/` secara bergantian, melewati berkas duplikat berdasarkan md5, melanjutkan saat ada model rusak, lalu memulihkan model awal), `POST /api/benchmark/cancel`, dan `POST /api/benchmark/export` (XLSX dengan sheet `Ringkasan`, `Perbandingan`, dan satu sheet per model). `/api/status` memuat field `benchmark`.
- Snapshot preset laya `presets/laya-presets.json` (salinan `GET /v1/presets`, 10 preset) beserta `presets/README.md`.
- `scripts/sync-presets.js` dan skrip npm `presets:sync` untuk memperbarui snapshot setelah upgrade laya.
- Respons `/api/score` memuat `usage` (`input_tokens`, `output_tokens`, `latency_ms`, `total_tokens`) yang dijumlahkan dari seluruh permintaan per teks.
- ADR-010 dan risiko R-15 (drift snapshot preset).
- Dokumentasi proyek di `docs/` (indeks, charter, PRD, FRD, TRD, arsitektur, rencana, checklist, roadmap, risiko, ADR, strategi uji, glosarium, referensi konfigurasi, setup, backend, frontend, standar, spesifikasi, rencana, dan UAT editor preset/template).
- `public/README.md` dan `scripts/README.md`.

### Changed

- `server.js` menjalankan `laya.exe daemon` (stdin/stdout, JSON per baris) alih-alih `laya.exe serve`. Aplikasi kini hanya membuka port web. Penilaian dilakukan per teks secara berurutan karena daemon tidak memiliki batch; bentuk respons `/api/*` lainnya tidak berubah ([ADR-010](11_DECISIONS.md#adr-010-laya-daemon-via-stdio-alih-alih-serve)).
- Definisi preset dibaca dari snapshot saat boot, bukan dari `/v1/presets` laya.
- Inti `/api/score` dipisah menjadi `prepareScoreJob` dan `runScoreJob` agar dapat dipakai ulang oleh benchmark; bentuk respons tidak berubah. `switchModel` kini mengembalikan hasil pemuatan dan menerima opsi untuk melewati fallback CPU pada galat muat/metadata. Pembuat sheet Results dipisah (`addSentimentResultsSheet`, `addPresetResultsSheet`) agar dipakai ulang oleh ekspor benchmark.
- Model yang gagal dimuat sebelum baris ready kini dilaporkan dengan pesan dari stderr laya (misalnya metadata `ggmlc.graph_spec` tidak ada), bukan hanya kode keluar.
- `/api/score` dan `/api/model` mengembalikan 409 selama benchmark berjalan.
- Tampilan `public/index.html` dirombak ke gaya Editorial Brutalism: header sticky dengan status model, toggle tema terang/gelap, footer, tombol kembali ke atas, strip ringkasan hasil, dan kartu hasil multi-kolom (1/2/3 kolom sesuai lebar layar).
- `models/README.md` dan `templates/README.md` diberi blok header status dokumen; isi tidak diubah.

### Removed

- Variabel lingkungan `LAYA_PORT`, pemeriksaan port laya (`isPortFree` untuk laya), polling `/health`, dan pemanggilan `/v1/decide/batch`.

## [bf78ba9] - 2026-09-28

`feat: preset editor with reusable question templates`

### Added

- API CRUD template (`/api/templates`) berbasis `templates/*.json` dengan empat template bawaan: `ulasan-produk`, `keluhan-pelanggan`, `moderasi-komentar`, `email-triage`.
- Mode penilaian `custom` untuk template tersimpan maupun belum disimpan.
- Field `extra_state` untuk preset dan template.
- `GET /api/presets/:name` untuk memuat preset Laya ke editor.
- Editor serupa Studio: question builder, Raw JSON, Uji, Simpan, Salin JSON, Reset, Hapus.
- `templates/README.md`.

### Changed

- Ekspor Excel mendukung hasil template (nama berkas `template-<id>-<ts>.xlsx`).

## [dcc4574] - 2026-09-28

`feat: sentiment scoring app on Laya multilingual decision model`

### Added

- Backend Express yang mengelola `laya.exe` (ggmlc, Vulkan): unduh otomatis, pemilihan GPU diskrit otomatis, fallback port.
- Mode sentimen: `sentiment3` (choice tiga kelas), `binary` (noul), `scale5` (skala 1-5, eksperimental).
- Mode preset Laya dengan keluaran per pertanyaan serupa Studio.
- Pemilih model jika ada beberapa berkas GGUF.
- Ekspor Excel dengan sheet Results, Summary, Detail.
- Frontend satu berkas dengan input dinamis, reset, dan ekspor.
- `README.md`, `models/README.md`, `scripts/setup.js`.
