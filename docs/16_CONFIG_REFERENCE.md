# Referensi Konfigurasi

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

Aplikasi tidak memakai berkas konfigurasi; seluruh pengaturan lewat variabel lingkungan. Tidak ada dukungan `.env`.

## Variabel lingkungan

| Variabel | Default | Dipakai oleh | Ringkasan |
| --- | --- | --- | --- |
| `PORT` | `3000` | `server.js` | Port server web |
| ~~`LAYA_PORT`~~ | (dihapus) | tidak dipakai | Dihapus sejak ADR-010; laya berjalan sebagai daemon stdio tanpa port |
| `LAYA_DEVICE` | `auto` (`cpu` untuk `presets:sync`) | `server.js`, `scripts/sync-presets.js` | Perangkat inferensi |
| `LAYA_MODEL` | tidak ada (pilih otomatis) | `server.js`, `scripts/sync-presets.js` | Berkas `.gguf` tertentu |
| `LAYA_RELEASE_URL` | URL rilis ggmlc v0.9.6 Vulkan | `scripts/setup.js` | Sumber zip binary laya |

Contoh PowerShell: `$env:LAYA_DEVICE='vulkan:1'; npm start`. Contoh bash: `PORT=3001 npm start`.

### PORT

- Default `3000`.
- Jika **tidak diset** dan port sibuk, server mencoba port berikutnya hingga 20 kali. Port aktual dicetak: `Buka http://localhost:<port>`.
- Jika **diset** dan port sibuk, server mencetak galat lalu keluar dengan kode 1.
- Server web mendengarkan di semua antarmuka (tanpa host eksplisit). Lihat risiko R-08 di [10_RISK_REGISTER.md](10_RISK_REGISTER.md).

### LAYA_PORT (dihapus)

- Dihapus pada 2026-09-29 ([ADR-010](11_DECISIONS.md#adr-010-laya-daemon-via-stdio-alih-alih-serve)). `server.js` menjalankan `laya.exe daemon` yang berkomunikasi lewat stdin/stdout dan tidak membuka port. Aplikasi hanya mendengarkan pada `PORT`.
- Jika masih diset, variabel ini diabaikan.
- `npm run presets:sync` memakai `laya serve` sementara pada port acak bebas di `127.0.0.1` yang dipilih OS, lalu menghentikannya; tidak ada variabel untuk port tersebut.

### LAYA_DEVICE

| Nilai | Perilaku |
| --- | --- |
| `auto` | Jalankan `laya info <model>`; jika ada lebih dari satu perangkat Vulkan, pilih yang pertama dengan `uma: 0` (GPU diskrit) sebagai `vulkan:N`. Jika tidak, teruskan `auto` ke laya. |
| `vulkan:0`, `vulkan:1`, ... | Perangkat Vulkan tertentu. |
| `cpu` | CPU saja. |

Jika laya crash pada perangkat selain `cpu`, server memuat ulang sekali dengan `cpu`.

### LAYA_MODEL

- Tidak ada default; tanpa variabel ini model dipilih otomatis dari `models/`.
- Nilai di-resolve relatif terhadap root proyek terlebih dahulu, lalu relatif terhadap `models/`. Jadi `LAYA_MODEL=models/laya_multilingual_f16.gguf` dan `LAYA_MODEL=laya_multilingual_f16.gguf` setara.
- Jika tidak ditemukan, server mencatat log lalu kembali ke pemilihan otomatis.
- Urutan pemilihan otomatis: nama berisi `q8_0` > `ud_q4_k_m` atau `q4_k_m` > `f16` > lainnya; seri diurutkan berdasarkan nama.
- Pilihan model lewat UI (`POST /api/model`) hanya disimpan di memori; restart kembali ke aturan di atas.

### LAYA_RELEASE_URL

- Default `https://github.com/monatis/ggmlc/releases/download/v0.9.6/laya-windows-x86_64-vulkan.zip`.
- Dipakai oleh `npm run setup` dan unduhan otomatis saat `npm start` jika `bin/laya.exe` belum ada. Lihat [scripts/README.md](../scripts/README.md).

## Konstanta di kode

Nilai berikut tidak dapat dikonfigurasi tanpa mengubah `server.js`.

| Konstanta | Nilai |
| --- | --- |
| `MAX_TEXTS` | 256 teks per permintaan `/api/score` |
| Batas body JSON | 20 MB |
| Polling folder `models/` | 5 detik |
| Menunggu baris ready daemon (`READY_TIMEOUT_MS`) | 10 menit |
| Timeout per permintaan daemon (`REQUEST_TIMEOUT_MS`) | 120 detik per teks |
| Snapshot preset (`PRESETS_FILE`) | `presets/laya-presets.json`, dibaca sekali saat boot |
| Timeout `laya info` | 120 detik |
| Ambang label rata-rata `sentiment3` | > 0,15 positif, < -0,15 negatif |
| Ambang label `scale5` | >= 3,5 positif, <= 2,5 negatif |
| `MAX_OPTS` | 16 |

## Skema JSON template

Berkas `templates/<id>.json`. Aturan validasi lengkap ada di [spesifikasi](specs/2026-09-28-preset-template-editor-design.md#aturan-validasi); contoh dan template bawaan di [templates/README.md](../templates/README.md).

| Field | Tipe | Wajib | Aturan |
| --- | --- | --- | --- |
| `id` | string | Tidak (dibuat dari judul) | `^[a-z0-9][a-z0-9-]{0,63}$`; sama dengan nama berkas |
| `title` | string | Ya | 1-120 karakter |
| `description` | string | Tidak | Maksimal 1000 karakter |
| `state_key` | string | Ya | 1-64 karakter |
| `extra_state` | object | Tidak | Maksimal 32 field; nilai string/number/boolean; string maksimal 10000 karakter; kunci sama dengan `state_key` dihapus |
| `include_sentiment` | boolean | Tidak | Default `true` kecuali `false` |
| `questions` | object | Ya | 1-32 entri; id `^[A-Za-z_][A-Za-z0-9_]{0,63}$` |
| `questions.<id>.type` | string | Ya | `choice`, `noul`, atau `score` |
| `questions.<id>.instructions` | string | Ya | 1-1000 karakter |
| `questions.<id>.criteria` | object/array | Ya untuk `choice`/`score` | Lihat tabel berikut |
| `builtin` | boolean | Diisi server | `false` untuk template yang disimpan lewat API |
| `updated_at` | string | Diisi server | ISO 8601 |

| Tipe | Bentuk `criteria` |
| --- | --- |
| `choice` | Objek `{opsi: deskripsi}`, 2-16 opsi, nama opsi 1-64 karakter, deskripsi string (boleh kosong) maksimal 1000 karakter |
| `noul` | Opsional. Jika ada: tepat `{"false": "...", "true": "..."}`, keduanya terisi atau keduanya kosong |
| `score` | Array 2-16 string tidak kosong, masing-masing maksimal 1000 karakter; indeks = level |
