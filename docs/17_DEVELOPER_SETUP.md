# Persiapan Lingkungan Pengembang

> Status: Draft
> Terakhir diperbarui: 2026-09-28
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

   Buka alamat yang dicetak di konsol (default `http://localhost:3000`). Muat model pertama dapat memakan waktu; status di UI berubah menjadi siap setelah health check laya berhasil.

## Menguji dengan port lain

Untuk menjalankan instance uji berdampingan dengan instance utama:

```powershell
$env:PORT='3100'; $env:LAYA_PORT='8189'; npm start
```

Tanpa `PORT`/`LAYA_PORT`, instance kedua otomatis memakai port bebas berikutnya. Lihat [16_CONFIG_REFERENCE.md](16_CONFIG_REFERENCE.md).

## Pemecahan masalah

| Gejala | Penyebab dan tindakan |
| --- | --- |
| Status menunggu model | Belum ada `*.gguf` di `models/` atau berkas masih disalin. |
| Inferensi lambat di laptop | Terpilih iGPU. Set `LAYA_DEVICE=vulkan:N` sesuai GPU diskrit (lihat log `[laya]`). |
| Laya crash di GPU | Server otomatis mencoba `cpu` sekali. Periksa driver Vulkan. |
| "Port ... sudah dipakai" dan server keluar | `PORT` diset eksplisit ke port yang sibuk. Ganti atau hapus variabelnya. |
| Status galat port laya | `LAYA_PORT` diset eksplisit ke port yang sibuk. |
| Unduhan laya gagal | Periksa koneksi, atau set `LAYA_RELEASE_URL` ke mirror. |

## Catatan

- Belum ada skrip `test` atau lint. Lihat [12_TEST_STRATEGY.md](12_TEST_STRATEGY.md).
- Log proses laya diteruskan ke konsol dengan prefiks `[laya]` (stdout) dan `[laya!]` (stderr).
- `bin/`, `models/*.gguf`, `node_modules/`, dan `*.log` diabaikan git.
