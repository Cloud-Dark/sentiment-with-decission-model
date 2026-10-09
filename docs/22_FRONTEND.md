# Frontend

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

Frontend adalah satu berkas `public/index.html` (HTML, CSS, JavaScript ES5 dalam satu IIFE) tanpa dependensi eksternal dan tanpa langkah build ([ADR-009](11_DECISIONS.md#adr-009-frontend-satu-berkas-offline)). Berkas disajikan statis oleh Express. Ringkasan per berkas ada di [public/README.md](../public/README.md); endpoint yang dipanggil di [21_BACKEND.md](21_BACKEND.md).

## Prinsip

- DOM dibangun dengan helper `el()` dan `textContent`; tidak ada `innerHTML` untuk data pengguna.
- Mode gelap mengikuti `prefers-color-scheme`; tata letak responsif dengan breakpoint 640 px.
- Semua teks antarmuka dalam Bahasa Indonesia.
- Validasi di editor mencerminkan [aturan validasi server](specs/2026-09-28-preset-template-editor-design.md#aturan-validasi); server tetap menjadi penentu akhir.

## Struktur UI

| Bagian | Elemen utama (id) | Fungsi |
| --- | --- | --- |
| Status model | `stDot`, `stModel`, `stModelSel`, `stDevice`, `stMsg` | Titik status, model aktif, pemilih model (jika ada beberapa GGUF), perangkat, pesan |
| Mode | `modeSeg`, `modeHint` | Pilihan `sentiment3`, `binary`, `scale5`, Preset / Template, beserta petunjuk |
| Preset | `presetBox`, `presetSel`, `btnEditor`, `inclSent` | Pilih template/preset, buka editor, sertakan sentimen |
| Editor | `editor` | Lihat bagian Editor |
| Input | `inCount`, `qsGrid`, `qsOwn`, `qsNote`, `btnQsUndo`, `tabBox`, `tabList`, `inputs`, `listPane`, `listText`, `btnAdd`, `btnSaveTpl`, `btnClearIn` | Template teks "Mulai cepat" (bawaan `SAMPLES` + milik pengguna), tab Per kotak / Daftar (satu teks per baris), penghitung teks, Kosongkan dengan Urungkan |
| Aksi | `btnAnalyze`, `btnReset`, `btnExport` | Analisis (`Ctrl + Enter`), reset, ekspor Excel |
| Galat | `err` | Pesan galat global |
| Hasil | `results`, `resMeta`, `stale`, `avgBox`, `rows` | Metadata, peringatan hasil kedaluwarsa, rata-rata, baris per teks |

## State utama (variabel dalam IIFE)

| Variabel | Isi |
| --- | --- |
| `mode` | Mode aktif (`sentiment3` / `binary` / `scale5` / `preset`) |
| `srv` | Respons `/api/status` terakhir |
| `presets`, `templates` | Katalog dari `/api/presets` dan `/api/templates` |
| `selKey` | Pilihan katalog: `t:<id>`, `p:<name>`, atau `new` |
| `includeSentiment` | Opsi sertakan sentimen |
| `cur` | Item yang dimuat: `{key, kind: 't' / 'p' / 'new', id, builtin}` |
| `draft`, `origDraft`, `origSig` | Model editor saat ini, versi saat dimuat, dan tanda tangannya |
| `lastResponse`, `lastReq` | Hasil analisis terakhir dan tanda tangan permintaannya |

## localStorage

Akses dibungkus `try/catch`; aplikasi tetap berjalan jika storage tidak tersedia.

| Kunci | Nilai | Catatan |
| --- | --- | --- |
| `sentiment.mode` | `sentiment3`, `binary`, `scale5`, `preset` | Nilai tidak dikenal kembali ke `sentiment3` |
| `sentiment.textTemplates` | Array `{ title, texts[] }` | Template teks milik pengguna dari "Simpan sebagai template". |
| `sentiment.preset` | `t:<id>`, `p:<name>`, `new` | Nilai lama berupa nama polos diberi prefiks `p:`. Dihapus saat template yang dipilih dihapus. |
| `sentiment.includeSentiment` | `'1'` / `'0'` | Selain `'0'` dianggap aktif |

## Polling status

| Kondisi | Interval |
| --- | --- |
| Model siap dan tidak sedang diganti | 15 detik |
| Memuat atau mengganti model | 1 detik |
| Galat jaringan | 3 detik |

Setelah memilih model di `stModelSel`, UI memanggil `POST /api/model` lalu polling 1 detik. Katalog preset dimuat ulang saat model berubah; jika laya belum siap, pemuatan dicoba ulang.

## Editor preset/template

- **Sumber**: template (`t:`), preset Laya (`p:`), atau template baru (`new`, berisi satu pertanyaan `choice` kosong).
- **Field meta**: `edTitle`, `edKey` (`state_key`), `edDesc`, `edIncl`, dan daftar `extra_state` (`edExtra`, `edAddExtra`).
- **Preset Laya**: contoh `state` dari laya (tanpa `state_key`) menjadi baris `extra_state` dengan nilai kosong; nilai contoh hanya tampil sebagai placeholder "mis. ..." ([ADR-006](11_DECISIONS.md#adr-006-extra_state-untuk-preset)).
- **Tab Builder** (`tabB`/`paneB`): kartu pertanyaan (`edQs`) dengan id, tipe, instruksi, dan kriteria; tombol naik/turun/hapus; `edAddQ` untuk menambah. `choice` minimal 2 opsi; `noul` dengan kotak centang deskripsi false/true; `score` minimal 2 level.
- **Tab Raw JSON** (`tabJ`/`paneJ`): `edJson` berisi `{state_key, extra_state, include_sentiment, questions}`; `edApplyJson` menerapkan setelah pemeriksaan tipe.
- **Uji** (`edTest`, `edRun`): memanggil `POST /api/score` mode `custom` dengan template inline untuk satu teks; hasil di `edOut`.
- **Simpan** (`edSave`): template kustom ditimpa dengan id yang sama; preset Laya dan template bawaan meminta judul baru lewat `prompt` (default "<judul> (salinan)") lalu disimpan sebagai template baru.
- **Salin JSON** (`edCopy`), **Reset** (`edReset`, dengan konfirmasi jika ada perubahan), **Hapus** (`edDel`, hanya template non-bawaan, dengan konfirmasi).
- **Validasi langsung**: isian yang salah ditandai kelas `invalid`; pesan per bagian. Uji dan Analisis ditolak selama ada galat.
- **Penanda perubahan**: `isDirty()` membandingkan tanda tangan draft dengan `origSig`.

## Pembentukan permintaan analisis

`requestBody(texts)`:

| Kondisi | Body |
| --- | --- |
| Mode sentimen | `{texts, mode}` |
| Preset Laya yang `state_key` dan `questions`-nya tidak diubah | `{texts, mode: "preset", preset, include_sentiment, extra_state}` |
| Selain itu (template, template baru, preset yang diubah) | `{texts, mode: "custom", template: <template inline>}`; `id` disertakan hanya untuk template tersimpan yang tidak diubah |

## Hasil kedaluwarsa

Setiap analisis menyimpan tanda tangan permintaan (body tanpa `texts`). Jika mode, template, atau model berubah setelah analisis, elemen `stale` menampilkan "Hasil ini dari ... Jalankan analisis lagi untuk memperbarui."

## Ekspor

`btnExport` mengirim `lastResponse` ke `POST /api/export` dan mengunduh berkas sesuai nama dari header `Content-Disposition`.

## Hasil verifikasi UI

Diuji di Chromium headless terhadap backend mock pada 2026-09-28: tanpa galat konsol, tanpa scroll horizontal pada lebar 375 px, dan mode gelap berfungsi ([UAT](uat/2026-09-28_preset-template-uat.md)).
