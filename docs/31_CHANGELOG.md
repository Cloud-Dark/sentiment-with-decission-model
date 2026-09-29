# Changelog

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/). Versi `package.json` masih `1.0.0` dan belum ada tag rilis, sehingga entri dikelompokkan per commit. Aturan rilis: [standards/07_RELEASE_STANDARD.md](standards/07_RELEASE_STANDARD.md).

## [Unreleased]

### Added

- Dokumentasi proyek di `docs/` (indeks, charter, PRD, FRD, TRD, arsitektur, rencana, checklist, roadmap, risiko, ADR, strategi uji, glosarium, referensi konfigurasi, setup, backend, frontend, standar, spesifikasi, rencana, dan UAT editor preset/template).
- `public/README.md` dan `scripts/README.md`.

### Changed

- Tampilan `public/index.html` dirombak ke gaya Editorial Brutalism: header sticky dengan status model, toggle tema terang/gelap, footer, tombol kembali ke atas, strip ringkasan hasil, dan kartu hasil multi-kolom (1/2/3 kolom sesuai lebar layar).
- `models/README.md` dan `templates/README.md` diberi blok header status dokumen; isi tidak diubah.

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
