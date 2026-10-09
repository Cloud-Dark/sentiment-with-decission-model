# public/

> Status: Draft
> Terakhir diperbarui: 2026-09-29
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
| Input teks | Template teks "Mulai cepat" (klik langsung terisi, bisa diurungkan, bisa simpan template sendiri), tab Per kotak / Daftar (satu per baris), penghitung teks, Kosongkan |
| Benchmark | Sakelar "Bandingkan semua model (benchmark)" di panel Mode (disimpan di `localStorage['sentiment.benchmark']`), daftar model yang diuji (default semua), opsi "Sertakan file duplikat" |
| Progres benchmark | Satu baris per model (status Menunggu/Memuat/Menguji/Selesai/Gagal/Duplikat, waktu muat dan uji, titik live), bilah "Model i/N", waktu berjalan, tombol Batalkan |
| Hasil | Ringkasan (jumlah teks, skor rata-rata, distribusi label, model dan latensi, rata-rata probabilitas atau per pertanyaan), kartu per teks (label, skor, probabilitas, pertanyaan dalam baris yang bisa dibuka), peringatan hasil kedaluwarsa |
| Hasil benchmark | Menggantikan hasil biasa: ringkasan per model (device, muat, uji, ms/teks, rata-rata, distribusi label, kesepakatan dengan mayoritas; tanda tercepat dan paling sepakat), matriks per teks (kolom sticky, gulir horizontal sendiri; pemilih pertanyaan untuk preset/template), tab detail per model, Export benchmark ke Excel, Salin ringkasan (Markdown) |
| Aksi | Analisis / Jalankan benchmark (`Ctrl + Enter`), Reset, Ekspor Excel |
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
| Jalankan benchmark | `POST /api/benchmark` (body `/api/score` + `models`, `include_duplicates`; respons NDJSON dibaca bertahap) |
| Batalkan benchmark | `POST /api/benchmark/cancel` (menutup stream juga membatalkan) |
| Ekspor benchmark | `POST /api/benchmark/export` (`mode`, `texts`, preset/template, `runs` = event hasil/gagal/dilewati) |
| Progres di header | field `benchmark` pada `GET /api/status` (analisis dan ganti model nonaktif selama berjalan) |

Rincian struktur, state, kunci localStorage, dan perilaku editor: [docs/22_FRONTEND.md](../docs/22_FRONTEND.md). Referensi endpoint: [docs/21_BACKEND.md](../docs/21_BACKEND.md).

## Mengubah frontend

Edit `index.html` langsung lalu muat ulang browser; tidak perlu restart server. Ikuti [standar kode](../docs/standards/02_CODE_STANDARD.md): ES5, `textContent` untuk data, `localStorage` dalam `try/catch`.
