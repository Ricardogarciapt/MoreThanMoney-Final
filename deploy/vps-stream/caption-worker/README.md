# Legendas ao vivo (closed captions) — trabalhador do VPS

Produz legendas traduzidas em tempo real para as sessões LMS. Corre **no VPS de streaming**
(`stream.morethanmoney.pt`), ao lado do SRS/nginx.

## Como funciona

```
OBS → (Restream) → VPS/SRS → HLS local (http://127.0.0.1:8080/live/<key>.m3u8)
                                   │
                caption-manager.js ├─ sonda o site: que sessões estão live + captions_enabled
                                   └─ arranca 1 caption-worker por sessão:
                                        ffmpeg capta áudio (WAV 16k mono, segmentos ~5s)
                                        → OpenAI gpt-4o-transcribe (idioma de origem)
                                        → POST /api/live-sessions/streams/<id>/captions/ingest
                                             (o site traduz com Claude + grava o cue)
                                   ↓
web (Supabase Realtime)  ·  iOS/Android (polling GET /captions)  → overlay + seletor de idioma
```

Só funciona para sessões com **ingest HLS no VPS** (não para YouTube-embed — não há áudio para captar).

## Requisitos

- Node 18+ (usa `fetch`/`FormData`/`Blob` globais)
- `ffmpeg` no PATH (`apt install ffmpeg`)

## Variáveis de ambiente

| Var | Descrição |
|-----|-----------|
| `MTM_API_BASE` | `https://www.morethanmoney.pt` |
| `LMS_CAPTION_WORKER_SECRET` | segredo partilhado com o site (mesmo valor na Vercel) |
| `OPENAI_API_KEY` | chave OpenAI (transcrição) |
| `CAPTION_SEGMENT_SECONDS` | opcional, default `5` |
| `CAPTION_ASR_MODEL` | opcional, default `gpt-4o-transcribe` |
| `CAPTION_POLL_SECONDS` | opcional (manager), default `15` |

> No site (Vercel) define também `LMS_CAPTION_WORKER_SECRET` (o mesmo) e, se quiseres um modelo
> de tradução diferente, `CAPTIONS_MODEL` (default `claude-haiku-4-5-20251001`).

## Instalar (systemd)

```bash
# no VPS, como root
mkdir -p /opt/mtm-captions && cd /opt/mtm-captions
# copiar caption-worker.js e caption-manager.js para aqui
cp /etc/mtm-captions.env.example /etc/mtm-captions.env   # e preencher os segredos
cp mtm-captions.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mtm-captions
journalctl -u mtm-captions -f     # ver legendas a serem produzidas
```

## Ligar legendas numa sessão

Basta a sessão estar **live** e ter `captions_enabled = true` em `lms_streams`
(pelo admin/studio, ou `update lms_streams set captions_enabled = true where id = '<uuid>';`).
O idioma de origem sai de `caption_source_language` (senão do idioma do educador, senão `pt`).

## Testar um worker isolado

```bash
STREAM_ID=<uuid> STREAM_KEY=<key> SOURCE_LANG=pt \
MTM_API_BASE=https://www.morethanmoney.pt \
LMS_CAPTION_WORKER_SECRET=... OPENAI_API_KEY=... \
node caption-worker.js
```
