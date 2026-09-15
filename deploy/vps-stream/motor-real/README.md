# MTM — motor em tempo real das contas reais (VPS)

Processo longo que, **tick a tick**, gere as posições abertas das contas REAIS com as **mesmas regras**
dos monitores de hoje:

| Tipo | Monitor actual (continua a correr) | Regras partilhadas |
|---|---|---|
| Premium (mestre `530d2e07` + contas por Telegram directo) | `lib/mtmcopy/premium-price-monitor.ts` (loop VPS 1 s) | `lib/gestao-real/premium.ts` + `espelho-premium.ts` |
| T2T | `lib/mtmcopy/t2t-price-monitor.ts` (5 s) | `lib/gestao-real/t2t.ts` |
| MTM Auto (contas MetaApi) | mtm-auto `/api/cron/motor` (5 s) | `lib/gestao-real/mtmauto.ts` (cópia byte a byte do mtm-auto) |

Os monitores **chamam estas funções** — não há regras copiadas. A prova está nos testes (secção 7).

- **SOMBRA** (por omissão, `MOTOR_REAL_ESCRITA=0`): nunca envia ordens. Grava em `gestao_real_sombra`
  UMA linha por decisão (intenções da mesma regra na mesma posição fundem-se em 5 s) e, quando o
  monitor actual age (o streaming vê o SL mudar, o volume descer, a posição fechar), casa as duas:
  **latência** (ms que o motor teria ganho) e **divergência** (pips/pontos, ou lotes).
- **LIVE** conta a conta: `MOTOR_REAL_ESCRITA=1` **e** a conta em `site_settings.motor_real_contas_live`
  **e** tipo suportado (fase 1: só `premium`). Ordens por REST `/trade`, nunca pela ligação RPC.
- Substitui o `mtm-premium-streaming`: as contas de `MOTOR_REAL_FOTOGRAFIA_CONTAS` (ou
  `PREMIUM_STREAMING_CONTAS`) continuam a escrever `metaapi_snapshot` com as mesmas regras.
- Streaming só em contas com posições abertas (+ fotografia), tecto `MOTOR_REAL_MAX_CONTAS`, graça de
  10 min depois do fecho, travão de quota e registo de contas inexistentes partilhados com o site,
  chave MetaApi da equipa quando a conta é de uma equipa.

Fonte: `services/motor-real/` (motor, ligacao, escopo, live). Nada escreve na base por tick: sombra em
lote de 5 s, batimento (1 linha) de 5 s, pico do Premium em live agrupado de 5 s.

## 1. Base de dados

Aplicar `supabase/migrations/096_gestao_real_sombra.sql` (tabelas `gestao_real_sombra`,
`gestao_real_pulso`, e `motor_real_contas_live = []`). Aditiva. Sem ela: o motor decide mas não grava,
e os monitores gerem tudo como hoje.

## 2. Site (Vercel) — antes de ligar o motor

Fazer deploy deste ramo: os monitores passam a chamar `lib/gestao-real/*` (comportamento igual —
paridade testada) e ganham o guarda que lê a lista live (vazia → não muda nada). Também entram
`/api/gestao-real/efeitos` (só usado em live) e `/api/admin/centro/motor-real` + o cartão
«Motor em tempo real» no Cockpit de `/admin/centro`.

**mtm-auto** (repositório próprio, ramo `motor-real-sombra`): mesmo princípio — `lib/motor.ts` chama
`lib/gestao-real/mtmauto.ts` e o cron tem o guarda (inerte: `mtmauto` não é tipo live suportado).

## 3. Construir

```bash
node_modules/.bin/esbuild services/motor-real/motor.ts --bundle --platform=node --target=node18 \
  --format=cjs --minify-syntax --legal-comments=none --external:bufferutil --external:utf-8-validate \
  --outfile=deploy/vps-stream/motor-real/dist/motor.js
for f in lib/gestao-real/__tests__/*.check.ts; do npx tsx "$f" || break; done
```

Um ficheiro (~3,5 MB, com o SDK da MetaApi e a Supabase). `dist/` não vai para o git.

## 4. Variáveis — `/etc/mtm-motor-real.env` (chmod 600, root)

```
SUPABASE_URL=https://iwscxotvmtkphajmasof.supabase.co
SUPABASE_SERVICE_ROLE_KEY=…
METAAPI_TOKEN=…
MOTOR_REAL_FOTOGRAFIA_CONTAS=530d2e07-b391-440f-bc6e-f4c2a224057b   # = PREMIUM_STREAMING_CONTAS de hoje
MOTOR_REAL_ESCRITA=0            # SOMBRA. 1 só na semana de live (secção 6)
CRON_SECRET=…                   # só usado em live (efeitos no site); obrigatório com ESCRITA=1
MTM_API_BASE=https://www.morethanmoney.pt

# REGRAS — têm de ser IGUAIS às da Vercel (site e mtm-auto), senão a sombra diverge por configuração:
# PREMIUM_EARLY_BE_RATIO  PREMIUM_LOCK_PROFIT_PIPS  PREMIUM_BE_BUFFER_PIPS
# T2T_BE_BUFFER_PIPS  T2T_EARLY_BE_RATIO
# MTMAUTO_BE_BUFFER_PIPS  MTMAUTO_BE_RATIO  MTMAUTO_TRAIL_RATIO
# (vazias = 0.4 / 12 / 5 · 5 / 0.4 · 5 / 0.4 / 0.5 — o log de arranque imprime as regras em uso)

# opcionais
# MOTOR_REAL_PREMIUM=1 MOTOR_REAL_T2T=1 MOTOR_REAL_MTMAUTO=1     # 0 desliga um tipo
# MOTOR_REAL_SUBSCRITORES=0      # 1 = liga também os subscritores do Premium enquanto há posição mestre (sombra do espelho por conta)
# MOTOR_REAL_MAX_CONTAS=30  MOTOR_REAL_GRACA_MIN=10  MOTOR_REAL_PAUSA_LIMITE_MIN=15
# MOTOR_REAL_TICK_MS=250  MOTOR_REAL_COTACOES_MS=500  MOTOR_REAL_ESCOPO_MS=15000
# MOTOR_REAL_SOMBRA_JANELA_MS=5000  MOTOR_REAL_SOMBRA_ESPERA_MS=120000  MOTOR_REAL_ENTRADA_LIVE_MS=15000
# MOTOR_REAL_LOG_NOTAS=1         # imprime cada decisão da sombra no journal
```

```bash
grep -E '^(SUPABASE_SERVICE_ROLE_KEY|METAAPI_TOKEN|CRON_SECRET)=' .env.local \
  | ssh mtm-stream 'sudo tee -a /etc/mtm-motor-real.env >/dev/null && sudo chmod 600 /etc/mtm-motor-real.env'
vercel env ls production | grep -E 'PREMIUM_(EARLY|LOCK|BE_BUFFER)|T2T_(BE|EARLY)'   # copiar os valores que existirem
```

## 5. Instalar (troca o mtm-premium-streaming)

```bash
scp deploy/vps-stream/motor-real/dist/motor.js deploy/vps-stream/motor-real/mtm-motor-real.service mtm-stream:/tmp/
ssh mtm-stream 'sudo mkdir -p /opt/mtm/motor-real && sudo mv /tmp/motor.js /opt/mtm/motor-real/ \
  && sudo mv /tmp/mtm-motor-real.service /etc/systemd/system/ && sudo systemctl daemon-reload \
  && sudo systemctl disable --now mtm-premium-streaming \
  && sudo systemctl enable --now mtm-motor-real'
ssh mtm-stream 'journalctl -u mtm-motor-real -f'
```

Esperar: `arranque · escrita=SOMBRA`, `[ligacao] 530d2e07 sincronizada`, `[pulso]` de minuto a minuto.
Confirmar que `metaapi_snapshot.em` continua a andar (≤2 s) — o monitor Premium lê-a como antes.
**Reverter:** `systemctl disable --now mtm-motor-real && systemctl enable --now mtm-premium-streaming`.

## 6. A semana de sombra — como ler a comparação

Cartão **Cockpit → Motor em tempo real** em `/admin/centro` (24 h), ou SQL:

```sql
-- resumo por regra
select regra, count(*) n,
       count(*) filter (where estado='casada') casadas,
       count(*) filter (where estado='sem_monitor') sem_monitor,
       percentile_cont(0.5) within group (order by latencia_ms) filter (where estado='casada') lat_p50,
       percentile_cont(0.95) within group (order by divergencia_pips) filter (where estado='casada') div_p95
from gestao_real_sombra where decidido_em > now() - interval '7 days' group by 1 order by 2 desc;

-- o que precisa de explicação
select decidido_em, conta, simbolo, regra, acao, sl, volume, monitor_valor, latencia_ms, divergencia_pips, estado, detalhe
from gestao_real_sombra
where estado in ('monitor_sem_sombra','sem_monitor') or divergencia_pips > 3 or divergencia_volume > 0
order by decidido_em desc limit 100;
```

Leitura:
- `casada` com **latência positiva** = o monitor agiu X ms depois do motor (é o ganho do cut-over).
  Latência negativa pequena é normal (o monitor viu o mesmo preço antes do tick seguinte).
- **divergência** de SL ≤ 1–3 pips no trailing é o passo de 0,5 pip × preços de ticks diferentes. Em
  BE/tranca/parciais tem de ser **0** (mesma regra, mesmo preenchimento).
- `sem_monitor`: o motor decidiu e o monitor não agiu em 2 min. Casos esperados: toque de um tick que o
  monitor (1–5 s) não viu; o interruptor do monitor desligado; T2T de uma fonte cuja ordem o monitor
  recusou. Repetido na mesma regra = investigar.
- `monitor_sem_sombra`: o monitor mexeu e o motor não pretendia nada. **Grave** se não for explicável
  (mudança manual do trader, adopção de manuais, espelho vindo do mestre numa conta directa, TP/SL
  alterado por mensagem do Telegram — esses são caminhos que o motor não cobre de propósito).
- `posicao_fechada`: fechou na corretora (SL/TP/manual) — contexto, não erro.
- `espelho`: o motor pediria o espelho aos subscritores (com `MOTOR_REAL_SUBSCRITORES=1` aparece
  também uma linha por subscritor).

Critério para passar a live (sugestão): ≥30 decisões Premium casadas, divergência 0 em BE/tranca/
parciais, p95 do trailing ≤3 pips, zero `monitor_sem_sombra` por explicar, zero erros no `[pulso]`.

## 7. Paridade (o que os testes provam)

- `paridade-premium.check.ts` / `paridade-t2t.check.ts` / `paridade-espelho-premium.check.ts`:
  empacotam com esbuild o monitor **original tirado do git** (`8a81044`) e o actual, trocam só o IO
  (MetaApi, Supabase, anúncios) por falsos, correm os mesmos cenários (escada completa, venda com
  preenchimento longe, zona larga, conta pequena 0,01, perfil trailing EURUSD/BTC em pontos,
  fotografia sem a posição → RPC, trailing em tempo real, fecho recusado, conta ilegível, pendentes) e
  exigem o **mesmo registo de chamadas**. Mutar uma regra parte o teste.
- `mtm-auto: lib/gestao-real/__tests__/paridade.check.ts` faz o mesmo com `gerirPosicao` (`f13d62c`).
- `sombra.check.ts`: o motor em sombra (estado virtual + sobreposições) pretende **tick a tick** as
  mesmas ordens que o monitor original envia; registo (fusão, latência ±, divergência em pontos),
  ressincronização sem fechos falsos.
- `planeamento-e-guarda.check.ts`: tecto/prioridade/graça, conta inexistente, pausa por limite, recuo;
  guarda live; cópias byte a byte com o mtm-auto (`MTM_AUTO_DIR=…`).

## 8. Passar uma conta a LIVE (começar pelo mestre Premium)

1. VPS: `MOTOR_REAL_ESCRITA=1` e `CRON_SECRET` no env; `systemctl restart mtm-motor-real`.
   Com a lista vazia continua 100% sombra (o log diz `escrita=LIVE PERMITIDO`).
2. Supabase:
   ```sql
   update site_settings set value = '[{"conta":"530d2e07-b391-440f-bc6e-f4c2a224057b","tipos":["premium"]}]'::jsonb
   where key = 'motor_real_contas_live';
   ```
3. Em ≤15 s o motor anuncia a conta no batimento (`[live] … a entrar em live em 15s`); o monitor Premium
   lê o batimento (cache 5 s) e passa a fazer SÓ contabilidade nessa conta (fecho quando a posição
   desaparece, adopção de manuais, anúncio). Aos 15 s: `[live] … EM LIVE — itens re-semeados da base`.
4. Verificar: linhas `modo='live'` com `estado='live_ok'`; `detail` do monitor com
   «gestão por preço no motor em tempo real — aqui só contabilidade»; `mtmcopy_premium_active`
   a avançar (`exits_done`, `profit_locked`), espelho aos subscritores (`[premium-mirror]` em
   `mtmcopy_signal_log`).

**Sair de live (qualquer um basta):** lista `[]` · `MOTOR_REAL_ESCRITA=0` + restart · parar o serviço.
O monitor volta a gerir em ≤5 s (lista/escrita) ou ≤20 s (motor morto: batimento velho). Se o motor
perder a sincronização da conta, tira-a do batimento no mesmo instante.

Diferenças conhecidas em live (fase 1): ordens por REST (o monitor usa RPC); trailing do lado da
MetaApi convertido com a especificação do streaming (sem ela vai só o SL e o ratchet do motor segue o
preço); T2T e MTM Auto só em sombra (anúncios T2T e o estado `t2t_monitor_state` são do monitor;
TradeLocker e MTM Funded ficam de fora).
