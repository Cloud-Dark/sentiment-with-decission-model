# Product Requirements Document (PRD)

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

## Masalah

Menilai sentimen dan mengklasifikasikan teks (ulasan, keluhan, komentar, email) secara manual lambat dan tidak konsisten. Layanan LLM berbasis cloud membutuhkan biaya, koneksi internet, dan pengiriman data ke pihak ketiga. Model Laya multilingual dapat berjalan lokal di GPU kelas menengah, tetapi hanya menyediakan API HTTP tanpa antarmuka untuk pengguna non-teknis dan tanpa ekspor ke spreadsheet.

## Pengguna sasaran

| Persona | Kebutuhan |
| --- | --- |
| Analis data / riset | Menilai sentimen ratusan teks lalu mengolahnya di Excel |
| Tim layanan pelanggan | Triase keluhan dan email: kategori, urgensi, risiko churn, permintaan refund |
| Moderator konten | Mendeteksi komentar toksik, pelecehan, ujaran kebencian, dan spam |
| Pengembang / penyusun prompt | Menyusun dan menguji pertanyaan keputusan sendiri, lalu menyimpannya sebagai template |

Persona di atas diturunkan dari template bawaan. Validasi dengan pengguna nyata `_TBD_`.

## Fitur dan prioritas (MoSCoW)

| Fitur | Prioritas | Status |
| --- | --- | --- |
| Input banyak teks, tampilan daftar (satu teks per baris), dan template teks contoh | Must | Selesai |
| Mode `sentiment3` (positif/netral/negatif) | Must | Selesai |
| Ringkasan rata-rata dan hasil per teks | Must | Selesai |
| Ekspor Excel | Must | Selesai |
| Status model dan pengelolaan proses laya otomatis | Must | Selesai |
| Mode `binary` | Should | Selesai |
| Mode preset Laya dengan opsi sertakan sentimen | Should | Selesai |
| Template kustom (CRUD, template bawaan) | Should | Selesai |
| Editor template serupa Studio (builder, Raw JSON, Uji) | Should | Selesai |
| Pemilihan model saat beberapa GGUF tersedia | Could | Selesai |
| Mode `scale5` | Could | Selesai, eksperimental |
| Field state tambahan (`extra_state`) | Could | Selesai |
| Unggah CSV/XLSX sebagai input | Could | Belum ([roadmap](08_ROADMAP.md)) |
| Evaluasi akurasi otomatis terhadap dataset berlabel | Could | Belum |
| Autentikasi dan multi-pengguna | Won't (saat ini) | Di luar lingkup |

## User stories

| ID | Cerita | FR terkait |
| --- | --- | --- |
| US-001 | Sebagai analis, saya ingin mengetik atau menempel beberapa teks sekaligus agar dapat dinilai dalam satu kali proses. | FR-001, FR-002 |
| US-002 | Sebagai analis, saya ingin memilih mode sentimen (3 kelas, biner, skala 1-5) sesuai kebutuhan laporan. | FR-003 |
| US-003 | Sebagai analis, saya ingin melihat rata-rata sentimen dari semua teks untuk ringkasan cepat. | FR-004 |
| US-004 | Sebagai analis, saya ingin mengosongkan semua input dan hasil dengan satu tombol. | FR-005 |
| US-005 | Sebagai analis, saya ingin mengekspor hasil ke Excel untuk diolah lebih lanjut. | FR-006 |
| US-006 | Sebagai pengguna, saya ingin memilih file model GGUF yang aktif tanpa me-restart server. | FR-007 |
| US-007 | Sebagai tim layanan pelanggan, saya ingin menjalankan preset Laya (misalnya `email`) terhadap teks saya. | FR-008 |
| US-008 | Sebagai penyusun prompt, saya ingin membuat, mengubah, dan menghapus template pertanyaan saya sendiri. | FR-009 |
| US-009 | Sebagai penyusun prompt, saya ingin menyusun pertanyaan lewat builder visual atau JSON mentah. | FR-010 |
| US-010 | Sebagai penyusun prompt, saya ingin menguji template pada satu teks sebelum menyimpannya. | FR-011 |
| US-011 | Sebagai tim layanan pelanggan, saya ingin mengisi field tambahan seperti `from` dan `subject` agar hasil preset email lebih akurat. | FR-012 |
| US-012 | Sebagai pengguna, saya ingin tahu kapan model siap dan perangkat apa yang dipakai. | FR-013 |

## Metrik

| Metrik | Cara ukur | Target |
| --- | --- | --- |
| Latensi per permintaan | `latency_ms` pada respons `/api/score` | `_TBD_` (referensi: batch 10 teks sekitar 0,13 detik di GTX 1650) |
| Tingkat keberhasilan permintaan | Rasio respons 200 terhadap total `/api/score` | `_TBD_` (belum ada telemetri) |
| Akurasi sentimen | Kecocokan label terhadap dataset berlabel | `_TBD_` (belum ada dataset) |
| Waktu siap setelah `npm start` | Waktu sampai `/api/status` `ready: true` | `_TBD_` |

## Dokumen terkait

[00_PROJECT_CHARTER.md](00_PROJECT_CHARTER.md), [03_FRD.md](03_FRD.md), [08_ROADMAP.md](08_ROADMAP.md).
