# MTM Funded — Spec Técnico Fase 1 (motor simulado + WebTrader)

> Estado: aprovado em conceito (2026-09-13). Este documento é a referência de implementação.
> Contexto estratégico: substituir a dependência MetaApi por sistema próprio ONDE ela custa
> dinheiro por conta — desafios/torneios/funded são 100% simulados e nossos. O MetaApi fica
> confinado ao MTM Auto + Tap-to-Trade (contas reais, custo coberto pela assinatura).

---

## 1. Posicionamento (informa naming, UI e T&Cs — não é detalhe)

- **NÃO é prop firm.** O MTM Funded é um programa educativo: desafios e torneios em contas
  **100% simuladas**, e a fase "funded" é um **Patrocínio de Desempenho MTM** — uma recompensa
  paga pelo MTM aos alunos com melhor desempenho **para entrarem no mercado regulado**: o
  patrocínio destina-se à conta própria do aluno numa corretora regulada (PU Prime, via
  parceria/IB). O MTM nunca dá capital a alunos para operar, nunca custodia fundos de clientes,
  nunca executa em mercado real por conta deles.
- Wording obrigatório em TODA a UI e marketing: "conta demo educativa", "simulação",
  "torneio de simulação", "patrocínio de desempenho — não constitui gestão de ativos nem
  atividade de intermediação financeira", + disclaimer educativo MTM padrão.
- Passagem pelo agente compliance antes do lançamento público (T&Cs, regras de payout, KYC
  mínimo para pagamento de patrocínios, 18+).

## 2. Onde o cliente negoceia — decisão

**MTM WebTrader dentro do `app-mobile`** (novo tab). Razões:
- As shells nativas iOS/Android carregam o site vivo → o WebTrader fica disponível em
  web/PWA/iOS/Android **sem rebuild nativo** (mesmo padrão provado no deep-link T2T).
- Gráficos: `lightweight-charts` (open-source TradingView, ~45KB) — sem licenças.
- App TradeLocker: NÃO na Fase 1 — exigiria acordo de brand com o TradeLocker (custo mensal,
  dependência de terceiro). O TradeLocker entra noutra fase como driver de contas REAIS do
  MTM Auto (API pública, o cliente traz a conta dele).

## 3. Arquitetura

```
Contas provider MetaApi (já pagas p/ MTM Auto/T2T)
    └─ streaming de ticks ─┐
                           ▼
        mtmcopy-engine (VPS, processo longo) — novo módulo funded-sim/
            ├─ publica ticks → Supabase Realtime (canal broadcast por símbolo)
            ├─ avalia por tick: fills (market/limit/stop), SL/TP, margem,
            │   drawdown diário/total, profit target → transições de estado
            └─ persiste em funded_* (Supabase)
                           ▼
        Next.js (Vercel)
            ├─ /api/funded/* — ordens, contas, produtos, leaderboard (validação + escrita)
            ├─ crons lentos: rollover diário (âncora de equity), expiração de desafios,
            │   snapshots de leaderboard, notificações
            └─ app-mobile?tab=funded — WebTrader (lightweight-charts + Realtime)
```

- **Porquê o engine e não a Vercel para o tick-loop:** serverless não segura ligações de
  streaming; o engine já é um processo Node longo com `getStreamingConnection` do MetaApi.
- **Feed de preços:** as ligações streaming das contas provider existentes (custo marginal
  zero). Fallback/expansão: um terminal MT5 self-hosted no VPS como fonte de ticks (piloto da
  Fase 3 do roadmap geral). Um feed serve TODAS as contas simuladas — o custo não escala por
  conta.
- **Latência-alvo:** fill em <1s a partir do tick. Suficiente para educação; não prometemos
  execução institucional (dizê-lo nos T&Cs).

## 4. Schema Supabase (novas tabelas, prefixo `funded_`)

```sql
-- Catálogo de produtos (desafio 1-step/2-step, torneio)
funded_products (
  id uuid pk, slug text unique, kind text check (kind in ('challenge','tournament')),
  name text, price_eur numeric, active bool,
  rules jsonb  -- { initial_balance, max_daily_dd_pct, max_total_dd_pct, profit_target_pct,
               --   min_trading_days, max_days, leverage, symbols: [..], max_volume_per_order,
               --   steps: 1|2, step2_rules?: {...} }
)

-- Uma conta simulada por compra/inscrição
funded_accounts (
  id uuid pk, user_id uuid → profiles, product_id → funded_products,
  tournament_id uuid null → funded_tournaments,
  status text check (status in ('active','passed','failed','expired','reward_pending','reward_paid')),
  step int default 1,
  start_balance numeric, balance numeric, equity numeric,       -- balance = fechado; equity = c/ abertas
  daily_anchor_equity numeric, daily_anchor_at timestamptz,     -- âncora do DD diário
  peak_equity numeric,                                          -- p/ DD total (modo trailing ou estático via rules)
  trading_days int default 0, last_trade_day date,
  fail_reason text null,  -- 'daily_dd' | 'total_dd' | 'expired' | 'rule_violation'
  stripe_session_id text null, created_at, closed_at
)

funded_positions (
  id uuid pk, account_id → funded_accounts, symbol text, direction text,
  volume numeric, entry numeric, sl numeric null, tp numeric null,
  opened_at, closed_at null, close_price null, commission numeric, pnl numeric null,
  status text check (status in ('open','closed')),
  close_reason text null  -- 'manual'|'sl'|'tp'|'liquidation'|'account_closed'
)

funded_orders (  -- pendentes limit/stop
  id uuid pk, account_id, symbol, direction, order_type text, volume, price, sl, tp,
  status text check (status in ('pending','filled','cancelled','expired')), created_at, filled_at
)

funded_equity_snapshots (account_id, at timestamptz, equity, balance)  -- gráfico de progresso + auditoria

funded_tournaments (
  id uuid pk, slug, name, starts_at, ends_at, entry_product_id → funded_products,
  prize_pool jsonb,  -- [{rank:1, reward_eur:..}, ...]
  status text check (status in ('upcoming','running','finished'))
)

funded_rewards (  -- patrocínios de desempenho
  id uuid pk, account_id, user_id, amount_eur numeric,
  method text check (method in ('pu_prime_deposit','bank_transfer')),
  status text check (status in ('pending','kyc','approved','paid','rejected')),
  compliance_note text, created_at, paid_at
)

funded_symbols (  -- specs de simulação por símbolo
  symbol text pk, digits int, contract_size numeric, pip_size numeric,
  spread_points int, commission_per_lot numeric, min_volume numeric, volume_step numeric,
  trading_hours jsonb, source_symbol text  -- símbolo no feed provider (sufixos)
)
```

RLS: leitura das próprias linhas por `user_id`; escrita SÓ via service role (API/engine).
Reutilizar `pip-points.ts`/`symbol-resolver.ts` existentes para a matemática.

## 5. Motor de simulação (`mtmcopy-engine/src/funded-sim/`)

Módulo novo no engine (isolado; não toca no fluxo Copygram):

- `feed.ts` — subscreve ticks (streaming MetaApi das providers; interface `TickSource` para
  trocar a fonte depois), publica em Supabase Realtime `broadcast` canal `funded:ticks:{symbol}`
  (throttle ~2-4 ticks/s por símbolo chegam para UI; avaliação interna usa todos).
- `state.ts` — índice em memória `symbol → contas com posições/ordens nesse símbolo`,
  recarregado da BD no arranque e atualizado por evento; evita full-scan por tick.
- `engine.ts` — por tick: mark-to-market das posições → equity; verifica nesta ordem:
  1. fills de `funded_orders` pendentes (limit/stop, com spread simulado),
  2. SL/TP das posições abertas (fill exato ao nível, sem requotes — regra documentada),
  3. margem/liquidação (equity ≤ margem exigida → fecha tudo, `close_reason='liquidation'`),
  4. **max_daily_dd**: equity < daily_anchor_equity × (1 − max_daily_dd_pct) → conta `failed`,
  5. **max_total_dd**: idem contra start/peak (modo definido nas rules),
  6. **profit_target**: equity ≥ alvo E trading_days ≥ min → `passed` (ou step 2).
  Transições persistem imediatamente + push Firebase (infra de notificações existente).
- `rollover.ts` — chamado pelo cron diário: fixa `daily_anchor_equity` (00:00 servidor,
  configurável), incrementa `trading_days` se houve trade, expira contas `max_days`.
- Idempotência: transições de estado por `UPDATE ... WHERE status='active'` (uma vitória só).

## 6. API (`app/api/funded/`)

| Rota | Método | Função |
|---|---|---|
| `/api/funded/products` | GET | catálogo ativo |
| `/api/funded/accounts` | GET | contas do utilizador (estado, regras, progresso) |
| `/api/funded/orders` | POST | market/limit/stop — valida símbolo permitido, volume, margem, conta `active`; market executa contra último tick + spread |
| `/api/funded/orders/[id]` | DELETE | cancela pendente |
| `/api/funded/positions` | GET / PATCH | abertas+histórico / alterar SL-TP |
| `/api/funded/positions/[id]/close` | POST | fecho manual (total ou parcial `{volume}`) |
| `/api/funded/leaderboard` | GET | ranking do torneio (ganho %, cache 60s) |
| `/api/funded/rewards` | GET | patrocínios do utilizador |
| `/api/admin/funded/*` | * | requireAdmin(): produtos CRUD, contas (forçar estado), rewards (aprovar/pagar), torneios |

Execução de ordem: a API valida e insere com `status='pending_fill'`; o engine faz o fill no
tick seguinte (fonte única de verdade de preço = engine). Fallback: se o engine não fizer fill
em 5s, a API devolve timeout e a ordem cancela-se (nunca fica limbo).

Stripe: estende o webhook existente — `checkout.session.completed` de um produto funded cria a
`funded_account` (mesmo padrão dos eventos Opinly/subscrições). Torneios = produto de inscrição.

## 7. WebTrader UI (`components/funded/`)

Tab novo no `app-mobile` (`?tab=funded`, deep-link igual ao T2T):

- `funded-dashboard.tsx` — cartões das contas: equity, barras de regra (DD diário restante,
  DD total, progresso p/ target — estilo dos medidores admin existentes), CTA comprar desafio.
- `funded-trader.tsx` — o WebTrader: gráfico (ver "Estratégia de charting" abaixo), ticket de
  ordem (padrão visual do tap-to-copy-modal: símbolo, direção, volume, SL/TP com validação de
  distância), posições abertas com PnL live, pendentes, histórico.
- **Estratégia de charting (decisão 2026-09-13):** a fluidez do TradeLocker/Match-Trader É o
  TradingView — ambos integram as bibliotecas dele, licenciáveis GRÁTIS para empresas
  (candidatura + atribuição visível "charts by TradingView").
  1. M3 lança com `lightweight-charts` (open-source, sem fricção);
  2. em paralelo, candidatura ao TradingView **Advanced Charts + Trading Platform**
     (tradingview.com/advanced-charts — demora semanas; termos p/ área de membros
     confirmam-se na aprovação);
  3. M4 troca o componente para o **Trading Platform**: gráficos completos (indicadores,
     desenho, multi-timeframe) + trading no gráfico (SL/TP arrastáveis, one-click, painel de
     posições) ligado ao nosso backend via a interface Broker API deles — datafeed = os nossos
     ticks Realtime, routing = `/api/funded/orders`. A arquitetura do datafeed/ordens é a mesma
     nas duas etapas; só muda o componente de gráfico.
  Fora de âmbito deliberado (e proibido nos desafios, como na maioria dos prop firms): EAs/algos
  do cliente, marketplace de indicadores, DOM de futuros.
- `funded-leaderboard.tsx` — ranking do torneio, atualização 60s, destaque do próprio.
- `funded-rules-banner.tsx` — SEMPRE visível em modo trading: "Conta demo educativa · Simulação
  MTM" + link T&Cs.
- Admin `/admin/funded` (sidebar "MTM Funded"): produtos, contas com filtros de estado,
  violações do dia, fila de rewards com aprovação manual, gestão de torneios.

i18n PT/EN desde o início (padrão `t()` já usado no T2T feed).

## 8. Patrocínio de Desempenho (fase pós-desafio)

- Conta `passed` → cria `funded_rewards` com `status='pending'` → admin aprova (`kyc` → `approved`).
- Método preferencial: **`pu_prime_deposit`** — o patrocínio é depositado na conta própria do
  aluno na PU Prime (aberta via link de parceria MTM). Reforça o posicionamento ("entrar no
  mercado regulado com patrocínio MTM") e a parceria IB. `bank_transfer` como alternativa.
- O aluno na PU Prime é cliente DA PU PRIME (regulada) — o MTM não intermedeia, não custodia,
  não executa. A relação MTM↔aluno termina no pagamento do patrocínio.
- Valores/percentagens do patrocínio: definidos por produto em `rules` (decisão de negócio,
  fora deste spec).

## 9. Além da Fase 1 — WebTrader multi-conta (decisão de arquitetura 2026-09-13)

O WebTrader é a montra; a execução é um **driver por conta**. A camada de ordens
(`/api/funded/orders` e, depois, a Broker API do TradingView) encaminha para o driver da
conta selecionada — a UI não distingue simulado de real:

| Conta | Driver | Fase |
|---|---|---|
| Desafio/torneio MTM Funded | `funded-sim` (este spec) | 1 |
| MT5 externa do cliente (MTM Auto/Copy) | MetaApi — primitivas já existem (`placeOrdersSequential`, `modifyPositionSlTp`, `closePositionById`, `readOpenPositions`) | possível já; ligar na UI pós-M4 |
| TradeLocker externa do cliente | API pública TradeLocker (auth do próprio cliente) | 2 |
| MT5 self-hosted VPS | driver próprio | 3 |

Implicações para o M1: o conceito de "conta negociável" na UI deve nascer com um campo
`driver` (`'sim' | 'metaapi' | 'tradelocker' | ...`) e um seletor de conta no topo do
WebTrader (padrão TradeLocker). O PnL live das contas reais usa o MESMO feed de ticks do
simulador + reconciliação periódica à conta; execução manual real via RPC ≈1–2s/ordem
(equivalente ao MT5 mobile).

⚠️ Compliance antes de ativar trading manual em contas REAIS: interface que transmite ordens
do cliente a uma corretora pode tocar em "receção e transmissão de ordens" (MiFID).
Enquadramento a validar: fornecedor de software/tecnologia (como a MetaQuotes), com T&Cs a
marcar essa fronteira. No simulado não há questão.

## 10. Milestones

| M | Entrega | Dependências |
|---|---|---|
| M1 | Schema + `funded_symbols` seed (XAUUSD, majors, índices) + API produtos/contas + Stripe checkout→conta | — |
| M2 | Engine `funded-sim` (feed, fills, regras, rollover) + push de transições | M1; deploy engine no VPS |
| M3 | WebTrader UI + Realtime ticks + dashboard de contas | M1 (dados), M2 (ticks) |
| M4 | Torneios + leaderboard + admin completo + fila de rewards | M2, M3 |
| M5 | T&Cs/compliance, wording final, beta fechada com membros, lançamento | tudo |

Riscos principais: (1) qualidade/continuidade do feed de ticks — mitigado por `TickSource`
plugável e pelo piloto MT5 self-hosted; (2) contestação de fills — mitigado por
`funded_equity_snapshots` + log de ticks no momento do fill (guardar tick no registo da
posição); (3) restart do engine — estado reconstruível 100% da BD (nunca só em memória).

## 11. Negociação interna, ideias diretas e cópia funded → conta pessoal (decisão Ricardo 2026-09-14)

Acrescenta à secção 9. O WebTrader deixa de ser só um tab: é a **camada de negociação comum**
de todas as superfícies MTM, e o seletor de conta vive em todas.

### 11.1 Onde se negocia
| Superfície | Entrada |
|---|---|
| MTM System (iOS nativa) | WebView do `app-mobile?tab=funded` + botão "Negociar" nos ecrãs de sinais |
| `app-mobile` (web/PWA/Android) | tab `funded` (WebTrader) |
| Widget TradingView da app | ticket de ordem a partir do gráfico (M3: overlay nosso; M4: Trading Platform/Broker API) |
| Scanner access | botão "Negociar" em cada alerta → ticket pré-preenchido (símbolo, direção, SL/TP do alerta) |

Uma só rota de ordens (`/api/funded/orders`) → driver da conta escolhida. Nenhuma superfície fala
diretamente com MetaApi/TradeLocker.

### 11.2 Aceitar ideias diretamente na conta
- Cada ideia/sinal (Premium, estratégias MTM Auto, scanners) ganha "Aceitar em…" → **o user escolhe
  a conta** (funded simulada, MT5 própria, TradeLocker própria) e confirma o risco.
- Reaproveita o fan-out/risco do T2T (`t2t-multi-account`) e a janela de aceitação (5 min + fora
  da zona bloqueia). Na conta simulada executa no `funded-sim`; nas reais pelo driver.
- Regra dos desafios: aceitar ideias da casa numa conta de desafio É permitido mas marcado na
  posição (`origin='mtm_idea'`) — decisão de negócio a fechar se conta para o ranking dos torneios.

### 11.3 Copiar da conta funded para a conta pessoal
- Quem tem **MTM Auto pago** ou o **addon MTM Copy** pode ligar "espelhar esta conta funded" →
  cada abertura/fecho/parcial da conta simulada replica-se na MT5 (MetaApi) ou TradeLocker
  (TradeLocker API) do próprio user, com lote/risco próprio (padrão `strategy_lots`).
- Implementação: o `funded-sim` emite eventos (`position_opened|modified|closed|partial`) →
  consumidor no engine → driver da conta destino. Mesmo modelo proporcional do
  `espelho-saidas-educador`.
- Gates: sem subscrição válida o toggle não aparece; regras de contas (1 real + 1 demo por produto,
  extras 7€); iOS nunca Stripe (compra do addon por IAP).
- Compliance: é o user a copiar a SUA própria conta simulada para a SUA conta — software, não
  gestão. T&Cs têm de o dizer; validar com o agente compliance antes de ligar em contas reais.

### 11.4 Emissão própria de contas (substitui a fila MT5 externa)
- Hoje: torneio usa contas MT5 criadas na PU Prime por fila + agente local (`agente-mt5-vps`).
- Alvo: **a MTM Funded emite e vende as contas no nosso servidor** — compra (Stripe/IAP) ou
  inscrição → `funded_accounts` criada na hora com credenciais do WebTrader (login MTM, sem
  password MT5). A fila MT5 externa fica só para o torneio em curso e é descontinuada depois.
- Migração: `mtm_tournament_participants` → `funded_accounts.tournament_id` para o próximo torneio.

### 11.5 Mindmap editável
O conceito completo vive num artifact com blocos editáveis; as edições do Ricardo gravam-se na
BD do artifact e são a fonte de verdade da fase de construção (reler antes de cada milestone).
