# Admin de estratégias — um só sítio onde se decide

**Decisão do dono (05/10/2026):** o **Centro** (`/admin/centro`) é o ÚNICO sítio onde se DECIDE o
que uma estratégia faz. `/admin/mtmcopy` fica para diagnóstico e leitura. O admin da MTM Auto
(`/definicoes/admin`) mantém o que é das equipas (utilizadores, cupões, pagamentos, franchise, bots
de Telegram, métricas) e, para estratégias, usa a MESMA API do site filtrada pela equipa.

Este documento é o mapa. Fase 0 = o retrato de 05/10 ANTES de mexer. As fases seguintes
acrescentam a coluna «depois».

## Legenda

- **C** = Centro (`/admin/centro`, secção Estratégias e gaveta da estratégia)
- **M** = `/admin/mtmcopy` (separador Estratégias)
- **A** = admin da MTM Auto (`mtm-auto` → `/definicoes/admin`, aba *strategies*)
- **P** = admin dentro da app-mobile (`components/mobile/mtm-auto-estrategias.tsx`) — um 4.º sítio
  que o inventário encontrou
- Tabelas: `prov` = `mtmauto_providers`, `mest` = `mestres_estrategias`, `ss` = `site_settings`

## Fase 0 — inventário (cada interruptor × onde aparece × quem escreve)

| # | Interruptor / acção | C | M | A | Rota que escreve (tabela) |
|---|---|---|---|---|---|
| 1 | **Fonte** — tipo (metaapi / telegram / mt5 / mtmfunded / tradelocker / mtm_t2t), conta, chat | ✔ ProvidersExternos (criar) | ✔ ProvidersExternos (criar) — **duplicado** | ✔ formulário New/Edit + ligar conta + ligar canal | S `POST /api/admin/mtmauto-copia/providers {criar}` (prov); A `POST /api/admin/providers` (upsert prov), `/api/admin/contas-estrategia[/mtmfunded\|/tradelocker]` (prov.login/servidor/metaapi_account_id/funded_account_id/tl_*), `/api/admin/telegram {ligar}` (prov.telegram_*) |
| 2 | **Registar na cadeia** (mestre SIM + `mest` em sombra + rotas + canal) | ✔ botão «registar» | ✔ igual — **duplicado** | automático depois de gravar (pede ao site) | S `providers {registar}` → `lib/mestres/servidor/registar-provider.ts` (mest, copia_rotas, chat_channels, prov.funded_account_id) |
| 3 | Fonte desligada / MT5 «por ligar» | só leitura (F5) | — | só leitura | ninguém pela UI (SQL de 05/10) |
| 4 | Fonte de execução mestre ↔ espelho | ✔ gaveta | — | ✔ botão por estratégia | S `/api/admin/centro/acoes {trocar_fonte}`; A `providers {fonte}` → ambos `rpc mtmauto_trocar_fonte_execucao` |
| 5 | **Modo da mestre**: `modo` (propagação), `sinal_modo`, `t2t_modo` | ✔ MotorMestres | ✔ MotorMestres — **duplicado** | ✔ (só super admin) | S `/api/admin/mtmauto-copia/mestres` → `painel-escrita.ts` (mest); **A escreve `mest` directamente** (`/api/admin/mestres`) |
| 6 | Modo por conta (`mestres_contas`), kill-switch, alertas vistos | ✔ | ✔ — **duplicado** | — | S `painel-escrita.ts` |
| 7 | Opções: listada (`ativo`), a executar (`espelhar`), SL mínimo, risco por omissão, BE no TP, máx. trades/dia, símbolos | ✔ OpcoesEstrategia (gaveta) | — | ✔ formulário | S `/api/admin/centro/estrategia-opcoes` → `opcoes-estrategia.ts`; **A upsert directo** (mesma regra `lib/estrategias-admin/opcoes.ts`) |
| 8 | **Trailing** (tempo real, arranca, distância, passo) | ✔ OpcoesEstrategia **e** TrailingEstrategias (2× no mesmo ecrã) | ✔ TrailingEstrategias | ✔ formulário | S `/api/admin/mtmcopy/trailing-estrategias` (prov) **e** `estrategia-opcoes` (prov); A upsert |
| 9 | Saídas parciais (`saidas_pct`) | só leitura (relatório espelho) | — | ✔ formulário | só A upsert |
| 10 | **Espelho provider**: criar conta espelho, ligar, config (seguir fechos / parciais / níveis) | ✔ EspelhoProviderRelatorio | — | só leitura (veredicto) | S `/api/admin/mtmfunded/espelho-provider` (mtm_trading_accounts + prov.espelho_*) |
| 11 | **Cópia da rota provider on/off** (route.enabled + `prov.ativo` + CopyFactory) | via Rotas provider (PUT telegram-sources, sem espelho em prov) | igual | — | P `/api/admin/mtmcopy/t2t-controls {route_copy}` (ss.mtmcopy_signal_sources + prov.ativo + CopyFactory); C/M `PUT /api/admin/mtmcopy/telegram-sources` (ss) |
| 12 | **T2T on/off** por rota e canais extra | via Rotas provider | igual | — | P `t2t-controls {route_t2t, extra_channel}`; C/M `PUT telegram-sources` (ss) |
| 13 | Canal de chat da estratégia (`canal_chat`) | só leitura | — | ✔ formulário | S `providers {criar}`; A upsert |
| 14 | Receção por canal, exec switches, regras perps, sombra Sensei | ✔ MtmcopyStrategyControl | ✔ igual — **duplicado** | — | `/api/admin/mtmcopy/strategy-config` (ss) |
| 15 | Senders Telegram / rotas provider (canais activos, chat ids, conta/estratégia CF) | ✔ | ✔ — **duplicado** | — | `PUT /api/admin/mtmcopy/telegram-sources` (ss) |
| 16 | Contas provider MetaApi (criar/apagar) | ✔ | ✔ — **duplicado** | (equipa: ligar conta, #1) | `/api/admin/mtmcopy/provider-account` |
| 17 | Subscritores: ligar/desligar, mover, lote, criar contas SIM; travas da mestre | ✔ secção Cópia (quadro) | — | — | `/api/admin/mtmauto-copia/cadeia` → `lib/copia-contas/servidor/cadeia.ts` (+ sincronizar-rotas) |
| 18 | **Apagar** | ✔ «esconder» (recusa com seguidores/live) | — | ✔ DELETE que PÁRA os seguidores e esconde (+ apagar conta MetaApi) | S `estrategia-opcoes {apagar}`; **A escreve prov/subs/rotas directamente** — duas semânticas |
| 19 | Equipas onde a estratégia aparece (`mtmauto_provider_tenants`) | — | — | ✔ (super admin) | A `providers {equipas}` |
| 20 | Providers por equipa (lista) | ✔ leitura | ✔ leitura | ✔ (a sua equipa) | — |
| 21 | Conta mestre (`prov.funded_account_id`) | via registar | via registar | ✔ ligar conta MTM Funded | registar-provider; `lib/mtmfunded/estrategias-sinais/contas.ts` (provisionamento das contas do dono); A `contas-estrategia/mtmfunded` |
| 22 | Reconciliação CopyFactory (re-sync) | ✔ | — | — | `/api/admin/mtmauto-copia/estrategias POST` |
| 23 | Testes (ordem de teste, Telegram) | ✔ | ✔ | — | `test-provider-trade`, `test-telegram` (sem estado) |

### Quem escreve `mtmauto_providers` (antes)
1. `app/api/admin/mtmcopy/trailing-estrategias` — 4 colunas de trailing
2. `app/api/admin/mtmcopy/t2t-controls` — `ativo` por slugs da rota (espelho da pausa)
3. `app/api/admin/mtmfunded/espelho-provider` — `espelho_funded_account_id`, `espelho_provider_ativo`, `espelho_config`
4. `app/api/admin/mtmauto-copia/providers` — insert do provider externo
5. `lib/admin-centro/servidor/opcoes-estrategia.ts` — opções, apagar/restaurar
6. `lib/mtmfunded/estrategias-sinais/contas.ts` — `funded_account_id` (provisionamento, não é decisão)
7. **MTM Auto**: `/api/admin/providers` (upsert, fonte, DELETE), `/api/admin/contas-estrategia*`, `/api/admin/telegram {ligar}`

### Quem escreve `mestres_estrategias` (antes)
- `lib/mestres/servidor/painel-escrita.ts` (site) e `registar-provider.ts` (site)
- **MTM Auto** `/api/admin/mestres` — directamente

### Contradições já visíveis no inventário
- Trailing editável DUAS vezes no mesmo ecrã do Centro (opções + painel de trailing).
- Apagar tem duas regras: o site recusa com seguidores; a MTM Auto pára-os e esconde.
- A pausa da cópia (`t2t-controls`) espelha em `prov.ativo`; o mesmo `enabled` mudado pelo PUT de
  `telegram-sources` NÃO espelha — o painel de rotas pode «pausar» sem parar a MTM Auto.
- A app-mobile tem o seu próprio admin de T2T/cópia (P) — um quarto sítio.

## Alvo (fases 1–3)

| Camada | Ficheiro |
|---|---|
| Escrita única | `lib/admin-centro/servidor/estrategia-escrita.ts` (+ regra pura `lib/admin-centro/estrategia-escrita-plano.ts`) |
| Leitura da página | `lib/admin-centro/servidor/estrategia-ficha.ts` (+ contradições puras `lib/admin-centro/estrategia-contradicoes.ts`) |
| API | `GET/POST /api/admin/centro/estrategia` — admin do site vê tudo; admin MTM Auto vê só a sua equipa |
| Página | `/admin/centro?s=estrategias&e=<slug>` |

As 6 rotas antigas ficam vivas como **fachadas finas** que chamam a camada única.
