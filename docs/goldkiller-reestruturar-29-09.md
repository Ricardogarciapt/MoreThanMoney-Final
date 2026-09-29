# GoldKiller — porque perde, e o que mudar

Corrido a 2026-09-29T14:17Z · velas M15 OANDA:XAUUSD · janela de 288 barras (3 dias) por sinal.

> Só leitura: nada foi escrito em `mtmauto_providers` nem em nenhuma outra tabela.

**Amostra:** 235 sinais de entrada, 2026-07-12 a 2026-09-29. Um símbolo só (XAUUSD), 117 compras / 118 vendas.

## A leitura, numa página

**1. O GoldKiller não perde −31%. Esse número mede uma gestão que não está configurada, no pior mês.**
O backtest de 29/09 corre com `BE no Exit 1` e lote fixo de 0,01. A gestão que o GoldKiller tem
mesmo posta (`BE 0,30R + trailing 1,0R/0,5R`), nos mesmos sinais e com o risco de 1% por trade que
`risco_default_pct` descreve, dá **1 000 → 1 152 $ (+15,2%)** em 232 sinais de 12/07 a 29/09.
A conta a lote fixo é o que faz a diferença: o stop mediano passou de 84 pips em Julho para 165 em
Setembro, por isso a lote fixo o risco por trade **dobrou** (0,84% → 1,65% da conta) exactamente no
mês em que o sinal deixou de funcionar. Ver a secção 4.

**2. A premissa «as perdedoras entram fundo em lucro e devolvem-no» não se confirma em R.**
Os 69 pips de pico mediano das perdedoras vêm do acompanhamento, que mede em PIPS e só cobre
25/08–25/09 — o mês dos stops de 165 pips. Em fracção do risco, que é a única unidade estável aqui,
as perdedoras (sem gestão) chegam a **0,32R** de mediana e só 31% passam de 0,5R. Metade delas nunca
chega sequer ao gatilho de break-even que já lá está. Não há um lago de lucro por recolher.

**3. O TP1 NÃO é o defeito do Premium.** O TP1 do Premium estava a 2,0R com 19% a lá chegarem. Aqui o
TP1 está a 1,13R e **47% chegam** — e isso é por construção: o Pine põe o TP1 no percentil 40 da
distribuição histórica das pernas (`docs/pine/mtm-goldkiller-alertas.pine`, `target_50.gain` com
`scale=80`). O alvo está calibrado. Testei mover a 1.ª parcial para 1,0 / 0,75 / 0,6 / 0,5 / 0,4 /
0,3R e **todas pioram** (secção 2b): a parcial antecipada corta as vencedoras e não salva as
perdedoras, que já estavam protegidas pelo break-even. **Hipótese testada e rejeitada.**

**4. A gestão que está posta é a melhor de ~40 que medi.** Nenhuma combinação de parcial × BE ×
trailing bate os +0,064R por trade da configuração de hoje de forma distinguível. **Não recomendo
mexer em `sinais_config`.**

**5. Os filtros de sinal que pareciam bons são o calendário disfarçado.** Testei QUATRO. «Só compras»
(+0,113R) vive todo em Agosto, o mês em que o ouro subiu 9,2% — em Julho compras e vendas empatam.
«Stop ≤ 110 pips» é literalmente «não é Setembro»: zero sinais largos em Julho, todos os 44 de
Setembro são largos; e dentro de Agosto o stop largo é MELHOR. **Os dois morrem no teste dentro do
mês** (secção 3). O `Supertrend` do payload é idêntico à direcção em 235/235 sinais e o `Momentum`
é `false` em 235/235: o bloco `confirmations` não tem informação nenhuma para filtrar.

**6. O que sobra, honestamente:** o GoldKiller tem uma expectativa positiva medida mas **não
distinguível de zero** (+0,064R ± 0,105), a encolher mês a mês (+0,161 → +0,034 → −0,090), e um
problema real de dimensionamento que é do motor, não do sinal. A acção com melhor relação
valor/risco não é mexer no scanner: é **garantir que quem o executa dimensiona por risco e não por
lote fixo**.

## 1. A causa: o TP1 está pousado onde o preço não chega

| medida | p25 | p50 | p75 | p90 |
|---|---:|---:|---:|---:|
| MFE em R (quão fundo chega a favor) | 0.19 | 0.93 | 2.90 | 8.85 |
| TP1 do sinal, em R | 0.92 | 1.13 | 1.15 | 1.31 |
| TP2 do sinal, em R | 2.01 | 2.13 | 2.19 | 2.23 |
| TP3 do sinal, em R | 3.52 | 4.21 | 4.28 | 4.53 |
| risco inicial, em pips | 84 | 89 | 158 | 171 |

**Fracção que chegou a estar em lucro de:**
0,3R 72% · 0,5R 60% · 0,75R 53% · **1R 49%** · 1,5R 40% · 2R 32% · 4R 19%

**Quantos sinais tocaram cada alvo do próprio sinal:** TP1 110/232 (47%) · TP2 73/232 (31%) · TP3 45/232 (19%).

**As perdedoras entram fundo em lucro antes de virar** (com a configuração de hoje):

| grupo | n | MFE mediano (R) | MFE mediano (pips) | % que passou de 0,5R |
|---|---:|---:|---:|---:|
| perdedoras | 65 | 0.00 | 0 | 0% |
| vencedoras | 167 | 1.63 | 190 | 84% |

## 2. Reestruturar a gestão

### 2a. O que a configuração de hoje vale, e o que valem os perfis só-de-stop

| perfil | n | % vit. | R total | R médio | IC 95% | pior seq. |
|---|---:|---:|---:|---:|---:|---:|
| sem gestão (alvos do sinal, SL fixo) | 232 | 42.7% | -7.9 | -0.034 | ±0.150 | -19.1 |
| **config de hoje** (BE 0,30R+0,05 · trail 1,0R/0,5R) | 232 | 72.0% | +14.9 | +0.064 | ±0.105 | -7.0 |
| BE 0.20R (+0,05R) | 232 | 74.6% | +14.3 | +0.062 | ±0.107 | -10.1 |
| BE 0.30R (+0,05R) | 232 | 72.0% | +13.6 | +0.058 | ±0.112 | -10.5 |
| BE 0.50R (+0,05R) | 232 | 60.3% | +0.0 | +0.000 | ±0.128 | -12.0 |
| BE 0.75R (+0,05R) | 232 | 53.4% | +0.3 | +0.001 | ±0.138 | -12.7 |

### 2b. Mover a 1.ª parcial (50%) para uma fracção do risco — a hipótese principal

A 2.ª parcial (25%) e o alvo final ficam onde estão. Só se mexe no sítio onde se tira metade.

| perfil | n | % vit. | R total | R médio | IC 95% | pior seq. |
|---|---:|---:|---:|---:|---:|---:|
| TP1 do sinal (~1,13R) · sem gestão de stop | 232 | 42.7% | -7.9 | -0.034 | ±0.150 | -19.1 |
| 1.ª parcial a 1.00R · sem gestão de stop | 232 | 32.3% | -8.5 | -0.037 | ±0.147 | -18.0 |
| 1.ª parcial a 0.75R · sem gestão de stop | 232 | 32.3% | -13.8 | -0.060 | ±0.139 | -18.7 |
| 1.ª parcial a 0.60R · sem gestão de stop | 232 | 32.3% | -16.7 | -0.072 | ±0.134 | -19.9 |
| 1.ª parcial a 0.50R · sem gestão de stop | 232 | 32.3% | -15.8 | -0.068 | ±0.129 | -18.8 |
| 1.ª parcial a 0.40R · sem gestão de stop | 232 | 32.3% | -13.8 | -0.060 | ±0.124 | -16.7 |
| 1.ª parcial a 0.30R · sem gestão de stop | 232 | 32.3% | -13.1 | -0.057 | ±0.119 | -18.3 |

| perfil | n | % vit. | R total | R médio | IC 95% | pior seq. |
|---|---:|---:|---:|---:|---:|---:|
| TP1 do sinal (~1,13R) · BE 0,30R | 232 | 72.0% | +13.6 | +0.058 | ±0.112 | -10.5 |
| 1.ª parcial a 1.00R · BE 0,30R | 232 | 72.0% | +14.5 | +0.062 | ±0.111 | -9.5 |
| 1.ª parcial a 0.75R · BE 0,30R | 232 | 72.0% | +13.2 | +0.057 | ±0.107 | -10.0 |
| 1.ª parcial a 0.60R · BE 0,30R | 232 | 72.0% | +9.3 | +0.040 | ±0.104 | -10.2 |
| 1.ª parcial a 0.50R · BE 0,30R | 232 | 72.0% | +9.9 | +0.042 | ±0.102 | -9.5 |
| 1.ª parcial a 0.40R · BE 0,30R | 232 | 72.0% | +7.2 | +0.031 | ±0.100 | -10.6 |
| 1.ª parcial a 0.30R · BE 0,30R | 232 | 72.0% | +3.4 | +0.015 | ±0.098 | -12.8 |

| perfil | n | % vit. | R total | R médio | IC 95% | pior seq. |
|---|---:|---:|---:|---:|---:|---:|
| TP1 do sinal (~1,13R) · BE 0,30R + trail 1,0R/0,5R (gestão de hoje) | 232 | 72.0% | +14.9 | +0.064 | ±0.105 | -7.0 |
| 1.ª parcial a 1.00R · BE 0,30R + trail 1,0R/0,5R (gestão de hoje) | 232 | 72.0% | +14.6 | +0.063 | ±0.104 | -7.1 |
| 1.ª parcial a 0.75R · BE 0,30R + trail 1,0R/0,5R (gestão de hoje) | 232 | 72.0% | +13.3 | +0.057 | ±0.100 | -7.8 |
| 1.ª parcial a 0.60R · BE 0,30R + trail 1,0R/0,5R (gestão de hoje) | 232 | 72.0% | +9.4 | +0.041 | ±0.097 | -8.1 |
| 1.ª parcial a 0.50R · BE 0,30R + trail 1,0R/0,5R (gestão de hoje) | 232 | 72.0% | +10.0 | +0.043 | ±0.095 | -7.4 |
| 1.ª parcial a 0.40R · BE 0,30R + trail 1,0R/0,5R (gestão de hoje) | 232 | 72.0% | +7.4 | +0.032 | ±0.093 | -8.5 |
| 1.ª parcial a 0.30R · BE 0,30R + trail 1,0R/0,5R (gestão de hoje) | 232 | 72.0% | +3.5 | +0.015 | ±0.090 | -10.7 |

### 2c. Break-even e trailing por cima da parcial nova

_Só distâncias de trailing ≥ 0,75R: abaixo disso a vela de M15 (0,73R de amplitude mediana) é maior do que a coisa medida e o número sai optimista._

| perfil | n | % vit. | R total | R médio | IC 95% | pior seq. |
|---|---:|---:|---:|---:|---:|---:|
| sem gestão (alvos do sinal, SL fixo) | 232 | 42.7% | -7.9 | -0.034 | ±0.150 | -19.1 |
| **config de hoje** (BE 0,30R+0,05 · trail 1,0R/0,5R) | 232 | 72.0% | +14.9 | +0.064 | ±0.105 | -7.0 |
| parcial 0.75R · BE 0.3R · sem trail | 232 | 72.0% | +13.2 | +0.057 | ±0.107 | -10.0 |
| parcial 0.75R · BE 0.2R · sem trail | 232 | 74.6% | +12.9 | +0.056 | ±0.102 | -10.6 |
| parcial 0.75R · BE 0.2R · trail 1.5R/0.75R | 232 | 74.6% | +11.6 | +0.050 | ±0.096 | -12.0 |
| parcial 0.75R · BE 0.3R · trail 1.5R/0.75R | 232 | 72.0% | +10.8 | +0.047 | ±0.101 | -11.7 |
| parcial 0.75R · BE 0.2R · trail 1R/0.75R | 232 | 74.6% | +10.8 | +0.047 | ±0.094 | -10.2 |
| parcial 0.75R · BE 0.3R · trail 1R/0.75R | 232 | 72.0% | +10.5 | +0.045 | ±0.099 | -9.7 |
| parcial 0.75R · BE 0.2R · trail 1.5R/1R | 232 | 74.6% | +10.3 | +0.044 | ±0.096 | -11.7 |
| parcial 0.5R · BE 0.2R · sem trail | 232 | 74.6% | +9.9 | +0.043 | ±0.097 | -10.0 |
| parcial 0.75R · BE 0.3R · trail 1.5R/1R | 232 | 72.0% | +9.9 | +0.043 | ±0.101 | -11.4 |
| parcial 0.5R · BE 0.3R · sem trail | 232 | 72.0% | +9.9 | +0.042 | ±0.102 | -9.5 |
| parcial 0.6R · BE 0.2R · sem trail | 232 | 74.6% | +9.4 | +0.041 | ±0.099 | -10.8 |
| parcial 0.6R · BE 0.3R · sem trail | 232 | 72.0% | +9.3 | +0.040 | ±0.104 | -10.2 |

## 3. Atacar o sinal — os filtros testados

**Testaram-se QUATRO filtros, e só estes quatro**, escolhidos por serem baratos (já estão no payload ou no relógio) e por terem uma direcção mecânica defensável. Não se varreu o espaço à procura do número bonito.

Base de comparação: 1.ª parcial a 0.5R + BE 0,30R, em TODOS os sinais.

| perfil | n | % vit. | R total | R médio | IC 95% | pior seq. |
|---|---:|---:|---:|---:|---:|---:|
| sem filtro (todos) | 232 | 72.0% | +9.9 | +0.042 | ±0.102 | -9.5 |
| só compras | 117 | 76.1% | +13.3 | +0.113 | ±0.144 | -6.0 |
| só vendas | 115 | 67.8% | -3.4 | -0.030 | ±0.144 | -11.1 |
| Supertrend=true (alinhado) | 117 | 76.1% | +13.3 | +0.113 | ±0.144 | -6.0 |
| Supertrend=false | 115 | 67.8% | -3.4 | -0.030 | ±0.144 | -11.1 |
| stop ≤ 110 pips (volatilidade normal) | 164 | 72.6% | +12.8 | +0.078 | ±0.125 | -7.2 |
| stop > 110 pips (volatilidade alta) | 68 | 70.6% | -2.9 | -0.043 | ±0.175 | -8.6 |
| sessão Londres+NY (07-20 UTC) | 122 | 68.9% | +8.5 | +0.069 | ±0.156 | -13.0 |
| fora de Londres+NY | 110 | 75.5% | +1.4 | +0.012 | ±0.129 | -6.4 |

### O teste decisivo: os dois filtros que parecem bons sobrevivem DENTRO do mês?

Um filtro que só separa meses não é um filtro, é um calendário lido ao contrário.

| corte | 2026-07 | 2026-08 | 2026-09 |
|---|---:|---:|---:|
| compras | +0.164 (n=50) | +0.217 (n=45) | -0.125 (n=22) |
| vendas | +0.158 (n=48) | -0.149 (n=45) | -0.055 (n=22) |
| stop ≤ 110 pips | +0.161 (n=98) | +0.007 (n=66) | sem sinais |
| stop > 110 pips | sem sinais | +0.111 (n=24) | -0.090 (n=44) |

**Os dois filtros morrem aqui:**

- **Compras vs vendas.** Em Julho as compras valem +0,164 e as vendas +0,158 — não há assimetria nenhuma. A assimetria toda vive em Agosto, o mês em que o ouro subiu **9,2%** (4 077 → 4 452). Filtrar para compras não é escolher melhores sinais, é apostar que o ouro continua a subir. Em Setembro, com o ouro a cair 6,6%, as compras foram as piores (−0,125).
- **Tamanho do stop.** Não há um único sinal com stop > 110 pips em Julho, e **todos** os 44 sinais de Setembro o têm. «Stop largo» é o nome que os dados dão a «Setembro». Dentro de Agosto, o único mês em que os dois convivem, o stop largo é **melhor** (+0,111 contra +0,007) — o contrário do que a intuição dizia.

### Mês a mês (R médio), para ver se a vantagem é estável

| perfil | 2026-07 (n) | 2026-08 (n) | 2026-09 (n) |
|---|---:|---:|---:|
| sem gestão | +0.048 (98) | -0.038 (90) | -0.210 (44) |
| config de hoje | +0.161 (98) | +0.034 (90) | -0.090 (44) |
| parcial 0,5R + BE 0,30R | +0.148 (98) | +0.021 (90) | -0.148 (44) |
| parcial 0,6R + BE 0,30R | +0.152 (98) | +0.013 (90) | -0.155 (44) |

## 4. De onde vem o «1 000 → 687 $, −31,3%»

O backtest de 29/09 (`scripts/estudos/fontes-1000-29-09.ts`) mede **outra coisa**: corre com
`BE no Exit 1` e **lote FIXO de 0,01**, que não é a gestão configurada no GoldKiller nem o
dimensionamento que `risco_default_pct = 1` descreve. E mede-o na janela do acompanhamento,
que é o pior mês. Os mesmos sinais, com as duas coisas separadas:

| janela | n | BE no Exit 1 + lote fixo (o backtest) | gestão de hoje + lote fixo | gestão de hoje + risco 1% |
|---|---:|---:|---:|---:|
| tudo (12/07–29/09) | 235 | 967 $ (-3.3%) | 1121 $ (12.1%) | 1152 $ (15.2%) |
| janela do acompanhamento (25/08–25/09) | 57 | 768 $ (-23.2%) | 923 $ (-7.7%) | 952 $ (-4.8%) |
| só Setembro | 44 | 897 $ (-10.3%) | 934 $ (-6.6%) | 960 $ (-4.0%) |

**O risco em dólares a lote fixo segue o stop, e o stop dobrou:**

| mês | stop mediano | risco a 0,01 lote | % de uma conta de 1 000 $ |
|---|---:|---:|---:|
| 2026-07 | 84 pips | 8.4 $ | 0.84% |
| 2026-08 | 89 pips | 8.9 $ | 0.89% |
| 2026-09 | 165 pips | 16.5 $ | 1.65% |

