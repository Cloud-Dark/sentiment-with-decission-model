# Sentiment Scoring dengan Decision Model (Laya)

Aplikasi web untuk menilai sentimen teks (positive / neutral / negative) memakai model
[Laya multilingual](https://huggingface.co/mys/laya-multilingual-GGUF) yang dijalankan lokal oleh
`laya.exe` dari [ggmlc](https://github.com/monatis/ggmlc) (backend Vulkan, jalan di GPU seperti GTX 1650).
Hasil bisa diekspor ke Excel (.xlsx).

## Setup

1. **Install dependency**
   ```powershell
   npm install
   ```
2. **Unduh binary laya** (opsional, `npm start` juga otomatis mengunduh kalau `bin/laya.exe` belum ada):
   ```powershell
   npm run setup
   ```
3. **Taruh model** `.gguf` di folder `models/` (lihat [models/README.md](models/README.md)):
   ```powershell
   huggingface-cli download mys/laya-multilingual-GGUF laya_multilingual_q8_0.gguf --local-dir models
   ```
4. **Jalankan**
   ```powershell
   npm start
   ```
5. Buka **http://localhost:3000**

Model boleh ditaruh setelah server jalan; server mengecek `models/` tiap 5 detik.

## Environment variable

| Variabel | Default | Keterangan |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port web app |
| `LAYA_PORT` | `8089` | Port internal `laya.exe serve` |
| `LAYA_DEVICE` | `auto` | `auto` (pilih GPU diskrit/NVIDIA otomatis), `vulkan:0`, `vulkan:1`, `cpu` |
| `LAYA_MODEL` | – | Path file `.gguf` tertentu (default: pilih otomatis q8_0 > ud_q4_k_m > f16) |

Contoh PowerShell: `$env:LAYA_DEVICE='vulkan:1'; npm start`

Jika laya crash di GPU, server otomatis mencoba sekali lagi dengan `--device cpu`.

## API

- `GET /api/status` → `{ready, model, device, message}`
- `POST /api/score` body `{"texts": ["..."]}` (maks 256) → hasil per teks + rata-rata.
  `score = P(positive) − P(negative)` (−1..1). Label rata-rata: `> 0.15` positive, `< −0.15` negative, selain itu neutral.
- `POST /api/export` body = respons `/api/score` → file `sentiment-YYYYMMDD-HHmmss.xlsx`
