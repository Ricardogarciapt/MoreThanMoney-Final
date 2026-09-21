# MTM Funded — motor de simulação (VPS)

O processo longo que dá vida às contas simuladas: escreve os preços (`funded_precos`), fecha por
SL/TP e stop-out, executa pendentes, mede equity/margem, aplica as regras do programa ou do
torneio, vira o dia às 22:00 UTC, tira fotografias de equity e mantém `metricas` na forma do cron
do MT5. Fonte: `services/funded-motor/` (a avaliação pura está em `avaliacao.ts`, com teste).

O site nunca chama esta máquina. Quando uma conta quebra ou passa, o motor avisa o site em
`POST /api/mtmfunded/simulado/motor` (cabeçalho `x-caption-secret`), e é o site que manda os
emails, emite o certificado e abre a fase seguinte.

## Antes de ligar

Por esta ordem, na Supabase:

1. `supabase/migrations/064_funded_symbols_classes.sql` — classes novas, `moeda_lucro`, `sessoes`,
   `funded_precos_pedidos`, e as funções atómicas `funded_fechar_posicao` / `funded_executar_pendente`
   / `funded_somar_saldo`. **Sem ela o motor em modo 1 falha ao fechar posições.**
2. `supabase/migrations/072_funded_ordens_avancadas.sql` — trailing, break-even, TPs parciais, OCO,
   diário e alertas de preço. **O motor novo lê as colunas desta migração: aplica-a ANTES de o
   actualizar** (sem ela as leituras de posições/ordens falham e o motor não arranca).
3. `supabase/seeds/funded_symbols_puprime.sql` — o catálogo da PU Prime (gerado por
   `npx tsx scripts/funded-sync-simbolos.ts`; voltar a correr quando a corretora mudar).

## Construir

```bash
node_modules/.bin/esbuild services/funded-motor/motor.ts --bundle --platform=node --target=node18 \
  --format=cjs --minify-syntax --legal-comments=none --external:bufferutil --external:utf-8-validate \
  --outfile=deploy/vps-stream/funded-motor/dist/motor.js
npx tsx services/funded-motor/teste-avaliacao.ts   # tem de dizer «todos certos»
npx tsx services/funded-motor/teste-metricas-escrita.ts   # métricas só se gravam quando mudam (17/09)
```

Um só ficheiro (~3 MB, com o SDK da MetaApi e a Supabase lá dentro): o VPS não precisa de
`node_modules`. `dist/` não vai para o git.

## Variáveis — `/etc/mtm-funded-motor.env` (chmod 600, root)

```
SUPABASE_URL=https://iwscxotvmtkphajmasof.supabase.co
SUPABASE_SERVICE_ROLE_KEY=…
METAAPI_TOKEN=…
METAAPI_CONTA_PRECOS=530d2e07-b391-440f-bc6e-f4c2a224057b   # PU Prime · «MTM Auto Premium»
LMS_CAPTION_WORKER_SECRET=…                                   # o mesmo dos outros workers
MTM_API_BASE=https://www.morethanmoney.pt
MOTOR_ESCRITA=0          # 0 = só decide e escreve no log; 1 = a sério
# opcionais: MOTOR_INTERVALO_MS=1000 · MOTOR_DESVIO_CORRETORA_MIN=180
```

Copiar segredos sem os mostrar:

```bash
grep -E '^(SUPABASE_SERVICE_ROLE_KEY|METAAPI_TOKEN|LMS_CAPTION_WORKER_SECRET)=' .env.local \
  | ssh mtm-stream 'sudo tee -a /etc/mtm-funded-motor.env >/dev/null && sudo chmod 600 /etc/mtm-funded-motor.env'
```

## Instalar / actualizar

```bash
scp deploy/vps-stream/funded-motor/dist/motor.js deploy/vps-stream/funded-motor/mtm-funded-motor.service mtm-stream:/tmp/
ssh mtm-stream 'sudo mkdir -p /opt/mtm/funded-motor && sudo mv /tmp/motor.js /opt/mtm/funded-motor/ \
  && sudo mv /tmp/mtm-funded-motor.service /etc/systemd/system/ && sudo systemctl daemon-reload \
  && sudo systemctl enable --now mtm-funded-motor && sudo systemctl restart mtm-funded-motor'
ssh mtm-stream 'journalctl -u mtm-funded-motor -f'
```

## Passar a modo 1

Só depois de: 064 e o seed aplicados; umas horas em modo 0 com linhas `[pulso]` a mostrar preços
e nenhuma linha `[seco]` absurda; o site com a rota `/api/mtmfunded/simulado/motor` em produção.
Então `MOTOR_ESCRITA=1` no ficheiro e `systemctl restart mtm-funded-motor`.

## O que ler no log

- `[pulso]` de minuto a minuto: ticks/min, contas, desvio da hora da corretora, preços base.
  Três minutos sem um tick (o BTC negoceia 24/7) → o processo sai e o systemd reinicia-o.
- `[seco] …` (modo 0): o que o motor faria — fechos, execuções, quebras, viragem do dia.
- `[evento] quebrou|objetivo … → 200`: o site recebeu. Enquanto não receber, `metricas.eventoPendente`
  fica na conta e o motor volta a tentar de 30 em 30 segundos.

## Espelho das estratégias (contas que seguem o MTM Auto)

`services/funded-motor/espelho-estrategias.ts`, ligado dentro do motor. Contas `sim` com
`segue_estrategia` (migração **070**, aplicar antes) copiam as posições da conta-mestre da estratégia
(`mtmauto_providers.metaapi_account_id`): uma ligação de **STREAMING** da MetaApi por mestre
(`services/funded-motor/espelho-leitor.ts`) — posições, equity e contrato lidos do `terminalState` em memória,
**zero pedidos RPC** (até 14/09 era `getPositions` por RPC de 3 em 3 s e a MetaApi cortou o token partilhado com o
MTM Auto/MTM Copy: «ws:getPositions … 180000 cpu credits per 1h»). Eventos do ouvinte → debounce 250 ms → diff;
repete 3 s depois enquanto há trabalho; reconcilia de 60 em 60 s. Mestre não sincronizada = leitura falhada (não
fecha nada). O feed e o espelho partilham UMA instância do SDK (`metaapi-partilhada.ts`): uma conta que o feed já
ouve não ganha segunda subscrição. **Interruptor**: ao primeiro erro de limite da MetaApi visto em qualquer parte do
motor, o espelho fecha as ligações e pára 1 h (o feed continua). Abertura ao nosso preço em proporção à equity (mínimo do símbolo + `escala` quando o lote
proporcional não chega), SL/TP em níveis absolutos, parciais proporcionais, fecho após 2 leituras sem a
posição. Ponte anti-duplicação: `funded_espelho_posicoes`. Posições abertas na mestre antes de a conta
existir, ou vistas mais de `ESPELHO_ATRASO_MAX_MIN` (30) depois, não se copiam (ficam `recusada`).

- `MOTOR_ESCRITA=0` → `[espelho][seco] …` no log; nada na base.
- Opcionais: `ESPELHO_ATIVO=0` (desliga só o espelho) · `ESPELHO_REPETIR_MS=3000` · `ESPELHO_DEBOUNCE_MS=250` ·
  `ESPELHO_RECONCILIAR_MS=60000` · `ESPELHO_PAUSA_LIMITE_MIN=60` · `ESPELHO_ATRASO_MAX_MIN=30`.
- No log: `[espelho] mestre xxxxxxxx sincronizada (streaming)`, `… dessincronizada … não fecha nada até voltar`,
  `[espelho] PAUSADO até … — limite da MetaApi`.
- Testes: `npx tsx lib/mtmfunded/__tests__/espelho.check.ts` (inclui o fluxo por eventos com um SDK falso).
- Contas com `metricas.analise = true` não são quebradas pelas regras do programa (o stop-out mantém-se).
- No log: `[espelho] <estratégia>→<conta> abriu|parcial|fechou|SL …`.

## Espelho provider (migração 082) — gestão nossa vs MetaApi

`services/funded-motor/espelho-provider.ts` (decisões puras em `lib/mtmfunded/espelho/provider.ts`). Uma conta
simulada **da casa** por estratégia (`mtmauto_providers.espelho_funded_account_id`, `mtm_trading_accounts.conta_casa`,
`metricas.analise=true` → nenhuma regra a quebra) que:

- lê a conta-mestre **por evento** (`onPositionUpdated/Removed/onDealAdded`, sem debounce, zero RPC); na
  (re)sincronização compara o `terminalState` com o que conhecia (abertas/fechadas durante a queda);
- abre a entrada ao **nosso** preço no próprio evento (ponte `funded_espelho_posicoes` = anti-duplicação);
- gere a cada **tick** do nosso feed com as regras da estratégia (`be_gatilho`, `trailing_arranca_pips`,
  `trailing_distancia_pips`, `trailing_passo_pips`, `saidas_pct`, `trailing_tempo_real`), independente da gestão da
  mestre; SL/TP finais fecham pelo motor; segue só fechos **humanos** da mestre (`espelho_config.seguirFechos`);
- os símbolos com posições do espelho pedem cotações a `MOTOR_INTERVALO_RAPIDO_MS` (250) em vez de 1000;
- grava 1 linha em `espelho_comparacao` à abertura (`em_curso`) e fecha-a no fim (`completa|so_mestre|reinicio`);
- batimento: `servicos_pulso.servico='mtm-funded-motor'` 1×/min com as latências (rede, entrada, tickSl, tickParcial).

**Deploy**: (1) aplicar `082_espelho_provider.sql` (072 não é precisa — o motor passa às colunas de base se faltar);
(2) build acima; (3) `/etc/mtm-funded-motor.env`: `ESPELHO_PROVIDER=1` (+ opcionais `MOTOR_INTERVALO_RAPIDO_MS=250`,
`ESPELHO_PROVIDER_ESPERA_DEAL_MS=1500`); (4) restart; (5) no admin → MTM Funded → «Espelho provider»: criar conta
(100 000 USD) e ligar por estratégia; (6) para medir a propagação, criar uma rota **em sombra** na cópia entre contas
com origem `funded:<conta espelho>` → TradeLocker/MT5 (o trigger da 078 gera os eventos sozinho).
Com `MOTOR_ESCRITA=0` só há `[provider][seco]` no log.

**Ler a comparação**: `diferenca_pips` = pips do espelho − pips da mestre (ponderados pelo volume de abertura);
`deslize_entrada_pips` > 0 = o espelho entrou pior; `latencia_entrada_ms` = evento recebido → posição escrita;
`latencia_rede_ms` = hora da mestre → evento no VPS; saídas da mestre com motivo `sl|tp|expert|humana|estimado`
(estimado = sem deal, ao último preço visto). A vista **`espelho_veredito`** (e `espelho_alinhado(slug)`) dá
`alinhado` com: ≥30 trades completas · |dif. média| ≤ 3 pips · latência p95 (entrada e propagação outbox→processado)
≤ 1500 ms · 0 trades perdidas · propagação medida. Os mesmos limiares em `CRITERIOS_PADRAO` (TS).

Testes: `npx tsx lib/mtmfunded/__tests__/espelho-provider.check.ts` (ticks gravados em `__tests__/fixtures/`).

### Fontes de preço — o que existe e as lacunas

| Fonte | Estado | Latência / custo | Notas |
|---|---|---|---|
| MetaApi streaming, conta PU Prime `530d2e07` (é também a mestre Premium) | **principal**, em produção | tick push; `quotes` a 1000 ms (250 ms nos símbolos do espelho); sem custo extra por símbolo | continua a ser MetaApi: se o token for cortado, o motor fica sem preço (sai pelo `[pulso]` aos 3 min) |
| MetaApi RPC `getSymbolPrice` | recurso automático se o streaming não liga | ~1 s por símbolo, gasta créditos RPC | só de recurso |
| TradeLocker `GET /trade/quotes` | **implementado** (`feed-tradelocker.ts`), `ESPELHO_FEED_TL=1` | sondagem HTTP (sem streaming público), ronda `ESPELHO_FEED_TL_MS`=2000; grátis com conta demo; limites de pedidos da TL | outra corretora (diferença de preço/spread medida no pulso: `feedTradeLocker.porSimbolo`). `ESPELHO_FEED_TL_RECURSO=1` injecta quando a MetaApi tem >5 s — fecha SL/TP de TODAS as contas simuladas com esse preço; por defeito desligado. Vars: `TL_FEED_EMAIL/PASSWORD/SERVER/ENV/ACCOUNT_ID/ACCNUM` |
| MT5 próprio no VPS (terminal PU Prime + EA a publicar ticks por socket) | não existe | sub-100 ms, zero créditos; custo = VPS Windows/Wine (~20–40 €/mês) | a opção mais independente: mesma corretora da mestre, sem MetaApi |
| FIX da corretora (PU Prime/LP) | não existe | o mais rápido; exige conta institucional/acordo, normalmente com mínimo de volume | fora de alcance para já |
| TradingView (dados/alertas) | não serve para ticks | sem API de ticks oficial; alertas com segundos de atraso | só para sinais, não para gerir SL |

## Regras de execução (as que se publicam)

- SL/TP fecham ao nível exacto, sem requotes; SL e TP no mesmo tick → vale o SL.
- Pendentes executam ao preço da ordem; sem margem, cancelam. A comissão é debitada à abertura.
- Stop-out abaixo de 50% de nível de margem: fecha a pior posição, uma de cada vez.
- Fora da sessão da corretora não há fills; o último preço fica.
- Swap ainda não é cobrado (as colunas existem; falta a regra de rollover).

## WS de preços (2026-09-21 — preços sempre funcionais, sem egress Supabase)

O motor abre um WebSocket na porta `WS_PRECOS_PORTA` (default 8787, `0` desliga) e o nginx
publica-o em `wss://stream.morethanmoney.pt/precos` (bloco `location /precos` — reaplica o
conf deste repo e `sudo nginx -t && sudo systemctl reload nginx`).

O WebTrader liga-se lá quando a Vercel tiver `NEXT_PUBLIC_FUNDED_WS_URL=wss://stream.morethanmoney.pt/precos`
(+ redeploy). Sem a env, ou com a WS em baixo, o poll clássico continua a funcionar sozinho.

Teste rápido no VPS: `journalctl -u funded-motor | grep ws-precos` deve mostrar
«a ouvir na porta 8787»; o [pulso] passa a incluir `wsClientes`.

## Operar SEM MetaApi (2026-09-21 — créditos esgotados não param o sistema interno)

O motor arranca mesmo com a MetaApi em baixo (fonte nula) e vive de dois recursos:
- **Binance (cripto, default LIGADO)**: BTCUSD/ETHUSD por WebSocket público, tick a tick.
  `BINANCE_FEED=0` desliga; pares em `BINANCE_PARES` (`BTCUSD:btcusdt,ETHUSD:ethusdt`).
- **TradeLocker (forex/ouro/índices)**: pôr no `/etc/mtm-funded-motor.env`:
  `ESPELHO_FEED_TL=1`, `ESPELHO_FEED_TL_RECURSO=1`, `TL_FEED_EMAIL/PASSWORD/SERVER/ENV/ACCOUNT_ID/ACCNUM`
  (uma conta TradeLocker demo serve). Sem MetaApi, a ronda TL cobre TODOS os símbolos desejados.

Os recursos só injetam quando o preço do feed principal tem >5 s — com a MetaApi viva não há
duas fontes a lutar; morta, assumem sozinhos. Quando a MetaApi voltar, `systemctl restart
funded-motor` devolve o streaming como principal.
