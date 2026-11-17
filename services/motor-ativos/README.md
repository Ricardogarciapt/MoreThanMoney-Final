# Motor de ativos MTM (o nosso Higgsfield)

Gera imagens, vídeos, voz e o clone do Ricardo a falar com modelos abertos, numa GPU nossa (alugada à
hora). Substitui o Higgsfield como o Studify substituiu as apps pagas. Base: workflows do
[open-higgsfield](https://github.com/pyoonpyoon/open-higgsfield) (MIT, commit `ccaf07b`, cópia em `workflows/`).

| Tipo | O que faz | Modelos (licença) |
|---|---|---|
| `cena` | foto + prompt → a mesma pessoa noutro cenário (ex.: estúdio de podcast) | Qwen-Image-Edit 2511 + Lightning (Apache-2.0) |
| `angulo` | foto → outro ângulo/distância (8 azimutes × 4 elevações × 3 distâncias) | + Multiple-Angles LoRA (Apache-2.0) |
| `mover` | imagem → clipe 9:16 de 2 a 8 s com movimento de câmara (15 movimentos) | LTX-2 19B + LoRAs de câmara (LTX-2 Community License) |
| `voz` | texto → voz clonada do Ricardo em PT | Chatterbox Multilingual (MIT); recurso Fish Audio |
| `falar` | imagem ou take + texto/áudio → clone a falar, lábios sincronizados (até 15 s) | voz + LTX-2 estático + LatentSync 1.6 (Apache-2.0) |

A LTX-2 Community License é gratuita para empresas abaixo de 10 M$ de receita anual.

## Contrato da API (para o /estudio, os reels diários e quem mais pedir)

Autenticação: sessão de quem tem a área «ativos» ou «editor» do estúdio, **ou** `Authorization: Bearer CRON_SECRET` (servidores, ex. GitHub Action dos reels).

### `POST /api/estudio/geracao`
```json
{
  "tipo": "mover",                 // cena | angulo | mover | voz | falar
  "ativo_id": "uuid",              // imagem/vídeo de referência em estudio_ativos (estado 'pronto')
  "imagem_url": "https://…",       // OU uma imagem pública (em vez de ativo_id)
  "prompt": "o Ricardo num estúdio de podcast, luz quente",   // cena (obrigatório), mover/falar (acção)
  "texto": "O que o clone diz.",   // voz (obrigatório), falar (ou audio_ativo_id)
  "audio_ativo_id": "uuid",        // falar: áudio já gravado em vez de texto
  "aspecto": "9:16",               // 9:16 (omissão) | 1:1 | 4:5 | 16:9
  "duracao_s": 5,                  // mover 2–8 (omissão 5) · falar até 15 (manda o áudio)
  "movimento": "dolly-in",         // static dolly-in dolly-out dolly-left dolly-right jib-up jib-down dolly-zoom orbit-left orbit-right pan-left pan-right tilt-up tilt-down handheld
  "azimute": "front-right", "elevacao": "eye", "distancia": "medium",   // angulo
  "seed": 123,                     // opcional, para repetir um resultado
  "marca": "ricardo-garcia",       // ou morethanmoney
  "origem": "reels-diarios",       // quem pediu (só para relatório)
  "ensaio": false                  // true → pronto na hora com um clipe de teste, sem GPU
}
```
Resposta: `{ ok, id, estado: "fila"|"pronto", motor_online, url? }` (`url` só no ensaio).

### `GET /api/estudio/geracao?id=…`
`{ id, tipo, estado, url, ativo_id, erro, criado_em, terminado_em, segundos_gpu, motor_online }`
- `estado`: `fila` → `a_gerar` → `pronto` | `erro` | `cancelado`.
- `url`: URL assinado de 24 h da saída (PNG, MP4 ou WAV). No ensaio, `https://www.morethanmoney.pt/estudio/ensaio-9x16.mp4`.
- `ativo_id`: a saída já é um ativo normal do /estudio (biblioteca «Ativos»), pronto a ligar a um guião.

### `GET /api/estudio/geracao` → `{ motor_online, motores[], tipos, recentes[30] }`
### `DELETE /api/estudio/geracao?id=…` → cancela um pedido ainda na fila.

**Regra para clientes automáticos (reels diários):** se `motor_online` for `false`, ou o pedido não
ficar `pronto` dentro do vosso prazo, caiam no visual de hoje (foto). O pedido fica na fila e é gerado
quando a GPU ligar; não o repitam.

## Worker (`worker.py`) e máquina GPU

O worker só fala com `/api/estudio/motor/geracao` (GET reclama + pulso; POST fecha). Os pedidos presos
20 min voltam à fila; à 3.ª falha ficam em `erro`.

Numa máquina acabada de alugar (Ubuntu + CUDA, 48 GB de VRAM ou mais, ~150 GB de disco):
```bash
git clone --depth 1 https://github.com/Ricardogarciapt/MoreThanMoney-Final /workspace/mtm
cd /workspace/mtm/services/motor-ativos
PERFIL=completo MTM_MOTOR_SECRET='<CRON_SECRET>' VOZ_REF_URL='<URL assinado do WAV da voz>' bash bootstrap.sh
tail -f /workspace/logs/worker.log
```
Perfis: `imagem` (~60 GB de pesos), `video` (~110 GB), `completo` (+ voz e lábios). Com menos de 48 GB:
`ANGLE_VARIANTE=gguf`. Parar: `bash arrancar.sh parar`.

### RunPod (recomendado): tudo pela API, sem painel
```bash
export RUNPOD_API_KEY=…  MTM_MOTOR_SECRET='<CRON_SECRET>'  VOZ_REF_URL='<URL assinado do WAV>'   # opcional
python3 services/motor-ativos/runpod.py criar --ensaio   # mostra o que vai criar
python3 services/motor-ativos/runpod.py criar            # disco 200 GB (EU-RO-1) + pod L40S → 6000 Ada → A6000
```
No fim põe `RUNPOD_POD_ID` e `RUNPOD_API_KEY` na Vercel (Production). Daí em diante:
pedido novo e nenhum motor online → o site liga o pod → o pod actualiza o código, corre o
`bootstrap.sh` (só descarrega o que falta no disco) e o worker → 10 min sem trabalho → `runpodctl stop pod`.
O 1.º arranque demora 30–60 min (≈112 GB de pesos); os seguintes ~3–5 min.
`runpod.py estado|ligar|parar|apagar` para gerir à mão.

Sem GPU (provar o ciclo, ex. na VPS): `MOTOR_MODO=ensaio MTM_MOTOR_SECRET=… python3 worker.py --uma-vez`.

Testes (sem GPU, com um site e um ComfyUI falsos): `python3 services/motor-ativos/test_worker.py`
e `npx tsx --test lib/estudio/geracao.test.ts`.

## Base de dados
Migração `supabase/migrations/265_estudio_geracoes.sql`: tabelas `estudio_geracoes` (fila) e
`estudio_motores` (pulso), e `estudio_ativos.user_id` passa a aceitar nulo (gerações pedidas por servidores).
