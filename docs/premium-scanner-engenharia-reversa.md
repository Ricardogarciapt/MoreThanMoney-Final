# MTM Premium Scanner — engenharia reversa dos sinais Premium

27/10/2026 · pedido do Ricardo: estudar todos os sinais Premium desde o início, montar um indicador e uma estratégia
em Pine que dêem resultados parecidos e preparar o scanner para as 3 sessões.

Ficheiros:
- `docs/pine/mtm-premium-scanner.pine`: o indicador, com alertas JSON para o webhook.
- `docs/pine/mtm-premium-scanner-estrategia.pine`: a estratégia, para fazer backtest no TradingView.
- `scripts/estudos/premium-scanner-check.py`: refaz todas as medições abaixo.

## 1. Os dados

| | |
|---|---|
| Sinais lidos (`chat_messages`, canal `premium-ideas`) | 926 com zona, SL e TP1 |
| Sinais únicos, sem repetições no espaço de 3 min | **871**, de 04/06 a 27/10/2026 |
| Activo | só XAUUSD |
| Direcção | 489 vendas e 382 compras |
| Velas para medir (`_bt_velas`, XAUUSD M15) | só existem de 04/09 a 26/10 → **221 sinais** com preço |

Os sinais de junho a agosto (650) servem para medir horários e geometria. Não servem para testar o scanner, porque
não há velas desse período na base.

## 2. O que os sinais têm em comum

**A geometria é sempre a mesma.**
- A zona tem 5 a 6 $ (841 dos 871 sinais).
- O SL fica 5 $ para lá da zona (817 dos 871).
- O TP1 fica a 5 $ da borda da zona (819 dos 871), e o TP2 e o TP3 seguem de 5 em 5 $.
- A zona fica cerca de 4 $ contra o preço do momento. A entrada é feita num recuo.

**O horário (UTC) é concentrado.**

| Janela | Sinais | % |
|---|---|---|
| Londres 07–11h | 459 | 53 % |
| NY 13–16h | 290 | 33 % |
| Ásia 00–06h | 66 | 8 % |

Entre setembro e outubro foi quase tudo em Londres: houve sinais em 35 de 36 dias de Londres e só em 6 dias de NY.

**A direcção segue o movimento.**
- 85 % dos sinais repetem a direcção do sinal anterior do mesmo dia.
- As compras surgem depois de subidas: em mediana, +11 $ em 4 h e o preço acima da abertura do dia. As vendas surgem depois de descidas.

## 3. O scanner (lógica do Pine)

- **Sessões**:
  - Londres 07:00–11:00 UTC e NY 13:00–16:00 UTC estão ligadas.
  - A Ásia 00:00–06:00 está desligada por omissão (ver ponto 4).
  - Cada sessão tem o seu interruptor.
- **Direcção**: voto de 3 critérios, no fecho da vela M15:
  - o preço contra a abertura da sessão;
  - o preço contra o de há 1 h;
  - o preço contra o de há 4 h.
- **Cadência**: um sinal no máximo a cada 2 velas (30 min) e até 6 por sessão.
- **Geometria**: a mesma dos sinais originais (zona de 5 $ a 4 $ contra o preço, SL a 5 $, TPs de 5 em 5 $).
- **Estratégia**:
  - Entra com uma ordem limite no meio da zona, válida 1 h.
  - Divide a posição em 3 partes, uma para cada TP.
  - Depois do TP1, o SL das outras partes passa para o break-even.

## 4. Semelhança medida (04/09–26/10, mesmas velas M15)

**Timing e direcção, só em Londres**

| | Treino (set.) | Teste (out., nunca visto) |
|---|---|---|
| Sinais originais com sinal do scanner na mesma direcção a ±30 min | 65/132 (49 %) | 49/89 (55 %) |
| Sinais do scanner com sinal original na mesma direcção a ±30 min | 56/108 (52 %) | 52/108 (48 %) |
| Direcção certa no instante de cada sinal original | 64 % | 70 % |

A direcção é o ponto fraco. Neste período 60 % dos sinais foram vendas, por isso «vender sempre» já acertava 60 %.
O voto de 3 acerta 66 %, o que é pouca vantagem. O momento do sinal é, na prática, a cadência dentro de Londres.

**Resultado (mesma execução: limite no meio da zona válida 1 h, 3 partes, break-even depois do TP1)**

| | Trades | TP1 | SL cheio | Pips líquidos |
|---|---|---|---|---|
| Sinais Premium originais | 151 | 50 % | 50 % | **−925** (−6,1/trade) |
| Seguimento real na base (`mtmcopy_signal_tracking`) | 150 com entrada | — | 119 | **−1 373** (−9,2/trade) |
| Scanner, Londres | 124 | 49 % | 51 % | **+108** (+0,9/trade) |
| Scanner, NY | 159 | 56 % | 44 % | **+342** (+2,1/trade) |
| Scanner, Ásia | 147 | 48 % | 52 % | **−1 550** (−10,5/trade) |

**Leitura**

- Em Londres o scanner dá o mesmo perfil dos sinais originais: cerca de metade chega ao TP1 e a outra metade leva o SL.
  O resultado líquido fica perto de zero nos dois. Nesse sentido, os resultados são «idênticos».
- Só que o original, medido aqui, perdeu. O nosso próprio seguimento mostra −1 373 pips no mesmo período. Os totais
  diários que a fonte publica («Total Net … PIPS») não se reproduzem quando se mede pelo preço.
- A Ásia perde de forma clara e por isso fica desligada. NY é a melhor das três, mas a fonte quase não deu sinais
  em NY desde setembro, por isso há pouco com que comparar.
- Os valores são todos em pips de ouro (1 $ = 10 pips), sem spread nem comissão. As velas M15 não têm abertura
  (usa-se o fecho anterior). Quando o SL e o TP caem na mesma vela, conta-se o SL.

## 5. Limites e próximos passos

1. **Mais histórico.**
   - Há velas só para 221 dos 871 sinais.
   - Para testar com junho a agosto (650 sinais, incluindo o bloco de NY às 14h), é preciso puxar velas M5/M15
     desse período pela MetaApi (mesmo método de `scripts/estudos/sensei-check.ts`) e voltar a correr o script.
2. **Sombra antes de execução.**
   - O alerta envia `strategy:"PremiumScanner"`. O webhook ainda não conhece essa chave, por isso nada é executado.
   - O passo seguinte é registar os alertas em sombra durante 2 semanas, ao lado dos sinais Premium reais, e só
     depois ligar uma mestre.
3. **Não se prometem taxas de acerto.** Os números acima são medições num período curto e com o preço de um só
   feed.

## SQL usado

```sql
-- sinais (deduplicar depois: mesma direcção, |SL| ≤ 1 e < 3 min)
select created_at, content from chat_messages
where channel_slug = 'premium-ideas' and coalesce(is_deleted, false) = false
  and content ~* 'SL\s*:?\s*[0-9]' and content ~* 'TP1';
-- velas
select t, h, l, c from _bt_velas where sym = 'XAUUSD' order by t;
```
