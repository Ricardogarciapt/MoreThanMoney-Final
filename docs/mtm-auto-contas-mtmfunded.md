# MTM Auto — contas `plataforma = 'mtmfunded'` (patch a aplicar no repo mtm-auto)

Origem: branch `contas-espelho-estrategias` do site (migração `070_contas_seguem_estrategia.sql`).
Este documento é a especificação; **o repo `~/Projetos/mtm-auto` não foi tocado**.

## O que existe do lado do site / base

- `mtm_trading_accounts` (motor `sim`) ganha `segue_estrategia text` (slug de `mtmauto_providers`)
  e `aceita_t2t boolean`. `metricas.analise = true` → as regras do programa não quebram a conta.
- `mtmauto_accounts` ganha `funded_account_id uuid` (FK → `mtm_trading_accounts.id`, único) e um
  check em `plataforma` (`mt4 | mt5 | tradelocker | mtmfunded`).
- Cada conta atribuída tem uma linha `mtmauto_accounts` com:
  `plataforma='mtmfunded'`, `funded_account_id`, `metaapi_account_id = null`, `login` (77xxxxxx),
  `servidor='MTM Funded'`, `corretora='MTM Funded'`, `estado='connected'`, `copia_ativa=true`,
  `demo=false`, `paga=false`, `principal=false`, `rotulo = nome_exibicao = 'MTM Funded · <estratégia>'`.
- `mtmauto_subscriptions` à estratégia com `conta_id` = essa linha e `auto_aceitar=false` — **só se
  o utilizador não tinha subscrição a essa estratégia** (`unique (user_id, provider_id)`; as rotas
  fazem upsert por essas colunas). Ex.: o Alcy já subscreve `premium-ouro` na conta real
  `e3f00c7a…` → essa subscrição fica intacta e a conta MTM Funded Premium existe sem subscrição.
  **Para saber que estratégia uma conta `mtmfunded` segue, ler `mtm_trading_accounts.segue_estrategia`
  via `funded_account_id` — não a subscrição.**
- Quem executa estas contas é o motor do VPS (`services/funded-motor/espelho-estrategias.ts`), que
  espelha as posições da conta-mestre da estratégia. **Nunca MetaApi, nunca CopyFactory, nunca o
  executor do MTM Auto.**

Leituras para uma conta `mtmfunded` (tudo na mesma Supabase, service role):

| O quê | Onde |
|---|---|
| saldo / equity / margem | `mtm_trading_accounts.sim_saldo`, `sim_equity`, `sim_margem` (moeda USD) |
| posições abertas | `funded_positions` `account_id = funded_account_id and estado='aberta'` (lucro flutuante: `lib/mtmfunded/simulado/matematica.ts#estadoDaConta` com `funded_precos`) |
| histórico | `funded_positions` `estado='fechada'` (parciais = filhas com `mae_id`); líquido = `pnl + swap − comissao` |
| métricas | `lib/mtmfunded/simulado/desempenho.ts#desempenhoDaConta` (copiar o ficheiro; é puro) ou `GET /api/mtmcopy/mtmauto-metrics` do site (campo `contasFunded`) |
| comentário da trade | `funded_positions.comentario` («MTM Auto Premium», «T2T premium») |
| estratégia seguida | `mtm_trading_accounts.segue_estrategia` → `mtmauto_providers.slug` |

Sugestão: um helper único `lib/mtmfunded.ts` no mtm-auto com `ehMtmFunded(c) = c.plataforma === 'mtmfunded'`
e `lerContaFunded(db, fundedAccountId) → { info: { balance, equity, currency:'USD' }, posicoes }`
(forma igual à de `infoDaContaDetalhada` / `posicoes` / `lib/tradelocker/operacoes`), usado em todos os pontos abaixo.

## Alterações, ficheiro a ficheiro

### 1. `app/api/auto/ligacao/route.ts` — **URGENTE** (antes de haver contas mtmfunded)
- **GET** (lista de contas, ~l.36–110): hoje uma conta sem `metaapi_account_id` e não-TradeLocker cai em
  `[{ info: null, falhouLeitura: false }, null]` → `ligada = false` → **grava `estado='error'`** na linha.
  Acrescentar o ramo `ehMtmFunded(c)` antes do da MetaApi: ler `lerContaFunded` (saldo, equity,
  posições), `ligada = true`, **nunca** actualizar `estado`/`saldo_maximo` destas linhas. Devolver
  `plataforma: 'mtmfunded'`, `estrategia` (nome) e `simulada: false` no payload (o dono quer-nas
  apresentadas como contas vivas).
- **POST** (limite, ~l.166–182): `jaLigadas` tem de excluir `plataforma = 'mtmfunded'` (`.neq('plataforma','mtmfunded')`) — não ocupam vagas.
- **PATCH** (~l.307): recusar mudar `principal`/risco em contas `mtmfunded` (não fazem nada) ou ignorar.
- **DELETE** (~l.318–334): recusar (403 «conta atribuída pela equipa») para `mtmfunded`; nunca chamar `apagarConta`.

### 2. `lib/limites-conta.ts` — `extrasDisponiveis` / qualquer contagem de `mtmauto_accounts`
Excluir `plataforma = 'mtmfunded'` de todas as contagens (reais, demos, extras). O site já o faz em
`app/api/mtmcopy/provision`, `app/api/mtmcopy/tradelocker`, `app/api/mtm-auto/conta-t2t`.

### 3. `lib/executor.ts#abrirNasContas` (~l.103–200) — **URGENTE**
Depois de escolher `conta`: `if (conta.plataforma === 'mtmfunded') { await registar('skipped', 'MTM Funded account — executed by the MTM Funded engine'); saltadas++; continue }`.
Sem isto, um «aceitar» na app para uma estratégia cuja subscrição aponta a uma conta mtmfunded
chega a `lerEstadoDoCliente` sem MetaApi e regista erro. (O Tap to Trade nestas contas funciona pelo
site: `POST /api/mtmcopy/tap-to-trade` abre também nas contas `aceita_t2t`.) Opcional depois: para
`opts.apenasUser`, chamar essa rota do site com o Bearer do cliente em vez de saltar.

### 4. `lib/motor.ts#lerEstadoDoCliente` (~l.306)
Ramo `ehMtmFunded(conta)` → saldo e posições por `lerContaFunded`. Defesa em profundidade para qualquer
outro chamador.

### 5. `app/api/cron/motor/route.ts` (~l.123–140, «Acompanhar o que está aberto»)
`contas` → saltar `plataforma='mtmfunded'` (não há `mtmauto_executions` delas; se houver por engano,
não as fechar como órfãs). Verificar também `lib/desfecho-pela-fonte.ts#fecharExecucoesOrfas` (~l.130):
não muda (as contas existem).

### 6. `app/api/auto/emergencia/route.ts` (~l.27–60)
Filtrar `.neq('plataforma','mtmfunded')`. O botão de emergência não fecha posições simuladas (quem as
gere é o espelho da estratégia; fechá-las à mão marca a ponte como `fechada_local`).

### 7. `app/api/auto/history/route.ts` (~l.64–90)
`contas` hoje filtra `metaapi_account_id` → as mtmfunded desaparecem. Juntar, por conta mtmfunded, as
linhas de `funded_positions` fechadas no período (uma por saída; `resultado = pnl+swap−comissao`,
`pips` com `pipSizeForSymbol`), com `conta = rotulo`, e a flutuação das abertas por `estadoDaConta`.
Referência: `app/api/mtm-auto/historico/route.ts` do site (bloco «Contas MTM Funded no MTM Auto»).
O saldo para a % vem de `sim_saldo`.

### 8. `app/api/auto/signals/route.ts` (~l.49–70)
A conta usada para cotações/flutuação é «a primeira `connected`» com `metaapi_account_id`: acrescentar
`.not('metaapi_account_id','is',null)` para nunca escolher uma mtmfunded (senão fica sem preços).

### 9. `app/api/auto/validar-corretora/route.ts` (~l.22–35)
Excluir `mtmfunded` da escolha da conta (não é corretora; não conta para isenção por saldo).

### 10. `app/api/auto/onboarding/route.ts` (~l.34) e `app/api/auto/reportar/route.ts` (~l.21)
Onboarding: uma conta mtmfunded **não** conta como «corretora ligada» (senão salta o passo de ligar a
conta real). Reportar: incluir `plataforma` na linha.

### 11. `app/api/auto/settings/route.ts` (~l.89) e `app/api/auto/definicoes/route.ts` (~l.25)
Update sem `contaId` aplica a todas as contas: acrescentar `.neq('plataforma','mtmfunded')`. Definições:
mostrar as mtmfunded só como leitura (risco é o da estratégia, proporcional ao saldo).

### 12. `app/api/admin/contas-estrategia/route.ts`, `app/api/admin/reparar-resultados/route.ts`, `app/api/admin/users/route.ts`
Já filtram `metaapi_account_id not null` (1, 2) — ok. `admin/users` (l.76) conta contas por utilizador:
separar `mtmfunded` para não parecer que o cliente ligou 6 corretoras.

### 13. UI (`app/(app)/…`)
Lista de contas / seletor de conta / cartão de estratégia: ícone e selo «MTM Funded», etiqueta
«segue <estratégia>», saldo/equity em USD vindos do GET de `ligacao`. Sem botões de ligar/desligar,
sem editar risco. Métricas por conta: `desempenhoDaConta` (trades terminadas, taxa de acerto por trade
com parciais pesados, pips, % retorno, drawdown máximo). **Sem euros.** Ícone por equipa e restante
branding sem alterações.

## Verificação sugerida
1. Aplicar a 070; criar as contas (rota do admin do site `sim_criar_contas_estrategia`).
2. Abrir a app MTM Auto com o Fábio: as 5 contas aparecem `connected`, com saldo 1000 USD, e o
   `estado` delas **não** muda para `error` após o GET de `ligacao` (item 1).
3. Aceitar um sinal na app: execução `skipped` com o motivo do item 3 na conta mtmfunded; nenhuma
   chamada à MetaApi para ela.
4. Ligar uma conta real nova: o limite não conta as mtmfunded (item 2).
