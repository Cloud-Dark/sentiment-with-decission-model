# Arsitektur

> Status: Draft
> Terakhir diperbarui: 2026-09-28
> Pemilik: _TBD_

## Ringkasan

Tiga proses/komponen berjalan di satu mesin: browser yang memuat `public/index.html`, server Node (`server.js`) yang menyajikan UI dan API `/api/*`, serta proses anak `laya.exe serve` yang memuat model GGUF dan menjalankan inferensi di GPU melalui Vulkan. Template disimpan sebagai berkas JSON; tidak ada basis data.

## Diagram komponen

```mermaid
flowchart LR
  subgraph Browser
    UI["public/index.html<br/>(UI satu berkas)"]
    LS[("localStorage")]
  end
  subgraph Node["Node.js: server.js"]
    EX["Express 5<br/>/api/*, static"]
    PM["Manajer proses laya<br/>boot, launch, switchModel"]
    SC["Penilaian<br/>parser + average"]
    TP["Template store"]
    XL["Ekspor ExcelJS"]
    ST["scripts/setup.js"]
  end
  subgraph Disk
    BIN[("bin/laya.exe + DLL")]
    MOD[("models/*.gguf")]
    TPL[("templates/*.json")]
  end
  LAYA["laya.exe serve<br/>127.0.0.1:LAYA_PORT"]
  GPU["GPU (Vulkan) / CPU"]
  GH["GitHub Releases ggmlc"]

  UI -- fetch JSON --> EX
  UI <--> LS
  EX --> SC --> LAYA
  EX --> TP --> TPL
  EX --> XL
  EX --> PM
  PM -- spawn / kill --> LAYA
  PM -- "laya info" --> BIN
  PM -- scan --> MOD
  ST -- unduh zip --> GH
  ST --> BIN
  LAYA --> MOD
  LAYA --> GPU
```

## Sekuens penilaian

```mermaid
sequenceDiagram
  participant U as Browser
  participant S as server.js
  participant L as laya serve
  U->>S: POST /api/score {texts, mode, ...}
  S->>S: validasi mode, template/preset, extra_state, teks (<=256)
  alt model belum siap / sedang ganti
    S-->>U: 503 {error, message, switching}
  end
  opt mode preset
    S->>L: GET /v1/presets (cache per model)
  end
  S->>L: POST /v1/decide/batch {states, questions}
  alt batch gagal atau bentuk tidak sesuai
    loop setiap teks
      S->>L: POST /v1/decide {state, questions}
    end
  end
  L-->>S: answers per state
  S->>S: parse (choice/noul/score) -> questions[], average
  S-->>U: 200 {mode, model, results, average, latency_ms, ...}
  U->>S: POST /api/export (respons di atas)
  S-->>U: .xlsx (Results, Summary, Detail)
```

## Sekuens penggantian model

```mermaid
sequenceDiagram
  participant U as Browser
  participant S as server.js
  participant L1 as laya (lama)
  participant L2 as laya (baru)
  U->>S: POST /api/model {file}
  S->>S: validasi file, gen++, switching=true
  S-->>U: 202 status
  S->>L1: kill (intentionalStop)
  alt tidak berhenti dalam 15 dtk
    S->>L1: taskkill /T /F
  end
  S->>S: tunggu port bebas (maks 20 x 250 ms)
  S->>S: resolveDevice (laya info bila auto)
  S->>L2: spawn serve model --port --device
  loop tiap 1 dtk, maks 10 menit
    S->>L2: GET /health
  end
  S->>S: ready=true, switching=false
  loop polling 1 dtk
    U->>S: GET /api/status
  end
  U->>S: GET /api/presets (muat ulang untuk model baru)
```

## Alur data

1. **Input**: teks dari kolom input dipangkas, yang kosong dibuang, lalu dikirim sebagai `texts[]`.
2. **State**: mode sentimen memakai state `{text: t}`. Mode preset/custom memakai `{...extra_state (tanpa nilai ""), [state_key]: t}`.
3. **Pertanyaan**: mode sentimen mengirim satu pertanyaan `sentiment`. Preset/custom mengirim pertanyaan template, ditambah `sentiment` (`sentiment3`) jika `include_sentiment`.
4. **Normalisasi**: jawaban laya diubah menjadi field sentimen tingkat atas (`label`, `score`, `value`, `confidence`, `act`, `options`) dan `questions[]` generik ([04_TRD.md](04_TRD.md#normalisasi-ke-bentuk-pertanyaan-generik)).
5. **Agregasi**: `average` dihitung dari semua hasil.
6. **Ekspor**: frontend mengirim balik respons utuh ke `/api/export`; server tidak menyimpan hasil.
7. **Persistensi**: hanya `templates/*.json` (server) dan beberapa kunci `localStorage` (browser). Pilihan model hanya di memori.

## Keputusan kunci

| Keputusan | ADR |
| --- | --- |
| Build Vulkan laya | [ADR-001](11_DECISIONS.md#adr-001-memakai-build-vulkan-laya) |
| GPU diskrit dipilih otomatis lewat `laya info` | [ADR-002](11_DECISIONS.md#adr-002-pemilihan-gpu-diskrit-otomatis-lewat-laya-info) |
| Fallback port dan `http.createServer` | [ADR-003](11_DECISIONS.md#adr-003-fallback-port-dan-httpcreateserver) |
| Endpoint batch dengan fallback per teks | [ADR-004](11_DECISIONS.md#adr-004-endpoint-batch-dengan-fallback-per-teks) |
| Template sebagai berkas JSON, bawaan hanya-baca | [ADR-005](11_DECISIONS.md#adr-005-template-sebagai-berkas-json-bawaan-hanya-baca) |
| `extra_state` untuk preset | [ADR-006](11_DECISIONS.md#adr-006-extra_state-untuk-preset) |
| Field extra kosong tidak dikirim | [ADR-007](11_DECISIONS.md#adr-007-field-extra-kosong-tidak-dikirim) |
| `scale5` eksperimental | [ADR-008](11_DECISIONS.md#adr-008-scale5-ditandai-eksperimental) |
| Frontend satu berkas offline | [ADR-009](11_DECISIONS.md#adr-009-frontend-satu-berkas-offline) |
