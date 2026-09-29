# MTM Scanner — existe borda em algum subconjunto?

Corrido a 2026-09-29 14:23 UTC · `npx tsx scripts/estudos/mtmscanner-borda-29-09.ts` · velas M15 · sinais desde 2026-07-01.

> Só leitura. Nada foi escrito em nenhuma tabela. A estratégia está em sombra (`ativo = false`).

**A pergunta.** As duas medições anteriores (`docs/sombra-mtm-scanner.md` e a varredura de 98
combinações de stop/alvo em `fontes-1000-29-09.ts --scanner`) mediram GESTÃO. Esta mede o
SINAL: qual é o retorno futuro cru, na direcção anunciada, normalizado pelo ATR(14) da altura,
sem stop nem alvo nenhum. Se for zero em todos os horizontes, nenhuma gestão pode salvar nada.

**Amostra:** 21571 ideias lidas · 18765 medidas em velas · 4808 passariam o gate de execução de hoje (25.6%).

**Regras do gate:** site_settings (as que estão vivas) · venda exige 2 confirmações.

**Entrada:** abertura da vela SEGUINTE ao sinal (ordem a mercado). Não se exige que o preço
toque o valor anunciado — é a regra da casa desde o caso da fonte a +124%.

## 1. O sinal tem seguimento? (retorno futuro cru, em ATR)

Cada coluna é o retorno médio, com o sinal da direcção, a N velas de 15 m da entrada, dividido
pelo ATR(14) da altura. `IC 95%` é o intervalo com erro-padrão AGRUPADO POR DIA; `IC ingénuo` é
o que sairia se se fingisse que os sinais são independentes — está lá para se ver quanto é que
essa mentira estreita o intervalo.

### todas as ideias (18765 sinais, 69 dias)

| horizonte | n | retorno médio (ATR) | IC 95% agrupado | IC ingénuo | % acima de zero | contém o zero? |
|---|---:|---:|---:|---:|---:|---|
| 1 velas (0.3 h) | 18763 | +0.008 | ±0.023 | ±0.017 | 49.1% | sim |
| 2 velas (0.5 h) | 18762 | +0.015 | ±0.026 | ±0.021 | 49.7% | sim |
| 4 velas (1.0 h) | 18756 | +0.021 | ±0.031 | ±0.027 | 49.7% | sim |
| 8 velas (2.0 h) | 18745 | +0.032 | ±0.036 | ±0.036 | 50.0% | sim |
| 16 velas (4.0 h) | 18727 | +0.058 | ±0.047 | ±0.049 | 50.5% | **NÃO** |
| 32 velas (8.0 h) | 18682 | +0.047 | ±0.067 | ±0.077 | 50.5% | sim |
| 96 velas (1 d) | 18566 | +0.127 | ±0.096 | ±0.132 | 50.5% | **NÃO** |
| 288 velas (3 d) | 18173 | +0.143 | ±0.170 | ±0.263 | 50.3% | sim |

### só as que passam o gate (4808 sinais, 67 dias)

| horizonte | n | retorno médio (ATR) | IC 95% agrupado | IC ingénuo | % acima de zero | contém o zero? |
|---|---:|---:|---:|---:|---:|---|
| 1 velas (0.3 h) | 4808 | +0.016 | ±0.041 | ±0.032 | 49.0% | sim |
| 2 velas (0.5 h) | 4808 | +0.023 | ±0.051 | ±0.040 | 49.9% | sim |
| 4 velas (1.0 h) | 4808 | +0.014 | ±0.060 | ±0.051 | 50.2% | sim |
| 8 velas (2.0 h) | 4808 | +0.030 | ±0.088 | ±0.069 | 50.5% | sim |
| 16 velas (4.0 h) | 4805 | +0.027 | ±0.128 | ±0.094 | 50.3% | sim |
| 32 velas (8.0 h) | 4793 | +0.042 | ±0.246 | ±0.146 | 51.3% | sim |
| 96 velas (1 d) | 4757 | +0.226 | ±0.402 | ±0.255 | 51.8% | sim |
| 288 velas (3 d) | 4643 | +0.291 | ±0.751 | ±0.464 | 52.9% | sim |

**O custo, na mesma régua.** O meio-spread ida-e-volta vale em média **0.657 ATR** por trade
nos sinais que passam o gate. Qualquer retorno médio bruto abaixo disso é negativo depois de custos.

## 2. Até onde o preço chega, e até onde vai contra (96 velas = 1 dia)

Se o sinal tivesse valor direccional, o MFE mediano seria maior que o MAE mediano. Mede-se nos
dois, em ATR, porque é a assimetria que uma gestão poderia explorar.

| conjunto | n | MFE p25 | p50 | p75 | MAE p25 | p50 | p75 | MFE−MAE mediano |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| todas as ideias | 18765 | 2.05 | 4.57 | 8.42 | 1.98 | 4.43 | 8.20 | +0.14 |
| passam o gate | 4808 | 2.09 | 4.62 | 8.41 | 2.05 | 4.44 | 8.16 | +0.18 |
| gate + compras | 3650 | 2.14 | 4.80 | 8.65 | 2.05 | 4.39 | 8.26 | +0.41 |
| gate + vendas | 1158 | 1.97 | 4.19 | 7.63 | 2.04 | 4.57 | 7.97 | -0.38 |

## 3. Existe subconjunto com borda?

Régua: retorno médio a 4 horas (16 velas), em ATR, com IC agrupado por dia, sobre os sinais que
passam o gate de execução. Um grupo só conta se (a) a média estiver longe de zero mesmo depois
de corrigir as comparações múltiplas e (b) o líquido de custos for positivo.

### 3.1 Por símbolo — dos pares, há algum que preste?

Um par «bom» por acaso é o resultado mais fácil de produzir num estudo destes. Daí o limiar.

Comparações feitas: **15**. Para uma delas contar como real depois de Bonferroni, a média
tem de estar a mais de **2.61×** o seu IC 95% de zero — não basta o IC não conter o zero.

| grupo | n | dias | retorno 4h médio (ATR) | IC 95% agrupado | custo médio (ATR) | líquido | sobrevive a Bonferroni? |
|---|---:|---:|---:|---:|---:|---:|---|
| AUDCHF | 433 | 62 | +0.166 | ±0.363 | 0.952 | -0.787 | não |
| CADCHF | 154 | 21 | +0.407 | ±0.642 | 1.092 | -0.685 | não |
| CADJPY | 176 | 24 | +0.011 | ±0.423 | 0.529 | -0.518 | não |
| EURAUD | 204 | 27 | +0.358 | ±0.467 | 0.392 | -0.034 | não |
| EURCAD | 257 | 34 | -0.369 | ±0.412 | 0.568 | -0.937 | não |
| EURCHF | 406 | 62 | +0.269 | ±0.335 | 0.978 | -0.709 | não |
| EURGBP | 437 | 55 | -0.155 | ±0.302 | 1.359 | -1.513 | não |
| EURUSD | 433 | 58 | +0.195 | ±0.428 | 0.337 | -0.142 | não |
| GBPCAD | 487 | 59 | +0.010 | ±0.345 | 0.426 | -0.416 | não |
| GBPCHF | 331 | 52 | +0.111 | ±0.415 | 0.603 | -0.492 | não |
| GBPJPY | 325 | 51 | -0.494 | ±0.545 | 0.281 | -0.775 | não |
| GBPUSD | 399 | 57 | -0.137 | ±0.361 | 0.239 | -0.377 | não |
| NZDCHF | 390 | 61 | -0.116 | ±0.371 | 1.044 | -1.161 | não |
| NZDUSD | 107 | 17 | +0.672 | ±0.630 | 0.342 | +0.330 | não |
| USDCHF | 266 | 39 | +0.141 | ±0.509 | 0.305 | -0.164 | não |

**Nenhum grupo sobrevive.** Não há aqui subconjunto com borda.

### 3.2 Por hora UTC — das 24 horas, há alguma?

As horas herdam a estrutura do dia de negociação; 24 comparações é muita corda.

Comparações feitas: **24**. Para uma delas contar como real depois de Bonferroni, a média
tem de estar a mais de **2.78×** o seu IC 95% de zero — não basta o IC não conter o zero.

| grupo | n | dias | retorno 4h médio (ATR) | IC 95% agrupado | custo médio (ATR) | líquido | sobrevive a Bonferroni? |
|---|---:|---:|---:|---:|---:|---:|---|
| 00h | 335 | 56 | +0.282 | ±0.395 | 0.737 | -0.456 | não |
| 01h | 342 | 56 | +0.287 | ±0.327 | 0.936 | -0.649 | não |
| 02h | 227 | 55 | +0.197 | ±0.419 | 0.795 | -0.598 | não |
| 03h | 155 | 48 | +0.351 | ±0.461 | 0.835 | -0.484 | não |
| 04h | 114 | 40 | +0.729 | ±0.803 | 0.938 | -0.209 | não |
| 05h | 114 | 47 | +0.762 | ±0.964 | 0.922 | -0.161 | não |
| 06h | 288 | 57 | +0.058 | ±0.477 | 0.825 | -0.767 | não |
| 07h | 394 | 57 | -0.596 | ±0.411 | 0.639 | -1.236 | não |
| 08h | 338 | 54 | -0.103 | ±0.347 | 0.542 | -0.645 | não |
| 09h | 185 | 50 | -0.564 | ±0.550 | 0.526 | -1.090 | não |
| 10h | 114 | 46 | -0.401 | ±0.788 | 0.537 | -0.939 | não |
| 11h | 141 | 50 | +0.273 | ±0.990 | 0.509 | -0.237 | não |
| 12h | 248 | 54 | -0.362 | ±0.427 | 0.511 | -0.873 | não |
| 13h | 303 | 53 | +0.149 | ±0.452 | 0.474 | -0.325 | não |
| 14h | 341 | 51 | +0.173 | ±0.324 | 0.469 | -0.296 | não |
| 15h | 231 | 51 | +0.227 | ±0.360 | 0.398 | -0.171 | não |
| 16h | 145 | 46 | +0.007 | ±0.223 | 0.468 | -0.461 | não |
| 17h | 94 | 42 | +0.036 | ±0.419 | 0.584 | -0.548 | não |
| 18h | 77 | 35 | +0.097 | ±0.530 | 0.667 | -0.570 | não |
| 19h | 94 | 43 | -0.006 | ±0.316 | 0.780 | -0.787 | não |
| 20h | 107 | 45 | -0.013 | ±0.502 | 0.800 | -0.812 | não |
| 21h | 99 | 49 | -0.130 | ±1.051 | 0.778 | -0.908 | não |
| 22h | 203 | 54 | +0.061 | ±0.373 | 0.702 | -0.642 | não |
| 23h | 116 | 47 | -0.360 | ±0.690 | 0.767 | -1.127 | não |

**Nenhum grupo sobrevive.** Não há aqui subconjunto com borda.

### 3.3 Por lado

Só duas comparações — é o corte mais barato de todos.

Comparações feitas: **2**. Para uma delas contar como real depois de Bonferroni, a média
tem de estar a mais de **1.67×** o seu IC 95% de zero — não basta o IC não conter o zero.

| grupo | n | dias | retorno 4h médio (ATR) | IC 95% agrupado | custo médio (ATR) | líquido | sobrevive a Bonferroni? |
|---|---:|---:|---:|---:|---:|---:|---|
| compra | 3647 | 67 | +0.089 | ±0.195 | 0.667 | -0.578 | não |
| venda | 1158 | 67 | -0.167 | ±0.302 | 0.626 | -0.792 | não |

**Nenhum grupo sobrevive.** Não há aqui subconjunto com borda.

### 3.4 Por número de confirmações

O gate já exige ≥2. A pergunta é se exigir mais compra alguma coisa.

Comparações feitas: **2**. Para uma delas contar como real depois de Bonferroni, a média
tem de estar a mais de **1.67×** o seu IC 95% de zero — não basta o IC não conter o zero.

| grupo | n | dias | retorno 4h médio (ATR) | IC 95% agrupado | custo médio (ATR) | líquido | sobrevive a Bonferroni? |
|---|---:|---:|---:|---:|---:|---:|---|
| 2 confirmações | 3714 | 67 | -0.031 | ±0.162 | 0.668 | -0.699 | não |
| 3 confirmações | 1091 | 64 | +0.225 | ±0.369 | 0.617 | -0.392 | não |

**Nenhum grupo sobrevive.** Não há aqui subconjunto com borda.

### 3.5 Por regime (lado da EMA200 M15)

A EMA200 em M15 é o regime local — o Scanner é de 15 m, não se sai do timeframe dele.

Comparações feitas: **2**. Para uma delas contar como real depois de Bonferroni, a média
tem de estar a mais de **1.67×** o seu IC 95% de zero — não basta o IC não conter o zero.

| grupo | n | dias | retorno 4h médio (ATR) | IC 95% agrupado | custo médio (ATR) | líquido | sobrevive a Bonferroni? |
|---|---:|---:|---:|---:|---:|---:|---|
| a favor da EMA200 | 2197 | 67 | +0.006 | ±0.220 | 0.665 | -0.659 | não |
| contra a EMA200 | 2608 | 67 | +0.046 | ±0.209 | 0.650 | -0.604 | não |

**Nenhum grupo sobrevive.** Não há aqui subconjunto com borda.

### 3.6 Por volatilidade (ATR% do preço)

É o corte que decide se o custo mata o sinal: em ATR baixo, o spread pesa mais.

Comparações feitas: **3**. Para uma delas contar como real depois de Bonferroni, a média
tem de estar a mais de **1.89×** o seu IC 95% de zero — não basta o IC não conter o zero.

| grupo | n | dias | retorno 4h médio (ATR) | IC 95% agrupado | custo médio (ATR) | líquido | sobrevive a Bonferroni? |
|---|---:|---:|---:|---:|---:|---:|---|
| ATR < 0,05% | 3385 | 66 | +0.040 | ±0.146 | 0.755 | -0.715 | não |
| ATR 0,05–0,08% | 1242 | 64 | +0.012 | ±0.212 | 0.447 | -0.435 | não |
| ATR 0,08–0,12% | 158 | 36 | -0.182 | ±0.666 | 0.257 | -0.439 | não |

**Nenhum grupo sobrevive.** Não há aqui subconjunto com borda.

### 3.7 Por sessão

Quatro comparações. É o corte com mais sentido mecânico dos que aqui estão.

Comparações feitas: **4**. Para uma delas contar como real depois de Bonferroni, a média
tem de estar a mais de **2.04×** o seu IC 95% de zero — não basta o IC não conter o zero.

| grupo | n | dias | retorno 4h médio (ATR) | IC 95% agrupado | custo médio (ATR) | líquido | sobrevive a Bonferroni? |
|---|---:|---:|---:|---:|---:|---:|---|
| Ásia (00–07h) | 1575 | 57 | +0.304 | ±0.200 | 0.842 | -0.539 | não |
| fecho (17–24h) | 790 | 66 | -0.042 | ±0.258 | 0.726 | -0.768 | não |
| Londres (07–12h) | 1172 | 57 | -0.325 | ±0.281 | 0.568 | -0.893 | não |
| Nova Iorque (12–17h) | 1268 | 56 | +0.053 | ±0.218 | 0.465 | -0.412 | não |

**Nenhum grupo sobrevive.** Não há aqui subconjunto com borda.

## 4. E se se juntar tudo o que parece melhor?

O teste mais duro que se pode fazer a uma estratégia sem borda: escolher, DEPOIS de ver os
números, o melhor valor de cada corte e cruzá-los todos. Se nem isto ficar positivo depois de
custos, está respondido. (E se ficar, é sobreajuste puro: foi escolhido a olhar para a resposta.)

Melhor lado: **compra** · melhor sessão: **Ásia (00–07h)** · melhor regime: **contra a EMA200** · melhor banda de volatilidade: **ATR < 0,05%**.

| conjunto | n | dias | retorno 4h médio (ATR) | IC 95% agrupado | custo | líquido |
|---|---:|---:|---:|---:|---:|---:|
| todos os que passam o gate | 4805 | 67 | +0.027 | ±0.128 | 0.657 | -0.629 |
| o melhor de cada corte, cruzado (SOBREAJUSTADO) | 674 | 56 | +0.525 | ±0.387 | 0.881 | -0.357 |

## 5. O teste que ninguém consegue enganar: primeira metade contra segunda

Parte-se a janela ao meio pelo tempo. Se algum corte da secção 3 tiver borda a sério, o que for
bom na primeira metade tem de continuar bom na segunda. Se a ordem dos símbolos mudar ao acaso
entre as duas metades, o que a secção 3 encontrou foi ruído.

Corte em **2026-08-20** — primeira metade 2791 sinais, segunda 2017.

| símbolo | n 1.ª | retorno 1.ª metade | n 2.ª | retorno 2.ª metade | mesmo sinal? |
|---|---:|---:|---:|---:|---|
| AUDCHF | 216 | +0.236 | 217 | +0.096 | sim |
| EURCAD | 208 | -0.332 | 49 | -0.528 | sim |
| EURCHF | 191 | +0.084 | 215 | +0.433 | sim |
| EURGBP | 203 | +0.033 | 234 | -0.317 | não |
| EURUSD | 231 | +0.622 | 202 | -0.294 | não |
| GBPCAD | 229 | +0.159 | 258 | -0.122 | não |
| GBPCHF | 139 | -0.018 | 192 | +0.204 | não |
| GBPJPY | 207 | -0.196 | 118 | -1.017 | sim |
| GBPUSD | 193 | +0.064 | 206 | -0.326 | não |
| NZDCHF | 184 | -0.377 | 206 | +0.117 | não |
| USDCHF | 149 | -0.092 | 117 | +0.438 | não |

**4 de 11 símbolos** mantêm o sinal do retorno entre as duas metades.
Ao acaso esperavam-se metade. Se o número for perto de metade, a ordenação por símbolo da
secção 3 não se repete e não serve para filtrar nada.

