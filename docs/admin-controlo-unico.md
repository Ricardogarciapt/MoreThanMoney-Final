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

## Fase 1 — feito (05/10)

**Página por estratégia**: `/admin/centro?s=estrategias&e=<slug>` (`components/admin/centro/estrategia-pagina.tsx`).
Ordem do ecrã = hierarquia pedida pelo dono:

1. **Atenção** — contradições entre elos (`lib/admin-centro/estrategia-contradicoes.ts`): fonte
   desligada × mestre live, MT5 por ligar × live, apagada/inactiva × live, mestre sem conta,
   CopyFactory por cortar × propagação live, kill/motor desligado, T2T live × T2T da rota desligado,
   cópia pausada × estratégia activa na app, rota activa para quem não tem direito, subscrição em
   auto-aceitar sem rota.
2. **Cadeia** (cada elo com o seu interruptor):
   1. Fonte — tipo, conta/chat, estado (viva / desligada / MT5 por ligar / sem fonte), canal T2T,
      último sinal; «Registar na cadeia» quando não há mestre.
   2. Conta mestre — login, saldo/equity, **posições abertas agora**, CopyFactory por cortar; os três
      modos (sinal → mestre, propagação, T2T) com o motivo de bloqueio do live.
   3. Rotas — `copia_rotas` da mestre: destino, tipo, live/sombra pela regra do motor, estado/motivo
      de pausa, lote, abertas, último evento, direito; Ligar/Desligar subscritor; cópia da rota provider.
   4. Subscritores — MTM Auto (auto-aceitar, lote, rota?, direito), contas MTM Funded que seguem,
      ligações T2T do canal; Tap to Trade on/off da rota provider.
   Ao lado: a MESMA coluna do quadro de cópias (`vista-simples.tsx`), e «Ver no quadro de cópias»
   abre `?s=copia&estrategia=<slug>` filtrado.
3. **Gestão** — `OpcoesEstrategia` (listada, a executar, SL mínimo, trailing, risco, BE, máx/dia,
   símbolos, apagar=esconder/restaurar), saídas parciais (novo no site, validado: soma ≤ 100 %),
   espelho provider (criar conta, ligar, fechos/parciais) e fonte de execução mestre/espelho.
4. **Detalhe** — ids, recolhido.

**Escrita única**: `lib/admin-centro/servidor/estrategia-escrita.ts` (`escreverEstrategia(quem, {accao,…})`)
com a regra pura em `lib/admin-centro/estrategia-escrita-plano.ts`. Acções: `opcoes`, `trailing`,
`saidas`, `fonte`, `apagar`, `apagar_parando`, `restaurar`, `registar`, `gravar`, `conta`
(alcance **equipa**) · `mestres`, `rota_provider`, `canal_extra`, `espelho`, `criar`, `equipas`,
`subscritor`, `conta_mestre` (alcance **casa**: só admin do site / super admin).

**API**: `GET /api/admin/centro/estrategia?e=<slug>` (página), `GET …?lista=1[&equipa=]`, `POST …`.
Guarda `soQuemDecide`: admin do site → tudo; admin da MTM Auto (Bearer) → só a sua equipa.

### As 6 rotas que escreviam `mtmauto_providers` — agora fachadas
| Rota | Depois |
|---|---|
| `api/admin/mtmcopy/trailing-estrategias` POST | → `escreverEstrategia({accao:'trailing'})` |
| `api/admin/mtmcopy/t2t-controls` POST | → `rota_provider` / `canal_extra` (mesma ordem do travão) |
| `api/admin/mtmfunded/espelho-provider` POST | → `espelho` (criar_conta / ligar / config) |
| `api/admin/mtmauto-copia/providers` POST | → `registar` / `criar` |
| `lib/admin-centro/servidor/opcoes-estrategia.ts` | chamado SÓ pela camada (`opcoes`/`apagar`/`restaurar`); a rota `centro/estrategia-opcoes` POST passa pela camada |
| `lib/mtmfunded/estrategias-sinais/contas.ts` | → `conta_mestre` |
| (extra) `api/admin/mtmauto-copia/mestres` POST e `centro/acoes {trocar_fonte}` | → `mestres` / `fonte` |

`mestres_estrategias`: `painel-escrita.ts` só é importado pela camada; `registar-provider.ts` só é
chamado pela camada (`registar`/`criar`).

Guardas: `lib/admin-centro/__tests__/estrategia-escrita.check.ts` (paridade com a regra antiga de
cada rota + franchisado X → 403 em Y, sem escrita) e `estrategia-contradicoes.check.ts`.

## Centro: o que mudou (revamp 05/10)

Pedido do dono: menos secções e cartões repetidos; atenção → controlo → detalhe. Nada que o dono
use deixou de existir sem destino.

| Onde estava | Para onde foi | Porquê |
|---|---|---|
| Secção **MTM Funded** (`?s=funded`, atalho 7) | Contas → grupo «MTM Funded» (aberto por `?s=contas&grupo=funded`); `?s=funded` redirecciona | as contas Funded já estavam na lista de Contas; o resto é um grupo |
| Secção **Sincronização & Auditoria** (`?s=sincronizacao`, atalho 8) | Cópia → «Sincronização & auditoria» (aberto por `?s=copia&grupo=sincronizacao`); `?s=sincronizacao` redirecciona | sincronizar é reconciliar a cópia; a secção Cópia continua a ser o quadro de controlo (URL igual) |
| Estratégias → gaveta: opções, trocar fonte, link «Pausar/apagar no admin MTM Auto» | Página da estratégia (Gestão) | dois sítios com o mesmo interruptor; a gaveta é agora resumo + «Abrir a página» |
| Estratégias → **TrailingEstrategias** | Página da estratégia → Opções (trailing estava 2× no mesmo ecrã) | duplicado |
| Estratégias → MotorMestres aberto no topo | «Motor e criação» (recolhido); os modos por estratégia estão na página | o motor inteiro (kill, contas) não é de uma estratégia |
| Estratégias → azulejos «Em espelho» e «Ideias 30 d» | coluna «Ideias 30 d» da tabela; espelho na página | cartões repetidos |
| Estratégias → 12 acordeões em 3 grupos | «Atenção» (só as com problemas) · lista · «Motor e criação» · «Diagnóstico» | hierarquia |
| Estratégias → «Senders» e «Rotas provider» separados | um só acordeão «Senders · Telegram e rotas provider» | o mesmo assunto |
| `?s=copia` | fica; ganha filtro `&estrategia=<slug>` e o grupo de sincronização | regra do dono |
