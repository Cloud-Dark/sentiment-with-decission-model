# Glosarium

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

| Istilah | Definisi |
| --- | --- |
| act | Peluang model akan "bertindak" atas jawaban (`action.act_probability` dari laya). Ditampilkan sebagai kolom Act; bernilai 1 jika tidak dikirim. |
| average | Ringkasan rata-rata seluruh hasil dalam satu permintaan (`average` di respons `/api/score`): skor, label, nilai, confidence, probabilitas opsi, dan rata-rata per pertanyaan. |
| batch | Pemanggilan `/v1/decide/batch` laya untuk banyak state sekaligus (maksimal 256 teks). Lihat [ADR-004](11_DECISIONS.md#adr-004-endpoint-batch-dengan-fallback-per-teks). |
| binary | Mode sentimen ya/tidak berbasis `noul`: "apakah sentimen teks positif?". Skor = 2p - 1. |
| builtin | Penanda template bawaan (`"builtin": true`). Tidak dapat ditimpa atau dihapus lewat API (409). |
| choice | Tipe pertanyaan pilih satu dari 2-16 opsi. Jawaban memuat `choice`, `confidence`, dan `probabilities` per opsi. |
| confidence | Keyakinan model atas jawaban, dari laya (`confidence`). Jika tidak ada, diambil dari probabilitas tertinggi. |
| criteria | Deskripsi opsi (`choice`), deskripsi `false`/`true` (`noul`), atau daftar level (`score`) pada sebuah pertanyaan. |
| custom | Mode penilaian memakai template (tersimpan lewat `template_id` atau inline lewat `template`). |
| extra_state | Field tetap (misalnya `from`, `subject`) yang dikirim bersama setiap teks. Field bernilai `""` tidak dikirim. Lihat [ADR-006](11_DECISIONS.md#adr-006-extra_state-untuk-preset). |
| f16 | Varian model presisi penuh 16-bit (sekitar 650 MB). |
| ggmlc | Proyek penyedia binary `laya` (rilis GitHub `monatis/ggmlc`, versi v0.9.6 dipakai). |
| GGUF | Format berkas model untuk runtime berbasis ggml. Berkas `*.gguf` disimpan di `models/` dan tidak masuk git. |
| headline | Ringkasan satu baris jawaban pertanyaan: kunci pemenang (`choice`), `P(true)=0.xxxx` (`noul`), atau level harapan 4 desimal (`score`). |
| include_sentiment | Opsi menyertakan pertanyaan sentimen tiga kelas dengan id `sentiment` pada mode preset/custom. Bawaan `true` kecuali bernilai `false`. |
| instructions | Teks pertanyaan yang diberikan ke model (wajib, maksimal 1000 karakter). |
| label | Hasil kategori sentimen: `positive`, `neutral`, atau `negative`. |
| laya | Mesin keputusan yang menjalankan model Laya. Aplikasi memakainya sebagai proses anak `laya daemon` lewat stdin/stdout (JSON per baris, tanpa port); `laya serve` (API HTTP) hanya dipakai sementara oleh `npm run presets:sync`. |
| max_opts | Batas jumlah opsi per pertanyaan pada model, yaitu 16 (`MAX_OPTS`). |
| noul | Tipe pertanyaan ya/tidak. Jawaban `noul` berupa P(true). |
| preset | Kumpulan pertanyaan bawaan laya (`/v1/presets`), misalnya `email`. Dipakai lewat mode `preset`. |
| q8_0 | Kuantisasi 8-bit. Varian model yang direkomendasikan (sekitar 350 MB) dan prioritas pertama pemilihan otomatis. |
| scale5 | Mode sentimen skala 1-5 berbasis `score`. Eksperimental ([ADR-008](11_DECISIONS.md#adr-008-scale5-ditandai-eksperimental)). |
| score | (1) Tipe pertanyaan skala bertingkat; jawaban berupa level harapan 0..n-1. (2) Skor sentimen hasil dalam rentang -1..1. |
| sentiment3 | Mode bawaan: `choice` positif/netral/negatif. Skor = P(positif) - P(negatif). |
| state | Objek masukan untuk laya, misalnya `{"text": "..."}` atau `{"from": "...", "subject": "...", "body": "..."}`. |
| state_key | Nama field state yang diisi teks input (misalnya `text` atau `body`). Selalu menimpa field sama di `extra_state`. |
| Studio | Antarmuka web referensi Laya yang menjadi acuan tampilan editor dan hasil per pertanyaan. |
| switching | Status ketika model sedang diganti; permintaan penilaian dijawab 503. |
| template | Berkas `templates/<id>.json` berisi kumpulan pertanyaan, `state_key`, `extra_state`, dan `include_sentiment`. |
| uma | Penanda memori bersama pada log `ggml_vulkan` (`uma: 1` = iGPU, `uma: 0` = GPU diskrit). Dipakai untuk memilih perangkat. |
| ud_q4_k_m | Kuantisasi 4-bit K-quant (sekitar 520 MB). Prioritas kedua pemilihan otomatis. |
| Vulkan | API grafis dan komputasi lintas vendor yang dipakai build laya ini. Lihat [ADR-001](11_DECISIONS.md#adr-001-memakai-build-vulkan-laya). |
