# Rencana Implementasi Editor Preset dan Template

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

Rencana untuk [spesifikasi editor preset/template](../specs/2026-09-28-preset-template-editor-design.md). Rencana ini telah dieksekusi dan hasilnya di-commit sebagai `bf78ba9`.

## Konteks

- Basis: commit `dcc4574` (mode sentimen, mode preset Laya, ekspor Excel).
- Masalah: pertanyaan tidak dapat dikustomisasi; preset `email` tanpa `from`/`subject` memberi `is_spam`/`is_phishing` 0,00 dibanding 0,866/0,833 di Studio.
- Batasan: tanpa dependensi baru, tanpa basis data, frontend tetap satu berkas ES5, pesan Bahasa Indonesia.

## Langkah

1. **Validasi bersama di server**: `ValidationError`, `normalizeQuestion`, `normalizeExtraState`, `validateQuestionSet`, `validateTemplate`, konstanta batas (`MAX_OPTS`, `MAX_QUESTIONS`, dan lainnya).
2. **Penyimpanan template**: `templates/`, `readTemplate`, `writeTemplate` (atomik), `listTemplates`, `slugify`, `isTemplateId`.
3. **Endpoint CRUD**: `GET/POST /api/templates`, `GET/DELETE /api/templates/:id`, dengan 400/404/409/500.
4. **Mode `custom` di `/api/score`**: template inline atau `template_id`; `scorePreset` menerima `extra_state` dan membuang nilai `""`; respons menambah `template_id`, `template_title`, `extra_state`.
5. **`extra_state` untuk mode `preset`** dan `GET /api/presets/:name`.
6. **Ekspor**: nama berkas `template-<id|custom>-<ts>.xlsx`; baris "State tetap" di Summary.
7. **Template bawaan**: `ulasan-produk`, `keluhan-pelanggan`, `moderasi-komentar`, `email-triage` dengan `builtin: true`.
8. **Frontend katalog**: `presetSel` dengan grup template dan preset; kunci `t:`/`p:`/`new`; migrasi nilai localStorage lama.
9. **Frontend editor**: builder, Raw JSON, validasi langsung, Uji, Simpan (salinan untuk bawaan/preset), Salin JSON, Reset, Hapus, penanda perubahan.
10. **Pembentukan permintaan**: `requestBody` memilih `preset` atau `custom`; penanda hasil kedaluwarsa.
11. **Dokumentasi**: `templates/README.md`.
12. **Uji**: smoke test API dengan curl, E2E terhadap model nyata, UI di Chromium headless dengan mock ([UAT](../uat/2026-09-28_preset-template-uat.md)).

## Berkas yang disentuh

| Berkas | Perubahan |
| --- | --- |
| `server.js` | Validasi, penyimpanan template, endpoint baru, mode `custom`, `extra_state`, ekspor |
| `public/index.html` | Katalog, editor, pembentukan permintaan, hasil kedaluwarsa |
| `templates/*.json` | Empat template bawaan (baru) |
| `templates/README.md` | Baru |

Total 7 berkas, 1550 baris ditambah dan 88 dihapus (`git show --stat bf78ba9`).

## Risiko

| Risiko | Mitigasi |
| --- | --- |
| Aturan validasi UI dan server tidak selaras | Satu daftar aturan di spesifikasi; UAT mencakup 11 kasus validasi |
| Path traversal lewat id template | Regex id sebelum akses berkas |
| Template bawaan tertimpa | 409 di server; UI menawarkan salinan |
| Hasil berbeda dari Studio | `extra_state` dan dokumentasi ([ADR-006](../11_DECISIONS.md#adr-006-extra_state-untuk-preset)) |
| Wording template bawaan kurang akurat | Dicatat sebagai keterbatasan di UAT; iterasi berikutnya ([08_ROADMAP.md](../08_ROADMAP.md)) |
| Regresi mode sentimen | Uji regresi `sentiment3` |
