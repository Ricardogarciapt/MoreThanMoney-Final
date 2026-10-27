# MTM Premium Scanner — engenharia reversa dos sinais Premium

27/10/2026, a pedido do Ricardo. O objetivo foi estudar todos os sinais Premium desde o início e construir em Pine
um indicador e uma estratégia que se comportem como esses sinais, nas 3 sessões.

**Ficheiros**
- `docs/pine/mtm-premium-scanner.pine`: o indicador, com alertas em JSON para o webhook.
- `docs/pine/mtm-premium-scanner-estrategia.pine`: a estratégia, para fazer o backtest no TradingView.
- `scripts/estudos/premium-scanner-check.py`: refaz todas as medições a partir dos dados em `dados-estudo/`.
- `scripts/estudos/premium-velas-puxar.ts --csv`: puxa as velas da MetaApi. Só lê, não escreve na Supabase.

## 1. Dados

| | |
|---|---|
| Sinais Premium (`chat_messages`, `premium-ideas`) | 871 únicos, de 04/06 a 27/10/2026, todos XAUUSD |
| Sinais com geometria válida | **833**. Os outros 38 têm gralhas, por exemplo TP1 4223 em vez de 4323. |
| Velas | XAUUSD M15 (9 752) e M5 (29 253), de 01/06 a 27/10, MetaApi conta 166531ed… |
| Desvio entre o preço dos sinais e estas velas | mediana −0,2 $ (IQR ±3 $). É o mesmo feed. |

O primeiro estudo usou as velas `_bt_velas`. Esse feed tinha um desvio de cerca de 10 $ em relação aos sinais, por isso
os números deste documento substituem os do primeiro.

## 2. O que os sinais têm em comum

**Geometria fixa**
- A zona tem 5 $ de largura.
- O SL fica 5 $ para lá da zona.
- O TP1, o TP2 e o TP3 ficam a 5, 10 e 15 $ da borda da zona. O TP4 é deixado correr.
- O meio da zona fica 4 $ contra o preço do momento, ou seja, a entrada é num recuo.

**Horário: a fonte mudou ao longo do tempo** (sessões com sinais / dias úteis)

| Mês | Ásia | Londres | NY |
|---|---|---|---|
| Junho | 12/22 | 17/22 | 19/22 |
| Julho | 12/23 | 15/23 | 14/23 |
| Agosto | 1/21 | 15/21 | 12/21 |
| Setembro | 0/22 | 21/22 | 10/22 |
| Outubro | 0/19 | 19/19 | 0/19 |

Em média há 4 a 6 sinais por sessão activa. O minuto do sinal é manual: está espalhado pelos 60 minutos da hora e
não acompanha o fecho da vela.

**Direcção: segue o movimento**
- 85 % dos sinais repetem a direcção do anterior do mesmo dia.
- O melhor resultado foi um voto de 5 critérios, todos medidos no fecho M15:
  - preço contra a abertura da sessão;
  - preço contra o de há 1 h;
  - preço contra o de há 4 h;
  - preço contra a EMA200;
  - preço contra a EMA9.
- Esse voto acerta a direcção em **66 % dos 833 sinais**. Vender sempre acertava 57 %.
- Uma regressão logística com 11 variáveis não fez melhor fora da amostra: 56 a 66 %. Com dados de preço, este é
  o tecto. O resto da decisão é discricionário.

## 3. O scanner

- **Sessões**: Ásia 00–06, Londres 07–11 e NY 13–16 UTC. Cada uma tem o seu interruptor e vêm todas ligadas.
- **Direcção**: voto de 5.
  - `Maioria`, a opção por omissão, é a réplica dos sinais.
  - `Unânime` só dispara quando os 5 critérios concordam.
- **Cadência**: no máximo 1 sinal a cada 30 min e 6 por sessão.
- **Geometria**: a mesma dos sinais originais.
- **Estratégia**:
  - Entrada com ordem limite no meio da zona, válida 1 h.
  - A posição divide-se em 3 partes, uma para cada TP.
  - Depois do TP1, o SL passa para break-even.

## 4. Semelhança medida

Contámos só as sessões em que a fonte operou. Um sinal conta como apanhado se houver outro na mesma direcção a ±30 min.

| | Jun–ago | Set–out |
|---|---|---|
| Originais apanhados pelo scanner (Maioria) | 347/562 (62 %) | 180/271 (66 %) |
| Sinais do scanner com original ao lado (Maioria) | 302/702 (43 %) | 153/300 (51 %) |
| Originais apanhados (Unânime) | 239/562 (43 %) | 116/271 (43 %) |
| Sinais do scanner com original ao lado (Unânime) | 187/423 (44 %) | 89/158 (56 %) |

## 5. Resultados

Todos com a mesma execução, simulada em M5 com as velas reais da corretora, de 01/06 a 27/10.

| | Trades | TP1 | SL cheio | Pips | Por trade |
|---|---|---|---|---|---|
| **Sinais Premium originais** (limite na zona) | 619 | 46 % | 54 % | **−5 764** | −9,3 |
| Sinais Premium originais (a mercado) | 833 | 47 % | 53 % | −3 145 | −3,8 |
| Scanner Maioria, Ásia | 463 | 55 % | 45 % | +1 558 | +3,4 |
| Scanner Maioria, Londres | 412 | 48 % | 51 % | −474 | −1,2 |
| Scanner Maioria, NY | 484 | 53 % | 47 % | +541 | +1,1 |
| Scanner Unânime, Ásia | 318 | 54 % | 46 % | +1 808 | +5,7 |
| Scanner Unânime, Londres | 223 | 52 % | 48 % | +448 | +2,0 |
| Scanner Unânime, NY | 265 | 55 % | 45 % | +1 636 | +6,2 |

**Por período** (o scanner foi escolhido em jun–ago, e set–out funciona como teste)

| Sessão | Maioria jun–ago | Maioria set–out | Unânime jun–ago | Unânime set–out |
|---|---|---|---|---|
| Ásia | +6,1/trade | −1,0 | +8,2 | +1,8 |
| Londres | −5,1 | +5,1 | +3,1 | +0,5 |
| NY | +6,0 | −6,8 | +12,9 | −7,6 |

## 6. Leitura honesta

- O scanner reproduz o comportamento dos sinais Premium. Apanha cerca de 2 em cada 3 sinais na mesma direcção,
  tem a mesma geometria e a mesma taxa de TP1, que fica em torno dos 50 %.
- Os sinais originais, medidos pelo preço, perderam: −5 764 pips em 619 trades com entrada na zona. Os totais
  diários que a fonte publica («Total Net … PIPS») não se reproduzem.
- O scanner fica perto de zero por trade. O `Unânime` sai melhor no total (+4,8/trade), mas no teste
  (set–out) fica em −1,3/trade, e o `Maioria` em −1,2/trade. NY inverteu de sinal entre os dois períodos.
- Com spread e comissão, que no ouro são cerca de 2–3 pips por trade, nenhuma das variantes tem vantagem
  comprovada. Não se publicam taxas de acerto nem resultados destes números.

## 7. Gestão das saídas (27/10)

Simulação M5 com BE depois do TP1 em todas as linhas. Os valores são pips por trade e, entre
parênteses, a % de trades que fecham positivos.

| Saída TP1/TP2/TP3 | Maioria, tudo | Maioria, set–out | Unânime, tudo | Unânime, set–out | Originais |
|---|---|---|---|---|---|
| 33/33/34 | +1,2 (52 %) | −1,2 | +4,8 (54 %) | −1,3 | −9,3 |
| **50/25/25 (por omissão)** | **+1,8 (52 %)** | **−0,5** | **+5,2 (54 %)** | **−0,8** | **−8,4** |
| 50/0/50 | +1,7 | −0,8 | +5,6 | −0,4 | −8,2 |
| 100/0/0 | +3,6 (52 %) | +1,4 | +6,2 (54 %) | +0,5 | −5,5 |
| 0/50/50 (só BE no TP1) | 0,0 (29 %) | −2,5 | +4,1 (30 %) | −2,2 | −11,2 |

O 100 % no TP1 é o melhor medido, mas deixa de haver TP2 e TP3, que são a forma dos sinais
originais. O 50/25/25 fica perto disso e mantém os três alvos, por isso é o que vem por omissão.
Tirar a parcial no TP1 é a pior opção: com o mesmo número de trades, só ~30 % fecham positivos.

## 8. Webhook em sombra

O alerta do indicador vai para `/api/webhooks/tradingview?secret=…` com `"strategy":"PremiumScanner"`
(ou com `&strategy=premiumscanner` no URL). A rota grava em `tradingview_signals` com
`estrategia='premium-scanner'`, `signal_kind='sombra'` e `trade_status='filtered'`. Por isso o alerta não
notifica, não aparece nas MTM Alerts nem nos chats e não executa (`lib/sinais/premium-scanner-webhook.ts`).

## 9. Próximos passos

1. **Sombra**: regista-se durante 2–4 semanas, lado a lado com os sinais Premium reais, e só depois se liga uma mestre.
2. **Gestão**: o resultado depende mais da saída do que da entrada. Falta testar o trailing e o TP4.
3. **Limpeza**: os dados de `dados-estudo/` saem da branch antes do merge, se o Ricardo preferir não os guardar no repo.
