# Architecture Decision Records

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

Setiap ADR berstatus **Diterima** dan tercermin di kode pada commit `dcc4574` atau `bf78ba9`, kecuali disebut lain.

## ADR-001: Memakai build Vulkan laya

- **Konteks**: Perangkat sasaran adalah Windows dengan GTX 1650 (compute capability sm75). Binary CUDA prabangun ggmlc hanya mencakup sm80/86/89 (komentar di `scripts/setup.js`). Build CPU Windows tidak dipakai sebagai jalur utama (ketersediaannya di rilis ggmlc `_TBD_`).
- **Keputusan**: Unduh `laya-windows-x86_64-vulkan.zip` dari rilis ggmlc v0.9.6. URL dapat ditimpa dengan `LAYA_RELEASE_URL`.
- **Konsekuensi**: Berjalan di GPU NVIDIA, AMD, maupun Intel yang mendukung Vulkan. Build Vulkan juga menerima `--device cpu`, yang dipakai sebagai fallback. Membutuhkan driver Vulkan.

## ADR-002: Pemilihan GPU diskrit otomatis lewat `laya info`

- **Konteks**: `--device auto` pada laya memilih Vulkan device 0, yang pada laptop sering iGPU. Terukur: Intel UHD sekitar 2,4 detik vs GTX 1650 sekitar 0,13 detik untuk batch 10 teks.
- **Keputusan**: Untuk `LAYA_DEVICE=auto`, jalankan `laya.exe info <model>`, parse baris `ggml_vulkan: N = <nama> | uma: X`, dan pilih perangkat pertama dengan `uma: 0` jika ada lebih dari satu perangkat. Selain itu biarkan `auto`.
- **Konsekuensi**: Tambahan satu proses singkat saat boot dan setiap penggantian model. Bergantung pada format log ggml; jika berubah, fallback ke `auto`.

## ADR-003: Fallback port dan `http.createServer`

- **Konteks**: Port 3000 atau 8089 dapat sudah dipakai, termasuk oleh instance kedua aplikasi ini. Di Express 5, `app.listen()` meneruskan galat listen ke callback yang hanya dipanggil sekali, sehingga mencoba port berikutnya tidak berfungsi.
- **Keputusan**: Pakai `http.createServer(app)` dengan handler `error`. Jika `EADDRINUSE` dan `PORT` tidak diset, coba port berikutnya hingga 20 kali. Untuk laya, periksa port dengan koneksi TCP (`isPortFree`) dan naikkan hingga 20 kali jika `LAYA_PORT` tidak diset.
- **Konsekuensi**: Aplikasi dapat berjalan berdampingan tanpa konfigurasi. Port aktual dicetak di konsol ("Buka http://localhost:<port>"). Port eksplisit yang sibuk dianggap galat.
- **Revisi 2026-09-29**: Bagian laya (`isPortFree`, `LAYA_PORT`) dihapus oleh [ADR-010](#adr-010-laya-daemon-via-stdio-alih-alih-serve). Fallback port kini hanya berlaku untuk port web.

## ADR-004: Endpoint batch dengan fallback per teks

- **Konteks**: `/v1/decide/batch` jauh lebih efisien, tetapi bentuk responsnya diverifikasi dari `server.cpp` laya dan dapat berbeda di versi lain.
- **Keputusan**: Coba batch terlebih dahulu (timeout 10 menit). Jika gagal, jumlah hasil tidak sama, atau ada hasil tanpa `answers`, catat log lalu panggil `/v1/decide` per teks secara berurutan.
- **Konsekuensi**: Tangguh terhadap perbedaan versi; jalur fallback lebih lambat. Galat yang sebenarnya dari laya (misalnya 422) dapat memicu fallback yang juga gagal, sehingga pesan akhir berasal dari panggilan per teks.
- **Status 2026-09-29**: Digantikan oleh [ADR-010](#adr-010-laya-daemon-via-stdio-alih-alih-serve). Daemon tidak memiliki batch; semua teks dikirim satu per satu.

## ADR-005: Template sebagai berkas JSON, bawaan hanya-baca

- **Konteks**: Perlu penyimpanan template yang sederhana, dapat diedit manual, dan dapat dilacak git, tanpa basis data.
- **Keputusan**: Satu berkas `templates/<id>.json` per template; id dari nama berkas; folder dibaca ulang tiap permintaan; penulisan atomik lewat berkas sementara lalu rename. Template dengan `"builtin": true` tidak dapat ditimpa atau dihapus lewat API (409); UI menawarkan simpan sebagai salinan.
- **Konsekuensi**: Tidak perlu restart setelah edit manual. Tidak ada penguncian bersamaan; penulisan terakhir menang. Template bawaan tetap dapat diubah langsung di disk.

## ADR-006: `extra_state` untuk preset

- **Konteks**: Preset Laya membawa contoh state (misalnya preset `email` dengan `from`, `subject`, `body`). Studio mengirim state lengkap, sedangkan aplikasi ini awalnya hanya mengirim `{[state_key]: teks}`. Pada contoh Studio, tanpa `from`/`subject`, `is_spam` dan `is_phishing` turun dari 0,866/0,833 ke 0,00.
- **Keputusan**: Sediakan `extra_state`: field tetap yang dikirim bersama setiap teks. Untuk preset Laya, nilai contoh state hanya ditampilkan sebagai placeholder dan tidak dikirim otomatis, karena nilai contoh tidak berlaku untuk teks pengguna. `state_key` selalu diisi teks input dan menimpa field yang sama.
- **Konsekuensi**: Angka berbeda dari Studio kecuali pengguna mengisi field terkait. Template `email-triage` menyediakan `from`/`subject` kosong sebagai pengingat.

## ADR-007: Field extra kosong tidak dikirim

- **Konteks**: Template seperti `email-triage` memiliki field placeholder bernilai `""`. Mengirim string kosong dapat memengaruhi jawaban model.
- **Keputusan**: Di `scorePreset`, field `extra_state` bernilai `""` dibuang sebelum dikirim ke laya. Field tetap tersimpan di template.
- **Konsekuensi**: Template dapat menyimpan slot field tanpa memengaruhi hasil. Nilai `0` atau `false` tetap dikirim.

## ADR-008: `scale5` ditandai eksperimental

- **Konteks**: Pada model multilingual, rubrik singkat ("very negative", "neutral") mendorong teks faktual ke level 0. Setelah rubrik ditulis ulang, teks yang jelas positif tetap cenderung dinilai sekitar 3,2-3,5.
- **Keputusan**: Pertahankan mode dengan rubrik deskriptif, tetapi beri tanda "eksperimental" di UI dan petunjuk yang menjelaskan kecenderungan tersebut. Label memakai ambang >= 3,5 positif dan <= 2,5 negatif.
- **Konsekuensi**: Pengguna diarahkan ke `sentiment3`. Kaji ulang tercatat di [roadmap](08_ROADMAP.md).

## ADR-009: Frontend satu berkas offline

- **Konteks**: Aplikasi lokal, pengguna tidak selalu daring, dan tidak ingin ada langkah build.
- **Keputusan**: Seluruh UI (HTML, CSS, JavaScript ES5) berada di `public/index.html`, tanpa CDN, font, atau library eksternal. Ikon favicon berupa data URI. DOM dibangun lewat `textContent`.
- **Konsekuensi**: Tidak ada dependensi frontend dan tidak ada build. Berkas besar sehingga lebih sulit dipelihara; tidak ada modul atau tes unit frontend.
- **Revisi 2026-09-29**: Tampilan mengadopsi gaya "Editorial Brutalism / Operator's Desk" dan memuat font Bricolage Grotesque, Hanken Grotesk, dan JetBrains Mono dari Google Fonts. Saat luring, halaman tetap berfungsi dengan font sistem sebagai fallback; tidak ada library JavaScript eksternal.

## ADR-010: laya daemon via stdio alih-alih serve

- **Status**: Diterima (2026-09-29, belum di-commit saat ditulis).
- **Konteks**: Aplikasi sebelumnya membuka dua port: port web (bawaan 3000, sering 3001 karena fallback) dan port `laya serve` (bawaan 8089, sering 8090). Pengguna tidak menginginkan dua port. ggmlc v0.9.6 menyediakan `laya.exe daemon <gguf> --device X` yang menerima permintaan JSON per baris lewat stdin dan menulis jawaban JSON per baris ke stdout, tanpa membuka port.
- **Keputusan**:
  - `server.js` menjalankan `laya.exe daemon` dan berkomunikasi lewat stdio. Kesiapan ditandai baris `{"status":"ready"}`. Permintaan diberi `id` angka dan dicocokkan dengan `String(id)`; antrean per proses menjaga satu permintaan berjalan, dengan timeout per permintaan dan penolakan semua permintaan tertunda saat proses berhenti.
  - `LAYA_PORT`, pemeriksaan port laya (`isPortFree`), dan polling `/health` dihapus. Fallback CPU, pemilihan GPU lewat `laya info`, dan penggantian model tetap sama.
  - Karena daemon tidak dapat menampilkan daftar preset, definisi preset (`GET /v1/presets`) disimpan sebagai snapshot `presets/laya-presets.json` yang di-commit dan dibaca saat boot. Skrip `npm run presets:sync` (`scripts/sync-presets.js`) memperbaruinya dengan menjalankan `laya serve` sementara pada port acak bebas di `127.0.0.1`, lalu menghentikannya.
  - Penilaian preset mengirim `questions` eksplisit dari snapshot (bukan field `preset` daemon) agar `extra_state` dan `include_sentiment` tetap berperilaku sama.
- **Konsekuensi**:
  - Aplikasi hanya membuka satu port (web). Proses laya tidak memiliki soket TCP. Jika server Node mati paksa, daemon keluar sendiri karena stdin-nya tertutup.
  - Tidak ada batch: teks dinilai berurutan. Terukur pada GTX 1650 (`vulkan:1`, `q8_0`, `sentiment3`): 4 teks 171-172 ms (UAT batch sebelumnya 191-212 ms; batch `serve` diukur ulang 172 ms), 50 teks 2,1-3,2 detik (batch `serve` diukur ulang 2,1-3,0 detik). Tidak ada regresi berarti pada ukuran ini.
  - Snapshot preset dapat tertinggal dari versi laya. Setelah upgrade laya, jalankan `npm run presets:sync` dan periksa diff ([R-15](10_RISK_REGISTER.md)).
  - `usage` per permintaan dijumlahkan dan kini dikembalikan pada respons `/api/score`.
- **Alternatif yang ditolak**:
  - Tetap memakai `laya serve` yang diikat ke `127.0.0.1`: port kedua tetap ada, tetap dapat bentrok dengan instance lain, dan tidak memenuhi permintaan pengguna.
  - `laya serve` pada port efemeral (port 0/acak): port kedua tetap terbuka walau berubah-ubah, masih perlu deteksi port dan polling `/health`, serta menyulitkan diagnosis.
