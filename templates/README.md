# Template pertanyaan

> Status: Draft
> Terakhir diperbarui: 2026-09-29
> Pemilik: _TBD_

Folder ini berisi template untuk mode **custom** (editor preset di UI). Setiap template disimpan
sebagai satu file `<id>.json`. Nama file sama dengan `id`.

Template dapat dibuat, diubah, dan dihapus lewat UI atau API (`/api/templates`). File juga boleh
diedit manual. Server membaca ulang folder ini di setiap permintaan, jadi tidak perlu restart.

## Format

```json
{
  "id": "ulasan-produk",
  "title": "Ulasan produk",
  "description": "Penjelasan singkat untuk daftar template",
  "state_key": "text",
  "extra_state": { "from": "", "subject": "" },
  "include_sentiment": true,
  "questions": {
    "aspect": {
      "type": "choice",
      "instructions": "Which aspect does this review mainly talk about?",
      "criteria": { "kualitas": "product quality", "harga": "price", "lainnya": "" }
    },
    "complaint": {
      "type": "noul",
      "instructions": "Does the review contain a complaint?",
      "criteria": { "false": "no complaint", "true": "complains about something" }
    },
    "rating": {
      "type": "score",
      "instructions": "What star rating would the reviewer give?",
      "criteria": ["1 star: very bad", "2 stars: bad", "3 stars: mixed", "4 stars: good", "5 stars: excellent"]
    }
  },
  "builtin": false,
  "updated_at": "2026-09-28T00:00:00.000Z"
}
```

| Field | Keterangan |
| --- | --- |
| `id` | Slug: huruf kecil, angka, dan `-`, diawali huruf/angka, maksimal 64 karakter (`^[a-z0-9][a-z0-9-]{0,63}$`). Jika kosong saat disimpan, id dibuat dari judul. Jika id itu sudah dipakai, server menambahkan `-2`, `-3`, dan seterusnya. |
| `title`, `description` | Judul (wajib, maksimal 120 karakter) dan deskripsi (maksimal 1000 karakter). |
| `state_key` | Nama field yang diisi setiap teks input, misalnya `text` atau `body`. |
| `extra_state` | Field tetap yang ikut dikirim bersama setiap teks, misalnya `from` dan `subject` untuk email. Nilainya berupa teks, angka, atau boolean dalam objek datar. Field bernilai `""` tidak dikirim ke model. |
| `include_sentiment` | `true` berarti pertanyaan sentimen bawaan (positif/netral/negatif) ikut ditanyakan dengan id `sentiment`. |
| `questions` | Berisi 1 sampai 32 pertanyaan. Id pertanyaan memakai `^[A-Za-z_][A-Za-z0-9_]{0,63}$`. Id `sentiment` tidak boleh dipakai jika `include_sentiment` bernilai `true`. |
| `builtin` | Diisi oleh server. Template bawaan (`true`) tidak bisa ditimpa atau dihapus lewat API. Simpan salinannya dengan nama lain. |
| `updated_at` | Waktu terakhir disimpan (ISO 8601). Diisi oleh server. |

### Tipe pertanyaan

- **`choice`**: memilih satu opsi. `criteria` berupa objek `{opsi: deskripsi}` dengan 2 sampai 16
  opsi (batas model `max_opts` = 16). Deskripsi boleh kosong (`""`). Dalam hal ini model hanya
  memakai nama opsi.
- **`noul`**: ya/tidak. Hasilnya berupa P(true). `criteria` bersifat opsional. Jika diisi, harus tepat
  `{"false": "...", "true": "..."}`.
- **`score`**: skala bertingkat. `criteria` berupa daftar 2 sampai 16 deskripsi level, dimulai dari level 0.
  Hasilnya berupa level harapan (0 sampai n-1).

`instructions` wajib diisi, maksimal 1000 karakter. Model paling akurat jika instruksi dan kriteria
ditulis dalam bahasa Inggris. Bahasa Indonesia juga bisa. Teks yang dinilai boleh dalam bahasa apa saja.

## Template bawaan

| id | Isi |
| --- | --- |
| `ulasan-produk` | Sentimen, aspek (kualitas/harga/pengiriman/pelayanan/lainnya), `would_recommend`, `complaint`, dan `rating` bintang 1-5. |
| `keluhan-pelanggan` | Kategori, `urgency` (3 level), `churn_risk`, `refund_requested`, `needs_reply`, dan `emotion` (marah/kecewa/netral/senang). |
| `moderasi-komentar` | `toxic`, `harassment`, `hate`, `spam`, dan `severity` (3 level). |
| `percakapan-cs` | Transkrip chat pelanggan–agen (`state_key` = `transcript`; baris diawali `Pelanggan:` / `Agen:`). Sentimen, `intent` (8 kategori), `resolution_status`, `next_action`, `needs_escalation`, `urgency` (3 level), `agent_quality` (4 level), `churn_risk`, dan `final_emotion` (marah/kecewa/netral/puas). `extra_state` opsional: `channel`, `customer_tier`. |
| `percakapan-cs-sarkasme` | Gabungan `percakapan-cs` dan deteksi sarkasme pelanggan: semua pertanyaan `percakapan-cs` ditambah `sarcasm`, `real_attitude`, dan `would_buy_again`. |
| `sentimen-sarkasme` | Sentimen, `sarcasm` (pujian ironis), `real_attitude` (positif/campuran/negatif) dengan memperhitungkan sarkasme dan slang, serta `would_buy_again` (ya/tidak/tidak_jelas) sebagai sinyal pendukung karena sentimen dan `real_attitude` cenderung mengikuti kata pujian pada kalimat sarkas. `state_key` = `transcript`. |
| `email-triage` | Salinan preset `email` Laya. Isi `from`/`subject` di `extra_state` agar hasilnya lebih mirip Studio. |

## API

- `GET /api/templates`: daftar template, bawaan lebih dulu.
- `GET /api/templates/:id`: template lengkap.
- `POST /api/templates`: simpan template (buat baru atau timpa). Template bawaan mengembalikan 409.
- `DELETE /api/templates/:id`: hapus template. Template bawaan mengembalikan 409.
- `POST /api/score` dengan `{"mode":"custom","texts":[...],"template_id":"..."}` atau
  `{"mode":"custom","texts":[...],"template":{...}}` (template yang belum disimpan).
