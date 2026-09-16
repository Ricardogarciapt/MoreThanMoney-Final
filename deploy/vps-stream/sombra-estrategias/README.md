# MTM — sombra das estratégias (VPS)

Mede, todos os dias, o que uma estratégia **desligada** teria feito — hoje o **MTM Scanner**
(`mtmauto_providers.slug = 'mtm-scanner'`, `ativo = false`). Não abre nada, não fala com a MetaApi.

```
tradingview_signals (entradas MTMScanner) ─▶ gate do webhook (regras de hoje) ─▶ replay em velas M15
                                                 lib/mtmcopy/webhook-gates         lib/estudos/replay-velas
                                                 lib/mtmcopy/signal-rules          gestão = configDoProvider
                                           ─▶ 1 upsert em estrategia_sombra_dia ─▶ /admin/centro → Estratégias
```

- **Quem decide a execução é `ativo`.** `sinais_config.modo = 'sombra'` é só a etiqueta que o Centro
  mostra («Sombra — não executa»). Voltar a executar = pôr `ativo = true` **e** tirar `mtm-scanner`
  de `SLUGS_QUE_NAO_EXECUTAM` (lib/mtmcopy/contas-provider-estrategia.ts) e da exclusão
  `scannerKey !== "mtmscanner"` do webhook. Nada disto é feito aqui.
- **Porquê na VPS:** as velas vêm do websocket não-oficial do TradingView (`tvfeed.cjs`, o cliente
  do MCP, vendorizado em `services/sombra-estrategias/`). Aqui corre sem limite de tempo, com o
  Node 18 que já lá está e o journal para os erros. Ensaiado a 16/09 a partir da VPS (`--seco`): as
  velas BlackBull chegam normalmente.
- **Carga:** ~1 min por dia, 4 leituras pequenas + as entradas de ~8 dias + **1 escrita** (upsert dos
  últimos 3 dias; os dias `definitivo` já não são reescritos).
- **Medição do histórico** (o mesmo código, velas em cache no Mac): `npx tsx scripts/estudos/sombra-mtm-scanner.ts`
  → `docs/sombra-mtm-scanner.md`.

## 1. Base de dados

Aplicar `supabase/migrations/108_estrategia_sombra_dia.sql` (tabela `estrategia_sombra_dia`, RLS sem
políticas, e `sinais_config.modo = 'sombra'` no Scanner). Aditiva. Sem ela o Centro mostra «migração
108 por aplicar» e o serviço falha a escrita (sai com erro, não toca em mais nada).

## 2. Site (Vercel)

Deploy deste ramo: o cartão «MTM Scanner · Forex · sombra» e a pílula «Sombra — não executa» na
secção **Estratégias** de `/admin/centro`. O webhook do TradingView só mudou de sítio as funções de
classificação e dos gates (`lib/mtmcopy/webhook-gates.ts`), sem mudar lógica.

## 3. Construir

```bash
node_modules/.bin/esbuild services/sombra-estrategias/sombra.ts --bundle --platform=node --target=node18 \
  --format=cjs --minify-syntax --legal-comments=none --external:bufferutil --external:utf-8-validate \
  --outfile=deploy/vps-stream/sombra-estrategias/dist/sombra.js
npx tsx lib/mtmauto/__tests__/sombra-scanner.check.ts
```

Um ficheiro (~150 KB). `dist/` não vai para o git.

## 4. Variáveis

Usa `/etc/mtm-motor-real.env` (já existe na VPS): só lê `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

## 5. Instalar

```bash
scp deploy/vps-stream/sombra-estrategias/dist/sombra.js \
    deploy/vps-stream/sombra-estrategias/mtm-sombra-estrategias.service \
    deploy/vps-stream/sombra-estrategias/mtm-sombra-estrategias.timer mtm-stream:/tmp/
ssh mtm-stream 'sudo mkdir -p /opt/mtm/sombra-estrategias && sudo mv /tmp/sombra.js /opt/mtm/sombra-estrategias/ \
  && sudo mv /tmp/mtm-sombra-estrategias.service /tmp/mtm-sombra-estrategias.timer /etc/systemd/system/ \
  && sudo systemctl daemon-reload'

# ensaio (não escreve) e depois o histórico desde 12/07 — um upsert só
ssh mtm-stream 'sudo bash -c "set -a; . /etc/mtm-motor-real.env; set +a; node /opt/mtm/sombra-estrategias/sombra.js --seco"'
ssh mtm-stream 'sudo bash -c "set -a; . /etc/mtm-motor-real.env; set +a; node /opt/mtm/sombra-estrategias/sombra.js --desde 2026-07-12"'

# todos os dias às 06:30 UTC
ssh mtm-stream 'sudo systemctl enable --now mtm-sombra-estrategias.timer && systemctl list-timers mtm-sombra-estrategias.timer'
ssh mtm-stream 'journalctl -u mtm-sombra-estrategias -n 30'
```

Esperar no journal: `[sombra] mtm-scanner ativo=false modo=sombra · dias …`, uma linha por dia e
`gravadas N linha(s) num upsert`.

**Parar:** `sudo systemctl disable --now mtm-sombra-estrategias.timer`. A tabela fica como está.

## 6. Ler

- `/admin/centro?s=estrategias` → cartão da sombra (14 dias; `*` = dia provisório).
- SQL:

```sql
select dia, trades, vitorias, r_total, r_medio, pior_sequencia, perdas_seguidas, exposicao_max, abertas, definitivo,
       detalhe->'ideias' ideias, detalhe->'passaram_gate' gate, detalhe->'exposicao' exposicao
from estrategia_sombra_dia where estrategia = 'mtm-scanner' order by dia desc limit 30;
```

## Notas

- As regras do gate e a gestão são lidas **na hora** de cada corrida. Mudar `sinais_config` do
  Scanner (ex.: `beFracaoDoRisco`) muda a medição dos dias seguintes; `gestao` em cada linha diz com
  que gestão aquele dia foi medido. Ao gravar `sinais_config` pelo admin, manter a chave `modo`.
- `tvfeed.cjs` é uma cópia de `~/tradingview-mcp/src/tvfeed.js`: se o original mudar (ex.: o
  TradingView mudar o protocolo), levar a mudança para aqui e reconstruir.
