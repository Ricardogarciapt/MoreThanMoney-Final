# Sombra do MTM Scanner — o que teria sido executado

Corrido a 2026-09-16 21:01 UTC · `npx tsx scripts/estudos/sombra-mtm-scanner.ts` · velas M15 do TradingView · janela de 3 dias por sinal.

> Só leitura. A estratégia continua `ativo = false`: nada disto abriu uma trade.

## Leitura (escrita à mão a 16/09 — as tabelas abaixo são geradas e podem ter mudado desde então)

**Com o gate e a gestão de hoje, o MTM Scanner perde dinheiro de forma consistente, e o volume não é
suportável.**

1. **Perde, e não é ruído.** Cerca de −0,10R por trade em ~4 300 trades. Mesmo contando só as velas de
   15 m diferentes em que as trades nasceram (as trades de uma mesma vela não são independentes), o
   intervalo de 95% fica todo abaixo de zero. Os três meses são negativos, e todas as semanas completas
   também. Os 66% de «vitórias» enganam: a maior parte são saídas no break-even (+2 pips) ou pelo
   trailing perto da entrada, e cada perda custa 1R inteiro.
2. **O stop mínimo de 20 pips é o que ainda o segura.** Com o stop que o sinal escreve (2 a 10 pips,
   dentro do spread), o resultado quase quadruplica a perda (≈ −1 670R, 26% de acerto). A regra de
   `source-risk-rules` está certa; o problema não é esse.
3. **O volume não cabe numa conta.** O Scanner volta a disparar no mesmo par enquanto a trade anterior
   ainda está aberta: no pior momento havia **88 posições abertas** (22% da conta em risco a 0,25% por
   trade, 88% a 1%), metade delas com CHF. A mediana é ~31 posições abertas quando entra uma nova.
   Mesmo com **uma posição por símbolo** o máximo é 14 (3,5% a 0,25%) e o resultado continua negativo
   (≈ −0,14R por trade).
4. **Nenhum par salva a estratégia.** Só CADCHF e EURCHF ficam acima de zero, e por menos de 3R cada em
   centenas de trades — isso é zero, não uma vantagem. Os piores (GBPCAD, EURCAD, GBPJPY, EURAUD) têm
   ~50% de acerto e −0,2R por trade.

**O que isto NÃO diz:** mede a gestão de HOJE (`configDoProvider` sobre uma linha com `sinais_config`
vazio: parciais 50/25, break-even no TP1, trailing aos 10 pips a meio risco). Outra gestão pode dar
outro número — mas antes de voltar a executar é preciso, pelo menos, (a) limitar a uma posição por
símbolo e um tecto de posições abertas, e (b) encontrar uma gestão com R médio positivo e estável
semana a semana nesta mesma régua. A sombra diária (`estrategia_sombra_dia`) mede isso daqui para a
frente sem abrir nada.

**Régua:** velas M15 da BlackBull (a corretora de onde o Scanner lê), stop ganha na mesma vela, spread
simulado de 1,2/2,5 pips. Uma vela de 15 m é grossa para um stop de 20 pips e um trailing a ~10: o
modelo tende a ser **optimista** com o trailing (deixa-o subir até ao extremo da vela), por isso o
resultado real dificilmente seria melhor do que este.

## O que se mediu

- **Janela medida:** 2026-07-12 → 2026-09-16 (pedido desde 2026-07-12; as velas M15 do TradingView começam a ~30/06).
- **Ideias (entradas MTMScanner na base):** 19366
- **Teriam passado o gate de execução:** 4312 (22.3%)
- **Medidas em velas:** 4279
- **Gestão (a de `configDoProvider` para a linha actual):** saidas_pct = 50/25 · break_even = no TP1 (+2 pips) · trailing = arranca 10 pips · distância 0.5R · sl_minimo = 20 pips (slComMinimo) · janela = 3 dias de M15
- **Linha da estratégia:** ativo = false · sinais_config = `{}` · trailing_arranca_pips = 10 · saidas_pct = null · be_gatilho = 1 (ignorado de propósito por `configDoProvider`)
- **Regras do gate (site_settings, lidas agora):** whitelist 19 símbolos · confirmações ≥ 2 (venda ≥ 2) · exclusões do Scanner ["XAUUSD","XAGUSD"] · interruptor forex = true
- **Spread simulado:** 1,2 pips nos majors, 2,5 nos cruzados. Resultado em R (1R = distância entrada→stop DEPOIS de alargado a 20 pips e com spread).

**Ficaram de fora no gate:**

- 10875 — não publicado (gate de ruído)
- 2622 — gate de execução: símbolo fora da whitelist de execução
- 1060 — classe index não executa
- 497 — classe other não executa

**Passaram o gate mas não se mediram:**

- 31 — sem velas no histórico à hora do sinal
- 2 — menos de 4 velas depois do sinal

Velas: EURGBP ← BLACKBULL:EURGBP · USDCHF ← BLACKBULL:USDCHF · CADCHF ← BLACKBULL:CADCHF · NZDCHF ← BLACKBULL:NZDCHF · GBPJPY ← BLACKBULL:GBPJPY · EURCHF ← BLACKBULL:EURCHF · AUDCHF ← BLACKBULL:AUDCHF · CADJPY ← BLACKBULL:CADJPY · GBPCAD ← BLACKBULL:GBPCAD · GBPCHF ← BLACKBULL:GBPCHF · EURAUD ← BLACKBULL:EURAUD · EURCAD ← BLACKBULL:EURCAD · NZDUSD ← BLACKBULL:NZDUSD · EURUSD ← BLACKBULL:EURUSD · GBPUSD ← BLACKBULL:GBPUSD

## 1. Resultado global

| variante | trades | % vit. | R total | R médio | pior queda (R) | perdas seguidas | exposição máx. |
|---|---:|---:|---:|---:|---:|---:|---:|
| **gate + gestão actuais (stop mínimo 20 pips)** | 4279 | 66.4% | -438.4 | -0.102 | -448.6 | 10 | 88 |
| stop do sinal, sem alargar | 4279 | 26.4% | -1667.1 | -0.390 | -1672.5 | 54 | 20 |
| só uma posição por símbolo | 1228 | 61.0% | -166.5 | -0.136 | -169.0 | 6 | 14 |
| só compras | 3259 | 66.2% | -345.6 | -0.106 | -356.8 | 12 | 78 |
| só vendas | 1020 | 67.2% | -92.8 | -0.091 | -102.1 | 10 | 25 |

IC 95% do R médio (trades tratadas como independentes): -0.102 ± 0.020. Mas não são independentes: as 4279 trades nasceram em apenas **2263 velas de 15 m diferentes** (1.89 trades por vela). Com o tamanho efectivo das velas, o intervalo alarga para ± 0.027.

Como fecharam: be 1456 · sl 1373 · tp 315 · trailing 1114 · aberta 21.

## 2. Exposição simultânea

- **Máximo de posições abertas ao mesmo tempo:** 88, a 2026-08-04 07:30 UTC (a moeda mais repetida nesse momento: CHF em 46).
- **Risco somado nesse momento:** 22.00% da conta a 0,25% por trade · **88%** a 1% por trade.
- **Pior concentração numa moeda (em qualquer altura):** CHF em 50 posições abertas.
- **Posições abertas no momento de cada nova entrada:** p50 31 · p90 48 · p99 69.
- **Trades por dia:** p50 81 · máx 137 · 57 dias com trades. **R por dia:** pior -38.5 · melhor 14.1 · dias negativos 41/57.
- Com **uma posição por símbolo** o máximo desce para 14 (3.50% a 0,25%, 14% a 1%).

## 3. Por semana (segunda-feira UTC)

| semana | trades | % vit. | R total | R médio | pior queda (R) | perdas seguidas | exposição máx. | risco somado a 0,25% | a 1% |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-07-06 | 10 | 80.0% | +0.5 | +0.054 | -1.3 | 1 | 9 | 2.25% | 9% |
| 2026-07-13 | 507 | 65.7% | -33.5 | -0.066 | -41.1 | 6 | 44 | 11.00% | 44% |
| 2026-07-20 | 509 | 67.8% | -47.6 | -0.094 | -57.4 | 6 | 56 | 14.00% | 56% |
| 2026-07-27 | 542 | 63.3% | -64.3 | -0.119 | -66.9 | 6 | 54 | 13.50% | 54% |
| 2026-08-03 | 490 | 67.6% | -30.5 | -0.062 | -34.3 | 5 | 88 | 22.00% | 88% |
| 2026-08-10 | 423 | 70.7% | -32.3 | -0.076 | -42.0 | 7 | 55 | 13.75% | 55% |
| 2026-08-17 | 458 | 60.0% | -72.7 | -0.159 | -74.1 | 7 | 59 | 14.75% | 59% |
| 2026-08-24 | 386 | 64.8% | -71.7 | -0.186 | -74.4 | 10 | 64 | 16.00% | 64% |
| 2026-08-31 | 417 | 70.3% | -19.5 | -0.047 | -40.4 | 7 | 46 | 11.50% | 46% |
| 2026-09-07 | 384 | 65.1% | -59.4 | -0.155 | -64.6 | 6 | 54 | 13.50% | 54% |
| 2026-09-14 | 153 | 74.5% | -7.3 | -0.048 | -10.3 | 4 | 39 | 9.75% | 39% |

## 4. Por símbolo

| símbolo | trades | % vit. | R total | R médio | pior queda (R) | perdas seguidas | exposição máx. | risco somado a 0,25% | a 1% |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CADCHF | 152 | 82.2% | +2.7 | +0.018 | -8.6 | 7 | 14 | 3.50% | 14% |
| EURCHF | 332 | 82.5% | +1.4 | +0.004 | -13.6 | 8 | 15 | 3.75% | 15% |
| NZDUSD | 107 | 69.2% | -5.4 | -0.051 | -10.6 | 8 | 9 | 2.25% | 9% |
| USDCHF | 263 | 68.1% | -11.1 | -0.042 | -18.7 | 9 | 12 | 3.00% | 12% |
| CADJPY | 176 | 63.1% | -12.2 | -0.069 | -22.3 | 10 | 10 | 2.50% | 10% |
| GBPUSD | 347 | 64.3% | -18.5 | -0.053 | -25.9 | 16 | 17 | 4.25% | 17% |
| GBPCHF | 286 | 67.5% | -25.6 | -0.089 | -29.1 | 5 | 11 | 2.75% | 11% |
| EURGBP | 363 | 80.7% | -26.0 | -0.072 | -27.3 | 8 | 20 | 5.00% | 20% |
| EURUSD | 392 | 65.8% | -28.5 | -0.073 | -34.3 | 11 | 16 | 4.00% | 16% |
| AUDCHF | 365 | 74.0% | -32.2 | -0.088 | -40.0 | 14 | 13 | 3.25% | 13% |
| EURAUD | 204 | 52.9% | -38.1 | -0.187 | -41.6 | 7 | 7 | 1.75% | 7% |
| NZDCHF | 318 | 72.0% | -41.1 | -0.129 | -44.2 | 10 | 12 | 3.00% | 12% |
| GBPJPY | 324 | 52.2% | -53.7 | -0.166 | -59.5 | 7 | 8 | 2.00% | 8% |
| EURCAD | 255 | 51.0% | -69.5 | -0.273 | -72.1 | 16 | 12 | 3.00% | 12% |
| GBPCAD | 395 | 51.9% | -80.5 | -0.204 | -82.5 | 15 | 12 | 3.00% | 12% |

## 5. Por mês

| mês | trades | % vit. | R total | R médio | pior queda (R) | perdas seguidas | exposição máx. | risco somado a 0,25% | a 1% |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-07 | 1560 | 65.6% | -143.2 | -0.092 | -151.4 | 6 | 56 | 14.00% | 56% |
| 2026-08 | 1854 | 66.7% | -194.8 | -0.105 | -210.2 | 10 | 88 | 22.00% | 88% |
| 2026-09 | 865 | 67.1% | -100.3 | -0.116 | -107.9 | 8 | 60 | 15.00% | 60% |

