# Standar Rilis

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

## Pesan commit

Repositori memakai [Conventional Commits](https://www.conventionalcommits.org/), seperti pada commit yang ada:

```
feat: sentiment scoring app on Laya multilingual decision model
feat: preset editor with reusable question templates
```

Format:

```
<tipe>: <ringkasan dalam bahasa Inggris, huruf kecil, tanpa titik>

- butir perubahan
- butir perubahan

Co-Authored-By: <nama> <email>   (jika ada)
```

| Tipe | Pemakaian |
| --- | --- |
| `feat` | Fitur baru (dipakai di kedua commit saat ini) |
| `fix` | Perbaikan bug |
| `docs` | Dokumentasi saja |
| `refactor` | Perubahan kode tanpa perubahan perilaku |
| `test` | Menambah atau memperbaiki tes |
| `chore` | Pemeliharaan (dependensi, konfigurasi) |

Scope (`feat(editor): ...`) belum dipakai; opsional. Bahasa isi commit mengikuti yang ada (Inggris).

## Changelog

- Setiap perubahan yang terlihat pengguna dicatat di [31_CHANGELOG.md](../31_CHANGELOG.md) bagian `Unreleased`, dengan kategori Keep a Changelog: Added, Changed, Deprecated, Removed, Fixed, Security.
- Saat rilis, `Unreleased` dipindah ke judul versi beserta tanggal.

## Versi

- `package.json` versi `1.0.0`, `private: true`; belum ada tag git maupun proses rilis (`_TBD_`).
- Jika rilis diberlakukan, gunakan Semantic Versioning dan tag `vX.Y.Z`.

## Daftar periksa sebelum rilis

- [ ] Smoke test API dan uji E2E manual sesuai [12_TEST_STRATEGY.md](../12_TEST_STRATEGY.md)
- [ ] UAT untuk fitur baru dicatat di `docs/uat/`
- [ ] Changelog diperbarui
- [ ] Dokumen terkait (backend, frontend, konfigurasi) diperbarui
- [ ] Tidak ada berkas `bin/`, `*.gguf`, atau `*.log` yang ikut ter-commit
