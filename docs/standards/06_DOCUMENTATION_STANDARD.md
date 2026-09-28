# Standar Dokumentasi

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

## Bahasa dan gaya

- Bahasa Indonesia formal dan profesional, tanpa persona.
- Tanpa emoji, kecuali penanda status roadmap: ✅ selesai, 🚧 sedang dikerjakan, 📋 direncanakan.
- Ringkas; tabel dan daftar lebih diutamakan daripada paragraf panjang.
- Hanya fakta yang dapat diverifikasi dari kode, git, atau hasil uji. Hal yang belum diketahui ditandai `_TBD_`.
- Istilah teknis (endpoint, field JSON, nama berkas) ditulis dalam `code` dan tidak diterjemahkan. Definisi istilah di [13_GLOSSARY.md](../13_GLOSSARY.md).
- Angka desimal dalam kalimat memakai koma (0,15); di contoh kode tetap titik.

## Header wajib

Setiap dokumen diawali:

```markdown
# <Judul>

> Status: Draft
> Terakhir diperbarui: YYYY-MM-DD
> Pemilik: _TBD_
```

Nilai status: `Draft`, `Review`, `Final`, `Usang`. Tanggal diperbarui setiap kali isi berubah.

## Penamaan berkas

| Lokasi | Pola | Contoh |
| --- | --- | --- |
| `docs/` | `NN_NAMA_DOKUMEN.md` (dua digit, huruf besar, underscore) | `04_TRD.md` |
| `docs/standards/` | `NN_NAMA_STANDARD.md` | `02_CODE_STANDARD.md` |
| `docs/specs/` | `YYYY-MM-DD-<topik>-design.md` (kebab-case) | `2026-09-28-preset-template-editor-design.md` |
| `docs/plans/` | `YYYY-MM-DD-<topik>.md` | `2026-09-28-preset-template-editor.md` |
| `docs/uat/` | `YYYY-MM-DD_<topik>-uat.md` (underscore setelah tanggal) | `2026-09-28_preset-template-uat.md` |
| Folder kode | `README.md` | `public/README.md` |

Nomor dokumen di `docs/` bersifat tetap. Nomor yang belum dipakai dicadangkan dan tidak diisi ulang untuk topik lain.

| Rentang | Kelompok |
| --- | --- |
| 00-09 | Produk dan perencanaan |
| 10-12 | Risiko, keputusan, pengujian |
| 13-19 | Referensi dan setup |
| 20-29 | Komponen (backend, frontend) |
| 30-39 | Riwayat (changelog) |

## Penomoran item

| Jenis | Format | Dokumen |
| --- | --- | --- |
| User story | `US-NNN` | [01_PRD.md](../01_PRD.md) |
| Kebutuhan fungsional | `FR-NNN` | [03_FRD.md](../03_FRD.md) |
| Kebutuhan teknis | `TR-NNN` | [04_TRD.md](../04_TRD.md) |
| Risiko | `R-NN` | [10_RISK_REGISTER.md](../10_RISK_REGISTER.md) |
| Keputusan | `ADR-NNN` dengan judul `## ADR-NNN: <judul>` | [11_DECISIONS.md](../11_DECISIONS.md) |

Nomor yang sudah dipakai tidak didaur ulang; item yang batal ditandai, bukan dihapus.

## Tautan

- Gunakan tautan relatif (`../README.md`, `specs/...md#anchor`).
- Anchor mengikuti judul heading (huruf kecil, spasi menjadi `-`, tanda baca dibuang). Mengubah judul yang ditautkan wajib memperbarui semua tautan.
- Setiap dokumen baru didaftarkan di [indeks dokumentasi](../README.md).

## Diagram

Gunakan Mermaid dalam blok kode `mermaid` agar dapat dirender di GitHub dan tetap dapat dibaca sebagai teks.
