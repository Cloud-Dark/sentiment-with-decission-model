# Desain Editor Preset dan Template

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

Spesifikasi fitur yang diimplementasikan di commit `bf78ba9`. Rencana kerja: [plans/2026-09-28-preset-template-editor.md](../plans/2026-09-28-preset-template-editor.md). Hasil uji: [uat/2026-09-28_preset-template-uat.md](../uat/2026-09-28_preset-template-uat.md).

## Latar belakang

Sebelum fitur ini, mode preset hanya dapat menjalankan preset bawaan laya apa adanya, dan hanya mengirim `{[state_key]: teks}`. Pengguna tidak dapat menulis pertanyaan sendiri, dan hasil preset `email` berbeda jauh dari Studio karena `from`/`subject` tidak dikirim.

## Tujuan

1. Pengguna dapat menyusun kumpulan pertanyaan (`choice`, `noul`, `score`) dengan editor serupa Studio.
2. Template dapat diuji tanpa disimpan, lalu disimpan sebagai berkas JSON yang dapat dipakai ulang.
3. Field state tambahan (`extra_state`) dapat dikirim bersama setiap teks.
4. Hasil template dapat diekspor ke Excel seperti hasil preset.

Di luar lingkup: autentikasi, versi/riwayat template, berbagi template antar mesin, impor template dari berkas lewat UI.

## API

| Metode | Path | Ringkasan |
| --- | --- | --- |
| GET | `/api/templates` | Daftar ringkas, bawaan lebih dulu |
| GET | `/api/templates/:id` | Template lengkap; 404 jika tidak ada |
| POST | `/api/templates` | Buat/timpa; 400 validasi, 409 bawaan |
| DELETE | `/api/templates/:id` | 204; 404, 409 bawaan |
| GET | `/api/presets/:name` | Preset laya lengkap termasuk contoh `state` |
| POST | `/api/score` | Mode baru `custom` (`template` inline atau `template_id`); mode `preset` menerima `extra_state` |
| POST | `/api/export` | Mendukung `mode: "custom"`, nama berkas `template-<id|custom>-<ts>.xlsx` |

Contoh permintaan dan respons lengkap: [21_BACKEND.md](../21_BACKEND.md).

## Skema template

```json
{
  "id": "ulasan-produk",
  "title": "Ulasan produk",
  "description": "...",
  "state_key": "text",
  "extra_state": {},
  "include_sentiment": true,
  "questions": {
    "aspect": { "type": "choice", "instructions": "...", "criteria": { "kualitas": "...", "harga": "..." } },
    "complaint": { "type": "noul", "instructions": "...", "criteria": { "false": "...", "true": "..." } },
    "rating": { "type": "score", "instructions": "...", "criteria": ["...", "..."] }
  },
  "builtin": false,
  "updated_at": "2026-09-28T00:00:00.000Z"
}
```

Penyimpanan: satu berkas `templates/<id>.json`, dibaca ulang setiap permintaan, ditulis atomik ([ADR-005](../11_DECISIONS.md#adr-005-template-sebagai-berkas-json-bawaan-hanya-baca)). Tabel field: [16_CONFIG_REFERENCE.md](../16_CONFIG_REFERENCE.md#skema-json-template).

## Aturan validasi

Diterapkan di server (`validateTemplate` untuk CRUD, `validateQuestionSet` untuk CRUD dan `/api/score` mode `custom`). Pelanggaran menghasilkan HTTP 400 dengan pesan Bahasa Indonesia. UI menerapkan aturan yang sama sebelum mengirim.

| No | Aturan | Batas |
| --- | --- | --- |
| V-01 | Template berupa objek JSON | - |
| V-02 | `title` wajib (hanya CRUD) | 1-120 karakter setelah trim |
| V-03 | `description` berupa string | Maksimal 1000 karakter |
| V-04 | `id` (jika diberikan) | `^[a-z0-9][a-z0-9-]{0,63}$` |
| V-05 | `state_key` wajib | 1-64 karakter setelah trim |
| V-06 | `questions` berupa objek | 1-32 pertanyaan |
| V-07 | Id pertanyaan | `^[A-Za-z_][A-Za-z0-9_]{0,63}$` |
| V-08 | Id `sentiment` dilarang jika `include_sentiment` aktif | `include_sentiment` aktif kecuali bernilai `false` |
| V-09 | `type` | `choice`, `noul`, `score` |
| V-10 | `instructions` wajib | 1-1000 karakter |
| V-11 | `choice.criteria` berupa objek | 2-16 opsi (`MAX_OPTS`) |
| V-12 | Nama opsi `choice` | 1-64 karakter setelah trim, tanpa duplikat |
| V-13 | Deskripsi opsi `choice` | String atau `null` (dianggap kosong), maksimal 1000 karakter |
| V-14 | `noul.criteria` opsional | Jika ada: tepat kunci `false` dan `true` |
| V-15 | Deskripsi `noul` | Keduanya terisi atau keduanya kosong (keduanya kosong: `criteria` dibuang); maksimal 1000 karakter |
| V-16 | `score.criteria` berupa array | 2-16 string tidak kosong, masing-masing maksimal 1000 karakter |
| V-17 | `extra_state` berupa objek datar | Maksimal 32 field |
| V-18 | Nama field `extra_state` | 1-64 karakter setelah trim |
| V-19 | Nilai `extra_state` | string, number berhingga, atau boolean; string maksimal 10000 karakter |

Normalisasi setelah validasi:

- Kunci `extra_state` yang sama dengan `state_key` dihapus (teks input selalu menang).
- `builtin` dipaksa `false` dan `updated_at` diisi waktu server.
- Tanpa `id`: slug dari `title` (NFKD, tanpa diakritik, huruf kecil, non-alfanumerik menjadi `-`, maksimal 56 karakter, fallback `template`), ditambah `-2`, `-3`, ... jika sudah ada.
- Template dengan `builtin: true` tidak dapat ditimpa atau dihapus (409).

## Perilaku penilaian

- State per teks: `{...extra_state tanpa nilai "", [state_key]: teks}` ([ADR-007](../11_DECISIONS.md#adr-007-field-extra-kosong-tidak-dikirim)).
- Jika `include_sentiment` aktif, pertanyaan `sentiment3` ikut ditanyakan dengan id `sentiment` dalam panggilan yang sama.
- Keluaran `custom` sama dengan `preset`, ditambah `template_id` dan `template_title`.
- Preset Laya yang tidak diubah dikirim sebagai mode `preset`; preset yang diubah dikirim sebagai `custom` dengan template inline.
- Nilai contoh `state` preset Laya tidak dikirim otomatis ([ADR-006](../11_DECISIONS.md#adr-006-extra_state-untuk-preset)).

## State UI

| State | Tampilan |
| --- | --- |
| Belum memilih | Editor tertutup; Analisis mode preset menampilkan "Pilih preset atau template terlebih dahulu." |
| Memuat item | Editor menampilkan indikator memuat; jika laya belum siap, dicoba ulang tiap 1,5 detik |
| Gagal memuat | Pesan "Gagal memuat: ..." |
| Bersih | Draft sama dengan versi asli |
| Kotor | Ada perubahan belum disimpan (`isDirty()`) |
| Tidak valid | Isian ditandai merah; Uji, Simpan, dan Analisis ditolak dengan pesan |
| Sibuk | Uji/Simpan/Hapus berjalan; tombol dinonaktifkan |
| Hasil uji | Panel hasil dengan model, token (jika ada), dan latensi |
| Hasil kedaluwarsa | Hasil utama diberi peringatan jika template/mode/model berubah setelah analisis |

## Kasus tepi

| Kasus | Perilaku |
| --- | --- |
| Simpan template bawaan atau preset Laya | `prompt` judul baru (default "<judul> (salinan)"); disimpan sebagai template baru |
| Judul salinan kosong atau lebih dari 120 karakter | Ditolak di UI |
| Judul menghasilkan slug yang sudah ada | Server menambah akhiran `-2`, `-3`, ... |
| Id berisi path traversal (`../x`) | Gagal regex: 404 pada GET/DELETE, 400 pada POST |
| Menghapus template yang sudah terhapus | UI menerima 404 sebagai sukses |
| Berkas template diedit manual menjadi JSON rusak | Berkas diabaikan dalam daftar; GET 404 |
| `extra_state` berisi `state_key` | Field dibuang |
| Field `extra_state` bernilai `""` | Tidak dikirim ke laya |
| Id pertanyaan `sentiment` dengan `include_sentiment` aktif | 400 |
| Raw JSON dengan tipe pertanyaan tidak dikenal | Ditolak saat diterapkan |
| Model diganti saat editor terbuka | Katalog preset dimuat ulang; hasil lama diberi tanda kedaluwarsa |
| Lebih dari 256 teks | 400 |
