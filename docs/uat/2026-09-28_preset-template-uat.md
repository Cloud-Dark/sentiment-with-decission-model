# UAT Editor Preset dan Template

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

## Ringkasan

| Item | Nilai |
| --- | --- |
| Fitur | Editor preset/template ([spesifikasi](../specs/2026-09-28-preset-template-editor-design.md)) |
| Build | Commit `bf78ba9` |
| Tanggal | 2026-09-28 |
| Penguji | Agen backend (uji API) dan lead (E2E) |
| Lingkungan | Windows 11, Node v24.18.0, laya ggmlc v0.9.6 Vulkan, model Laya multilingual (`q8_0`), Chromium headless dengan mock untuk UI |
| Hasil | Semua skenario PASS; keterbatasan akurasi model dicatat terpisah |

## Skenario

### API template

| ID | Skenario | Ekspektasi | Aktual | Hasil |
| --- | --- | --- | --- | --- |
| UAT-01 | `GET /api/templates` | 200, empat template bawaan | Sesuai | PASS |
| UAT-02 | `GET /api/templates/:id` | 200, template lengkap | Sesuai | PASS |
| UAT-03 | `POST /api/templates` tanpa id | 200, id dari judul | Sesuai | PASS |
| UAT-04 | `POST /api/templates` dengan id yang ada | 200, berkas ditimpa | Sesuai | PASS |
| UAT-05 | `DELETE /api/templates/:id` | 204 | Sesuai | PASS |
| UAT-06 | Timpa template bawaan | 409 | 409 | PASS |
| UAT-07 | Hapus template bawaan | 409 | 409 | PASS |
| UAT-08 | Id berisi traversal | 400 atau 404, tanpa akses berkas di luar `templates/` | 400/404 | PASS |
| UAT-09 | 11 kasus pelanggaran validasi | 400 dengan pesan | 400 pada seluruh 11 kasus | PASS |

### Penilaian

| ID | Skenario | Ekspektasi | Aktual | Hasil |
| --- | --- | --- | --- | --- |
| UAT-10 | Preset `email` dengan `from`/`subject` pada contoh Studio | Mendekati Studio | category `billing`, is_spam 0,866, is_phishing 0,833, urgency 1,92, refund 0,979, churn 0,857, needs_reply 0,819 | PASS |
| UAT-11 | Preset `email` tanpa `from`/`subject` | Perbedaan terdokumentasi | is_spam dan is_phishing turun ke 0,00 (perilaku yang diketahui, [ADR-006](../11_DECISIONS.md#adr-006-extra_state-untuk-preset)) | PASS |
| UAT-12 | `ulasan-produk`: "Barangnya bagus, pengiriman cepat" | positive, aspek pengiriman, merekomendasikan, bukan keluhan | positive, aspect `pengiriman`, would_recommend true, complaint false | PASS |
| UAT-13 | `ulasan-produk`: "Harga kemahalan, kualitas jelek" | negative, aspek harga, tidak merekomendasikan, keluhan | negative, aspect `harga`, would_recommend false, complaint true | PASS |
| UAT-14 | Ekspor hasil template kustom | 200, berkas XLSX | 200, `template-moderasi-komentar-<ts>.xlsx` | PASS |
| UAT-15 | Regresi mode `sentiment3` | Perilaku sama dengan sebelum fitur | Sesuai | PASS |

### UI

| ID | Skenario | Ekspektasi | Aktual | Hasil |
| --- | --- | --- | --- | --- |
| UAT-16 | Muat halaman dan jalankan alur editor | Tanpa galat konsol | Tanpa galat konsol | PASS |
| UAT-17 | Lebar layar 375 px | Tanpa scroll horizontal | Tanpa scroll horizontal | PASS |
| UAT-18 | Mode gelap | Kontras dan warna benar | Sesuai | PASS |

## Keterbatasan yang diketahui

Dicatat sebagai catatan kualitas model/wording, bukan kegagalan fitur. Ditindaklanjuti lewat R-03 dan R-04 di [10_RISK_REGISTER.md](../10_RISK_REGISTER.md).

| No | Template | Pengamatan |
| --- | --- | --- |
| N-01 | `moderasi-komentar` | Komentar hinaan dinilai `spam` 0,96 |
| N-02 | `moderasi-komentar` | `severity` maksimal sekitar 1,3 dari skala 0-2 |
| N-03 | `keluhan-pelanggan` | Keluhan marah terbaca sebagai `emotion` "kecewa" |
| N-04 | `keluhan-pelanggan` | `churn_risk` 0,24 pada keluhan yang relevan |

## Keputusan

Fitur diterima untuk penggunaan lokal. Persetujuan formal pemilik produk `_TBD_`.
