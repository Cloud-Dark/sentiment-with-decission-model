# Indeks Dokumentasi

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

Dokumentasi proyek **sentiment-with-decision-model**: aplikasi web lokal (Node.js, Express 5, ExcelJS) untuk penilaian sentimen dan analisis keputusan memakai model Laya multilingual (GGUF) yang dijalankan oleh `bin/laya.exe serve` (ggmlc v0.9.6, build Windows Vulkan).

Penamaan berkas mengikuti [standar dokumentasi](standards/06_DOCUMENTATION_STANDARD.md). Nomor yang tidak muncul (02, 09, 14, 15, 18-20, 23-30) sengaja dicadangkan.

## Produk dan perencanaan

| Dokumen | Isi |
| --- | --- |
| [00_PROJECT_CHARTER.md](00_PROJECT_CHARTER.md) | Visi, tujuan, ruang lingkup, pemangku kepentingan, kriteria keberhasilan |
| [01_PRD.md](01_PRD.md) | Masalah, pengguna sasaran, fitur (MoSCoW), user story, metrik |
| [03_FRD.md](03_FRD.md) | Kebutuhan fungsional FR-xxx beserta kriteria penerimaan |
| [04_TRD.md](04_TRD.md) | Kebutuhan teknis TR-xxx, stack, integrasi API laya, batasan |
| [06_IMPLEMENTATION_PLAN.md](06_IMPLEMENTATION_PLAN.md) | Fase yang sudah dikerjakan dan langkah berikutnya |
| [07_MASTER_CHECKLIST.md](07_MASTER_CHECKLIST.md) | Daftar periksa per fase |
| [08_ROADMAP.md](08_ROADMAP.md) | Status fitur |

## Arsitektur, risiko, dan keputusan

| Dokumen | Isi |
| --- | --- |
| [05_ARCHITECTURE.md](05_ARCHITECTURE.md) | Diagram komponen dan sekuens, alur data |
| [10_RISK_REGISTER.md](10_RISK_REGISTER.md) | Daftar risiko dan mitigasi |
| [11_DECISIONS.md](11_DECISIONS.md) | Architecture Decision Records (ADR) |
| [12_TEST_STRATEGY.md](12_TEST_STRATEGY.md) | Strategi pengujian (manual E2E dan smoke test curl) |

## Referensi

| Dokumen | Isi |
| --- | --- |
| [13_GLOSSARY.md](13_GLOSSARY.md) | Glosarium istilah |
| [16_CONFIG_REFERENCE.md](16_CONFIG_REFERENCE.md) | Variabel lingkungan dan skema JSON template |
| [17_DEVELOPER_SETUP.md](17_DEVELOPER_SETUP.md) | Persiapan lingkungan pengembang |
| [21_BACKEND.md](21_BACKEND.md) | Referensi endpoint HTTP |
| [22_FRONTEND.md](22_FRONTEND.md) | Struktur UI, state, localStorage, editor |
| [31_CHANGELOG.md](31_CHANGELOG.md) | Catatan perubahan |

## Standar

| Dokumen | Isi |
| --- | --- |
| [standards/00_STANDARD_INDEX.md](standards/00_STANDARD_INDEX.md) | Indeks standar |
| [standards/02_CODE_STANDARD.md](standards/02_CODE_STANDARD.md) | Standar kode |
| [standards/06_DOCUMENTATION_STANDARD.md](standards/06_DOCUMENTATION_STANDARD.md) | Standar dokumentasi dan penamaan |
| [standards/07_RELEASE_STANDARD.md](standards/07_RELEASE_STANDARD.md) | Standar rilis dan pesan commit |

## Spesifikasi, rencana, dan UAT

| Dokumen | Isi |
| --- | --- |
| [specs/2026-09-28-preset-template-editor-design.md](specs/2026-09-28-preset-template-editor-design.md) | Desain editor preset/template |
| [plans/2026-09-28-preset-template-editor.md](plans/2026-09-28-preset-template-editor.md) | Rencana implementasi editor preset/template |
| [uat/2026-09-28_preset-template-uat.md](uat/2026-09-28_preset-template-uat.md) | Hasil UAT editor preset/template |

## README lain di repositori

- [../README.md](../README.md): ringkasan proyek dan cara menjalankan.
- [../public/README.md](../public/README.md): frontend satu berkas.
- [../scripts/README.md](../scripts/README.md): skrip setup dan folder `bin/`.
- [../models/README.md](../models/README.md): berkas model GGUF.
- [../templates/README.md](../templates/README.md): format template pertanyaan.
