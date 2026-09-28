# Rencana Implementasi

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

Dokumen ini mencatat fase yang benar-benar sudah dikerjakan (berdasarkan `git log`) dan langkah berikutnya. Daftar periksa rinci ada di [07_MASTER_CHECKLIST.md](07_MASTER_CHECKLIST.md).

## Fase 1: Aplikasi penilaian sentimen (selesai, commit `dcc4574`, 2026-09-28)

Tujuan: aplikasi web lokal yang menilai sentimen dengan laya dan mengekspor ke Excel.

Pekerjaan:
1. `scripts/setup.js`: unduh dan ekstrak `laya-windows-x86_64-vulkan.zip` (ggmlc v0.9.6) ke `bin/`.
2. `server.js`: manajemen proses anak laya (unduh otomatis, pencarian model, pemilihan GPU diskrit, fallback port, fallback CPU, penggantian model).
3. Mode `sentiment3` (`choice`), `binary` (`noul`), `scale5` (`score`, eksperimental), beserta parser dan rata-rata.
4. Mode preset Laya dengan keluaran per pertanyaan serupa Studio.
5. Pemilih model jika ada beberapa GGUF.
6. Ekspor Excel dengan sheet Results, Summary, Detail.
7. `public/index.html`: input dinamis, tempel massal, reset, ekspor.
8. `README.md` dan `models/README.md`.

## Fase 2: Editor preset dan template (selesai, commit `bf78ba9`, 2026-09-28)

Tujuan: pengguna dapat menyusun, menguji, dan menyimpan pertanyaan sendiri.

Pekerjaan:
1. API CRUD template (`/api/templates`) berbasis `templates/*.json` dan validasi bersama (`validateQuestionSet`).
2. Empat template bawaan: `ulasan-produk`, `keluhan-pelanggan`, `moderasi-komentar`, `email-triage`.
3. Mode `custom` untuk template tersimpan maupun inline; `extra_state` untuk preset.
4. `GET /api/presets/:name` untuk memuat preset ke editor.
5. Editor serupa Studio: question builder, Raw JSON, Uji, Simpan, Salin JSON, Reset, Hapus.
6. Ekspor mendukung hasil template.
7. `templates/README.md`.

Rinciannya: [spesifikasi](specs/2026-09-28-preset-template-editor-design.md), [rencana](plans/2026-09-28-preset-template-editor.md), [UAT](uat/2026-09-28_preset-template-uat.md).

## Fase 3: Dokumentasi (berjalan, 2026-09-28)

Folder `docs/` dan README per folder (`public/`, `scripts/`). Belum di-commit.

## Langkah berikutnya

Prioritas masih `_TBD_` dan menunggu keputusan pemilik produk.

1. Suite pengujian otomatis: unit test untuk parser (`parseChoice`, `parseNoul`, `parseScore`, `genericQuestion`), validasi template, dan `buildAverage`; tes integrasi API dengan mock laya ([12_TEST_STRATEGY.md](12_TEST_STRATEGY.md)).
2. Dataset evaluasi berlabel untuk mengukur akurasi per mode dan per template.
3. Penyempurnaan wording template yang lemah (misalnya `spam` pada `moderasi-komentar`, `severity`, `emotion`, `churn_risk`) berdasarkan catatan UAT.
4. Perbaikan atau pengkajian ulang `scale5` ([ADR-008](11_DECISIONS.md#adr-008-scale5-ditandai-eksperimental)).
5. Pertimbangkan mengikat server web ke `127.0.0.1` secara default ([10_RISK_REGISTER.md](10_RISK_REGISTER.md)).
6. Input dari berkas CSV/XLSX.
7. `package.json` belum memiliki skrip `test` atau lint; tambahkan saat suite tersedia.
