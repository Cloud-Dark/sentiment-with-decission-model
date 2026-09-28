# Standar Kode

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

Belum ada linter atau formatter yang dikonfigurasi (`_TBD_`). Aturan di bawah mengikuti gaya kode yang ada.

## Umum

- Bahasa kode dan komentar: Inggris. Pesan yang terlihat pengguna (UI, galat API, status, sheet Excel): Bahasa Indonesia.
- Tidak menambah dependensi tanpa alasan kuat. Dependensi runtime saat ini hanya `express` dan `exceljs`.
- Komentar menjelaskan alasan ("mengapa"), terutama untuk perilaku laya yang diamati dan wording kriteria yang disetel.

## Backend (`server.js`, `scripts/setup.js`)

- CommonJS dengan `'use strict'`, Node `>=18`.
- Indentasi 2 spasi, tanda kutip tunggal, titik koma, template literal untuk interpolasi.
- Konstanta konfigurasi di bagian atas berkas dalam `UPPER_SNAKE_CASE`; fungsi dan variabel `camelCase`.
- Bagian berkas dipisah dengan komentar blok `// ----`.
- Log ke konsol lewat helper `log()`; keluaran proses laya diberi prefiks `[laya]` / `[laya!]`.
- Validasi input melempar `ValidationError` dan dipetakan ke HTTP 400. Galat laya dipetakan ke 502, model belum siap ke 503, konflik template bawaan ke 409.
- Body galat selalu `{"error": "..."}`.
- Nilai numerik dari laya dibaca defensif (`num()`, `clamp()`, `round4()`), probabilitas dinormalisasi jika totalnya tidak 1.
- Id dari pengguna divalidasi dengan regex sebelum dipakai sebagai path (`TEMPLATE_ID_RE`, pemeriksaan `path.basename` untuk model).
- Penulisan berkas bersifat atomik (berkas sementara lalu `rename`).
- Aturan validasi template didefinisikan sekali (`validateQuestionSet`, `validateTemplate`) dan dipakai bersama oleh CRUD dan `/api/score`.

## Frontend (`public/index.html`)

- JavaScript ES5 dalam satu IIFE: `var`, `function`, tanpa arrow function, modul, atau transpiler.
- Tanpa library, CDN, atau font eksternal.
- DOM dibuat dengan `el()` dan `textContent`; jangan memasukkan data ke `innerHTML`.
- Akses `localStorage` selalu dalam `try/catch`, dengan kunci berprefiks `sentiment.`.
- Aturan validasi UI harus diselaraskan dengan server ketika salah satunya berubah.
- Warna didefinisikan sebagai variabel CSS dengan varian `prefers-color-scheme: dark`.

## Template bawaan

- Instruksi dan kriteria ditulis dalam bahasa Inggris (akurasi model lebih baik); kunci opsi boleh Bahasa Indonesia.
- Perubahan wording dicatat hasilnya di dokumen UAT.
