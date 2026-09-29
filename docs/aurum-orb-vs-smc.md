# Aurum Flow · ORB — qual dos dois motores paga?

Corrido a 2026-09-29 13:38 UTC · velas 15m · janela de 288 barras (3 dias) por sinal.

> Só leitura. Nada foi escrito em `mtmauto_providers` nem em nenhuma outra tabela.

**Amostra:** 160 sinais replicados de 160 com motor identificável (0 alertas sem motor/entrada/stop utilizável).

## 1. Os dois motores, lado a lado

| motor | gestão | trades | % vit. | R total | R médio | IC 95% do R médio |
|---|---|---:|---:|---:|---:|---:|
| ORB (rompimento) | sem gestão (parciais + SL + alvo final) | 54 | 27.8% | +6.5 | +0.121 | ±0.554 |
| ORB (rompimento) | BE 0,75R + trailing 1,0R/0,5R | 54 | 61.1% | +1.4 | +0.027 | ±0.313 |
| ORB (rompimento) | alvo único 2R | 54 | 27.8% | -1.0 | -0.019 | ±0.437 |
| SMC (reversão) | sem gestão (parciais + SL + alvo final) | 94 | 52.1% | +7.4 | +0.079 | ±0.157 |
| SMC (reversão) | BE 0,75R + trailing 1,0R/0,5R | 94 | 66.0% | +10.0 | +0.106 | ±0.143 |
| SMC (reversão) | alvo único 2R | 94 | 75.5% | +9.9 | +0.105 | ±0.128 |
| TODOS (o que o dono tem ligado) | sem gestão (parciais + SL + alvo final) | 148 | 43.2% | +14.0 | +0.094 | ±0.224 |
| TODOS (o que o dono tem ligado) | BE 0,75R + trailing 1,0R/0,5R | 148 | 64.2% | +11.4 | +0.077 | ±0.146 |
| TODOS (o que o dono tem ligado) | alvo único 2R | 148 | 58.1% | +8.9 | +0.060 | ±0.178 |

## 2. Onde chega o preço antes de morrer (MFE) — é aqui que se vê a ENTRADA

| motor | trades | MFE p25 | p50 | p75 | chegou a +0,3R | +0,5R | +1R | +2R | MFE mediano das PERDEDORAS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ORB (rompimento) | 54 | 0.20 | 0.92 | 2.41 | 72% | 65% | 48% | 28% | 0.55 |
| SMC (reversão) | 94 | 0.50 | 1.19 | 2.99 | 80% | 74% | 51% | 37% | 0.42 |
| TODOS (o que o dono tem ligado) | 148 | 0.32 | 0.99 | 2.97 | 77% | 71% | 50% | 34% | 0.45 |

## 3. O ORB, sessão a sessão (sem gestão)

| sessão | trades | % vit. | R total | R médio | IC 95% | MFE mediano |
|---|---:|---:|---:|---:|---:|---:|
| LONDON | 19 | 21.1% | -2.1 | -0.109 | ±0.848 | 0.80 |
| NYFX | 24 | 33.3% | +6.9 | +0.287 | ±0.923 | 1.12 |
| PRE LONDON | 11 | 27.3% | +1.7 | +0.155 | ±1.191 | 0.78 |

## 4. Compras contra vendas (sem gestão)

| motor | lado | trades | % vit. | R total | R médio |
|---|---|---:|---:|---:|---:|
| ORB | compra | 32 | 34.4% | +13.1 | +0.410 |
| ORB | venda | 22 | 18.2% | -6.6 | -0.299 |
| SMC | compra | 67 | 50.7% | +10.8 | +0.161 |
| SMC | venda | 27 | 55.6% | -3.4 | -0.124 |

## 5. Tamanho do stop (o CAP de 3,5% morde?)

| motor | trades | SL% p25 | p50 | p75 | p90 | % no CAP (≥3,4%) |
|---|---:|---:|---:|---:|---:|---:|
| ORB | 66 | 0.92% | 1.41% | 2.15% | 3.23% | 11% |
| SMC | 94 | 0.14% | 0.65% | 1.36% | 1.58% | 1% |

## 6. O que as taxas comem, em R

Taker 0,055% por lado = 0,11% ida-e-volta. Em R isso é `0,11 / SL%`.

| motor | custo mediano por trade (R) | custo p25 | p75 |
|---|---:|---:|---:|
| ORB | 0.078R | 0.051R | 0.119R |
| SMC | 0.169R | 0.081R | 0.803R |

## 7. Alvo único: que RR é que paga, com o acerto que estes motores têm

| motor | RR do alvo | % vit. | R médio | IC 95% |
|---|---:|---:|---:|---:|
| ORB | 1R | 48.1% | -0.042 | ±0.262 |
| ORB | 1.5R | 31.5% | -0.212 | ±0.306 |
| ORB | 2R | 27.8% | -0.168 | ±0.354 |
| ORB | 3R | 25.9% | +0.002 | ±0.452 |
| ORB | 4R | 22.2% | +0.056 | ±0.532 |
| ORB | 6R | 18.5% | +0.152 | ±0.666 |
| SMC | 1R | 52.1% | +0.014 | ±0.198 |
| SMC | 1.5R | 37.2% | -0.096 | ±0.239 |
| SMC | 2R | 37.2% | +0.085 | ±0.286 |
| SMC | 3R | 26.6% | +0.031 | ±0.348 |
| SMC | 4R | 14.9% | -0.290 | ±0.345 |
| SMC | 6R | 7.4% | -0.525 | ±0.344 |

## 8. Filtros de ENTRADA testados sobre as mesmas velas

Cada linha é o MESMO conjunto de sinais, só que a aceitar os que passam o filtro. Tudo
adimensional (fracção do ATR, fracção do corpo, lado da EMA) — nada em unidades de preço.
Gestão = sem gestão (parciais + SL + alvo final), para o filtro aparecer limpo.

Sinais com traços calculáveis: 115 de 160.

### Motor ORB

| filtro | trades | % vit. | R total | R médio | IC 95% |
|---|---:|---:|---:|---:|---:|
| — sem filtro — | 51 | 25.5% | +6.4 | +0.125 | ±0.584 |
| corpo ≥ 50% da barra | 19 | 21.1% | -2.6 | -0.136 | ±0.836 |
| corpo ≥ 60% da barra | 12 | 16.7% | -1.0 | -0.083 | ±1.212 |
| fecho no terço extremo (≥0,66) | 13 | 30.8% | +4.1 | +0.314 | ±1.198 |
| fecho no quarto extremo (≥0,75) | 9 | 22.2% | -1.5 | -0.163 | ±1.236 |
| barra ≥ 1,0× ATR (rompimento com força) | 33 | 18.2% | -2.1 | -0.063 | ±0.710 |
| barra ≥ 1,5× ATR | 14 | 21.4% | +2.2 | +0.154 | ±1.142 |
| barra ≤ 2,5× ATR (evita exaustão) | 48 | 27.1% | +9.4 | +0.195 | ±0.616 |
| momento 8 barras ≥ +1 ATR | 36 | 19.4% | -0.7 | -0.019 | ±0.712 |
| momento 8 barras ≥ +2 ATR | 14 | 21.4% | -0.6 | -0.046 | ±1.012 |
| EMA200 4h a favor | 44 | 22.7% | +1.0 | +0.023 | ±0.627 |
| EMA200 4h a favor + ≥1 ATR de folga | 42 | 23.8% | +3.0 | +0.071 | ±0.653 |
| EMA200 4h a favor + ≥3 ATR de folga | 37 | 24.3% | +5.7 | +0.154 | ±0.730 |
| RSI a favor (≥55 compra / ≤45 venda) | 44 | 27.3% | +8.0 | +0.181 | ±0.638 |
| só COMPRAS | 29 | 31.0% | +13.0 | +0.447 | ±0.904 |
| stop ≤ 2% do preço | 34 | 23.5% | -0.9 | -0.027 | ±0.687 |
| stop ≥ 1% do preço (custo taker ≤ 0,11R) | 42 | 28.6% | +13.4 | +0.320 | ±0.691 |
| COMPRAS + EMA200 4h a favor | 29 | 31.0% | +13.0 | +0.447 | ±0.904 |
| COMPRAS + EMA200 4h + corpo ≥50% | 12 | 25.0% | +1.0 | +0.080 | ±1.211 |
| EMA200 4h + corpo ≥50% + fecho ≥0,66 | 4 | — | — | — | amostra curta demais |

### Motor SMC

| filtro | trades | % vit. | R total | R médio | IC 95% |
|---|---:|---:|---:|---:|---:|
| — sem filtro — | 52 | 48.1% | -0.9 | -0.018 | ±0.199 |
| corpo ≥ 50% da barra | 29 | 48.3% | -3.8 | -0.132 | ±0.256 |
| corpo ≥ 60% da barra | 24 | 45.8% | -3.2 | -0.135 | ±0.275 |
| fecho no terço extremo (≥0,66) | 27 | 63.0% | +6.3 | +0.233 | ±0.251 |
| fecho no quarto extremo (≥0,75) | 19 | 63.2% | +3.7 | +0.197 | ±0.288 |
| barra ≥ 1,0× ATR (rompimento com força) | 34 | 55.9% | +1.8 | +0.053 | ±0.249 |
| barra ≥ 1,5× ATR | 19 | 57.9% | +0.4 | +0.019 | ±0.366 |
| barra ≤ 2,5× ATR (evita exaustão) | 47 | 46.8% | -1.1 | -0.022 | ±0.204 |
| momento 8 barras ≥ +1 ATR | 14 | 35.7% | -2.0 | -0.146 | ±0.380 |
| momento 8 barras ≥ +2 ATR | 7 | — | — | — | amostra curta demais |
| EMA200 4h a favor | 51 | 47.1% | -1.9 | -0.036 | ±0.199 |
| EMA200 4h a favor + ≥1 ATR de folga | 51 | 47.1% | -1.9 | -0.036 | ±0.199 |
| EMA200 4h a favor + ≥3 ATR de folga | 41 | 53.7% | +4.9 | +0.120 | ±0.198 |
| RSI a favor (≥55 compra / ≤45 venda) | 10 | 40.0% | -1.4 | -0.143 | ±0.458 |
| só COMPRAS | 28 | 35.7% | -0.6 | -0.020 | ±0.240 |
| stop ≤ 2% do preço | 51 | 47.1% | -1.9 | -0.037 | ±0.199 |
| stop ≥ 1% do preço (custo taker ≤ 0,11R) | 31 | 19.4% | -11.9 | -0.385 | ±0.198 |
| COMPRAS + EMA200 4h a favor | 28 | 35.7% | -0.6 | -0.020 | ±0.240 |
| COMPRAS + EMA200 4h + corpo ≥50% | 15 | 33.3% | -2.4 | -0.159 | ±0.352 |
| EMA200 4h + corpo ≥50% + fecho ≥0,66 | 18 | 55.6% | +0.8 | +0.045 | ±0.300 |

## 9. Hora do sinal (UTC) — as janelas do ouro ainda servem os perps 24/7?

| hora UTC | trades | % vit. | R total | R médio |
|---:|---:|---:|---:|---:|
| 00h | 2 | 50.0% | +4.2 | +2.082 |
| 01h | 4 | 50.0% | +0.6 | +0.161 |
| 02h | 3 | 33.3% | -1.0 | -0.343 |
| 03h | 4 | 25.0% | +2.3 | +0.578 |
| 04h | 1 | 0.0% | -1.0 | -1.000 |
| 05h | 7 | 28.6% | -1.6 | -0.234 |
| 06h | 6 | 66.7% | +0.3 | +0.056 |
| 07h | 9 | 11.1% | -7.1 | -0.786 |
| 08h | 8 | 12.5% | -5.3 | -0.668 |
| 09h | 3 | 33.3% | +1.5 | +0.493 |
| 10h | 4 | 50.0% | +2.4 | +0.601 |
| 11h | 7 | 57.1% | +3.2 | +0.463 |
| 12h | 5 | 20.0% | -3.0 | -0.610 |
| 13h | 8 | 25.0% | +0.5 | +0.065 |
| 14h | 4 | 25.0% | -2.8 | -0.695 |
| 15h | 9 | 66.7% | +7.1 | +0.789 |
| 16h | 6 | 66.7% | +1.8 | +0.304 |
| 17h | 2 | 50.0% | -0.0 | -0.024 |
| 18h | 1 | 0.0% | -1.0 | -1.000 |
| 19h | 1 | 0.0% | -1.0 | -1.000 |
| 20h | 3 | 33.3% | +4.2 | +1.409 |
| 21h | 1 | 100.0% | +0.9 | +0.944 |
| 22h | 3 | 33.3% | +0.8 | +0.251 |
| 23h | 2 | 0.0% | -0.5 | -0.260 |

## 10. Sensibilidade às taxas (o número muda de sinal?)

`replay-velas` usa `CUSTO_PERP = 0,05%` ida-e-volta. A taxa taker real que o indicador assume
é 0,055% POR LADO = 0,11%. Aqui está o mesmo conjunto com a taxa a dobrar.

| motor | ida-e-volta | trades | % vit. | R médio | IC 95% |
|---|---:|---:|---:|---:|---:|
| ORB | 0.05% | 54 | 27.8% | +0.111 | ±0.553 |
| ORB | 0.11% | 54 | 25.9% | +0.085 | ±0.544 |
| ORB | 0.20% | 54 | 24.1% | +0.015 | ±0.532 |
| SMC | 0.05% | 94 | 48.9% | -0.080 | ±0.151 |
| SMC | 0.11% | 94 | 39.4% | -0.200 | ±0.148 |
| SMC | 0.20% | 94 | 24.5% | -0.521 | ±0.131 |

## 11. Tamanho do stop × resultado (com a taxa real de 0,11%)

| motor | stop | trades | % vit. | R médio | IC 95% |
|---|---|---:|---:|---:|---:|
| ORB | < 0,3% do preço | 4 | — | — | amostra curta demais |
| ORB | 0,3–0,7% | 2 | — | — | amostra curta demais |
| ORB | 0,7–1,5% | 22 | 22.7% | -0.155 | ±0.773 |
| ORB | ≥ 1,5% | 26 | 30.8% | +0.451 | ±0.905 |
| SMC | < 0,3% do preço | 42 | 31.0% | -0.360 | ±0.219 |
| SMC | 0,3–0,7% | 11 | 90.9% | +0.498 | ±0.346 |
| SMC | 0,7–1,5% | 29 | 44.8% | -0.143 | ±0.259 |
| SMC | ≥ 1,5% | 12 | 8.3% | -0.417 | ±0.314 |

## 12. Piso do stop escrito em MÚLTIPLOS DO CUSTO (a regra adimensional que vai para o Pine)

`SL% ≥ N × 0,11%`. É o mesmo número em BTC a 120 000 $ e em ONDO a 0,39 $, e diz exactamente
a coisa que interessa: quanto do risco é que as taxas comem. N=9 ⇒ as taxas são ≤11% do risco.
Medido com a taxa real (0,11% ida-e-volta).

| motor | piso | trades (de) | % vit. | R médio | IC 95% | contém o zero? |
|---|---|---:|---:|---:|---:|---|
| ORB | N=0 (SL ≥ 0.00%) | 54 de 66 | 25.9% | +0.085 | ±0.544 | sim |
| ORB | N=3 (SL ≥ 0.33%) | 50 de 66 | 26.0% | +0.126 | ±0.584 | sim |
| ORB | N=5 (SL ≥ 0.55%) | 49 de 66 | 26.5% | +0.149 | ±0.594 | sim |
| ORB | N=9 (SL ≥ 0.99%) | 42 de 66 | 28.6% | +0.296 | ±0.679 | sim |
| ORB | N=14 (SL ≥ 1.54%) | 23 de 66 | 26.1% | +0.139 | ±0.841 | sim |
| ORB | N=20 (SL ≥ 2.20%) | 12 de 66 | 16.7% | -0.067 | ±1.143 | sim |
| SMC | N=0 (SL ≥ 0.00%) | 94 de 94 | 39.4% | -0.200 | ±0.148 | **NÃO** |
| SMC | N=3 (SL ≥ 0.33%) | 52 de 94 | 46.2% | -0.070 | ±0.195 | sim |
| SMC | N=5 (SL ≥ 0.55%) | 52 de 94 | 46.2% | -0.070 | ±0.195 | sim |
| SMC | N=9 (SL ≥ 0.99%) | 31 de 94 | 16.1% | -0.435 | ±0.194 | **NÃO** |
| SMC | N=14 (SL ≥ 1.54%) | 11 de 94 | 9.1% | -0.364 | ±0.325 | **NÃO** |
| SMC | N=20 | 1 de 94 | — | — | — | amostra curta demais |

## 13. A escada de alvos (parciais 50/25/25, taxa real 0,11%)

Cada linha substitui os TP do sinal por uma escada própria, mantendo entrada e stop. Mede o
que o indicador deve trazer por omissão, não o que o motor do site faz depois.

| motor | escada | trades | % vit. | R médio | IC 95% |
|---|---|---:|---:|---:|---:|
| ORB | 0,5 / 1 / 1,5 / 2R (o que o briefing descreve) | 54 | 48.1% | -0.110 | ±0.208 |
| ORB | 1 / 2 / 3 / 4R | 54 | 27.8% | -0.104 | ±0.300 |
| ORB | 1,5 / 3 / 4,5 / 6R (o que está no ficheiro) | 54 | 31.5% | -0.098 | ±0.388 |
| ORB | 1,5 / 4 / 7 / 12R (perfil SWING do ficheiro) | 54 | 31.5% | -0.060 | ±0.434 |
| ORB | 2 / 4 / 7 / 12R | 54 | 27.8% | -0.040 | ±0.462 |
| ORB | 3 / 6 / 10 / 16R | 54 | 25.9% | +0.107 | ±0.573 |
| SMC | 0,5 / 1 / 1,5 / 2R (o que o briefing descreve) | 94 | 39.4% | -0.202 | ±0.147 |
| SMC | 1 / 2 / 3 / 4R | 94 | 28.7% | -0.329 | ±0.177 |
| SMC | 1,5 / 3 / 4,5 / 6R (o que está no ficheiro) | 94 | 24.5% | -0.400 | ±0.214 |
| SMC | 1,5 / 4 / 7 / 12R (perfil SWING do ficheiro) | 94 | 18.1% | -0.461 | ±0.206 |
| SMC | 2 / 4 / 7 / 12R | 94 | 23.4% | -0.434 | ±0.223 |
| SMC | 3 / 6 / 10 / 16R | 94 | 21.3% | -0.446 | ±0.264 |

## 14. Os valores por omissão da v2, aplicados de uma vez

Motor ORB só · piso de custo N=9 (SL ≥ 0,99%) · tecto de exaustão 2,5× ATR · RSI a favor (55/45)
· escada 3/6/10/16R · taxa real 0,11% ida-e-volta.

| conjunto | trades | % vit. | R total | R médio | IC 95% |
|---|---:|---:|---:|---:|---:|
| v0 · tudo ligado como estava (ORB+SMC) | 103 | 23.3% | -3.7 | -0.036 | ±0.376 |
| v1 · só ORB | 51 | 25.5% | +7.5 | +0.147 | ±0.604 |
| v2a · ORB + piso de custo N=9 | 42 | 28.6% | +14.6 | +0.349 | ±0.716 |
| v2b · + tecto de exaustão 2,5× ATR | 39 | 30.8% | +17.6 | +0.452 | ±0.762 |
| v2 · + RSI a favor (o que se entrega) | 35 | 31.4% | +16.0 | +0.457 | ±0.803 |
| v2+ · e ainda só compras (NÃO entregue) | 20 | 35.0% | +16.0 | +0.801 | ±1.252 |

_Sem velas para: —_
