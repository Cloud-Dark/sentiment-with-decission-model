# Persiapan Lingkungan Pengembang

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

## Prasyarat

| Kebutuhan | Keterangan |
| --- | --- |
| OS | Windows x86_64 (binary laya yang diunduh adalah build Windows). Platform lain `_TBD_`: `setup.js` mendukung `unzip`, tetapi URL default tetap zip Windows. |
| Node.js | `>=18` (memakai `fetch` bawaan). Diuji dengan v24.18.0. |
| GPU | Opsional. Driver dengan dukungan Vulkan untuk akselerasi; tanpa GPU gunakan `LAYA_DEVICE=cpu`. |
| Ruang disk | Sekitar 350-650 MB per berkas model, ditambah binary laya. |
| Jaringan | Untuk mengunduh binary laya dan model (sekali). |
| Python + `huggingface_hub[cli]` | Opsional, untuk mengunduh model lewat CLI. |

## Langkah

1. **Pasang dependensi**

   ```powershell
   npm install
   ```

2. **Unduh binary laya** (opsional; `npm start` mengunduh otomatis jika `bin/laya.exe` belum ada)

   ```powershell
   npm run setup
   # unduh ulang paksa:
   node scripts/setup.js --force
   ```

   Rincian: [scripts/README.md](../scripts/README.md).

3. **Unduh model** ke `models/` (rincian di [models/README.md](../models/README.md))

   ```powershell
   pip install -U "huggingface_hub[cli]"
   huggingface-cli download mys/laya-multilingual-GGUF laya_multilingual_q8_0.gguf --local-dir models
   ```

   Model boleh ditaruh setelah server berjalan; folder dicek tiap 5 detik dan server menunggu ukuran berkas stabil.

4. **Jalankan server**

   ```powershell
   npm start
   ```

   Buka alamat yang dicetak di konsol (default `http://localhost:3000`). Muat model pertama dapat memakan waktu; status di UI berubah menjadi siap setelah daemon laya menulis baris ready. Aplikasi hanya membuka satu port (web); laya berjalan sebagai `laya.exe daemon` lewat stdin/stdout tanpa port ([ADR-010](11_DECISIONS.md#adr-010-laya-daemon-via-stdio-alih-alih-serve)).

## Menguji dengan port lain

Untuk menjalankan instance uji berdampingan dengan instance utama:

```powershell
$env:PORT='3100'; npm start
```

Tanpa `PORT`, instance kedua otomatis memakai port bebas berikutnya. laya tidak membuka port, sehingga tidak ada bentrok port laya (`LAYA_PORT` sudah dihapus). Lihat [16_CONFIG_REFERENCE.md](16_CONFIG_REFERENCE.md).

## Pemecahan masalah

| Gejala | Penyebab dan tindakan |
| --- | --- |
| Status menunggu model | Belum ada `*.gguf` di `models/` atau berkas masih disalin. |
| Inferensi lambat di laptop | Terpilih iGPU. Set `LAYA_DEVICE=vulkan:N` sesuai GPU diskrit (lihat log `[laya!]`). |
| Laya crash di GPU | Server otomatis mencoba `cpu` sekali. Periksa driver Vulkan. |
| "Port ... sudah dipakai" dan server keluar | `PORT` diset eksplisit ke port yang sibuk. Ganti atau hapus variabelnya. |
| Preset baru dari laya tidak muncul | Snapshot `presets/laya-presets.json` belum diperbarui. Jalankan `npm run presets:sync`. |
| Galat `Gagal memuat preset: ...` | Snapshot hilang atau rusak. Jalankan `npm run presets:sync` atau pulihkan dari git. |
| Unduhan laya gagal | Periksa koneksi, atau set `LAYA_RELEASE_URL` ke mirror. |

## Catatan

- Belum ada skrip `test` atau lint. Lihat [12_TEST_STRATEGY.md](12_TEST_STRATEGY.md).
- Log proses laya (stderr) diteruskan ke konsol dengan prefiks `[laya!]`. stdout daemon adalah kanal protokol JSON; hanya baris non-JSON atau tanpa pasangan yang dicatat dengan prefiks `[laya]`.

## Upgrade laya

Setelah mengganti binary laya (misalnya `node scripts/setup.js --force` dengan `LAYA_RELEASE_URL` baru):

1. Jalankan `npm run presets:sync` untuk memperbarui `presets/laya-presets.json` ([scripts/README.md](../scripts/README.md#sync-presetsjs)).
2. Periksa `git diff presets/` dan commit jika ada perubahan.
3. Pastikan protokol daemon masih sama (baris ready, `id`, `error`); lihat [04_TRD.md](04_TRD.md#integrasi-laya-daemon).
- `bin/`, `models/*.gguf`, `node_modules/`, dan `*.log` diabaikan git.
