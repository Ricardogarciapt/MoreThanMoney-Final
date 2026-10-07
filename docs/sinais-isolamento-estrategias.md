# Isolamento por estratégia — sinais, entradas, seguimentos, mestres, slaves e desfechos

07/10/2026 · migração `199_sinais_isolamento_estrategias.sql` · código em `lib/sinais/identidade.ts`

## O problema

Cada etapa da cadeia encontrava a anterior pelo **ticker**, pela **«mais recente»** ou por um **texto**.
Com duas estratégias no mesmo par isso mistura-as. Casos provados a 07/10:

- A entrada do Sensei ia à ideia pendente mais recente do XAUUSD, que era do GoldKiller ou do MTM Scanner. Ficava barrada ou activava a ideia alheia.
- Os TP do Sensei marcaram a compra do MTM Scanner (seguimento → «última entrada do ticker»).
- Qualquer alerta de ouro/BTC que não fosse GoldKiller ia para a conta e para a mestre do **Sensei** (`execTarget`), mesmo sem estratégia reconhecida.

## Mapa — onde a correspondência era feita por heurística

| # | Onde | O que mistura | Impacto | Estado |
|---|---|---|---|---|
| 1 | webhook TV · `findPendingSenseiIdea` | ideia pendente do ticker, de qualquer scanner; repetia sem timeframe | entrada de A activa/funde a ideia de B; `pendingHadLimit` barra a entrada | **corrigido**: só a mesma estratégia, 2+ = nada |
| 2 | `saveSenseiTradeIdea` | expira TODAS as pendentes do símbolo | ideia do GoldKiller mata a do Scanner | **corrigido** |
| 3 | `findActiveSenseiIdeaForFollowup` | símbolo + preço ±0,2%, senão a mais recente | thread/contexto/SL original/gestão na trade errada | **substituído** por `ideiaDaEntrada` (ids) |
| 4 | webhook TV · seguimento Pine → entrada | ticker + `alert_name` + preço só no Sensei | TP de A marca a entrada de B | **corrigido**: estratégia + chave |
| 5 | webhook TV · eventos JSON (`event: tp_hit…`) | a mais recente do ticker com o mesmo nome | idem | **corrigido**: sem chave = não toca |
| 6 | webhook TV · `execTarget` / mestre | tudo o que não é GoldKiller → Sensei | a mestre e a conta do Sensei recebem sinais alheios | **corrigido**: fonte da mestre = estratégia |
| 7 | webhook TV · BE redundante | última linha do tracker do símbolo, qualquer canal | BE de A calado pelo TP de B | **corrigido**: seguimentos da mesma entrada |
| 8 | webhook TV · gestão legada (`processMtmcopyWebhookManagement`) | posição do símbolo na conta; MTM Scanner ia à conta Sensei | parcial/BE/fecho no ticket errado | **corrigido**: só com entrada ligada e executor da estratégia |
| 9 | `t2t-lifecycle › findEntryMessageWithFollowers` | últimas 60 mensagens do canal, texto com o símbolo | fecha o sinal errado | **corrigido no webhook** (passa a mensagem da entrada); restantes chamadores na fase 2 |
| 10 | `t2t-lifecycle › closeFollowerOrder` | todas as pendentes + posições do símbolo na conta do cliente | fecha trades de outras estratégias / manuais | **corrigido**: por `broker_position_id`; sem id só se não houver outro T2T no símbolo |
| 11 | `t2t-lifecycle` · anti-duplicado 60 min | mesmo prefixo no canal | 2.º setup no mesmo par calado | **corrigido**: na thread da entrada |
| 12 | mestres · aceite T2T → posição da mestre | par/direcção/janela; a mais recente ganha | cliente liga à camada errada (Premium 2 vivas) | **corrigido**: ponte por `chat_message_id`; várias = ambíguo, não abre |
| 13 | `pendente.ts` · ponte ↔ ordem | id da ordem em texto (`erro`) | seguimentos de limites cheias nunca publicados | **corrigido**: `funded_order_id` + ligação a cada passagem do publicador |
| 14 | relay-post → processador Premium | pai = `reply_to_message_id` cru (quase sempre null) | «HIT SL»/«Close all» sem id do sinal; thread pela heurística dos pips | **corrigido**: pai no destino pelo mapa fonte→destino |
| 15 | signal-tracker · entrada cheia | `preço do lado certo` (só vale para limite) + preço MetaApi | «Todos os sinais» enche horas depois a preços que não houve | **corrigido** (ver abaixo) |
| 16 | `telegram-reply-thread › resolveThreadParent` | pips do texto, depois «última entrada» do canal | `reply_to_id` errado vira identidade | fase 2 |
| 17 | `signal-outcomes › emparelhar` | um fecho fecha todas as entradas anteriores do canal | desfecho no setup errado | fase 2 (usar `reply_to_id`) |
| 18 | `premium-management-exec`, `processor` (SL edit, `cancelPremiumPendingOnClose`), `position-management` (`closePositionsBySymbol`) | símbolo na conta / último do símbolo | gestão legada MT5 na posição errada | fase 2 (legado; a mestre SIM já vai por `ideia_ref`) |
| 19 | `t2t-management` / `master-poll` (`editT2TForSlaves`, `closeT2TForSlaves`) | todas as linhas T2T do canal + símbolo | edição/fecho a todos | fase 2 (`signal_chat_message_id` já existe) |
| 20 | `t2t-price-monitor` (descartes) | `cancelPendingOrdersForSymbol` | apaga pendentes alheias | fase 2 (`cancelPendingOrderById` já existe) |
| 21 | `perps-position-monitor` | `symbol|side` + `startsWith` no canal | Aurum × MTM Perps no mesmo canal | fase 2 |
| 22 | `mtm-alerts/evaluate` (ramo T2T) | por ticker; `chat_channel_slug` nem é lido | ramo morto | fase 2 |
| 23 | dedupe `decidirDuplicado` / `mestres_execucoes_conta` | impressão sem estratégia | 2.ª estratégia recusada na mesma conta | intencional na «Todos os sinais»; rever com o dono |

## O modelo

Três chaves acompanham o sinal do princípio ao fim:

| chave | o que é | quem a dá |
|---|---|---|
| **estratégia** | slug de `mestres_estrategias` (`sensei`, `Goldkiller`, `mtm-scanner`, `aurum-flow`, `mtm-perps`, `premium-ouro`) | `resolverEstrategiaDoAlerta`: `?strategy=` manda; senão o nome; dois nomes = ambíguo |
| **fonte** | o cano por onde entrou (`tradingview` + chave do webhook, `tg` do relay) | o próprio endpoint |
| **id de origem** | o id que a fonte dá à trade | `chaveDaTrade`: id explícito do payload (`trade_id`…), senão a impressão que a fonte repete igual nos seguimentos: `estratégia|TICKER|dir|entrada|tf|tp1`. Premium: `msg:tg:<id da mensagem>` |

### Como cada etapa encontra a anterior

```
alerta TV ──► tradingview_signals (estrategia, chave_trade, ligacao='origem')
                 │  entrada repetida (mesma estratégia+chave aberta) → entrada_id = original, ligacao='duplicada'
                 ├─► sensei_trade_ideas (estrategia, source_signal_id | trigger_signal_id = id da entrada)
                 ├─► mestre da estratégia: encaminharSinalParaMestre(fonte = FONTE_DA_MESTRE[estrategia])
                 │      └─► mestres_sinais (estrategia, chave = <slug>:msg:tv:<id>) ─► funded_positions.ideia_ref = sinal:<chave>
                 │             └─► funded_sinal_posicoes (conta, chave, funded_position_id | funded_order_id, chat_message_id)
                 │                    └─► copia_eventos (rota_id, origem_posicao_id) ─► slaves (mestres_ordens)
                 └─► chat_messages (id) ◄── tradingview_signals.chat_message_id
seguimento TV ──► tradingview_signals (estrategia, chave_trade)
                 └─► ligarSeguimento: candidatas = entradas ABERTAS com a MESMA estratégia E chave
                        1 → entrada_id, ligacao='chave' → estado da entrada, avisos, ideia (ideiaDaEntrada),
                            fecho T2T (mensagem da entrada → mtmcopy_signal_log.broker_position_id)
                        0 → ligacao='sem_entrada' · 2+ → 'ambigua' · sem chave → 'sem_chave'
                            → NADA executa; motivo em ai_error
aceite T2T ─────► funded_sinal_posicoes.chat_message_id = mensagem aceite → funded_position_id (posição da mestre)
                   sem ponte: compatíveis por par/direcção/preço; 1 → essa · 2+ → ambíguo, não abre
```

Regra transversal: **um caso ambíguo não executa e regista o motivo**. Nunca se escolhe «a mais recente».

### Histórico

Não foi reescrito. A migração preencheu só os últimos 35 dias, onde a inferência é exacta: os 5 nomes de alerta em uso são inequívocos. As 127 entradas de seguimento do Sensei ligaram-se a uma única entrada cada. As entradas antigas ainda «abertas» e sem identidade ficaram `ligacao='legado'` (4 503). Nenhum seguimento novo as toca.

## Signal-tracker parado desde 02/10 (conta «Todos os sinais»)

- **Causa:** o tracker cotava pelas contas MetaApi provider (`referencePrice`). Essas contas deixaram de responder a 02/10 por volta das 21 h. Sem preço, nada avançava: a última entrada cheia foi a 02/10 às 16:23 e a última cotação a 03/10 às 06:17. Ficaram 29 linhas pendentes, porque o descarte de 24 h também dependia do preço.
- **Correcção:**
  - O preço da casa (`funded_precos`, fresco ≤ 60 s) vem primeiro e a MetaApi fica como reserva. É o mesmo preço com que as contas simuladas abrem.
  - A validade conta-se no relógio, sem precisar de cotação.
  - Descartes com mais de 6 h de atraso fecham em silêncio, para não despejar cartões velhos no chat.
- **Entradas a preços que não houve** (02/10 12:30, três SELL Premium de manhã abertos de uma vez): o tipo da entrada (limite ou stop) passa a decidir-se na admissão, contra o preço desse instante (`preco_admissao`, `tipo_entrada`). A entrada só enche quando o preço a atravessa nesse sentido. O Premium vale 60 min, a mesma janela da limite da mestre. O preenchimento continua pelo pior dos dois preços (`precoDePreenchimento`).
- **`pendente.ts`:** aplica o `lote_minimo` da conta (197) e grava `funded_order_id`.

## Guardas

- `lib/sinais/__tests__/isolamento-estrategias.check.ts`: as quatro garantias (A–D), mais guardas estáticas no webhook, nas ideias e no T2T.
- `lib/mtmcopy/__tests__/tracker-entrada.check.ts`: tipo e enchimento, validade e preço da casa.
- `sensei-cadeia.check.ts`, `publicar.check.ts` e `stop-original-e-entrada.check.ts` foram adaptados à forma nova. A intenção de cada um mantém-se.

## Fase 2

Os itens 16 a 23 da tabela, por esta ordem de risco: 18 (gestão MT5 legada por símbolo), 19, 20, 17, 16, 21 e 22.

Também na fase 2:

- O webhook passa a gravar `estrategia` nas linhas que já existem em `mtmcopy_signal_tracking` e `mtmcopy_signal_log`. Hoje essas linhas têm `source_key` adivinhado do texto.
- Pedir ao Pine um `trade_id` explícito em todos os alertas. A chave já o aceita.
