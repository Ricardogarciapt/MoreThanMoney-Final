# Proposta: reduzir as escritas do motor na base de dados

**Estado: POR APLICAR.** Nada nesta página foi mexido. O motor executa ordens reais, por isso a
decisão é tua.

## O problema, em quatro linhas

| Tabela | Linhas | UPDATEs | Escreve quando |
|---|---|---|---|
| `funded_precos` | 194 | 3 498 270 | cada 1s (símbolos do provider) ou 5s (restantes) |
| `metaapi_snapshot` | 5 | 1 355 656 | cada 1s por conta ligada |
| `mtm_trading_accounts` | 173 | 1 008 529 | ciclo de contas |
| `gestao_real_pulso` | 1 | 169 684 | batimento a cada 2s |

Seis milhões de reescritas em tabelas de meia dúzia de linhas. Não é volume de dados — é
frequência. Foi isto que deixou a instância sem CPU e o site a dar 504.

A migração 133 já reduziu o **custo** de cada escrita. Isto aqui reduz o **número**.

---

## 1. `funded_precos`: não reescrever o que não mudou

`services/funded-motor/motor.ts:591` — `escreverPrecos()`

Hoje não há detecção de mudança nenhuma. Os símbolos do provider são escritos **a cada segundo,
sempre**, mesmo quando o ouro não deu um tick desde a última escrita; os restantes a cada 5s, na
mesma sem olhar se mudaram.

A proposta é guardar o que foi escrito da última vez e saltar a linha quando `bid`, `ask` e `em`
são idênticos.

**Porque é seguro, e não é uma questão de opinião:** `em` é a hora do TICK (vem de
`precoEm.get(s)`), não a hora da escrita. Se não houve tick novo, `em` também não avança. Escrever
a linha outra vez grava exactamente os mesmos três valores — ninguém, em lado nenhum, consegue
distinguir a linha escrita da não escrita. A frescura que o webtrader avalia lê `em`, e `em` fica
igual nos dois casos.

Não há perda de latência: um preço que não mudou não tem nada para contar a ninguém.

**Ganho estimado:** grande e variável. Fins-de-semana, noites e símbolos parados deixam de
escrever de todo. A olho, mais de metade dos 3,5M.

**Risco:** nenhum que eu consiga identificar. É a alteração que eu aplicaria primeiro.

---

## 2. `metaapi_snapshot`: separar «as posições mudaram» de «o preço mexeu»

`services/motor-real/ligacao.ts:192` e `services/premium-streaming/streaming.ts:189`

Estes dois **já** têm detecção de mudança (`assinaturaSnapshot` + `decidirPublicacao`). O problema
é que a assinatura inclui os **preços**, e os preços mudam a cada tick. Resultado: a assinatura
nunca é igual, e a linha é publicada ao ritmo máximo permitido — `intervaloMs = 1000`, uma escrita
por segundo por conta ligada. Com as contas actuais dá os 1,36M.

A proposta é passar a ter dois ritmos:

- **posições mudaram** (abriu, fechou, parcial, SL/TP mexeu) → publica já, ao ritmo de hoje;
- **só os preços mexeram** → publica a cada 3–5s.

**O que precisa da tua decisão:** `lib/webtrader/corretoras/mt5.ts:103` lê `precos` desta linha. Se
o webtrader depende deste campo para mostrar o P&L ao vivo, atrasá-lo para 5s degrada o que tu
próprio pediste que fosse rápido. A minha leitura é que não depende — o webtrader recebe preços
pelo WebSocket do motor, que foi construído exactamente para isso — **mas quero confirmar contigo
antes de mexer**, porque é a tua prioridade declarada.

**Ganho estimado:** ~80% de 1,36M, se os 5s forem aceitáveis.

---

## 3. Batimentos: `gestao_real_pulso` e `servicos_pulso`

`services/motor-real/motor.ts:377` — `gravarPulso()`

Uma linha, reescrita a cada 2s, só para dizer «estou vivo». São 170 mil escritas para uma
informação que ninguém lê ao segundo.

Proposta: passar o batimento para 15s. O único efeito é o painel de monitorização demorar até 15s
a notar que um serviço caiu — em vez de 2s.

**Ganho estimado:** ~85% de 196k (as duas tabelas).

**Risco:** só de monitorização. Se preferires 10s ou 5s, é um número, não uma reescrita.

---

## Resumo

| # | Alteração | Escritas poupadas (estimativa) | Risco | Precisa de ti? |
|---|---|---|---|---|
| 1 | `funded_precos` só quando muda | ~1,8M+ | nenhum que eu veja | não |
| 2 | snapshot: preço a 5s | ~1,1M | webtrader (a confirmar) | **sim** |
| 3 | batimentos a 15s | ~170k | monitorização mais lenta | pequeno |

De ~6M para cerca de 1,5M–2M de escritas.

## O que isto NÃO resolve

Mesmo com tudo aplicado, a instância continua a ser a mesma. Se o Supabase voltar a ficar sem CPU
— e hoje ficou várias vezes enquanto eu media — vale a pena olhar para o plano de compute antes de
continuar a espremer o motor. Isso é dinheiro, e a decisão é tua; eu não sei o plano actual.
