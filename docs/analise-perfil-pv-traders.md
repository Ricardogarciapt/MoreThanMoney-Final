# Perfil do break-even — MTM Auto Edge / King / Wolf

Gerado por `scripts/estudos/perfil-pv-traders.ts` em 2026-09-16 21:07 UTC. Só leitura.

> **Ressalva primeiro.** A amostra é de semanas, não de meses, e cada trade é replicado em velas do TradingView — não são fills reais. Nenhuma diferença abaixo é estatisticamente sólida se o t da coluna «Δ vs actual» estiver entre −2 e +2. Os fechos e BE anunciados pelo trader não entram (não há histórico fiável com hora e setup).

## Como se mediu

- **Gestão actual** (confirmada em `mtmauto_providers.sinais_config` das três — igual a `CONFIG_PADRAO`): saídas 50% no TP1 e 25% no TP2; BE no TP1 com +2 pips; trailing a 0,5×risco, a arrancar à distância do TP1. Numa conta de 0,01 lote não há parciais e o BE passa a `be_gatilho` = distância ao TP1.
- **Motor de produção**: `niveisAncorados` + `gestaoDoSinal` + `decidirGestao`; ordem SL → gestão → TP por tick; o stop ganha na mesma vela; a posição abre ao fecho da vela do ENTRY HIT (+spread) e só é avaliada a partir da vela seguinte; janela de 72 h (depois fecha a mercado, «tempo»).
- **Conferência** com `replicarSinal` (lib/mtmfunded/reconstituicao.ts) nos casos em M1: 37 casos, 0 com SL final diferente.
- **R** = soma das partes (volume × diferença de preço, spread incluído) ÷ (volume inicial × risco ancorado). **% vit.** = R > +0,02.
- **salvou / cortou**: trade a trade contra «sem BE» (o mesmo trailing): o perfil deu mais (salvou) ou menos (cortou) R. **…e o preço foi ao TP seguinte**: dos cortados, quantos viram o preço chegar, depois da nossa saída e antes do SL original, a um TP acima do último que tinham visto.
- **Δ vs actual (t)**: diferença média de R por trade contra o perfil actual, emparelhada, e o t dessa média. |t| < 2 = não se distingue do ruído.

## Amostra e janela

- Setups PrimeVerse no chat (todos os traders): 460. ENTRY HIT: 207 no chat + 315 no journal (201 são o mesmo evento). Journal ambíguo: 0.
- Desfasamento mediano feed − entrada do sinal no minuto do ENTRY HIT (casos exactos do chat): XAUUSD -0,05 (n=198, p10–p90 -2,73…3,14) · NAS100 +23,80 (n=1, p10–p90 23,80…23,80). Os níveis são ancorados ao preço do feed, por isso o R não depende disto; só o emparelhamento pelo preço depende.

**Porque é que várias linhas das tabelas saem iguais a «sem BE».** O trailing actual arranca à distância do TP1 e segue a 0,5R: quando o preço chega a +0,5R (+ a folga de 2 pips), o próprio trailing já pôs o stop na entrada. Um BE que arme DEPOIS disso (TP2, TP3, 0,75R, 1R — e o 0,5R quase sempre) nunca mexe no stop. Com este trailing fixo, a única decisão real sobre o BE é **se protege a faixa entre o TP1 e +0,5R** (BE no TP1 / 0,3R) **ou não** (todo o resto).

**Índices da Edge:** desde 20/08 o relay registou 1 ENTRY HIT de índices (o chat tem 1), contra 27 setups de US30/NAS100 do fxedge. Sem ENTRY HIT a estratégia não abre — ao vivo, a Edge é praticamente só ouro — e aqui não há amostra de índices para medir.

| estratégia | trader | trades | janela | XAUUSD / US30 / NAS100 | fonte (chat / journal) | M1 / M5 | risco mediano |
|---|---|---:|---|---|---|---|---|
| MTM Auto Edge | fxedge | 63 | 2026-08-20 → 2026-09-16 | 63 / 0 / 0 | 63 / 0 | 27 / 36 | XAUUSD 100 pips |
| MTM Auto King | kingfkg | 14 | 2026-08-24 → 2026-09-09 | 13 / 0 / 1 | 14 / 0 | 4 / 10 | XAUUSD 90 pips · NAS100 100 pts |
| MTM Auto Wolf | g_wolf | 14 | 2026-08-20 → 2026-09-16 | 14 / 0 / 0 | 14 / 0 | 6 / 8 | XAUUSD 70 pips |

**Fora da amostra:**

- kingfkg · ENTRY HIT do chat sem setup no chat: 3
- fxedge · ENTRY HIT do chat sem setup no chat: 4
- kingfkg · ENTRY HIT do journal sem setup compatível pelo preço (ou sem velas): 18
- g_wolf · ENTRY HIT do journal sem setup compatível pelo preço (ou sem velas): 4
- fxedge · ENTRY HIT do journal sem setup compatível pelo preço (ou sem velas): 28

## MTM Auto Edge (fxedge) — 63 trades

**Alvos do sinal** (mediana, em R): TP1 0,30R · TP2 0,60R · TP3 0,90R · TP4 1,20R · TP5 2,10R — 5 alvos por sinal.

**MFE antes do SL original** (em R): p25 0,36 · p50 0,88 · p75 3,18 · p90 7,71.

**Até que TP o preço foi antes do SL original** (72 h):

| último TP tocado | nenhum | TP1 | TP2 | TP3 | TP4 | TP5 |
|---|---:|---:|---:|---:|---:|---:|
| trades | 11 | 15 | 11 | 4 | 4 | 18 |
| % acumulada «chegou pelo menos a» | 100% | 83% | 59% | 41% | 35% | 29% |

**Anunciado pelo trader** (journal, só 15/09 19:43 → 16/09 18:19): XAUUSD sell @4331 → TP1 · NAS100 sell @29090 → TP1 · XAUUSD buy @4354 → TP1, TP2 · US30 sell @52175 → TP1, TP2, TP3, TP4, TP5 · US30 buy @52000 → TP1, TP2, TP3, TP4, TP5.

### 0,01 lote (contas de 1 000 — sem parciais)

| perfil | n | % vit. | R total | R médio | Δ vs actual (t) | salvou | cortou | …e o preço foi ao TP seguinte | saídas SL/BE/trail/TP/tempo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BE no TP1 (actual) | 63 | 56% | +8,3 | +0,131 | — | 15 | 7 | 5 | 11/23/26/3/0 |
| BE no TP2 | 63 | 59% | +7,7 | +0,122 | -0,010 (-0,6) | 0 | 0 | 0 | 11/0/49/3/0 |
| BE no TP3 | 63 | 59% | +7,7 | +0,122 | -0,010 (-0,6) | 0 | 0 | 0 | 11/0/49/3/0 |
| BE a 0.30R | 63 | 56% | +7,6 | +0,120 | -0,012 (-1,0) | 15 | 8 | 6 | 11/24/25/3/0 |
| BE a 0.50R | 63 | 54% | +7,6 | +0,120 | -0,011 (-0,7) | 0 | 3 | 2 | 11/4/45/3/0 |
| BE a 0.75R | 63 | 59% | +7,7 | +0,122 | -0,010 (-0,6) | 0 | 0 | 0 | 11/0/49/3/0 |
| BE a 1.00R | 63 | 59% | +7,7 | +0,122 | -0,010 (-0,6) | 0 | 0 | 0 | 11/0/49/3/0 |
| sem BE | 63 | 59% | +7,7 | +0,122 | -0,010 (-0,6) | — | — | — | 11/0/49/3/0 |
| ref · BE TP1, sem trailing | 63 | 32% | +2,5 | +0,039 | -0,092 (-1,4) | 18 | 30 | 14 | 11/46/0/6/0 |
| ref · BE TP1, trailing arranca a 1R | 63 | 43% | +5,5 | +0,087 | -0,045 (-1,9) | 18 | 21 | 13 | 11/37/12/3/0 |
| ref · sem BE e sem trailing | 63 | 30% | +7,0 | +0,111 | -0,020 (-0,1) | 16 | 33 | 0 | 44/0/0/18/1 |

### 0,10 lote (conta da casa de 10 000 — 50% TP1 / 25% TP2)

| perfil | n | % vit. | R total | R médio | Δ vs actual (t) | salvou | cortou | …e o preço foi ao TP seguinte | saídas SL/BE/trail/TP/tempo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BE no TP1 (actual) | 63 | 83% | +7,1 | +0,113 | — | 14 | 4 | 3 | 11/23/26/3/0 |
| BE no TP2 | 63 | 83% | +7,0 | +0,111 | -0,003 (-0,3) | 0 | 0 | 0 | 11/0/49/3/0 |
| BE no TP3 | 63 | 83% | +7,0 | +0,111 | -0,003 (-0,3) | 0 | 0 | 0 | 11/0/49/3/0 |
| BE a 0.30R | 63 | 83% | +6,4 | +0,101 | -0,012 (-1,0) | 14 | 5 | 4 | 11/24/25/3/0 |
| BE a 0.50R | 63 | 83% | +6,9 | +0,110 | -0,003 (-0,4) | 0 | 0 | 0 | 11/4/45/3/0 |
| BE a 0.75R | 63 | 83% | +7,0 | +0,111 | -0,003 (-0,3) | 0 | 0 | 0 | 11/0/49/3/0 |
| BE a 1.00R | 63 | 83% | +7,0 | +0,111 | -0,003 (-0,3) | 0 | 0 | 0 | 11/0/49/3/0 |
| sem BE | 63 | 83% | +7,0 | +0,111 | -0,003 (-0,3) | — | — | — | 11/0/49/3/0 |
| ref · BE TP1, sem trailing | 63 | 83% | +5,2 | +0,082 | -0,031 (-1,5) | 17 | 27 | 12 | 11/46/0/6/0 |
| ref · BE TP1, trailing arranca a 1R | 63 | 83% | +6,1 | +0,096 | -0,017 (-2,1) | 17 | 18 | 11 | 11/37/12/3/0 |
| ref · sem BE e sem trailing | 63 | 40% | +5,0 | +0,079 | -0,034 (-0,4) | 16 | 33 | 0 | 44/0/0/18/1 |

### Controlo (0,01 lote, R médio por trade)

| perfil | só M1 (n=27) | 1.ª metade (n=31) | 2.ª metade (n=32) |
|---|---:|---:|---:|
| BE no TP1 (actual) | +0,178 | +0,175 | +0,089 |
| BE no TP2 | +0,141 | +0,195 | +0,051 |
| BE no TP3 | +0,141 | +0,195 | +0,051 |
| BE a 0.30R | +0,151 | +0,175 | +0,066 |
| BE a 0.50R | +0,140 | +0,193 | +0,051 |
| BE a 0.75R | +0,141 | +0,195 | +0,051 |
| BE a 1.00R | +0,141 | +0,195 | +0,051 |
| sem BE | +0,141 | +0,195 | +0,051 |

## MTM Auto King (kingfkg) — 14 trades

**Alvos do sinal** (mediana, em R): TP1 0,38R · TP2 0,78R · TP3 1,20R · TP4 1,61R · TP5 2,03R — 5 alvos por sinal.

**MFE antes do SL original** (em R): p25 0,43 · p50 0,63 · p75 3,35 · p90 9,58.

**Até que TP o preço foi antes do SL original** (72 h):

| último TP tocado | nenhum | TP1 | TP2 | TP3 | TP4 | TP5 |
|---|---:|---:|---:|---:|---:|---:|
| trades | 4 | 2 | 3 | 0 | 0 | 5 |
| % acumulada «chegou pelo menos a» | 100% | 71% | 57% | 36% | 36% | 36% |

**Anunciado pelo trader** (journal, só 15/09 19:43 → 16/09 18:19): XAUUSD sell @4306 → TP2, TP3, TP4, TP5 · XAUUSD buy @4322 → TP1, TP2, TP3, TP4, TP5.

### 0,01 lote (contas de 1 000 — sem parciais)

| perfil | n | % vit. | R total | R médio | Δ vs actual (t) | salvou | cortou | …e o preço foi ao TP seguinte | saídas SL/BE/trail/TP/tempo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BE no TP1 (actual) | 14 | 64% | -1,3 | -0,090 | — | 2 | 2 | 0 | 4/4/6/0/0 |
| BE no TP2 | 14 | 57% | -1,2 | -0,085 | +0,005 (0,3) | 0 | 1 | 0 | 4/1/9/0/0 |
| BE no TP3 | 14 | 57% | -1,2 | -0,083 | +0,008 (0,5) | 0 | 0 | 0 | 4/0/10/0/0 |
| BE a 0.30R | 14 | 71% | -1,8 | -0,126 | -0,036 (-0,4) | 3 | 5 | 3 | 3/8/3/0/0 |
| BE a 0.50R | 14 | 57% | -1,2 | -0,085 | +0,005 (0,3) | 0 | 1 | 0 | 4/1/9/0/0 |
| BE a 0.75R | 14 | 57% | -1,2 | -0,083 | +0,008 (0,5) | 0 | 0 | 0 | 4/0/10/0/0 |
| BE a 1.00R | 14 | 57% | -1,2 | -0,083 | +0,008 (0,5) | 0 | 0 | 0 | 4/0/10/0/0 |
| sem BE | 14 | 57% | -1,2 | -0,083 | +0,008 (0,5) | — | — | — | 4/0/10/0/0 |
| ref · BE TP1, sem trailing | 14 | 57% | -1,3 | -0,093 | -0,003 (-0,0) | 3 | 7 | 5 | 4/9/0/1/0 |
| ref · BE TP1, trailing arranca a 1R | 14 | 64% | -1,9 | -0,135 | -0,044 (-1,7) | 2 | 5 | 3 | 4/7/3/0/0 |
| ref · sem BE e sem trailing | 14 | 36% | +3,1 | +0,222 | +0,313 (0,9) | 5 | 5 | 0 | 9/0/0/5/0 |

### 0,10 lote (conta da casa de 10 000 — 50% TP1 / 25% TP2)

| perfil | n | % vit. | R total | R médio | Δ vs actual (t) | salvou | cortou | …e o preço foi ao TP seguinte | saídas SL/BE/trail/TP/tempo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BE no TP1 (actual) | 14 | 71% | -0,3 | -0,022 | — | 2 | 1 | 0 | 4/4/6/0/0 |
| BE no TP2 | 14 | 71% | -0,2 | -0,013 | +0,008 (0,6) | 0 | 0 | 0 | 4/1/9/0/0 |
| BE no TP3 | 14 | 71% | -0,2 | -0,012 | +0,009 (0,7) | 0 | 0 | 0 | 4/0/10/0/0 |
| BE a 0.30R | 14 | 79% | -0,9 | -0,067 | -0,045 (-0,4) | 3 | 4 | 3 | 3/8/3/0/0 |
| BE a 0.50R | 14 | 71% | -0,2 | -0,013 | +0,008 (0,6) | 0 | 0 | 0 | 4/1/9/0/0 |
| BE a 0.75R | 14 | 71% | -0,2 | -0,012 | +0,009 (0,7) | 0 | 0 | 0 | 4/0/10/0/0 |
| BE a 1.00R | 14 | 71% | -0,2 | -0,012 | +0,009 (0,7) | 0 | 0 | 0 | 4/0/10/0/0 |
| sem BE | 14 | 71% | -0,2 | -0,012 | +0,009 (0,7) | — | — | — | 4/0/10/0/0 |
| ref · BE TP1, sem trailing | 14 | 71% | -0,3 | -0,020 | +0,001 (0,0) | 3 | 6 | 5 | 4/9/0/1/0 |
| ref · BE TP1, trailing arranca a 1R | 14 | 71% | -0,6 | -0,040 | -0,019 (-1,6) | 2 | 4 | 3 | 4/7/3/0/0 |
| ref · sem BE e sem trailing | 14 | 43% | +1,1 | +0,081 | +0,103 (0,8) | 5 | 5 | 0 | 9/0/0/5/0 |

### Por símbolo (0,01 lote, R médio por trade)

| perfil | XAUUSD (n=13) | NAS100 (n=1) |
|---|---:|---:|
| BE no TP1 (actual) | -0,020 | -1,000 |
| BE no TP2 | -0,015 | -1,000 |
| BE no TP3 | -0,012 | -1,000 |
| BE a 0.30R | -0,059 | -1,000 |
| BE a 0.50R | -0,015 | -1,000 |
| BE a 0.75R | -0,012 | -1,000 |
| BE a 1.00R | -0,012 | -1,000 |
| sem BE | -0,012 | -1,000 |

### Controlo (0,01 lote, R médio por trade)

| perfil | só M1 (n=4) | 1.ª metade (n=7) | 2.ª metade (n=7) |
|---|---:|---:|---:|
| BE no TP1 (actual) | -0,321 | -0,053 | -0,128 |
| BE no TP2 | -0,336 | -0,035 | -0,136 |
| BE no TP3 | -0,336 | -0,035 | -0,130 |
| BE a 0.30R | -0,321 | -0,124 | -0,128 |
| BE a 0.50R | -0,336 | -0,035 | -0,136 |
| BE a 0.75R | -0,336 | -0,035 | -0,130 |
| BE a 1.00R | -0,336 | -0,035 | -0,130 |
| sem BE | -0,336 | -0,035 | -0,130 |

## MTM Auto Wolf (g_wolf) — 14 trades

**Alvos do sinal** (mediana, em R): TP1 0,31R · TP2 1,29R · TP3 3,63R · TP4 6,14R · TP5 9,84R — 5 alvos por sinal.

**MFE antes do SL original** (em R): p25 0,06 · p50 0,59 · p75 1,79 · p90 13,19.

**Até que TP o preço foi antes do SL original** (72 h):

| último TP tocado | nenhum | TP1 | TP2 | TP3 | TP4 | TP5 |
|---|---:|---:|---:|---:|---:|---:|
| trades | 5 | 3 | 4 | 0 | 0 | 2 |
| % acumulada «chegou pelo menos a» | 100% | 64% | 43% | 14% | 14% | 14% |

**Anunciado pelo trader** (journal, só 15/09 19:43 → 16/09 18:19): XAUUSD buy @4278 → TP4, TP5 · XAUUSD sell @4335 → TP1, TP2.

### 0,01 lote (contas de 1 000 — sem parciais)

| perfil | n | % vit. | R total | R médio | Δ vs actual (t) | salvou | cortou | …e o preço foi ao TP seguinte | saídas SL/BE/trail/TP/tempo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BE no TP1 (actual) | 14 | 64% | -0,3 | -0,021 | — | 3 | 0 | 0 | 5/3/6/0/0 |
| BE no TP2 | 14 | 43% | -0,9 | -0,067 | -0,046 (-1,6) | 0 | 0 | 0 | 5/0/9/0/0 |
| BE no TP3 | 14 | 43% | -0,9 | -0,067 | -0,046 (-1,6) | 0 | 0 | 0 | 5/0/9/0/0 |
| BE a 0.30R | 14 | 50% | -0,9 | -0,064 | -0,043 (-1,4) | 1 | 0 | 0 | 5/1/8/0/0 |
| BE a 0.50R | 14 | 43% | -0,9 | -0,067 | -0,046 (-1,6) | 0 | 0 | 0 | 5/0/9/0/0 |
| BE a 0.75R | 14 | 43% | -0,9 | -0,067 | -0,046 (-1,6) | 0 | 0 | 0 | 5/0/9/0/0 |
| BE a 1.00R | 14 | 43% | -0,9 | -0,067 | -0,046 (-1,6) | 0 | 0 | 0 | 5/0/9/0/0 |
| sem BE | 14 | 43% | -0,9 | -0,067 | -0,046 (-1,6) | — | — | — | 5/0/9/0/0 |
| ref · BE TP1, sem trailing | 14 | 64% | +11,2 | +0,799 | +0,821 (1,1) | 5 | 4 | 0 | 5/7/0/2/0 |
| ref · BE TP1, trailing arranca a 1R | 14 | 64% | +0,6 | +0,040 | +0,061 (0,5) | 4 | 2 | 0 | 5/5/4/0/0 |
| ref · sem BE e sem trailing | 14 | 14% | +3,9 | +0,282 | +0,303 (0,4) | 2 | 7 | 0 | 12/0/0/2/0 |

### 0,10 lote (conta da casa de 10 000 — 50% TP1 / 25% TP2)

| perfil | n | % vit. | R total | R médio | Δ vs actual (t) | salvou | cortou | …e o preço foi ao TP seguinte | saídas SL/BE/trail/TP/tempo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BE no TP1 (actual) | 14 | 64% | -1,1 | -0,075 | — | 3 | 0 | 0 | 5/3/6/0/0 |
| BE no TP2 | 14 | 50% | -1,4 | -0,098 | -0,023 (-1,6) | 0 | 0 | 0 | 5/0/9/0/0 |
| BE no TP3 | 14 | 50% | -1,4 | -0,098 | -0,023 (-1,6) | 0 | 0 | 0 | 5/0/9/0/0 |
| BE a 0.30R | 14 | 50% | -1,3 | -0,096 | -0,021 (-1,4) | 1 | 0 | 0 | 5/1/8/0/0 |
| BE a 0.50R | 14 | 50% | -1,4 | -0,098 | -0,023 (-1,6) | 0 | 0 | 0 | 5/0/9/0/0 |
| BE a 0.75R | 14 | 50% | -1,4 | -0,098 | -0,023 (-1,6) | 0 | 0 | 0 | 5/0/9/0/0 |
| BE a 1.00R | 14 | 50% | -1,4 | -0,098 | -0,023 (-1,6) | 0 | 0 | 0 | 5/0/9/0/0 |
| sem BE | 14 | 50% | -1,4 | -0,098 | -0,023 (-1,6) | — | — | — | 5/0/9/0/0 |
| ref · BE TP1, sem trailing | 14 | 64% | +2,5 | +0,182 | +0,257 (1,1) | 5 | 4 | 0 | 5/7/0/2/0 |
| ref · BE TP1, trailing arranca a 1R | 14 | 64% | -0,8 | -0,054 | +0,021 (0,4) | 4 | 2 | 0 | 5/5/4/0/0 |
| ref · sem BE e sem trailing | 14 | 36% | +0,1 | +0,004 | +0,079 (0,3) | 2 | 7 | 0 | 12/0/0/2/0 |

### Controlo (0,01 lote, R médio por trade)

| perfil | só M1 (n=6) | 1.ª metade (n=7) | 2.ª metade (n=7) |
|---|---:|---:|---:|
| BE no TP1 (actual) | +0,320 | -0,358 | +0,315 |
| BE no TP2 | +0,221 | -0,364 | +0,230 |
| BE no TP3 | +0,221 | -0,364 | +0,230 |
| BE a 0.30R | +0,221 | -0,358 | +0,230 |
| BE a 0.50R | +0,221 | -0,364 | +0,230 |
| BE a 0.75R | +0,221 | -0,364 | +0,230 |
| BE a 1.00R | +0,221 | -0,364 | +0,230 |
| sem BE | +0,221 | -0,364 | +0,230 |

## Posições reais (funded_positions, comentário «MTM Auto …»)

As linhas «RECONST · …» das contas do dono são histórico reconstituído com uma configuração anterior e não entram aqui. Uma posição com parciais aparece em várias linhas (a parte fechada fica com `motivo_fecho = tp_parcial`).

| conta | estratégia | aberta → fechada (UTC) | vol. | entrada | SL final | TP | fecho | motivo | pnl | BE (gatilho/offset/no TP1/feito) | trailing (arranque/distância) | máx. favorável no feed até ao fecho |
|---|---|---|---:|---:|---:|---:|---:|---|---:|---|---|---:|
| 6e1d4af4 | MTM Auto Wolf | 09-16 03:27 → 03:52:53 | 0.01 de 0.01 | 4335.33 | 4326.64 | 4256.31 | 4326.64 | sl | 8.69 | 2/0.2/não/sim | 2/3.5 | 4322.855 (mín.) |
| b8ea7dd4 | MTM Auto Wolf | 09-16 03:27 → 03:29:12 | 0.05 | 4335.33 | 4342.31 | 4256.31 | 4333.31 | tp_parcial | 10.1 | —/0/não/não | —/— | 4331.895 (mín.) |
| b8ea7dd4 | MTM Auto Wolf | 09-16 03:27 → 03:43:50 | 0.02 | 4335.33 | 4329.87 | 4256.31 | 4326.31 | tp_parcial | 18.04 | —/0/não/não | —/— | 4325.945 (mín.) |
| b8ea7dd4 | MTM Auto Wolf | 09-16 03:27 → 03:52:53 | 0.03 de 0.1 | 4335.33 | 4326.64 | 4256.31 | 4326.64 | sl | 26.07 | —/0.2/sim/sim | 2/3.5 | 4322.855 (mín.) |
| 6e06d33e | MTM Auto Edge | 09-16 19:48 → 19:52:02 | 0.01 de 0.01 | 4266.06 | 4270.94 | 4281.06 | 4270.94 | sl | 4.88 | 3/0.2/não/sim | 3/5 | 4276.595 (máx.) |
| 2ff64e17 | MTM Auto Edge | 09-16 19:48 → 19:49:09 | 0.05 | 4266.06 | 4256.06 | 4281.06 | 4269.06 | tp_parcial | 15 | —/0/não/não | —/— | 4271.91 (máx.) |
| 2ff64e17 | MTM Auto Edge | 09-16 19:48 → 19:52:02 | 0.03 de 0.1 | 4266.06 | 4270.94 | 4281.06 | 4270.94 | sl | 14.64 | —/0.2/sim/sim | 3/5 | 4276.595 (máx.) |
| 2ff64e17 | MTM Auto Edge | 09-16 19:48 → 19:50:07 | 0.02 | 4266.06 | 4266.26 | 4281.06 | 4272.06 | tp_parcial | 12 | —/0/não/não | —/— | 4276.35 (máx.) |

## O caso de 16/09 19:48 (Edge, conta 6e06d33e)

- **Sinal** fxedge: compra XAUUSD, entrada 4268, SL 4258 (100 pips), TP1…TP5 = 4271 / 4274 / 4277 / 4280 / 4283 (+30 pips cada, TP1 = 0,3R).
- **Abertura** 19:48:00 a 4266,06 (o ENTRY HIT chegou com o preço 1,94 abaixo da entrada). Níveis ancorados: SL 4256,06, TPs 4269,06…4281,06.
- **Gestão gravada** (0,01 lote → sem parciais): `be_gatilho` 3,00 (= distância ao TP1) com `be_offset` 0,20; `trailing_ativacao` 3,00 e `trailing_distancia` 5,00 (= 0,5 × risco de 10,00).
- **O que fechou**: não foi o BE (esse põe o stop em 4266,26). O stop final 4270,94 = 4275,94 − 5,00: o **trailing** seguiu o bid até 4275,94 (feed: máximo 4276.595 entre 19:48 e 19:51) e o preço voltou a 4270,94 às 19:52:02 → +4,88 USD = **+0,49R**. A conta da casa (0,10) fez o mesmo com parciais: 0,05 no TP1, 0,02 no TP2, 0,03 no trailing = +41,64 USD (+0,42R).
- **O que o preço fez a seguir**: entre 19:52 e 19:56 o ouro andou entre 4267.63 e 4274.1; o TP3 (4277) e o TP4 (4280) do trader **nunca foram tocados no feed** nessa tarde. Até ao «CLOSED» do trader (20:26) o ouro desceu a 4258.1 — a um passo do SL dele (4258). Quem ficasse até ao fecho do trader (≈4259) saía perto de −0,7R na nossa entrada.
- **Os «TP HIT» das 19:53–19:55**: o journal tem 5 respostas `tp_hit` da Edge nesses minutos, mas não guarda o símbolo. No mesmo intervalo o **US30 do mesmo trader** (compra 51420 às 19:49, TPs a +30 pontos) subia no feed de 51430.4 a 51494.9 — com o desfasamento de ~+35 pontos da corretora dele, isso atravessa o TP1–TP3 do US30. É muito provável que pelo menos parte desses anúncios seja do US30 e não do ouro. O US30 não abriu na Edge (não houve ENTRY HIT).
- **Conclusão do caso**: a nossa gestão não saiu cedo em relação ao preço — saiu perto do topo do movimento. O BE não entrou na decisão.

## Os «TP HIT» do trader contra o preço do feed

Para cada anúncio com nível (journal, «SHADOW TP_HIT»): o melhor preço do feed M1 entre o setup e o anúncio, e se esse preço chegou ao nível anunciado. No US30 o feed anda ~30 pontos ao lado da corretora do trader, por isso lá a coluna «chegou?» vale pouco.

| anúncio (UTC) | trader | setup | nível | preço do nível | melhor preço no feed até ao anúncio | chegou? |
|---|---|---|---|---:|---:|---|
| 2026-09-15 19:43 | kingfkg | XAUUSD sell @4306 | TP2 | 4297 | 4291.5 | sim |
| 2026-09-15 20:36 | kingfkg | XAUUSD sell @4306 | TP3 | 4292 | 4291.5 | sim |
| 2026-09-15 23:02 | kingfkg | XAUUSD sell @4306 | TP4 | 4287 | 4286.38 | sim |
| 2026-09-15 23:28 | kingfkg | XAUUSD sell @4306 | TP5 | 4282 | 4282.155 | **não** |
| 2026-09-16 01:57 | zata | XAUUSD sell @4288 | TP1 | 4283 | 4280.17 | sim |
| 2026-09-16 02:56 | g_wolf | XAUUSD buy @4278 | TP4 | 4319 | 4322.64 | sim |
| 2026-09-16 03:14 | g_wolf | XAUUSD buy @4278 | TP5 | 4339 | 4338.98 | **não** |
| 2026-09-16 03:29 | g_wolf | XAUUSD sell @4335 | TP1 | 4333 | 4331.895 | sim |
| 2026-09-16 03:43 | g_wolf | XAUUSD sell @4335 | TP2 | 4326 | 4325.945 | sim |
| 2026-09-16 05:18 | kingfkg | XAUUSD buy @4322 | TP1 | 4324 | 4325.255 | sim |
| 2026-09-16 05:20 | kingfkg | XAUUSD buy @4322 | TP2 | 4326 | 4326.43 | sim |
| 2026-09-16 05:30 | kingfkg | XAUUSD buy @4322 | TP3 | 4328 | 4327.875 | **não** |
| 2026-09-16 05:38 | kingfkg | XAUUSD buy @4322 | TP4 | 4330 | 4330.96 | sim |
| 2026-09-16 05:44 | kingfkg | XAUUSD buy @4322 | TP5 | 4332 | 4333.075 | sim |
| 2026-09-16 05:45 | j-momentum | XAUUSD buy @4330 | TP1 | 4333 | 4333.845 | sim |
| 2026-09-16 08:01 | fxedge | XAUUSD sell @4331 | TP1 | 4326 | 4325.415 | sim |
| 2026-09-16 08:07 | fxedge | NAS100 sell @29090 | TP1 | 29060 | 29027.4 | sim |
| 2026-09-16 13:15 | fxedge | XAUUSD buy @4354 | TP1 | 4357 | 4360.465 | sim |
| 2026-09-16 13:15 | fxedge | XAUUSD buy @4354 | TP2 | 4360 | 4360.465 | sim |
| 2026-09-16 13:34 | fxedge | US30 sell @52175 | TP1 | 52145 | 52040.8 | sim |
| 2026-09-16 13:35 | fxedge | US30 sell @52175 | TP2 | 52075 | 52040.8 | sim |
| 2026-09-16 13:40 | fxedge | US30 sell @52175 | TP3 | 52025 | 51986.8 | sim |
| 2026-09-16 14:19 | fxedge | US30 sell @52175 | TP4 | 51975 | 51924.7 | sim |
| 2026-09-16 14:24 | fxedge | US30 sell @52175 | TP5 | 51925 | 51883.8 | sim |
| 2026-09-16 14:38 | fxedge | US30 buy @52000 | TP1 | 52030 | 52000.1 | **não** |
| 2026-09-16 14:41 | fxedge | US30 buy @52000 | TP2 | 52060 | 52022.7 | **não** |
| 2026-09-16 15:00 | fxedge | US30 buy @52000 | TP3 | 52090 | 52080.7 | **não** |
| 2026-09-16 15:01 | fxedge | US30 buy @52000 | TP4 | 52120 | 52089.2 | **não** |
| 2026-09-16 15:04 | fxedge | US30 buy @52000 | TP5 | 52150 | 52113.7 | **não** |

## Anexo — trades replicados (0,01 lote)

| entrada (UTC) | trader | símbolo | dir. | entrada / SL / último TP | fonte | tf | MFE R | TP máx. | actual R (saída) | sem BE R | BE 0,50R R |
|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|
| 2026-08-20 06:48 | fxedge | XAUUSD | sell | 4494 / 4504 / 4470 | chat | M5 | 4,22 | 5 | +0,42 (trailing) | +0,42 (trailing) | +0,42 (trailing) |
| 2026-08-20 12:37 | g_wolf | XAUUSD | buy | 4457 / 4450 / 4517 | chat | M5 | 24,07 | 5 | +1,18 (trailing) | +1,18 (trailing) | +1,18 (trailing) |
| 2026-08-20 12:45 | fxedge | XAUUSD | buy | 4466 / 4456 / 4481 | chat | M5 | 16,03 | 5 | +0,02 (be) | +0,77 (trailing) | +0,77 (trailing) |
| 2026-08-20 15:40 | fxedge | XAUUSD | sell | 4519 / 4529 / 4500 | chat | M5 | 0,00 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-08-20 17:00 | fxedge | XAUUSD | buy | 4510 / 4500 / 4555 | chat | M5 | 12,02 | 5 | +0,02 (be) | -0,02 (trailing) | -0,02 (trailing) |
| 2026-08-21 01:03 | fxedge | XAUUSD | buy | 4515 / 4505 / 4530 | chat | M5 | 12,74 | 5 | +1,50 (tp) | +1,50 (tp) | +1,50 (tp) |
| 2026-08-21 03:03 | g_wolf | XAUUSD | sell | 4534 / 4541 / 4485 | chat | M5 | 0,90 | 2 | +0,03 (be) | -0,01 (trailing) | -0,01 (trailing) |
| 2026-08-21 11:06 | fxedge | XAUUSD | buy | 4594 / 4584 / 4720 | chat | M5 | 1,19 | 2 | +0,33 (trailing) | +0,33 (trailing) | +0,33 (trailing) |
| 2026-08-21 13:09 | fxedge | XAUUSD | buy | 4583 / 4575 / 4750 | chat | M5 | 11,61 | 4 | +0,22 (trailing) | +0,22 (trailing) | +0,22 (trailing) |
| 2026-08-21 13:10 | fxedge | XAUUSD | buy | 4583 / 4575 / 4750 | chat | M5 | 0,27 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-08-21 17:23 | fxedge | XAUUSD | sell | 4621 / 4631 / 4606 | chat | M5 | 1,53 | 5 | +1,50 (tp) | +1,50 (tp) | +1,50 (tp) |
| 2026-08-24 00:51 | fxedge | XAUUSD | buy | 4614 / 4604 / 4680 | chat | M5 | 7,96 | 5 | +1,28 (trailing) | +1,28 (trailing) | +1,28 (trailing) |
| 2026-08-24 13:04 | kingfkg | XAUUSD | sell | 4667 / 4675 / 4652 | chat | M5 | 0,00 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-08-24 13:22 | g_wolf | XAUUSD | sell | 4671 / 4678 / 4542 | chat | M5 | 0,28 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-08-24 16:04 | fxedge | XAUUSD | buy | 4657 / 4647 / 5000 | chat | M5 | 0,29 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-08-24 17:02 | fxedge | XAUUSD | buy | 4643 / 4633 / 4658 | chat | M5 | 0,90 | 3 | +0,40 (trailing) | +0,40 (trailing) | +0,40 (trailing) |
| 2026-08-24 18:05 | fxedge | XAUUSD | buy | 4640 / 4630 / 4655 | chat | M5 | 6,46 | 5 | +0,48 (trailing) | +0,48 (trailing) | +0,48 (trailing) |
| 2026-08-25 00:35 | fxedge | XAUUSD | buy | 4689 / 4680 / 4704 | chat | M5 | 0,15 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-08-25 02:54 | kingfkg | XAUUSD | buy | 4625 / 4616 / 4651 | chat | M5 | 2,90 | 5 | +0,71 (trailing) | +0,71 (trailing) | +0,71 (trailing) |
| 2026-08-25 03:10 | fxedge | XAUUSD | buy | 4636 / 4626 / 4700 | chat | M5 | 0,72 | 2 | +0,02 (be) | +0,21 (trailing) | +0,21 (trailing) |
| 2026-08-25 12:19 | fxedge | XAUUSD | sell | 4635 / 4643 / 4615 | chat | M5 | 0,64 | 1 | +0,02 (be) | -0,09 (trailing) | -0,09 (trailing) |
| 2026-08-25 14:00 | fxedge | XAUUSD | buy | 4620 / 4610 / 4635 | chat | M5 | 5,46 | 5 | +0,25 (trailing) | +0,25 (trailing) | +0,25 (trailing) |
| 2026-08-25 16:31 | fxedge | XAUUSD | buy | 4640 / 4630 / 4680 | chat | M5 | 3,50 | 4 | +0,26 (trailing) | +0,26 (trailing) | +0,26 (trailing) |
| 2026-08-26 02:29 | fxedge | XAUUSD | sell | 4657 / 4663 / 4642 | chat | M5 | 0,17 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-08-26 03:00 | fxedge | XAUUSD | sell | 4657 / 4663 / 4642 | chat | M5 | 35,17 | 5 | +1,23 (trailing) | +1,23 (trailing) | +1,23 (trailing) |
| 2026-08-26 15:29 | fxedge | XAUUSD | buy | 4596 / 4586 / 4630 | chat | M5 | 1,41 | 3 | +0,91 (trailing) | +0,91 (trailing) | +0,91 (trailing) |
| 2026-08-26 16:39 | fxedge | XAUUSD | buy | 4590 / 4580 / 4605 | chat | M5 | 5,56 | 5 | +0,24 (trailing) | +0,24 (trailing) | +0,24 (trailing) |
| 2026-08-27 03:00 | kingfkg | XAUUSD | buy | 4629 / 4621 / 4644 | chat | M5 | 0,47 | 1 | +0,02 (be) | -0,03 (trailing) | -0,03 (trailing) |
| 2026-08-27 03:01 | kingfkg | XAUUSD | buy | 4630 / 4621 / 4656 | chat | M5 | 0,42 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-08-27 10:16 | fxedge | XAUUSD | buy | 4581 / 4571 / 4650 | chat | M5 | 1,99 | 4 | +1,35 (trailing) | +1,35 (trailing) | +1,35 (trailing) |
| 2026-08-27 13:21 | fxedge | XAUUSD | buy | 4587 / 4577 / 4602 | chat | M5 | 0,54 | 1 | +0,02 (be) | +0,04 (trailing) | +0,02 (be) |
| 2026-08-27 14:37 | g_wolf | XAUUSD | sell | 4587 / 4595 / 4508 | chat | M5 | 0,00 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-08-28 01:03 | fxedge | XAUUSD | buy | 4589 / 4579 / 4604 | chat | M5 | 0,72 | 2 | +0,02 (be) | +0,02 (trailing) | +0,02 (be) |
| 2026-08-28 01:35 | fxedge | XAUUSD | sell | 4587 / 4597 / 4572 | chat | M5 | 0,90 | 2 | +0,02 (be) | +0,06 (trailing) | +0,02 (be) |
| 2026-08-28 02:55 | kingfkg | XAUUSD | sell | 4586 / 4596 / 4520 | chat | M5 | 1,46 | 2 | +0,32 (trailing) | +0,32 (trailing) | +0,32 (trailing) |
| 2026-08-28 06:54 | kingfkg | XAUUSD | sell | 4604 / 4614 / 4589 | chat | M5 | 0,70 | 2 | +0,02 (be) | +0,20 (trailing) | +0,20 (trailing) |
| 2026-08-28 12:08 | fxedge | XAUUSD | buy | 4595 / 4585 / 4610 | chat | M5 | 3,27 | 5 | +0,41 (trailing) | +0,41 (trailing) | +0,41 (trailing) |
| 2026-08-28 12:40 | kingfkg | XAUUSD | buy | 4590 / 4580 / 4615 | chat | M5 | 3,51 | 5 | +0,55 (trailing) | +0,55 (trailing) | +0,55 (trailing) |
| 2026-08-28 17:06 | g_wolf | XAUUSD | buy | 4476 / 4469 / 4600 | chat | M5 | 0,00 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-08-30 23:10 | fxedge | XAUUSD | buy | 4465 / 4458 / 4480 | chat | M5 | 0,61 | 1 | +0,03 (be) | -0,03 (trailing) | -0,03 (trailing) |
| 2026-08-31 14:11 | fxedge | XAUUSD | buy | 4426 / 4416 / 4466 | chat | M5 | 0,34 | 1 | +0,02 (be) | -0,16 (trailing) | -0,16 (trailing) |
| 2026-08-31 16:04 | fxedge | XAUUSD | buy | 4431 / 4421 / 4446 | chat | M5 | 3,09 | 5 | +0,46 (trailing) | +0,46 (trailing) | +0,46 (trailing) |
| 2026-09-01 00:23 | kingfkg | XAUUSD | sell | 4460 / 4469 / 4436 | chat | M5 | 19,44 | 5 | +0,10 (trailing) | +0,10 (trailing) | +0,10 (trailing) |
| 2026-09-01 18:25 | fxedge | XAUUSD | buy | 4343 / 4333 / 4358 | chat | M5 | 0,00 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-09-01 23:56 | g_wolf | XAUUSD | buy | 4329 / 4322 / 4430 | chat | M5 | 0,00 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-09-03 02:08 | fxedge | XAUUSD | sell | 4411 / 4420 / 4396 | chat | M5 | 0,34 | 1 | +0,02 (be) | -0,16 (trailing) | -0,16 (trailing) |
| 2026-09-03 13:50 | kingfkg | XAUUSD | sell | 4457 / 4466.5 / 4443.5 | chat | M5 | 0,56 | 2 | +0,02 (be) | +0,06 (trailing) | +0,02 (be) |
| 2026-09-03 14:32 | fxedge | XAUUSD | buy | 4478 / 4468 / 4493 | chat | M5 | 3,98 | 5 | +0,02 (be) | -0,20 (trailing) | -0,20 (trailing) |
| 2026-09-03 15:29 | g_wolf | XAUUSD | sell | 4504 / 4512 / 4445 | chat | M5 | 17,58 | 5 | +0,28 (trailing) | +0,28 (trailing) | +0,28 (trailing) |
| 2026-09-03 17:26 | fxedge | XAUUSD | buy | 4491 / 4481 / 4520 | chat | M5 | 0,15 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-09-04 08:11 | fxedge | XAUUSD | sell | 4480 / 4490 / 4465 | chat | M5 | 11,62 | 5 | +0,02 (be) | +0,19 (trailing) | +0,19 (trailing) |
| 2026-09-04 13:39 | fxedge | XAUUSD | sell | 4399 / 4409 / 4360 | chat | M5 | 0,00 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-09-04 14:00 | kingfkg | XAUUSD | buy | 4415 / 4407 / 4430 | chat | M5 | 3,50 | 5 | +0,27 (trailing) | +0,27 (trailing) | +0,27 (trailing) |
| 2026-09-04 14:13 | g_wolf | XAUUSD | sell | 4421 / 4427 / 4395 | chat | M5 | 1,17 | 2 | +0,29 (trailing) | +0,29 (trailing) | +0,29 (trailing) |
| 2026-09-07 01:54 | kingfkg | NAS100 | sell | 29530 / 29630 / 29380 | chat | M1 | 0,12 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-09-07 04:26 | fxedge | XAUUSD | sell | 4402 / 4410 / 4387 | chat | M1 | 0,79 | 2 | +0,29 (trailing) | +0,29 (trailing) | +0,29 (trailing) |
| 2026-09-07 11:29 | fxedge | XAUUSD | buy | 4390 / 4380 / 4430 | chat | M1 | 5,29 | 5 | +1,25 (trailing) | +1,25 (trailing) | +1,25 (trailing) |
| 2026-09-07 14:53 | g_wolf | XAUUSD | sell | 4413 / 4418 / 4364 | chat | M1 | 2,94 | 2 | +1,20 (trailing) | +1,20 (trailing) | +1,20 (trailing) |
| 2026-09-07 15:40 | fxedge | XAUUSD | sell | 4410 / 4420 / 4395 | chat | M1 | 0,71 | 2 | +0,21 (trailing) | +0,21 (trailing) | +0,21 (trailing) |
| 2026-09-08 00:07 | fxedge | XAUUSD | sell | 4418 / 4428 / 4403 | chat | M1 | 0,46 | 1 | +0,02 (be) | -0,04 (trailing) | -0,04 (trailing) |
| 2026-09-08 00:10 | kingfkg | XAUUSD | sell | 4420 / 4428 / 4405 | chat | M1 | 0,47 | 1 | +0,03 (be) | -0,03 (trailing) | -0,03 (trailing) |
| 2026-09-08 03:12 | fxedge | XAUUSD | buy | 4430 / 4423 / 4480 | chat | M1 | 1,74 | 3 | +0,72 (trailing) | +0,72 (trailing) | +0,72 (trailing) |
| 2026-09-08 12:07 | g_wolf | XAUUSD | buy | 4403 / 4396 / 4494 | chat | M1 | 0,00 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-09-08 12:35 | fxedge | XAUUSD | sell | 4405 / 4415 / 4370 | chat | M1 | 0,68 | 1 | +0,02 (be) | +0,16 (trailing) | +0,16 (trailing) |
| 2026-09-08 14:20 | fxedge | XAUUSD | sell | 4396 / 4406 / 4381 | chat | M1 | 0,79 | 2 | +0,02 (be) | -0,07 (trailing) | -0,07 (trailing) |
| 2026-09-09 07:17 | fxedge | XAUUSD | sell | 4405 / 4415 / 4390 | chat | M1 | 1,80 | 5 | +1,50 (tp) | +1,50 (tp) | +1,50 (tp) |
| 2026-09-09 09:17 | kingfkg | XAUUSD | buy | 4396 / 4387 / 4422 | chat | M1 | 0,21 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-09-09 13:26 | kingfkg | XAUUSD | sell | 4427 / 4438 / 4403 | chat | M1 | 12,18 | 5 | +0,69 (trailing) | +0,69 (trailing) | +0,69 (trailing) |
| 2026-09-09 13:42 | fxedge | XAUUSD | sell | 4418 / 4428 / 4403 | chat | M1 | 0,38 | 1 | +0,02 (be) | -0,12 (trailing) | -0,12 (trailing) |
| 2026-09-09 15:13 | fxedge | XAUUSD | buy | 4388 / 4378 / 4413 | chat | M1 | 0,67 | 1 | +0,02 (be) | -0,02 (trailing) | -0,02 (trailing) |
| 2026-09-10 11:27 | fxedge | XAUUSD | buy | 4388 / 4378 / 4403 | chat | M1 | 0,32 | 1 | +0,02 (be) | -0,18 (trailing) | -0,18 (trailing) |
| 2026-09-10 13:01 | fxedge | XAUUSD | buy | 4352 / 4342 / 4367 | chat | M1 | 2,74 | 5 | +0,13 (trailing) | +0,13 (trailing) | +0,13 (trailing) |
| 2026-09-10 14:55 | fxedge | XAUUSD | sell | 4357 / 4367 / 4342 | chat | M1 | 0,31 | 1 | +0,02 (be) | -0,19 (trailing) | -0,19 (trailing) |
| 2026-09-10 16:09 | fxedge | XAUUSD | buy | 4361 / 4351 / 4376 | chat | M1 | 0,77 | 2 | +0,02 (be) | +0,05 (trailing) | +0,02 (be) |
| 2026-09-10 16:15 | fxedge | XAUUSD | sell | 4359 / 4369 / 4344 | chat | M1 | 6,73 | 5 | +0,02 (be) | -0,09 (trailing) | -0,09 (trailing) |
| 2026-09-10 18:15 | fxedge | XAUUSD | buy | 4342 / 4332 / 4450 | chat | M1 | 0,40 | 1 | +0,02 (be) | -0,10 (trailing) | -0,10 (trailing) |
| 2026-09-11 00:17 | g_wolf | XAUUSD | sell | 4318 / 4326 / 4249 | chat | M1 | 0,28 | 1 | +0,02 (be) | -0,22 (trailing) | -0,22 (trailing) |
| 2026-09-11 01:23 | fxedge | XAUUSD | sell | 4325 / 4335 / 4304 | chat | M1 | 0,34 | 1 | +0,02 (be) | -0,16 (trailing) | -0,16 (trailing) |
| 2026-09-11 08:10 | fxedge | XAUUSD | buy | 4346 / 4336 / 4425 | chat | M1 | 0,99 | 1 | +0,49 (trailing) | +0,49 (trailing) | +0,49 (trailing) |
| 2026-09-11 12:20 | fxedge | XAUUSD | buy | 4333 / 4323 / 4380 | chat | M1 | 1,09 | 2 | +0,59 (trailing) | +0,59 (trailing) | +0,59 (trailing) |
| 2026-09-11 13:12 | g_wolf | XAUUSD | sell | 4381.5 / 4391 / 4293 | chat | M1 | 0,24 | 1 | +0,02 (be) | -0,33 (trailing) | -0,33 (trailing) |
| 2026-09-11 15:17 | fxedge | XAUUSD | buy | 4364 / 4356 / 4389 | chat | M1 | 1,47 | 2 | +0,75 (trailing) | +0,75 (trailing) | +0,75 (trailing) |
| 2026-09-15 01:50 | fxedge | XAUUSD | buy | 4299 / 4289 / 4324 | chat | M1 | 1,95 | 3 | +0,86 (trailing) | +0,86 (trailing) | +0,86 (trailing) |
| 2026-09-15 11:27 | fxedge | XAUUSD | buy | 4283 / 4273 / 4315 | chat | M1 | 0,28 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-09-15 12:33 | fxedge | XAUUSD | sell | 4277 / 4287 / 4252 | chat | M1 | 0,00 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-09-15 14:23 | fxedge | XAUUSD | sell | 4287 / 4297 / 4272 | chat | M1 | 1,26 | 4 | +0,20 (trailing) | +0,20 (trailing) | +0,20 (trailing) |
| 2026-09-15 14:38 | fxedge | XAUUSD | sell | 4277 / 4287 / 4252 | chat | M1 | 0,29 | 0 | -1,00 (sl) | -1,00 (sl) | -1,00 (sl) |
| 2026-09-15 16:33 | g_wolf | XAUUSD | sell | 4295 / 4298 / 4246 | chat | M1 | 1,00 | 1 | +0,50 (trailing) | +0,50 (trailing) | +0,50 (trailing) |
| 2026-09-16 03:27 | g_wolf | XAUUSD | sell | 4335 / 4342 / 4256 | chat | M1 | 2,00 | 2 | +1,18 (trailing) | +1,18 (trailing) | +1,18 (trailing) |
| 2026-09-16 07:57 | fxedge | XAUUSD | sell | 4331 / 4340 / 4300 | chat | M1 | 0,73 | 1 | +0,23 (trailing) | +0,23 (trailing) | +0,23 (trailing) |
| 2026-09-16 19:48 | fxedge | XAUUSD | buy | 4268 / 4258 / 4283 | chat | M1 | 0,88 | 2 | +0,35 (trailing) | +0,35 (trailing) | +0,35 (trailing) |
