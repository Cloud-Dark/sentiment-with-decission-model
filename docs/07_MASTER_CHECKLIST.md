# Master Checklist

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

Fase mengikuti [06_IMPLEMENTATION_PLAN.md](06_IMPLEMENTATION_PLAN.md).

## Fase 1: Aplikasi penilaian sentimen (`dcc4574`)

- [x] `package.json` dengan Express 5 dan ExcelJS, skrip `start` dan `setup`
- [x] `scripts/setup.js` mengunduh laya ggmlc v0.9.6 Vulkan ke `bin/`
- [x] Unduh otomatis binary saat boot jika belum ada
- [x] Pencarian model dengan urutan preferensi dan polling `models/` tiap 5 detik
- [x] Menunggu file model selesai disalin
- [x] Pemilihan GPU diskrit otomatis lewat `laya info`
- [x] Fallback port web dan port laya
- [x] Fallback ke CPU jika laya crash di GPU
- [x] Mode `sentiment3`, `binary`, `scale5`
- [x] Rata-rata dan label rata-rata per mode
- [x] Mode preset Laya dan opsi sertakan sentimen
- [x] Pemilih dan penggantian model tanpa restart
- [x] Ekspor Excel (Results, Summary, Detail)
- [x] UI: input dinamis, tempel massal, Reset, `Ctrl + Enter`, status model, mode gelap
- [x] `README.md`, `models/README.md`

## Fase 2: Editor preset dan template (`bf78ba9`)

- [x] API `GET/POST /api/templates`, `GET/DELETE /api/templates/:id`
- [x] Validasi template di server (400) dan perlindungan template bawaan (409)
- [x] Penulisan berkas template atomik
- [x] Empat template bawaan
- [x] Mode `custom` (template tersimpan dan inline)
- [x] `extra_state` untuk preset dan template; field kosong tidak dikirim
- [x] `GET /api/presets/:name`
- [x] Editor: builder, Raw JSON, Uji, Simpan, Salin JSON, Reset, Hapus
- [x] Validasi di UI yang mencerminkan aturan server
- [x] Penanda perubahan belum disimpan dan hasil kedaluwarsa
- [x] Ekspor hasil template
- [x] `templates/README.md`
- [x] UAT backend dan E2E ([UAT](uat/2026-09-28_preset-template-uat.md))

## Fase 3: Dokumentasi

- [x] Folder `docs/` sesuai konvensi penamaan
- [x] `public/README.md`, `scripts/README.md`
- [x] Header status pada `models/README.md` dan `templates/README.md`
- [ ] Review dan penetapan pemilik dokumen
- [ ] Commit dokumentasi

## Berikutnya

- [ ] Unit test parser, validasi, dan agregasi
- [ ] Tes integrasi API dengan mock laya
- [ ] Dataset evaluasi berlabel dan metrik akurasi
- [ ] Penyempurnaan wording template berdasarkan catatan UAT
- [ ] Kaji ulang `scale5`
- [ ] Opsi bind ke `127.0.0.1`
- [ ] Input CSV/XLSX
