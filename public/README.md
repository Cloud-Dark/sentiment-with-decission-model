# public/

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

Folder ini berisi frontend aplikasi: satu berkas `index.html` yang disajikan statis oleh `server.js` (`express.static`).

## Isi berkas

`index.html` memuat HTML, CSS, dan JavaScript (ES5, satu IIFE) sekaligus. Tidak ada library, CDN script, maupun langkah build ([ADR-009](../docs/11_DECISIONS.md#adr-009-frontend-satu-berkas-offline)). Satu-satunya aset eksternal adalah stylesheet Google Fonts (Bricolage Grotesque, Hanken Grotesk, JetBrains Mono). Tanpa internet, halaman tetap berjalan dengan font sistem sebagai cadangan.

Tema terang/gelap diatur tombol di header dan disimpan di `localStorage.theme`. Jika belum ada, tema mengikuti `prefers-color-scheme` dan diterapkan sebelum halaman digambar.

## Bagian halaman

| Bagian | Fungsi |
| --- | --- |
| Header (sticky) | Status laya (titik live), model aktif, pemilih model, perangkat, tombol tema, bilah progres gulir |
| Mode | `sentiment3`, `binary`, `scale5` (eksperimental), Preset / Template |
| Preset / Template | Pilihan template atau preset Laya, opsi sertakan sentimen, tombol editor |
| Editor | Builder pertanyaan, Raw JSON, `extra_state`, Uji, Simpan, Salin JSON, Reset, Hapus |
| Input teks | Kotak teks dinamis dan tempel massal |
| Hasil | Ringkasan (jumlah teks, skor rata-rata, distribusi label, model dan latensi, rata-rata probabilitas atau per pertanyaan), kartu per teks (label, skor, probabilitas, pertanyaan dalam baris yang bisa dibuka), peringatan hasil kedaluwarsa |
| Aksi | Analisis (`Ctrl + Enter`), Reset, Ekspor Excel |
| Footer | Info model dan perangkat, tautan dokumentasi, hak cipta; tombol kembali ke atas muncul setelah gulir 300px |

## Komunikasi dengan API

| Aksi UI | Endpoint |
| --- | --- |
| Polling status (1 / 15 / 3 detik) | `GET /api/status` |
| Ganti model | `POST /api/model` |
| Muat katalog | `GET /api/presets`, `GET /api/templates` |
| Buka item di editor | `GET /api/presets/:name`, `GET /api/templates/:id` |
| Analisis dan Uji | `POST /api/score` |
| Simpan dan Hapus template | `POST /api/templates`, `DELETE /api/templates/:id` |
| Ekspor | `POST /api/export` (body = respons `/api/score` terakhir) |

Rincian struktur, state, kunci localStorage, dan perilaku editor: [docs/22_FRONTEND.md](../docs/22_FRONTEND.md). Referensi endpoint: [docs/21_BACKEND.md](../docs/21_BACKEND.md).

## Mengubah frontend

Edit `index.html` langsung lalu muat ulang browser; tidak perlu restart server. Ikuti [standar kode](../docs/standards/02_CODE_STANDARD.md): ES5, `textContent` untuk data, `localStorage` dalam `try/catch`.
