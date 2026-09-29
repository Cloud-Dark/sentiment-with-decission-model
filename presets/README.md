# presets/

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

Folder ini menyimpan snapshot definisi preset bawaan laya.

| Berkas | Isi |
| --- | --- |
| `laya-presets.json` | Array persis dari `GET /v1/presets` `laya serve` (ggmlc v0.9.6): 10 preset (`email`, `triage`, `guard`, `moderation`, `router`, `expense`, `security`, `invoice`, `customer_service`, `harness`). |

## Alasan

`server.js` menjalankan `laya daemon` lewat stdin/stdout tanpa port. Daemon tidak dapat menampilkan daftar preset, sehingga daftar dan pertanyaan preset dibaca dari snapshot ini sekali saat boot. Saat menilai mode preset, server mengirim `questions` eksplisit dari snapshot ke daemon. Lihat [ADR-010](../docs/11_DECISIONS.md#adr-010-laya-daemon-via-stdio-alih-alih-serve).

## Memperbarui

Setelah laya di-upgrade, jalankan:

```powershell
npm run presets:sync
```

Skrip menjalankan `laya serve` sementara pada port acak di `127.0.0.1`, mengambil `/v1/presets`, menulis ulang berkas, lalu menghentikan proses tersebut. Detail di [scripts/README.md](../scripts/README.md#sync-presetsjs). Periksa `git diff presets/` lalu commit.

Jangan mengedit `laya-presets.json` secara manual; perubahan akan tertimpa saat sinkronisasi. Risiko snapshot tertinggal dari versi laya dicatat sebagai R-15 di [10_RISK_REGISTER.md](../docs/10_RISK_REGISTER.md).
