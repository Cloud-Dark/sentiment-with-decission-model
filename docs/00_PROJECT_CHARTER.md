# Project Charter

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

## Visi

Menyediakan alat lokal yang sederhana untuk menilai sentimen dan menjawab sekumpulan pertanyaan keputusan terhadap banyak teks sekaligus, memakai model Laya multilingual yang berjalan di GPU pengguna sendiri, tanpa layanan cloud, dan hasilnya dapat diekspor ke Excel.

## Latar belakang

Model Laya multilingual (GGUF, repositori Hugging Face `mys/laya-multilingual-GGUF`) menjawab pertanyaan bertipe `choice`, `noul`, dan `score` terhadap sebuah state. Binary `laya` dari ggmlc menyediakan server HTTP (`laya serve`). Proyek ini membungkus server tersebut dengan antarmuka web berbahasa Indonesia dan ekspor Excel. Perangkat sasaran awal adalah laptop Windows dengan GPU GTX 1650 (lihat [ADR-001](11_DECISIONS.md#adr-001-memakai-build-vulkan-laya)).

## Tujuan

1. Menilai sentimen banyak teks (maksimal 256 per permintaan) dalam tiga mode: `sentiment3`, `binary`, `scale5`.
2. Menjalankan preset Laya dan template pertanyaan buatan sendiri (mode `preset` dan `custom`).
3. Menyediakan editor template serupa Studio: question builder, Raw JSON, Uji, Simpan, Reset.
4. Mengekspor hasil ke `.xlsx` (sheet Results, Summary, Detail).
5. Berjalan sepenuhnya lokal dengan satu perintah `npm start`.

## Ruang lingkup

### Termasuk

- Backend Express yang mengelola proses anak `laya.exe serve`, termasuk unduh binary otomatis, pemilihan GPU diskrit, fallback port, fallback CPU, dan penggantian model.
- Frontend satu berkas `public/index.html`.
- CRUD template berbasis berkas `templates/*.json`, dengan empat template bawaan yang hanya-baca lewat API.
- Ekspor Excel untuk semua mode.

### Tidak termasuk

- Autentikasi, otorisasi, dan multi-pengguna. Aplikasi ditujukan hanya untuk penggunaan lokal.
- Deployment server atau cloud, kontainer, dan CI/CD.
- Pelatihan atau fine-tuning model.
- Build selain Windows x86_64 Vulkan (skrip mendukung `unzip` di non-Windows, tetapi URL bawaan hanya untuk Windows; dukungan platform lain `_TBD_`).
- Suite pengujian otomatis (belum ada; lihat [12_TEST_STRATEGY.md](12_TEST_STRATEGY.md)).

## Pemangku kepentingan

| Peran | Nama | Kepentingan |
| --- | --- | --- |
| Pemilik produk | _TBD_ | Arah fitur dan prioritas |
| Pengembang | Cloud Dark (penulis commit) | Implementasi dan pemeliharaan |
| Pengguna akhir | Analis data, tim layanan pelanggan, moderator konten (asumsi, `_TBD_`) | Menilai teks dan mengekspor hasil |
| Penyedia model | Pemelihara `mys/laya-multilingual-GGUF` dan ggmlc (eksternal) | Model dan binary |

## Kriteria keberhasilan

| Kriteria | Target | Status |
| --- | --- | --- |
| Aplikasi berjalan dengan `npm install` dan `npm start` di Windows dengan GPU Vulkan | Ya | Tercapai (diuji 2026-09-28) |
| Mode sentimen, preset, dan custom menghasilkan skor dan dapat diekspor | Ya | Tercapai ([UAT](uat/2026-09-28_preset-template-uat.md)) |
| CRUD template dengan validasi dan perlindungan template bawaan | Ya | Tercapai ([UAT](uat/2026-09-28_preset-template-uat.md)) |
| Latensi batch 10 teks di GPU diskrit | Sekitar 0,13 detik terukur di GTX 1650 (catatan di `server.js`) | Target formal `_TBD_` |
| Akurasi model per mode | `_TBD_` (belum ada dataset evaluasi) | Terbuka |

## Dokumen terkait

[01_PRD.md](01_PRD.md), [08_ROADMAP.md](08_ROADMAP.md), [10_RISK_REGISTER.md](10_RISK_REGISTER.md).
