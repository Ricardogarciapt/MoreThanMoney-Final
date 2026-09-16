# Perfil de break-even e trailing — GoldKiller e Aurum Flow

Corrido a 2026-09-16 14:22 UTC · velas 5m do TradingView · janela de 864 barras (3 dias) por sinal.

> Só leitura: nada foi escrito em `mtmauto_providers` nem em nenhuma outra tabela.

## GoldKiller (XAUUSD)

**Janela medida:** 2026-08-17 → 2026-09-16 · **sinais medidos:** 47 de 216 entradas na base.

**Ficaram de fora:**

- 169 — sem velas no histórico à hora do sinal

### 1. Distribuição do MFE (excursão máxima a favor antes do stop)

| medida | p25 | p50 | p75 | p90 |
|---|---:|---:|---:|---:|
| MFE em R | 0.40 | 0.86 | 1.81 | 5.05 |
| MFE em pips | 63.2 | 136.4 | 319.3 | 862.5 |
| risco inicial R em pips | 160.1 | 168.9 | 171.8 | 177.3 |
| MAE em R | -1.14 | -1.06 | -1.02 | -0.92 |

Sem gestão nenhuma: 40 bateram no stop, 6 fecharam nos alvos, 1 ainda estavam abertas ao fim de 3 dias.

Fracção de sinais que chegou a estar em lucro de **0.3R**: 77% · **0.5R**: 66% · **0.75R**: 51% · **1R**: 47% · **1.5R**: 36% · **2R**: 23%.

**A que distância ficam os alvos do próprio sinal** (em R, mediana): TP1 1.15R · TP2 2.21R · último alvo 4.30R. É o último alvo que manda no pedaço que corre — quanto mais longe estiver, mais o desfecho do resto da posição é decidido pelo trailing e não pelo alvo.

**Resolução:** a vela de 5m tem uma amplitude mediana de 40.9 pips = **0.24R**. Qualquer gatilho ou distância abaixo disto está a ser medido com uma régua maior do que a coisa que se mede: os números saem optimistas e não se deve configurar por eles.

### 2. Varredura — break-even sozinho

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 47 | 42.6% | -8.0 | -0.170 | ±0.357 | -14.9 | 0 | 0 |
| BE 0.30R | 47 | 76.6% | +3.7 | +0.079 | ±0.260 | -6.5 | 16 | 9 |
| BE 0.50R | 47 | 66.0% | +1.6 | +0.033 | ±0.300 | -7.0 | 11 | 8 |
| BE 0.75R | 47 | 51.1% | -4.1 | -0.087 | ±0.322 | -12.8 | 4 | 5 |
| BE 1.00R | 47 | 46.8% | -4.4 | -0.093 | ±0.331 | -12.0 | 2 | 3 |

### 3. Varredura — trailing sozinho

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 47 | 42.6% | -8.0 | -0.170 | ±0.357 | -14.9 | 0 | 0 |
| trailing arranca 0.50R · dist 0.25R | 47 | 66.0% | -0.8 | -0.016 | ±0.210 | -4.7 | 11 | 7 |
| trailing arranca 0.50R · dist 0.50R | 47 | 66.0% | -0.9 | -0.019 | ±0.229 | -6.9 | 11 | 8 |
| trailing arranca 0.50R · dist 0.75R | 47 | 42.6% | -2.9 | -0.061 | ±0.235 | -7.4 | 11 | 12 |
| trailing arranca 0.50R · dist 1.00R | 47 | 42.6% | -0.5 | -0.010 | ±0.276 | -5.8 | 11 | 8 |
| trailing arranca 0.75R · dist 0.25R | 47 | 51.1% | -4.5 | -0.097 | ±0.260 | -10.0 | 4 | 7 |
| trailing arranca 0.75R · dist 0.50R | 47 | 51.1% | -3.8 | -0.081 | ±0.274 | -11.4 | 4 | 7 |
| trailing arranca 0.75R · dist 0.75R | 47 | 51.1% | -6.0 | -0.128 | ±0.267 | -12.4 | 4 | 10 |
| trailing arranca 0.75R · dist 1.00R | 47 | 44.7% | -3.1 | -0.066 | ±0.297 | -9.6 | 4 | 7 |
| trailing arranca 1.00R · dist 0.25R | 47 | 46.8% | -4.1 | -0.088 | ±0.282 | -10.1 | 2 | 7 |
| trailing arranca 1.00R · dist 0.50R | 47 | 46.8% | -3.0 | -0.065 | ±0.295 | -10.6 | 2 | 7 |
| trailing arranca 1.00R · dist 0.75R | 47 | 46.8% | -4.7 | -0.100 | ±0.288 | -10.4 | 2 | 7 |
| trailing arranca 1.00R · dist 1.00R | 47 | 46.8% | -4.8 | -0.102 | ±0.302 | -10.6 | 2 | 7 |
| trailing arranca 1.50R · dist 0.25R | 47 | 42.6% | -3.3 | -0.071 | ±0.324 | -11.7 | 0 | 6 |
| trailing arranca 1.50R · dist 0.50R | 47 | 42.6% | -4.7 | -0.100 | ±0.313 | -12.0 | 0 | 7 |
| trailing arranca 1.50R · dist 0.75R | 47 | 42.6% | -5.3 | -0.112 | ±0.312 | -12.0 | 0 | 7 |
| trailing arranca 1.50R · dist 1.00R | 47 | 42.6% | -4.8 | -0.103 | ±0.323 | -11.8 | 0 | 6 |

### 4. Varredura — break-even + trailing

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 47 | 42.6% | -8.0 | -0.170 | ±0.357 | -14.9 | 0 | 0 |
| BE 0.30R + trailing 1.00R/0.50R | 47 | 76.6% | +2.5 | +0.054 | ±0.207 | -5.2 | 16 | 12 |
| BE 0.30R + trailing 0.75R/0.50R | 47 | 76.6% | +2.4 | +0.050 | ±0.205 | -4.7 | 16 | 12 |
| BE 0.30R + trailing 0.75R/0.75R | 47 | 76.6% | +0.8 | +0.016 | ±0.196 | -5.5 | 16 | 13 |
| BE 0.30R + trailing 1.00R/0.75R | 47 | 76.6% | +0.8 | +0.016 | ±0.196 | -5.6 | 16 | 12 |
| BE 0.30R + trailing 1.50R/0.50R | 47 | 76.6% | +0.7 | +0.015 | ±0.204 | -5.9 | 16 | 13 |
| BE 0.30R + trailing 1.50R/0.75R | 47 | 76.6% | -0.0 | -0.001 | ±0.196 | -6.0 | 16 | 13 |
| BE 0.50R + trailing 0.75R/0.50R | 47 | 66.0% | -1.2 | -0.025 | ±0.231 | -7.1 | 11 | 11 |
| BE 0.50R + trailing 1.00R/0.50R | 47 | 66.0% | -1.2 | -0.027 | ±0.233 | -7.9 | 11 | 12 |
| BE 0.50R + trailing 1.50R/0.50R | 47 | 66.0% | -2.2 | -0.046 | ±0.236 | -7.7 | 11 | 13 |
| BE 0.50R + trailing 0.75R/0.75R | 47 | 66.0% | -2.2 | -0.047 | ±0.229 | -7.3 | 11 | 13 |
| BE 0.50R + trailing 1.00R/0.75R | 47 | 66.0% | -2.2 | -0.048 | ±0.229 | -7.4 | 11 | 12 |
| BE 1.00R + trailing 1.00R/0.50R | 47 | 46.8% | -3.0 | -0.065 | ±0.295 | -10.6 | 2 | 7 |
| BE 0.50R + trailing 1.50R/0.75R | 47 | 66.0% | -3.0 | -0.065 | ±0.228 | -7.8 | 11 | 13 |
| BE 0.75R + trailing 0.75R/0.50R | 47 | 51.1% | -3.8 | -0.081 | ±0.274 | -11.4 | 4 | 7 |
| BE 1.00R + trailing 0.75R/0.50R | 47 | 51.1% | -3.8 | -0.081 | ±0.274 | -11.4 | 4 | 7 |
| BE 1.00R + trailing 1.50R/0.50R | 47 | 46.8% | -4.3 | -0.091 | ±0.298 | -10.4 | 2 | 8 |
| BE 1.00R + trailing 1.00R/0.75R | 47 | 46.8% | -4.7 | -0.100 | ±0.288 | -10.4 | 2 | 7 |
| BE 0.75R + trailing 1.00R/0.50R | 47 | 51.1% | -4.8 | -0.103 | ±0.274 | -12.8 | 4 | 9 |
| BE 1.00R + trailing 1.50R/0.75R | 47 | 46.8% | -5.3 | -0.113 | ±0.290 | -10.4 | 2 | 8 |
| BE 0.75R + trailing 1.50R/0.50R | 47 | 51.1% | -5.7 | -0.122 | ±0.276 | -12.7 | 4 | 10 |
| BE 1.00R + trailing 0.75R/0.75R | 47 | 51.1% | -6.0 | -0.128 | ±0.267 | -12.4 | 4 | 10 |
| BE 0.75R + trailing 0.75R/0.75R | 47 | 51.1% | -6.1 | -0.129 | ±0.267 | -12.3 | 4 | 10 |
| BE 0.75R + trailing 1.00R/0.75R | 47 | 51.1% | -6.2 | -0.132 | ±0.266 | -12.5 | 4 | 9 |
| BE 0.75R + trailing 1.50R/0.75R | 47 | 51.1% | -7.0 | -0.149 | ±0.265 | -13.0 | 4 | 10 |

### 5. O mesmo em pips (o GoldKiller é um símbolo só)

O risco inicial mediano é de **168.9 pips**, por isso 1R ≈ 169 pips — mas esse número ANDOU: 84 pips em julho, 89 em agosto, 169 em setembro. Os gatilhos em pips abaixo estão convertidos em R sinal a sinal, com o risco daquele sinal.

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 47 | 42.6% | -8.0 | -0.170 | ±0.357 | -14.9 | 0 | 0 |
| BE 10 pips (+2 de folga) | 47 | 85.1% | +2.3 | +0.048 | ±0.215 | -4.6 | 20 | 14 |
| BE 15 pips (+2 de folga) | 47 | 85.1% | +2.8 | +0.060 | ±0.216 | -4.0 | 20 | 13 |
| BE 20 pips (+2 de folga) | 47 | 80.9% | +1.4 | +0.029 | ±0.226 | -6.1 | 18 | 12 |
| BE 25 pips (+2 de folga) | 47 | 80.9% | +1.4 | +0.029 | ±0.226 | -6.1 | 18 | 12 |
| BE 30 pips (+2 de folga) | 47 | 78.7% | +3.6 | +0.077 | ±0.256 | -6.1 | 17 | 10 |
| BE 40 pips (+2 de folga) | 47 | 76.6% | +2.6 | +0.055 | ±0.260 | -7.1 | 16 | 10 |
| BE 50 pips (+2 de folga) | 47 | 76.6% | +2.6 | +0.055 | ±0.260 | -7.1 | 16 | 10 |

### 6. Trailing em pips

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 47 | 42.6% | -8.0 | -0.170 | ±0.357 | -14.9 | 0 | 0 |
| trailing 20/10 pips | 47 | 80.9% | +2.5 | +0.054 | ±0.162 | -2.5 | 18 | 8 |
| trailing 20/15 pips | 47 | 80.9% | +1.8 | +0.039 | ±0.161 | -2.7 | 18 | 9 |
| trailing 20/20 pips | 47 | 80.9% | +2.0 | +0.042 | ±0.162 | -2.8 | 18 | 11 |
| trailing 20/30 pips | 47 | 70.2% | +1.4 | +0.029 | ±0.162 | -3.0 | 18 | 11 |
| trailing 30/10 pips | 47 | 78.7% | +2.4 | +0.050 | ±0.169 | -3.4 | 17 | 7 |
| trailing 30/15 pips | 47 | 78.7% | +1.7 | +0.035 | ±0.167 | -3.5 | 17 | 8 |
| trailing 30/20 pips | 47 | 78.7% | +1.7 | +0.037 | ±0.168 | -3.6 | 17 | 9 |
| trailing 30/30 pips | 47 | 78.7% | +0.9 | +0.019 | ±0.168 | -3.8 | 17 | 10 |
| trailing 40/10 pips | 47 | 76.6% | +3.0 | +0.064 | ±0.179 | -3.2 | 16 | 7 |
| trailing 40/15 pips | 47 | 76.6% | +2.4 | +0.050 | ±0.177 | -3.3 | 16 | 7 |
| trailing 40/20 pips | 47 | 76.6% | +2.0 | +0.043 | ±0.176 | -3.4 | 16 | 8 |
| trailing 40/30 pips | 47 | 76.6% | +0.8 | +0.017 | ±0.175 | -4.1 | 16 | 8 |
| trailing 60/10 pips | 47 | 76.6% | +5.8 | +0.123 | ±0.186 | -3.0 | 16 | 7 |
| trailing 60/15 pips | 47 | 76.6% | +4.7 | +0.100 | ±0.182 | -3.0 | 16 | 7 |
| trailing 60/20 pips | 47 | 76.6% | +4.6 | +0.097 | ±0.183 | -3.0 | 16 | 7 |
| trailing 60/30 pips | 47 | 76.6% | +3.1 | +0.066 | ±0.181 | -3.1 | 16 | 7 |

### 7. Os dois juntos, em pips

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 47 | 42.6% | -8.0 | -0.170 | ±0.357 | -14.9 | 0 | 0 |
| BE 15 + trailing 40/15 | 47 | 85.1% | +3.6 | +0.077 | ±0.150 | -3.0 | 20 | 12 |
| BE 15 + trailing 40/20 | 47 | 85.1% | +3.3 | +0.071 | ±0.149 | -3.0 | 20 | 12 |
| BE 15 + trailing 60/15 | 47 | 85.1% | +3.3 | +0.070 | ±0.151 | -3.0 | 20 | 13 |
| BE 15 + trailing 60/20 | 47 | 85.1% | +3.1 | +0.067 | ±0.150 | -3.0 | 20 | 13 |
| BE 15 + trailing 30/20 | 47 | 85.1% | +3.1 | +0.065 | ±0.148 | -2.9 | 20 | 12 |
| BE 15 + trailing 30/15 | 47 | 85.1% | +3.0 | +0.063 | ±0.147 | -2.8 | 20 | 12 |
| BE 40 + trailing 60/20 | 47 | 76.6% | +2.6 | +0.055 | ±0.181 | -3.0 | 16 | 8 |
| BE 30 + trailing 60/20 | 47 | 78.7% | +2.6 | +0.055 | ±0.174 | -3.0 | 17 | 10 |
| BE 20 + trailing 40/15 | 47 | 80.9% | +2.6 | +0.055 | ±0.164 | -3.0 | 18 | 11 |
| BE 25 + trailing 40/15 | 47 | 80.9% | +2.6 | +0.055 | ±0.164 | -3.0 | 18 | 11 |
| BE 40 + trailing 60/15 | 47 | 76.6% | +2.6 | +0.055 | ±0.180 | -3.0 | 16 | 8 |
| BE 30 + trailing 60/15 | 47 | 78.7% | +2.5 | +0.053 | ±0.173 | -3.1 | 17 | 10 |
| BE 40 + trailing 40/15 | 47 | 76.6% | +2.4 | +0.050 | ±0.177 | -3.3 | 16 | 7 |
| BE 20 + trailing 60/15 | 47 | 80.9% | +2.3 | +0.050 | ±0.165 | -3.0 | 18 | 12 |
| BE 25 + trailing 60/15 | 47 | 80.9% | +2.3 | +0.050 | ±0.165 | -3.0 | 18 | 12 |
| BE 20 + trailing 40/20 | 47 | 80.9% | +2.2 | +0.047 | ±0.163 | -3.0 | 18 | 11 |
| BE 25 + trailing 40/20 | 47 | 80.9% | +2.2 | +0.047 | ±0.163 | -3.0 | 18 | 11 |
| BE 25 + trailing 30/20 | 47 | 80.9% | +2.2 | +0.047 | ±0.162 | -2.9 | 18 | 10 |
| BE 30 + trailing 40/15 | 47 | 78.7% | +2.1 | +0.045 | ±0.170 | -3.6 | 17 | 9 |
| BE 20 + trailing 60/20 | 47 | 80.9% | +2.1 | +0.045 | ±0.164 | -3.0 | 18 | 12 |
| BE 25 + trailing 60/20 | 47 | 80.9% | +2.1 | +0.045 | ±0.164 | -3.0 | 18 | 12 |
| BE 40 + trailing 40/20 | 47 | 76.6% | +2.0 | +0.043 | ±0.176 | -3.4 | 16 | 8 |
| BE 25 + trailing 30/15 | 47 | 80.9% | +2.0 | +0.043 | ±0.161 | -2.8 | 18 | 10 |
| BE 20 + trailing 30/20 | 47 | 80.9% | +2.0 | +0.042 | ±0.162 | -2.9 | 18 | 11 |
| BE 30 + trailing 30/20 | 47 | 78.7% | +1.7 | +0.037 | ±0.168 | -3.6 | 17 | 9 |
| BE 40 + trailing 30/20 | 47 | 78.7% | +1.7 | +0.037 | ±0.168 | -3.6 | 17 | 9 |
| BE 20 + trailing 30/15 | 47 | 80.9% | +1.7 | +0.036 | ±0.161 | -2.8 | 18 | 11 |
| BE 30 + trailing 40/20 | 47 | 78.7% | +1.7 | +0.036 | ±0.169 | -3.7 | 17 | 10 |
| BE 30 + trailing 30/15 | 47 | 78.7% | +1.7 | +0.035 | ±0.167 | -3.5 | 17 | 8 |
| BE 40 + trailing 30/15 | 47 | 78.7% | +1.7 | +0.035 | ±0.167 | -3.5 | 17 | 8 |

### 8. Estabilidade mês a mês (R médio por mês)

| perfil | 2026-08 (n) | 2026-09 (n) |
|---|---:|---:|
| sem gestão (só parciais + SL + TP final) | -0.185 (22) | -0.158 (25) |
| BE 0.30R | +0.191 (22) | -0.020 (25) |
| BE 0.50R | +0.048 (22) | +0.020 (25) |
| BE 0.75R | -0.094 (22) | -0.080 (25) |
| BE 0.50R + trailing 0.75R/0.50R | -0.044 (22) | -0.009 (25) |
| BE 0.50R + trailing 1.00R/0.50R | -0.035 (22) | -0.019 (25) |
