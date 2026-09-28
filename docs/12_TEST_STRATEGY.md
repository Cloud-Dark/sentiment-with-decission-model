# Strategi Pengujian

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

## Kondisi saat ini

- Belum ada suite pengujian otomatis. `package.json` tidak memiliki skrip `test` maupun lint.
- Pengujian dilakukan secara manual: smoke test API dengan `curl` dan uji E2E lewat browser.
- Hasil uji terakhir tercatat di [UAT editor preset/template](uat/2026-09-28_preset-template-uat.md).

## Lingkungan uji

| Item | Nilai |
| --- | --- |
| OS | Windows 11 |
| Node.js | v24.18.0 (minimum `>=18`) |
| laya | ggmlc v0.9.6, build Vulkan |
| GPU | GTX 1650 (diskrit) dan Intel UHD (iGPU) |
| Model | `laya_multilingual_q8_0.gguf`, `laya_multilingual_ud_q4_k_m.gguf` |
| Browser | Chromium headless (terhadap backend mock) dan browser desktop |

## Smoke test API (curl)

Jalankan `npm start`, tunggu `GET /api/status` mengembalikan `"ready": true`, lalu jalankan perintah di bawah. Port disesuaikan dengan keluaran konsol ("Buka http://localhost:<port>"). Contoh di bawah memakai sintaks bash (Git Bash); di PowerShell gunakan `curl.exe` dan escape tanda kutip.

```bash
# Status
curl -s http://localhost:3000/api/status

# Mode bawaan (sentiment3)
curl -s -X POST http://localhost:3000/api/score -H "Content-Type: application/json" \
  -d '{"texts":["Produknya bagus sekali","Pengiriman lambat dan barang rusak"]}'

# Mode binary dan scale5
curl -s -X POST http://localhost:3000/api/score -H "Content-Type: application/json" \
  -d '{"mode":"binary","texts":["Pelayanan ramah"]}'

# Preset Laya dengan extra_state
curl -s -X POST http://localhost:3000/api/score -H "Content-Type: application/json" \
  -d '{"mode":"preset","preset":"email","include_sentiment":false,"extra_state":{"from":"a@b.com","subject":"Invoice"},"texts":["..."]}'

# Template tersimpan
curl -s -X POST http://localhost:3000/api/score -H "Content-Type: application/json" \
  -d '{"mode":"custom","template_id":"ulasan-produk","texts":["Barangnya bagus, pengiriman cepat"]}'

# CRUD template
curl -s http://localhost:3000/api/templates
curl -s -X POST http://localhost:3000/api/templates -H "Content-Type: application/json" -d @template.json
curl -s -X DELETE -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/templates/<id>

# Ekspor (body = respons /api/score)
curl -s -X POST http://localhost:3000/api/export -H "Content-Type: application/json" \
  -d @hasil.json -o hasil.xlsx -D -
```

Hal yang diperiksa:

| Area | Ekspektasi |
| --- | --- |
| `/api/status` | `ready`, `model`, `device`, `message`, `switching`, `models[]` terisi |
| `/api/score` | `results[]` sejumlah teks valid, `average`, `latency_ms`; kode 400 untuk body tidak valid |
| CRUD template | 200 untuk buat/timpa, 204 untuk hapus, 409 untuk template bawaan, 400/404 untuk id tidak valid |
| Validasi | Setiap pelanggaran [aturan validasi](specs/2026-09-28-preset-template-editor-design.md#aturan-validasi) mengembalikan 400 dengan pesan Bahasa Indonesia |
| `/api/export` | 200, `Content-Disposition` berisi nama berkas sesuai mode |

## Uji E2E manual (UI)

1. Muat halaman; titik status berubah dari memuat ke siap.
2. Isi beberapa teks, tekan **Analisis** (atau `Ctrl + Enter`); periksa baris hasil dan rata-rata.
3. Ganti mode `sentiment3` / `binary` / `scale5` / preset.
4. Buka editor; muat template bawaan, ubah, **Uji**, **Simpan** (bawaan menawarkan salinan), **Hapus** template kustom.
5. Tab Raw JSON: terapkan JSON tidak valid, pastikan pesan galat muncul.
6. Ekspor ke Excel dan buka berkasnya.
7. Periksa lebar 375 px (tanpa scroll horizontal), mode gelap, dan konsol browser bebas galat.
8. Regresi: mode `sentiment3` tetap menghasilkan label dan skor seperti sebelum fitur template.

## Uji model dan perangkat

- Ganti model lewat pemilih model; status harus melewati `switching` lalu siap kembali.
- `LAYA_DEVICE=cpu` dan `LAYA_DEVICE=vulkan:N` dijalankan manual bila perlu.
- Konflik port: jalankan dua instance; instance kedua harus memakai port berikutnya.

## Rencana otomatisasi

Belum dijadwalkan (`_TBD_`). Usulan:

| Lapisan | Cakupan | Catatan |
| --- | --- | --- |
| Unit | `parseChoice`, `parseNoul`, `parseScore`, `genericQuestion`, `buildAverage`, `validateQuestionSet`, `validateTemplate`, `slugify` | Membutuhkan ekspor fungsi dari `server.js` (perubahan kode, di luar lingkup dokumen ini) |
| Integrasi | Endpoint `/api/*` dengan server laya tiruan | Tanpa GPU, cocok untuk CI |
| Evaluasi model | Dataset berlabel per mode dan per template | Mengukur akurasi, bukan kebenaran kode |

Runner dan framework uji belum dipilih (`_TBD_`).
