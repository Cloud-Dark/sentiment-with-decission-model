# models/

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

Taruh **satu** file GGUF Laya multilingual di folder ini (dari
[mys/laya-multilingual-GGUF](https://huggingface.co/mys/laya-multilingual-GGUF)):

| File | Ukuran kira-kira | Catatan |
| :--- | ---: | :--- |
| `laya_multilingual_q8_0.gguf` | ~350 MB | Direkomendasikan (akurasi ≈ f16) |
| `laya_multilingual_ud_q4_k_m.gguf` | ~520 MB | Kuantisasi 4-bit |
| `laya_multilingual_f16.gguf` | ~650 MB | Presisi penuh |

Jika ada beberapa file, server memilih dengan urutan: `q8_0` > `ud_q4_k_m` > `f16`.
Bisa juga dipaksa lewat env `LAYA_MODEL=models/<nama-file>.gguf`.

Unduh dengan huggingface-cli:

```powershell
pip install -U "huggingface_hub[cli]"
huggingface-cli download mys/laya-multilingual-GGUF laya_multilingual_q8_0.gguf --local-dir models
```

Server mengecek folder ini tiap 5 detik, jadi file bisa ditaruh saat server sudah berjalan.
File `*.gguf` diabaikan oleh git.
