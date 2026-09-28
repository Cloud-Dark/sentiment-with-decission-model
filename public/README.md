# public/

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

Folder ini berisi frontend aplikasi: satu berkas `index.html` yang disajikan statis oleh `server.js` (`express.static`).

## Isi berkas

`index.html` memuat HTML, CSS, dan JavaScript (ES5, satu IIFE) sekaligus. Tidak ada library, CDN, font eksternal, maupun langkah build, sehingga halaman berjalan tanpa internet ([ADR-009](../docs/11_DECISIONS.md#adr-009-frontend-satu-berkas-offline)).

## Bagian halaman

| Bagian | Fungsi |
| --- | --- |
| Status model | Status laya, model aktif, pemilih model, perangkat |
| Mode | `sentiment3`, `binary`, `scale5` (eksperimental), Preset / Template |
| Preset / Template | Pilihan template atau preset Laya, opsi sertakan sentimen, tombol editor |
| Editor | Builder pertanyaan, Raw JSON, `extra_state`, Uji, Simpan, Salin JSON, Reset, Hapus |
| Input teks | Kotak teks dinamis dan tempel massal |
| Hasil | Rata-rata, hasil per teks dan per pertanyaan, peringatan hasil kedaluwarsa |
| Aksi | Analisis (`Ctrl + Enter`), Reset, Ekspor Excel |

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
