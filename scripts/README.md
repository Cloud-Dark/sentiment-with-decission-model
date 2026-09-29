# scripts/

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

## setup.js

Mengunduh binary `laya` (ggmlc) ke folder `bin/` di root proyek.

```powershell
npm run setup                  # sama dengan: node scripts/setup.js
node scripts/setup.js --force  # unduh ulang walau binary sudah ada
```

| Item | Nilai |
| --- | --- |
| Sumber default | `https://github.com/monatis/ggmlc/releases/download/v0.9.6/laya-windows-x86_64-vulkan.zip` |
| Override | Env `LAYA_RELEASE_URL` ([16_CONFIG_REFERENCE.md](../docs/16_CONFIG_REFERENCE.md#laya_release_url)) |
| Tujuan | `bin/` (binary dan DLL pendukungnya) |
| Alasan build Vulkan | Binary CUDA prabangun hanya untuk sm80/86/89, sedangkan GPU sasaran (GTX 1650) sm75 ([ADR-001](../docs/11_DECISIONS.md#adr-001-memakai-build-vulkan-laya)) |

Langkah kerja:

1. Jika `EXE_PATH` sudah ada dan tanpa `--force`, lewati.
2. Unduh zip ke `bin/laya.zip` (memakai `fetch` bawaan Node 18+).
3. Ekstrak ke `bin/_extract` dengan PowerShell `Expand-Archive` (Windows) atau `unzip` (platform lain).
4. Cari `laya.exe` di hasil ekstrak, lalu pindahkan seluruh isi foldernya ke `bin/`.
5. Hapus `bin/laya.zip` dan `bin/_extract`.

Modul mengekspor `{ setup, EXE_PATH, BIN_DIR }`. `EXE_PATH` bernilai `bin/laya.exe` di Windows dan `bin/laya` di platform lain. `server.js` memakai `setup()` untuk mengunduh otomatis saat `npm start` jika `EXE_PATH` belum ada, dan memakai `EXE_PATH` untuk menjalankan `laya daemon` dan `laya info` dengan cwd `bin/`.

## sync-presets.js

Memperbarui snapshot preset bawaan laya di `presets/laya-presets.json`. `server.js` menjalankan `laya daemon`, yang tidak dapat menampilkan daftar preset, sehingga definisi preset dibaca dari snapshot ini ([ADR-010](../docs/11_DECISIONS.md#adr-010-laya-daemon-via-stdio-alih-alih-serve)).

```powershell
npm run presets:sync                                     # sama dengan: node scripts/sync-presets.js
node scripts/sync-presets.js laya_multilingual_f16.gguf  # model tertentu
```

| Item | Nilai |
| --- | --- |
| Kapan dijalankan | Setelah binary laya di-upgrade, atau jika snapshot hilang/rusak |
| Model | Argumen pertama atau `LAYA_MODEL`; default `*.gguf` di `models/` dengan urutan `q8_0` > `q4_k_m` > `f16` |
| Device | `LAYA_DEVICE`, default `cpu` (daftar preset tidak bergantung pada device) |
| Keluaran | `presets/laya-presets.json`, array persis dari `GET /v1/presets` (indentasi 2 spasi) |

Langkah kerja:

1. Minta port bebas acak di `127.0.0.1` dari OS.
2. Jalankan `laya serve <model> --port <port> --device <device>` dengan cwd `bin/`.
3. Tunggu `GET /health` berhasil (maksimal 10 menit), lalu ambil `GET /v1/presets`.
4. Validasi setiap preset (`name` string, `questions` objek), tulis berkas, dan cetak apakah isi berubah.
5. Hentikan hanya proses laya yang dijalankan skrip ini (`taskkill /PID <pid> /T /F` di Windows), juga saat gagal atau Ctrl+C.

Setelah dijalankan, periksa `git diff presets/` lalu commit perubahan snapshot.

## Catatan tentang bin/

- `bin/` dibuat oleh skrip ini dan **diabaikan git** (`.gitignore`). Jangan menaruh berkas lain atau dokumentasi di sana; isinya dapat ditimpa saat `--force`.
- Jika binary rusak atau versi perlu diganti, hapus `bin/` atau jalankan `--force`.
- Model tidak disimpan di `bin/`, melainkan di `models/` ([models/README.md](../models/README.md)).
