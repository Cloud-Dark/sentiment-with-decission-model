# Functional Requirements Document (FRD)

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

Kebutuhan fungsional diturunkan dari implementasi pada `server.js` dan `public/index.html` (commit `bf78ba9`). Detail endpoint ada di [21_BACKEND.md](21_BACKEND.md), detail UI di [22_FRONTEND.md](22_FRONTEND.md).

## FR-001 Input banyak teks

Pengguna dapat memasukkan satu atau lebih teks pada kolom input dinamis.

Kriteria penerimaan:
- Saat halaman dibuka dan setelah Reset, tersedia dua kolom teks berlabel "Teks 1" dan "Teks 2".
- Tombol "+ Tambah teks" menambah kolom baru dan memfokuskannya.
- Tombol "×" menghapus kolom; tombol dinonaktifkan jika hanya tersisa satu kolom. Label dinomori ulang setelah penghapusan.
- Teks kosong atau hanya spasi diabaikan saat analisis. Jika tidak ada teks terisi, muncul pesan "Isi minimal satu teks terlebih dahulu."
- Server menolak lebih dari 256 teks valid dengan HTTP 400.
- `Ctrl + Enter` (atau `Cmd + Enter`) menjalankan analisis.

## FR-002 Tempel massal

Kriteria penerimaan:
- Tombol "Tempel banyak (satu per baris)" membuka area tempel.
- "Pisahkan ke input" memecah isi per baris (`\r?\n`), memangkas spasi, dan membuang baris kosong.
- Baris mengisi kolom input yang kosong terlebih dahulu, lalu sisanya menambah kolom baru.
- Jika tidak ada baris, muncul "Tidak ada baris untuk ditambahkan." "Batal" mengosongkan dan menutup area tempel.

## FR-003 Mode penilaian

Pengguna memilih satu dari empat mode di kontrol segmen: Positif/Netral/Negatif (`sentiment3`), Biner (`binary`), Skala 1-5 (`scale5`, bertanda "eksperimental"), dan Preset / Template.

Kriteria penerimaan:
- `sentiment3`: pertanyaan `choice` dengan opsi `positive`, `neutral`, `negative`. `score = P(positive) - P(negative)`, rentang -1..1.
- `binary`: pertanyaan `noul`. `value = P(true)` = P(positif), `score = 2 * P(positif) - 1`, label `positive` jika P(positif) >= 0,5, selain itu `negative`.
- `scale5`: pertanyaan `score` dengan 5 level (0..4). `rating = level harapan + 1` (dibatasi 1..5), `score = (rating - 3) / 2`. Label `positive` jika rating >= 3,5, `negative` jika <= 2,5, selain itu `neutral`.
- Mode terakhir disimpan di `localStorage` (`sentiment.mode`) dan dipulihkan saat halaman dibuka.
- Mode tidak dikenal di API menghasilkan HTTP 400.

## FR-004 Rata-rata

Kriteria penerimaan:
- Respons `/api/score` menyertakan objek `average` dengan `count`, `score`, `value`, `confidence`, `label`, probabilitas rata-rata per opsi, dan `questions` rata-rata per pertanyaan.
- Label rata-rata: `sentiment3` (dan preset/custom yang menyertakan sentimen) memakai skor rata-rata > 0,15 positive, < -0,15 negative, selain itu neutral; `binary` memakai rata-rata P(positif) >= 0,5; `scale5` memakai rata-rata rating >= 3,5 / <= 2,5.
- Untuk pertanyaan `choice`, pemenang rata-rata adalah argmax dari probabilitas rata-rata.
- Jika preset/custom tidak menyertakan sentimen, field sentimen tingkat atas bernilai `null`.

## FR-005 Reset

Kriteria penerimaan:
- Tombol Reset meminta konfirmasi jika ada teks, hasil, atau isi tempel massal.
- Setelah konfirmasi: input kembali ke dua kolom kosong, hasil disembunyikan, tombol Export dinonaktifkan, area tempel ditutup, pesan galat dihapus, dan fokus ke Teks 1.
- Reset tidak mengubah mode, preset terpilih, atau model.

## FR-006 Ekspor Excel

Kriteria penerimaan:
- Tombol "Export ke Excel" aktif hanya jika ada hasil terakhir.
- Frontend mengirim respons `/api/score` terakhir apa adanya ke `POST /api/export`.
- File berisi sheet `Results`, `Summary`, dan `Detail` (format panjang: satu baris per opsi per pertanyaan per teks).
- Nama file: `sentiment-YYYYMMDD-HHmmss.xlsx` untuk mode sentimen, `preset-<nama>-<ts>.xlsx` untuk preset, `template-<id>-<ts>.xlsx` untuk custom (atau `template-custom-<ts>.xlsx` jika template belum disimpan).
- Body tanpa `results` atau dengan `results` kosong menghasilkan HTTP 400.

## FR-007 Pemilihan model

Kriteria penerimaan:
- Jika `models/` berisi lebih dari satu `*.gguf`, bilah status menampilkan dropdown berisi nama file dan ukurannya dalam MB. Jika hanya satu, nama model ditampilkan sebagai teks.
- Memilih model memanggil `POST /api/model`; server membalas 202 lalu menghentikan proses laya lama dan memuat model baru di latar belakang.
- Selama penggantian, tombol Analisis dan dropdown dinonaktifkan dan status menampilkan "Mengganti model…".
- Pilihan hanya tersimpan di memori; setelah restart server kembali ke pilihan bawaan ([16_CONFIG_REFERENCE.md](16_CONFIG_REFERENCE.md#laya_model)).
- Nama file yang bukan basename, mengandung `..`, atau tidak ada di `models/` ditolak dengan 400.

## FR-008 Preset Laya

Kriteria penerimaan:
- Mode Preset / Template menampilkan dropdown berisi "+ Template baru (kosong)", grup "Template tersimpan", dan grup "Preset Laya" (dari `GET /api/presets`).
- Preset dimuat ulang saat model siap atau setelah model berganti.
- Kotak centang "Sertakan sentimen" menambahkan pertanyaan `sentiment` (`sentiment3`) pada panggilan yang sama.
- Preset yang tidak diubah dikirim sebagai `mode: "preset"` dengan `preset`, `include_sentiment`, dan `extra_state`. Preset yang pertanyaan atau `state_key`-nya diubah dikirim sebagai `mode: "custom"` dengan template inline.
- Nama preset tidak dikenal menghasilkan 400.

## FR-009 CRUD template

Kriteria penerimaan:
- `GET /api/templates` mengembalikan ringkasan; template bawaan di urutan pertama, lalu diurutkan per judul.
- `POST /api/templates` membuat atau menimpa template. Tanpa `id`, id dibuat dari judul (slug) dan diberi akhiran `-2`, `-3`, dan seterusnya jika bentrok.
- Template bawaan tidak dapat ditimpa atau dihapus (409).
- Id tidak valid ditolak (400 untuk simpan; 404 untuk GET/DELETE).
- Validasi mengikuti aturan di [spesifikasi editor](specs/2026-09-28-preset-template-editor-design.md#aturan-validasi); pelanggaran menghasilkan 400 dengan pesan berbahasa Indonesia.
- UI: "Simpan template" pada template bawaan atau preset Laya meminta judul baru dan menyimpan sebagai salinan. "Hapus" hanya tampil untuk template non-bawaan dan meminta konfirmasi.

## FR-010 Editor template

Kriteria penerimaan:
- Tombol "Atur preset" membuka editor berisi Judul, `state_key`, Deskripsi, "Sertakan sentimen", field state tambahan, tab "Question builder" dan "Raw JSON", teks uji, serta tombol Uji, Simpan template, Salin JSON, Reset, dan Hapus.
- Builder: tambah (maksimal 32), hapus, naikkan, dan turunkan pertanyaan; ubah tipe (`choice`, `noul`, `score`); tambah/hapus opsi atau level (2..16).
- Validasi berjalan di setiap ketikan; isian tidak valid diberi tanda merah dengan pesan. Uji dan Analisis dinonaktifkan jika tidak valid; Simpan juga membutuhkan judul.
- Raw JSON berisi `state_key`, `extra_state`, `include_sentiment`, dan `questions`. "Terapkan JSON" memuatnya ke builder; berpindah ke tab builder dengan JSON yang diubah akan menerapkannya dahulu dan tetap di tab JSON jika JSON rusak.
- Penanda "• belum disimpan" muncul jika draft berbeda dari versi yang dimuat. Mengganti pilihan preset saat ada perubahan meminta konfirmasi.
- Reset mengembalikan draft ke versi yang dimuat (dengan konfirmasi jika ada perubahan).
- Salin JSON menyalin skema ke clipboard; jika gagal, tab Raw JSON dibuka dengan pesan.

## FR-011 Uji

Kriteria penerimaan:
- Kolom teks uji otomatis terisi teks input pertama saat editor dibuka jika masih kosong.
- Tombol Uji mengirim `POST /api/score` dengan `mode: "custom"` dan template dari draft saat ini (tersimpan atau belum).
- Hasil menampilkan model, jumlah token jika tersedia, latensi, badge sentimen (jika disertakan), dan blok per pertanyaan.
- Teks uji kosong atau draft tidak valid menampilkan pesan galat tanpa memanggil server.

## FR-012 Extra state

Kriteria penerimaan:
- Editor menyediakan daftar pasangan nama-nilai ("+ Field"), maksimal 32 field, nama 1..64 karakter, nilai maksimal 10000 karakter.
- Field yang sama dengan `state_key` ditolak di UI dan dihapus di server (teks input selalu menang).
- Untuk preset Laya, nilai contoh state preset ditampilkan sebagai placeholder dan nilai field dikosongkan, sehingga tidak ikut terkirim.
- Field bernilai string kosong tidak dikirim ke model ([ADR-007](11_DECISIONS.md#adr-007-field-extra-kosong-tidak-dikirim)).
- Setiap field terisi dikirim sama untuk setiap teks dan dicatat di sheet Summary sebagai "State tetap: <nama>".

## FR-013 Status server

Kriteria penerimaan:
- UI menanyakan `GET /api/status` setiap 1 detik saat belum siap atau sedang mengganti model, dan setiap 15 detik saat siap; jika server tidak terjangkau, dicoba lagi setiap 3 detik.
- Indikator: hijau (siap), kuning berdenyut (memuat), merah (galat). Chip menampilkan perangkat (misalnya `vulkan:1`).
- Tombol Analisis dinonaktifkan jika model belum siap.

## FR-014 Penanda hasil kedaluwarsa

Kriteria penerimaan:
- Hasil tetap tampil setelah mode, preset, isi template, atau model berubah, disertai catatan "Hasil ini dari ... Jalankan analisis lagi untuk memperbarui."

## FR-015 Benchmark model

Pengguna dapat menjalankan teks dan mode yang sama pada setiap model di `models/` secara berurutan untuk membandingkan hasil, kecepatan, dan kegagalan tiap model, lalu mengekspor perbandingannya ke Excel sebagai bahan laporan.

Kriteria penerimaan:
- `POST /api/benchmark` menerima body yang sama dengan `/api/score`, ditambah `models` (opsional, bawaan seluruh `*.gguf` dengan urutan yang sama seperti daftar model) dan `include_duplicates` (bawaan `false`). Galat validasi dikembalikan sebagai 400 JSON sebelum streaming dimulai.
- Respons berupa NDJSON yang dialirkan per peristiwa: `start`, `model_skipped`, `model_loading`, `model_loaded`, `model_scoring`, `model_result`, `model_error`, `done`. Objek `result` pada `model_result` identik dengan respons `/api/score`.
- Berkas dengan isi identik (md5) dilewati sebagai duplikat dari berkas pertama menurut urutan, kecuali `include_duplicates: true`.
- Model yang gagal dimuat (misalnya tidak memiliki metadata `ggmlc.graph_spec`) dilaporkan sebagai `model_error` tahap `load` tanpa percobaan ulang di CPU, dan benchmark berlanjut ke model berikutnya.
- Setelah selesai, gagal, atau dibatalkan, model awal dimuat kembali sebelum peristiwa `done` dikirim. Kegagalan memuat model awal dilaporkan di `done.error`.
- `POST /api/benchmark/cancel` dan terputusnya koneksi klien menghentikan benchmark setelah langkah yang sedang berjalan.
- Selama benchmark berjalan, `/api/score`, `/api/model`, dan `/api/benchmark` mengembalikan 409, sedangkan `/api/status` memuat progres pada field `benchmark`.
- `POST /api/benchmark/export` menghasilkan `benchmark-<mode>-YYYYMMDD-HHmmss.xlsx` dengan sheet `Ringkasan`, `Perbandingan`, dan satu sheet per model yang berhasil.

## Dokumen terkait

[01_PRD.md](01_PRD.md), [04_TRD.md](04_TRD.md), [12_TEST_STRATEGY.md](12_TEST_STRATEGY.md).
