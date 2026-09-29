# Risk Register

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

Skala: Kemungkinan (K) dan Dampak (D) bernilai Rendah / Sedang / Tinggi. Pemilik risiko `_TBD_` kecuali disebut lain.

| ID | Risiko | K | D | Mitigasi saat ini | Tindak lanjut |
| --- | --- | --- | --- | --- | --- |
| R-01 | Akurasi model terbatas. `scale5` lemah: teks yang jelas positif cenderung dinilai sekitar 3,2-3,5. | Tinggi | Sedang | `scale5` diberi tanda eksperimental di UI; rubrik ditulis ulang agar teks faktual tidak jatuh ke level 0 ([ADR-008](11_DECISIONS.md#adr-008-scale5-ditandai-eksperimental)). | Dataset evaluasi; pertimbangkan menghapus atau mengganti mode. |
| R-02 | Mode `binary` tidak mengenal netral, sehingga teks netral/faktual dapat diberi label negatif (label `negative` jika P(positif) < 0,5). | Sedang | Sedang | Petunjuk mode menjelaskan nilai sebagai peluang positif; `sentiment3` tetap mode bawaan. | Dokumentasikan ke pengguna; pertimbangkan zona netral. |
| R-03 | Positif palsu pada moderasi: komentar hinaan dinilai `spam` 0,96 pada `moderasi-komentar` (UAT). | Sedang | Sedang | Kriteria `spam` sudah menyebut "insult from a reader" sebagai `false`. | Perbaiki wording; uji dengan dataset. |
| R-04 | Keterbatasan template lain dari UAT: `severity` maksimal sekitar 1,3; keluhan marah terbaca "kecewa"; `churn_risk` 0,24 pada keluhan yang relevan. | Sedang | Rendah | Dicatat di [UAT](uat/2026-09-28_preset-template-uat.md). | Iterasi wording kriteria. |
| R-05 | GPU/Vulkan tidak tersedia atau driver bermasalah. | Sedang | Tinggi | Jika laya crash di GPU, server memuat ulang sekali dengan `--device cpu`; `LAYA_DEVICE=cpu` dapat dipaksa. | Kinerja CPU belum diukur (`_TBD_`). |
| R-06 | `--device auto` bawaan laya memilih iGPU Intel (Vulkan 0), sekitar 18 kali lebih lambat (2,4 dtk vs 0,13 dtk untuk 10 teks). | Tinggi (laptop) | Sedang | `resolveDevice` memilih GPU diskrit pertama (`uma: 0`) lewat `laya info` ([ADR-002](11_DECISIONS.md#adr-002-pemilihan-gpu-diskrit-otomatis-lewat-laya-info)). | Jika parsing gagal, kembali ke `auto`; pengguna dapat set `LAYA_DEVICE=vulkan:N`. |
| R-07 | Konflik port web (3000 sudah dipakai, termasuk instance kedua aplikasi ini). Sejak [ADR-010](11_DECISIONS.md#adr-010-laya-daemon-via-stdio-alih-alih-serve) laya tidak membuka port, sehingga konflik port laya tidak ada lagi. | Sedang | Rendah | Fallback hingga 20 port jika `PORT` tidak diset ([ADR-003](11_DECISIONS.md#adr-003-fallback-port-dan-httpcreateserver)). | Jika `PORT` diset dan sibuk, server berhenti. |
| R-08 | Tidak ada autentikasi; server web mendengarkan di semua antarmuka jaringan, sehingga perangkat lain di jaringan dapat memanggil API termasuk menulis/menghapus template. | Sedang | Tinggi | Aplikasi dinyatakan hanya untuk penggunaan lokal. laya tidak membuka port (stdio). | Bind ke `127.0.0.1` secara default atau sediakan env host. |
| R-09 | Berkas model besar (sekitar 350-650 MB) dan `bin/` tidak ada di git (`.gitignore`: `bin/`, `models/*.gguf`). Klon baru tidak dapat langsung berjalan. | Tinggi | Sedang | Unduh laya otomatis; instruksi unduh model di `models/README.md`; server menunggu model muncul. | Skrip unduh model otomatis (`_TBD_`). |
| R-10 | Ketergantungan pada URL rilis eksternal GitHub ggmlc v0.9.6; rilis dapat hilang atau berubah. | Rendah | Tinggi | `LAYA_RELEASE_URL` dapat menimpa URL. | Pertimbangkan checksum dan mirror (`_TBD_`). |
| R-11 | Perubahan bentuk respons laya pada versi lain. | Rendah | Sedang | Parser defensif; protokol daemon (baris ready, `id`, `error`) diverifikasi pada v0.9.6. | Tes kontrak terhadap versi laya yang dipakai. |
| R-12 | Tidak ada suite pengujian otomatis; regresi hanya tertangkap lewat uji manual. | Tinggi | Sedang | Uji manual E2E dan smoke test curl ([12_TEST_STRATEGY.md](12_TEST_STRATEGY.md)). | Tambah unit dan tes integrasi. |
| R-13 | Hasil preset berbeda dari Studio jika `from`/`subject` tidak diisi (misalnya `is_spam` dan `is_phishing` turun ke 0,00). | Tinggi | Sedang | Editor menampilkan nilai contoh sebagai placeholder; deskripsi `email-triage` meminta mengisi `from`/`subject` ([ADR-006](11_DECISIONS.md#adr-006-extra_state-untuk-preset)). | Edukasi pengguna. |
| R-15 | Snapshot preset `presets/laya-presets.json` tertinggal (drift) dari preset bawaan laya setelah binary laya di-upgrade: preset baru tidak muncul, atau pertanyaan preset berbeda dari Studio. | Sedang | Sedang | Snapshot di-commit dan dapat diperbarui dengan `npm run presets:sync` ([ADR-010](11_DECISIONS.md#adr-010-laya-daemon-via-stdio-alih-alih-serve)). Penilaian preset memakai pertanyaan dari snapshot sehingga tetap konsisten dengan UI. | Jadikan `npm run presets:sync` langkah wajib saat upgrade laya ([17_DEVELOPER_SETUP.md](17_DEVELOPER_SETUP.md)); periksa diff snapshot. |
