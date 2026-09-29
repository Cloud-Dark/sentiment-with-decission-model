# UAT Perbandingan Model GGUF

> Status: Final
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

## Tujuan

Membandingkan seluruh berkas model di `models/` dengan data uji yang sama: kemampuan dimuat, hasil per mode, dan latensi. Hasil dipakai untuk memilih model bawaan.

## Lingkungan

| Item | Nilai |
|---|---|
| Tanggal | 2026-09-29 |
| Mesin | Windows 11, GPU NVIDIA GeForce GTX 1650 Max-Q (Vulkan `vulkan:1`) |
| laya | ggmlc v0.9.6 build Vulkan |
| Server uji | `PORT=3800 LAYA_PORT=8990`, terpisah dari server pengguna |
| Metode | Ganti model lewat `POST /api/model`, satu permintaan pemanasan, lalu `POST /api/score` dengan 4 teks per mode |

## Data uji

| # | Teks |
|---|---|
| 1 | internet ku kok lambat ya ka |
| 2 | ini caranya gimana karena lambat banget |
| 3 | gatau deh |
| 4 | benerin segera ya |

Mode yang diuji: `sentiment3`, `binary`, `scale5`, dan `custom` dengan template `keluhan-pelanggan`.

## Skenario 1: Model dapat dimuat

| Berkas | Ukuran | Waktu muat | Status | Catatan |
|---|---|---|---|---|
| `laya_multilingual_f16.gguf` | 633 MB | 7,3 s | PASS | |
| `laya_multilingual_q8_0.gguf` | 345 MB | 5,2 s | PASS | |
| `laya_multilingual_ud_q4_k_m.gguf` | 500 MB | 5,2 s | PASS | |
| `laya_persian_multilingual_q8_0.gguf` | 345 MB | 4,1 s | PASS | Identik byte-per-byte dengan `laya_multilingual_q8_0.gguf` (MD5 `350e8fb9…`) |
| `laya_persian_multilingual_ud_q4_k_m.gguf` | 500 MB | 5,1 s | PASS | Identik byte-per-byte dengan `laya_multilingual_ud_q4_k_m.gguf` (MD5 `10a475b0…`) |
| `laya-multilingual-Q8_0.gguf` | 325 MB | — | FAIL | laya: `Missing 'ggmlc.graph_spec' metadata in GGUF file` |
| `laya-multilingual-Q4_K_M.gguf` | 237 MB | — | FAIL | Sama seperti di atas |

Dua berkas bernama tanda hubung bukan GGUF format ggmlc sehingga ditolak `laya.exe`. Server mencoba ulang di CPU, lalu melaporkan status gagal; aplikasi tetap berjalan dan model lain tetap dapat dipilih.

## Skenario 2: Sentimen tiga kelas (`sentiment3`)

Format: label (skor −1..1, confidence).

| # | f16 | q8_0 | ud_q4_k_m |
|---|---|---|---|
| 1 | Netral (−0,39; 0,38) | Negatif (−0,51; 0,36) | Negatif (−0,99; 0,94) |
| 2 | Netral (−0,17; 0,56) | Netral (−0,15; 0,59) | Negatif (−0,84; 0,60) |
| 3 | Netral (−0,47; 0,33) | Netral (−0,38; 0,35) | Negatif (−0,51; 0,33) |
| 4 | Negatif (−0,82; 0,54) | Negatif (−0,75; 0,45) | Negatif (−0,71; 0,41) |
| Rata-rata | −0,46 | −0,45 | −0,76 |
| Latensi 4 teks | 191 ms | 212 ms | 194 ms |

Hasil f16 sama persis dengan tangkapan layar UI pengguna (P(netral) teks 1 = 60,6%), sehingga jalur pengujian terverifikasi.

## Skenario 3: Mode lain

| Mode | f16 | q8_0 | ud_q4_k_m |
|---|---|---|---|
| `binary` rata-rata | −0,92 (semua Negatif) | −0,92 (semua Negatif) | −0,92 (semua Negatif) |
| `scale5` rata-rata | −0,44 | −0,45 | −0,55 |
| `custom` latensi | 547 ms | 603 ms | 544 ms |

Template `keluhan-pelanggan` (seragam di f16 dan q8_0):

| # | category | urgency | churn_risk | refund_requested | needs_reply | emotion |
|---|---|---|---|---|---|---|
| 1 | layanan | 2 | false | false | false | netral |
| 2 | layanan | 1 | false | false | false | kecewa |
| 3 | produk | 1 | false | false | false | kecewa |
| 4 | pengiriman | 1 | true | true | true | senang |

ud_q4_k_m berbeda pada emosi teks 1 (kecewa), teks 3 (netral), dan `refund_requested` teks 4 (false).

## Temuan

| ID | Temuan | Dampak |
|---|---|---|
| N-01 | f16 dan q8_0 menghasilkan label hampir sama; beda hanya teks 1 (skor −0,39 vs −0,51 di sekitar batas Netral/Negatif). | q8_0 setara f16 dengan ukuran setengahnya. |
| N-02 | ud_q4_k_m condong negatif: keempat teks Negatif, teks 1 dengan confidence 0,94. Berkasnya juga lebih besar (500 MB) dari q8_0. | Tidak ada keuntungan ukuran maupun akurasi. |
| N-03 | `binary` menandai semua teks Negatif di semua model, termasuk teks netral seperti "gatau deh". | Keterbatasan mode biner yang sudah tercatat di risk register. |
| N-04 | Template `keluhan-pelanggan` salah pada teks pendek: teks 4 "benerin segera ya" terbaca kategori pengiriman, emosi senang, urgensi rendah; teks 1–2 berupa pertanyaan ke CS tetapi `needs_reply` false. | Pertanyaan template perlu disetel ulang untuk pesan chat singkat. |
| N-05 | Latensi antar model praktis sama (±200 ms untuk 4 teks sentimen di GPU). | Pemilihan model tidak dipengaruhi kecepatan. |

## Rekomendasi

1. Model bawaan: `laya_multilingual_q8_0.gguf` (hasil setara f16, ukuran 345 MB). Gunakan f16 bila ingin fidelitas maksimum.
2. Hindari `ud_q4_k_m` untuk sentimen karena bias negatif.
3. Berkas duplikat (`laya_persian_*`) dan berkas non-ggmlc (`laya-multilingual-Q8_0.gguf`, `laya-multilingual-Q4_K_M.gguf`) dapat dihapus dari `models/` untuk menghemat sekitar 1,4 GB; keputusan ada pada pemilik proyek.
4. Tinjau ulang instruksi `urgency`, `needs_reply`, dan `emotion` pada template `keluhan-pelanggan` untuk pesan chat singkat.

## Kesimpulan

5 dari 7 berkas lolos; 2 berkas gagal dimuat karena bukan format ggmlc. Aplikasi menangani kegagalan tanpa crash.
