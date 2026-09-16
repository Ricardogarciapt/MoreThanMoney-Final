# Perfil de break-even e trailing — GoldKiller e Aurum Flow

Corrido a 2026-09-16 14:23 UTC · velas 15m do TradingView · janela de 288 barras (3 dias) por sinal.

> Só leitura: nada foi escrito em `mtmauto_providers` nem em nenhuma outra tabela.

## A leitura, em duas páginas

*(Esta parte é escrita à mão — `docs/analise-perfil-gk-aurum-leitura.md`. Tudo o que vem a seguir é gerado pelo script e não tem opinião nenhuma lá dentro.)*

### GoldKiller — proposta: BE a 0,30R; o trailing é neutro (se o quiser, 1R de arranque e 0,5R de distância)

| | valor |
|---|---|
| Amostra | 213 sinais medidos de 216 · 12/07 a 16/09 (2 meses). Os 3 que ficaram de fora são alertas de domingo às 22:05, em que o feed OANDA ainda não tinha vela na meia hora seguinte |
| Onde está o MFE | mediana **0,96R**; 73% dos sinais chega a +0,3R, 61% a +0,5R, só 49% a +1R |
| Sem gestão nenhuma | +0,002R por trade — empate (79% bate no stop, o TP1 paga o resto) |
| **BE 0,30R (+0,05R de folga)** | **+0,110R por trade**, +23,5R no total, 73% de vitórias, salvou 70 e cortou 35 |
| Trailing 1,0R / 0,5R | +0,042R sozinho; **junto com o BE 0,30R piora** (+0,090 contra +0,110) |
| Intervalo de confiança | ±0,128R a 95% — **contém o zero** |

O par que decide: a 0,30R o break-even **salva 70 trades e corta 35**, dois para um. A partir de
0,50R a razão continua a favor mas o ganho total cai para metade, e a 1R já só salva 19. Isto bate
certo com a distribuição do MFE: 73% dos sinais chega a +0,3R e só metade chega a 1R — pôr o
break-even em cima de um sítio onde metade dos trades nunca passa é pôr um seguro que quase nunca
arma.

**Em pips ou em R?** O risco do GoldKiller não é estável: mediana de **84 pips em julho, 89 em
agosto e 169 em setembro**. Um número fixo em pips vale o dobro num mês e metade no outro. A mesma
varredura em pips diz BE 15-25 pips, que com o risco de hoje é 0,09-0,15R e com o de julho era
0,18-0,30R — ou seja, o número em pips muda de significado sozinho. **Configura-se em R (fracção do
stop), não em pips.** Se tiver mesmo de ir para a coluna em pips, 25 pips é o valor que fica mais
perto de 0,30R na média dos três meses, e tem de ser revisto sempre que a volatilidade do ouro muda
de patamar.

**O que NÃO recomendo, apesar de aparecer no topo da tabela:** trailing de 10 a 20 pips de
distância (as linhas de +0,19R). A vela de M15 do ouro tem uma amplitude mediana de **68,6 pips**.
Um trailing mais apertado do que a própria vela não é medível a esta resolução: o modelo deixa o
stop subir até ao extremo favorável da vela e só o executa na vela seguinte, o que é sempre bom
demais. O controlo em M5 (47 sinais, só setembro) mantém o BE 0,30R positivo (+0,079R), mas não
serve para validar distâncias de 10 pips — a vela de M5 ainda tem 41 pips de amplitude mediana.

**A ressalva honesta.** São 213 trades e dois meses. O intervalo de 95% do R médio do perfil
proposto é ±0,128 à volta de +0,110: em linguagem de gente, **isto não é estatisticamente
distinguível de zero**, é a melhor aposta com os dados que há. E a tabela mês a mês mostra a
vantagem a encolher: +0,198 em julho, +0,062 em agosto, −0,058 em setembro (só 25 trades). Se o
dono ligar isto, vale a pena voltar a medir daqui a um mês antes de o dar por assente.

### Aurum Flow — proposta: em R, e a pergunta não é o break-even

| | valor |
|---|---|
| Amostra | 924 sinais medidos de 924 · 24/07 a 16/09, 42 símbolos |
| Onde está o MFE | mediana **0,95R**; 71% chega a +0,3R, 49% a +1R |
| Sem gestão nenhuma | **−0,067R por trade**, −61,7R no total (80% bate no stop) |
| Melhor perfil medido | **BE 0,75R + trailing 1,0R / 0,5R** → −0,009R por trade (−8,1R) |
| BE agressivo (0,30R) | 71% de vitórias e mesmo assim −0,046R — a pior das opções com gestão |
| Intervalo de confiança | ±0,072R — **nenhum perfil é distinguível de zero, e nenhum é positivo** |

**Confirma-se o que o dono já aprovou: o Aurum só pode ser configurado em R.** Duas razões, e a
segunda é a que interessa. A primeira é dimensional: são 42 símbolos com preços de 0,07 $ a
120 000 $. A segunda é que a configuração de hoje está inerte por causa disso — `trailing_arranca_pips
= 40` passa pelo motor como `40 × pipSize`, e `pipSizeForSymbol` devolve 1 para cripto (é a regra da
casa, e está certa): 40 unidades **de preço**. Num ONDO a 0,39 $ o trailing nunca arma; num BTC a
120 000 $ arma ao primeiro suspiro. O mesmo número, os dois extremos. Vale a pena confirmar isto no
caminho de execução dos perpétuos antes de mexer, mas no motor de sinais é o que lá está.

**O par que decide, aqui, diz o contrário do GoldKiller.** O BE a 0,30R salva 294 trades e corta
234 — parece bom e é mau: sobe a taxa de vitórias para 71% e mesmo assim é o **pior** perfil em R.
Os trades que ele salva valem +0,05R cada; os que corta valiam muito mais. Só a partir de 0,75R é
que a conta fica a favor (153 salvos, 151 cortados, mas os salvos pesam mais), e é por isso que o
melhor perfil tem o break-even LONGE, não perto.

**O aviso que não quero dourar:** nenhum perfil torna o Aurum positivo. O melhor que a gestão faz é
levar a expectativa de −0,067R para −0,009R, ou seja, **transformar uma sangria num empate**. A
decisão em cima da mesa não é «que break-even ponho no Aurum» — é «ponho o Aurum a executar?». Se
for para executar, é com BE 0,75R e trailing a arrancar a 1R com 0,5R de distância, e sabendo que a
expectativa medida é zero antes de custos de funding.

E o n grande engana: dos 924 sinais, **510 são de julho e 391 de agosto** — e a maior parte cai
entre 24/07 e 05/08, com dezenas de símbolos a disparar nos mesmos dias. Em setembro há 23 sinais.
Isto não são dois meses de amostra independente; é essencialmente **uma janela de mercado de duas
semanas**, com os trades muito correlacionados entre si. O intervalo de confiança calculado (±0,072)
é, por isso, optimista: o número verdadeiro é mais largo.

### O que fica por medir, e é honesto dizer

- **Resolução.** M15 é o que o feed dá para cobrir todo o histórico (M5 só chega a um mês). Tudo o
  que seja mais apertado do que a amplitude da vela — 0,73R no ouro, 0,31R nos perpétuos — está a
  ser medido com uma régua maior do que a coisa medida, e sai optimista.
- **Ordem dentro da vela.** Assume-se sempre o pior (o extremo adverso primeiro; stop ganha ao alvo
  na mesma vela). Na realidade às vezes é melhor do que isto.
- **Custos.** Spread da casa no ouro (0,32 $) e no US30 (3,60), 0,05% nos perpétuos. Funding dos
  perpétuos não está contado — e em posições que ficam abertas três dias, pesa contra.
- **Parciais.** O modelo é o do motor (50% no TP1, 25% no TP2, o resto corre), e pressupõe conta com
  lote suficiente para as fazer. Numa conta de 0,01 lote não há parciais e o motor cai no
  break-even por distância: esse caso não está medido aqui.

## GoldKiller (XAUUSD)

**Janela medida:** 2026-07-12 → 2026-09-16 · **sinais medidos:** 213 de 216 entradas na base.

**Ficaram de fora:**

- 3 — sem velas no histórico à hora do sinal

### 1. Distribuição do MFE (excursão máxima a favor antes do stop)

| medida | p25 | p50 | p75 | p90 |
|---|---:|---:|---:|---:|
| MFE em R | 0.22 | 0.96 | 3.02 | 8.98 |
| MFE em pips | 19.9 | 98.8 | 280.4 | 919.6 |
| risco inicial R em pips | 83.6 | 88.2 | 91.7 | 170.2 |
| MAE em R | -1.64 | -1.26 | -1.08 | -1.00 |

Sem gestão nenhuma: 169 bateram no stop, 43 fecharam nos alvos, 1 ainda estavam abertas ao fim de 3 dias.

Fracção de sinais que chegou a estar em lucro de **0.3R**: 73% · **0.5R**: 61% · **0.75R**: 54% · **1R**: 49% · **1.5R**: 40% · **2R**: 33%.

**A que distância ficam os alvos do próprio sinal** (em R, mediana): TP1 1.13R · TP2 2.13R · último alvo 4.22R. É o último alvo que manda no pedaço que corre — quanto mais longe estiver, mais o desfecho do resto da posição é decidido pelo trailing e não pelo alvo.

**Resolução:** a vela de 15m tem uma amplitude mediana de 68.6 pips = **0.73R**. Qualquer gatilho ou distância abaixo disto está a ser medido com uma régua maior do que a coisa que se mede: os números saem optimistas e não se deve configurar por eles.

### 2. Varredura — break-even sozinho

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 213 | 40.4% | +0.4 | +0.002 | ±0.175 | -15.4 | 0 | 0 |
| BE 0.30R | 213 | 73.2% | +23.5 | +0.110 | ±0.128 | -7.6 | 70 | 35 |
| BE 0.50R | 213 | 61.0% | +11.0 | +0.051 | ±0.146 | -9.4 | 44 | 28 |
| BE 0.75R | 213 | 53.5% | +6.3 | +0.030 | ±0.156 | -13.3 | 28 | 22 |
| BE 1.00R | 213 | 49.3% | +6.6 | +0.031 | ±0.159 | -12.5 | 19 | 14 |

### 3. Varredura — trailing sozinho

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 213 | 40.4% | +0.4 | +0.002 | ±0.175 | -15.4 | 0 | 0 |
| trailing arranca 0.50R · dist 0.25R | 213 | 61.0% | +9.4 | +0.044 | ±0.120 | -9.2 | 44 | 47 |
| trailing arranca 0.50R · dist 0.50R | 213 | 61.0% | +1.0 | +0.005 | ±0.121 | -10.4 | 44 | 47 |
| trailing arranca 0.50R · dist 0.75R | 213 | 48.4% | +0.2 | +0.001 | ±0.127 | -10.5 | 42 | 52 |
| trailing arranca 0.50R · dist 1.00R | 213 | 45.5% | +6.4 | +0.030 | ±0.136 | -9.7 | 42 | 46 |
| trailing arranca 0.75R · dist 0.25R | 213 | 53.5% | +5.4 | +0.025 | ±0.133 | -10.2 | 28 | 45 |
| trailing arranca 0.75R · dist 0.50R | 213 | 53.5% | -0.8 | -0.004 | ±0.132 | -11.4 | 28 | 44 |
| trailing arranca 0.75R · dist 0.75R | 213 | 53.5% | -4.5 | -0.021 | ±0.134 | -13.4 | 28 | 47 |
| trailing arranca 0.75R · dist 1.00R | 213 | 46.5% | +0.4 | +0.002 | ±0.140 | -10.3 | 27 | 44 |
| trailing arranca 1.00R · dist 0.25R | 213 | 49.3% | +10.0 | +0.047 | ±0.143 | -10.2 | 19 | 43 |
| trailing arranca 1.00R · dist 0.50R | 213 | 49.3% | +9.0 | +0.042 | ±0.144 | -10.5 | 19 | 42 |
| trailing arranca 1.00R · dist 0.75R | 213 | 49.3% | +3.8 | +0.018 | ±0.142 | -10.3 | 19 | 40 |
| trailing arranca 1.00R · dist 1.00R | 213 | 49.3% | +1.7 | +0.008 | ±0.144 | -10.7 | 19 | 37 |
| trailing arranca 1.50R · dist 0.25R | 213 | 45.1% | +11.8 | +0.056 | ±0.155 | -11.6 | 10 | 41 |
| trailing arranca 1.50R · dist 0.50R | 213 | 45.1% | +7.0 | +0.033 | ±0.152 | -11.8 | 10 | 40 |
| trailing arranca 1.50R · dist 0.75R | 213 | 45.1% | +3.0 | +0.014 | ±0.150 | -11.9 | 10 | 38 |
| trailing arranca 1.50R · dist 1.00R | 213 | 45.1% | +1.3 | +0.006 | ±0.151 | -11.9 | 10 | 34 |

### 4. Varredura — break-even + trailing

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 213 | 40.4% | +0.4 | +0.002 | ±0.175 | -15.4 | 0 | 0 |
| BE 0.30R + trailing 0.75R/0.50R | 213 | 73.2% | +19.7 | +0.093 | ±0.109 | -6.4 | 70 | 53 |
| BE 0.30R + trailing 1.00R/0.50R | 213 | 73.2% | +19.3 | +0.090 | ±0.111 | -6.6 | 70 | 56 |
| BE 0.30R + trailing 1.50R/0.50R | 213 | 73.2% | +17.3 | +0.081 | ±0.113 | -8.5 | 70 | 57 |
| BE 0.30R + trailing 1.50R/0.75R | 213 | 73.2% | +16.2 | +0.076 | ±0.112 | -9.4 | 70 | 55 |
| BE 0.30R + trailing 0.75R/0.75R | 213 | 73.2% | +16.0 | +0.075 | ±0.110 | -8.4 | 70 | 53 |
| BE 0.30R + trailing 1.00R/0.75R | 213 | 73.2% | +16.0 | +0.075 | ±0.110 | -8.4 | 70 | 54 |
| BE 1.00R + trailing 1.00R/0.50R | 213 | 49.3% | +9.0 | +0.042 | ±0.144 | -10.5 | 19 | 42 |
| BE 1.00R + trailing 1.50R/0.50R | 213 | 49.3% | +8.0 | +0.038 | ±0.147 | -10.4 | 19 | 43 |
| BE 1.00R + trailing 1.50R/0.75R | 213 | 49.3% | +4.4 | +0.021 | ±0.145 | -10.4 | 19 | 41 |
| BE 1.00R + trailing 1.00R/0.75R | 213 | 49.3% | +3.8 | +0.018 | ±0.142 | -10.3 | 19 | 40 |
| BE 0.50R + trailing 1.00R/0.50R | 213 | 61.0% | +3.8 | +0.018 | ±0.126 | -9.5 | 44 | 53 |
| BE 0.50R + trailing 1.50R/0.50R | 213 | 61.0% | +3.1 | +0.015 | ±0.129 | -9.8 | 44 | 54 |
| BE 0.50R + trailing 0.75R/0.50R | 213 | 61.0% | +1.8 | +0.008 | ±0.122 | -9.5 | 44 | 48 |
| BE 0.50R + trailing 1.50R/0.75R | 213 | 61.0% | +1.4 | +0.006 | ±0.128 | -11.0 | 44 | 52 |
| BE 0.50R + trailing 1.00R/0.75R | 213 | 61.0% | +0.9 | +0.004 | ±0.125 | -10.5 | 44 | 51 |
| BE 0.50R + trailing 0.75R/0.75R | 213 | 61.0% | +0.3 | +0.001 | ±0.125 | -10.5 | 44 | 50 |
| BE 0.75R + trailing 1.00R/0.50R | 213 | 53.5% | -0.6 | -0.003 | ±0.135 | -12.8 | 28 | 50 |
| BE 0.75R + trailing 1.50R/0.50R | 213 | 53.5% | -0.6 | -0.003 | ±0.139 | -12.5 | 28 | 51 |
| BE 0.75R + trailing 0.75R/0.50R | 213 | 53.5% | -0.8 | -0.004 | ±0.132 | -11.4 | 28 | 44 |
| BE 1.00R + trailing 0.75R/0.50R | 213 | 53.5% | -0.8 | -0.004 | ±0.132 | -11.4 | 28 | 44 |
| BE 0.75R + trailing 1.50R/0.75R | 213 | 53.5% | -3.4 | -0.016 | ±0.137 | -13.3 | 28 | 49 |
| BE 0.75R + trailing 1.00R/0.75R | 213 | 53.5% | -4.3 | -0.020 | ±0.134 | -13.2 | 28 | 48 |
| BE 1.00R + trailing 0.75R/0.75R | 213 | 53.5% | -4.5 | -0.021 | ±0.134 | -13.4 | 28 | 47 |
| BE 0.75R + trailing 0.75R/0.75R | 213 | 53.5% | -4.6 | -0.021 | ±0.134 | -13.4 | 28 | 47 |

### 5. O mesmo em pips (o GoldKiller é um símbolo só)

O risco inicial mediano é de **88.2 pips**, por isso 1R ≈ 88 pips — mas esse número ANDOU: 84 pips em julho, 89 em agosto, 169 em setembro. Os gatilhos em pips abaixo estão convertidos em R sinal a sinal, com o risco daquele sinal.

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 213 | 40.4% | +0.4 | +0.002 | ±0.175 | -15.4 | 0 | 0 |
| BE 10 pips (+2 de folga) | 213 | 78.9% | +23.2 | +0.109 | ±0.117 | -8.2 | 82 | 45 |
| BE 15 pips (+2 de folga) | 213 | 77.5% | +23.1 | +0.109 | ±0.120 | -9.2 | 79 | 44 |
| BE 20 pips (+2 de folga) | 213 | 74.6% | +19.9 | +0.094 | ±0.125 | -7.9 | 73 | 42 |
| BE 25 pips (+2 de folga) | 213 | 73.7% | +22.1 | +0.104 | ±0.128 | -7.9 | 71 | 40 |
| BE 30 pips (+2 de folga) | 213 | 70.0% | +14.3 | +0.067 | ±0.131 | -8.6 | 63 | 40 |
| BE 40 pips (+2 de folga) | 213 | 64.8% | +9.3 | +0.043 | ±0.139 | -8.4 | 52 | 36 |
| BE 50 pips (+2 de folga) | 213 | 60.1% | +7.0 | +0.033 | ±0.146 | -10.4 | 42 | 32 |

### 6. Trailing em pips

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 213 | 40.4% | +0.4 | +0.002 | ±0.175 | -15.4 | 0 | 0 |
| trailing 20/10 pips | 213 | 74.6% | +40.2 | +0.189 | ±0.106 | -5.2 | 73 | 45 |
| trailing 20/15 pips | 213 | 74.6% | +35.1 | +0.165 | ±0.106 | -5.4 | 73 | 48 |
| trailing 20/20 pips | 213 | 74.6% | +30.3 | +0.142 | ±0.105 | -5.7 | 73 | 51 |
| trailing 20/30 pips | 213 | 63.4% | +21.5 | +0.101 | ±0.105 | -6.5 | 71 | 55 |
| trailing 30/10 pips | 213 | 70.0% | +33.7 | +0.158 | ±0.113 | -6.2 | 63 | 45 |
| trailing 30/15 pips | 213 | 70.0% | +28.3 | +0.133 | ±0.111 | -6.3 | 63 | 48 |
| trailing 30/20 pips | 213 | 70.0% | +24.1 | +0.113 | ±0.110 | -6.5 | 63 | 49 |
| trailing 30/30 pips | 213 | 70.0% | +16.4 | +0.077 | ±0.110 | -6.9 | 63 | 50 |
| trailing 40/10 pips | 213 | 64.8% | +26.6 | +0.125 | ±0.119 | -7.7 | 52 | 45 |
| trailing 40/15 pips | 213 | 64.8% | +21.5 | +0.101 | ±0.118 | -7.8 | 52 | 47 |
| trailing 40/20 pips | 213 | 64.8% | +16.9 | +0.079 | ±0.117 | -8.0 | 52 | 48 |
| trailing 40/30 pips | 213 | 64.8% | +10.5 | +0.049 | ±0.116 | -8.2 | 52 | 47 |
| trailing 60/10 pips | 213 | 58.7% | +19.2 | +0.090 | ±0.128 | -10.1 | 39 | 45 |
| trailing 60/15 pips | 213 | 58.7% | +15.6 | +0.073 | ±0.127 | -10.1 | 39 | 47 |
| trailing 60/20 pips | 213 | 58.7% | +11.3 | +0.053 | ±0.125 | -10.2 | 39 | 47 |
| trailing 60/30 pips | 213 | 58.7% | +6.0 | +0.028 | ±0.124 | -10.3 | 39 | 46 |

### 7. Os dois juntos, em pips

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 213 | 40.4% | +0.4 | +0.002 | ±0.175 | -15.4 | 0 | 0 |
| BE 15 + trailing 30/15 | 213 | 77.5% | +37.8 | +0.178 | ±0.103 | -4.8 | 79 | 52 |
| BE 15 + trailing 40/15 | 213 | 77.5% | +36.6 | +0.172 | ±0.103 | -5.2 | 79 | 53 |
| BE 25 + trailing 30/15 | 213 | 73.7% | +34.7 | +0.163 | ±0.107 | -5.3 | 71 | 51 |
| BE 15 + trailing 60/15 | 213 | 77.5% | +34.3 | +0.161 | ±0.104 | -6.2 | 79 | 54 |
| BE 15 + trailing 30/20 | 213 | 77.5% | +33.9 | +0.159 | ±0.102 | -5.1 | 79 | 53 |
| BE 20 + trailing 30/15 | 213 | 74.6% | +33.3 | +0.156 | ±0.106 | -5.6 | 73 | 51 |
| BE 25 + trailing 40/15 | 213 | 73.7% | +33.0 | +0.155 | ±0.108 | -5.6 | 71 | 52 |
| BE 15 + trailing 40/20 | 213 | 77.5% | +32.6 | +0.153 | ±0.102 | -5.5 | 79 | 54 |
| BE 20 + trailing 40/15 | 213 | 74.6% | +31.8 | +0.149 | ±0.107 | -5.9 | 73 | 52 |
| BE 15 + trailing 60/20 | 213 | 77.5% | +31.5 | +0.148 | ±0.103 | -6.3 | 79 | 54 |
| BE 25 + trailing 30/20 | 213 | 73.7% | +30.7 | +0.144 | ±0.106 | -5.5 | 71 | 52 |
| BE 20 + trailing 60/15 | 213 | 74.6% | +29.8 | +0.140 | ±0.108 | -6.7 | 73 | 54 |
| BE 20 + trailing 30/20 | 213 | 74.6% | +29.7 | +0.140 | ±0.105 | -5.7 | 73 | 52 |
| BE 25 + trailing 60/15 | 213 | 73.7% | +29.2 | +0.137 | ±0.109 | -6.7 | 71 | 54 |
| BE 25 + trailing 40/20 | 213 | 73.7% | +29.1 | +0.137 | ±0.107 | -5.7 | 71 | 53 |
| BE 30 + trailing 30/15 | 213 | 70.0% | +28.3 | +0.133 | ±0.111 | -6.3 | 63 | 48 |
| BE 40 + trailing 30/15 | 213 | 70.0% | +28.3 | +0.133 | ±0.111 | -6.3 | 63 | 48 |
| BE 20 + trailing 40/20 | 213 | 74.6% | +28.3 | +0.133 | ±0.105 | -5.9 | 73 | 53 |
| BE 20 + trailing 60/20 | 213 | 74.6% | +26.9 | +0.126 | ±0.106 | -6.8 | 73 | 54 |
| BE 30 + trailing 40/15 | 213 | 70.0% | +26.3 | +0.123 | ±0.112 | -6.7 | 63 | 49 |
| BE 25 + trailing 60/20 | 213 | 73.7% | +26.2 | +0.123 | ±0.108 | -6.8 | 71 | 54 |
| BE 30 + trailing 30/20 | 213 | 70.0% | +24.1 | +0.113 | ±0.110 | -6.5 | 63 | 49 |
| BE 40 + trailing 30/20 | 213 | 70.0% | +24.1 | +0.113 | ±0.110 | -6.5 | 63 | 49 |
| BE 30 + trailing 60/15 | 213 | 70.0% | +23.1 | +0.109 | ±0.113 | -7.3 | 63 | 51 |
| BE 30 + trailing 40/20 | 213 | 70.0% | +22.3 | +0.105 | ±0.111 | -6.7 | 63 | 50 |
| BE 40 + trailing 40/15 | 213 | 64.8% | +21.5 | +0.101 | ±0.118 | -7.8 | 52 | 47 |
| BE 30 + trailing 60/20 | 213 | 70.0% | +20.0 | +0.094 | ±0.112 | -7.4 | 63 | 51 |
| BE 40 + trailing 40/20 | 213 | 64.8% | +16.9 | +0.079 | ±0.117 | -8.0 | 52 | 48 |
| BE 40 + trailing 60/15 | 213 | 64.8% | +16.7 | +0.079 | ±0.119 | -8.1 | 52 | 49 |
| BE 40 + trailing 60/20 | 213 | 64.8% | +13.3 | +0.062 | ±0.118 | -8.2 | 52 | 49 |

### 8. Estabilidade mês a mês (R médio por mês)

| perfil | 2026-07 (n) | 2026-08 (n) | 2026-09 (n) |
|---|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | +0.083 (98) | -0.038 (90) | -0.174 (25) |
| BE 0.30R | +0.198 (98) | +0.062 (90) | -0.058 (25) |
| BE 0.50R | +0.106 (98) | +0.017 (90) | -0.038 (25) |
| BE 0.75R | +0.089 (98) | -0.000 (90) | -0.097 (25) |
| BE 0.50R + trailing 0.75R/0.50R | +0.057 (98) | -0.028 (90) | -0.049 (25) |
| BE 0.50R + trailing 1.00R/0.50R | +0.072 (98) | -0.021 (90) | -0.058 (25) |

## Aurum Flow (perpétuos + índices)

**Janela medida:** 2026-07-24 → 2026-09-16 · **sinais medidos:** 924 de 924 entradas na base.

**Ficaram de fora:**


### 1. Distribuição do MFE (excursão máxima a favor antes do stop)

| medida | p25 | p50 | p75 | p90 |
|---|---:|---:|---:|---:|
| MFE em R | 0.20 | 0.95 | 2.99 | 4.93 |
| MAE em R | -1.26 | -1.11 | -1.03 | -0.65 |

Sem gestão nenhuma: 739 bateram no stop, 83 fecharam nos alvos, 102 ainda estavam abertas ao fim de 3 dias.

Fracção de sinais que chegou a estar em lucro de **0.3R**: 71% · **0.5R**: 64% · **0.75R**: 56% · **1R**: 49% · **1.5R**: 39% · **2R**: 35%.

**A que distância ficam os alvos do próprio sinal** (em R, mediana): TP1 1.50R · TP2 3.00R · último alvo 6.00R. É o último alvo que manda no pedaço que corre — quanto mais longe estiver, mais o desfecho do resto da posição é decidido pelo trailing e não pelo alvo.

**Resolução:** a vela de 15m tem uma amplitude mediana de **0.31R**. Qualquer gatilho ou distância abaixo disto está a ser medido com uma régua maior do que a coisa que se mede: os números saem optimistas e não se deve configurar por eles.

### 2. Varredura — break-even sozinho

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 924 | 39.3% | -61.7 | -0.067 | ±0.091 | -88.6 | 0 | 0 |
| BE 0.30R | 924 | 71.1% | -52.4 | -0.057 | ±0.052 | -60.0 | 294 | 234 |
| BE 0.50R | 924 | 63.7% | -31.1 | -0.034 | ±0.063 | -44.5 | 226 | 186 |
| BE 0.75R | 924 | 55.8% | -29.9 | -0.032 | ±0.070 | -56.2 | 153 | 133 |
| BE 1.00R | 924 | 49.6% | -46.5 | -0.050 | ±0.074 | -61.9 | 95 | 111 |

### 3. Varredura — trailing sozinho

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 924 | 39.3% | -61.7 | -0.067 | ±0.091 | -88.6 | 0 | 0 |
| trailing arranca 0.50R · dist 0.25R | 924 | 43.5% | -17.8 | -0.019 | ±0.089 | -68.7 | 39 | 41 |
| trailing arranca 0.50R · dist 0.50R | 924 | 43.2% | -11.3 | -0.012 | ±0.090 | -70.5 | 36 | 46 |
| trailing arranca 0.50R · dist 0.75R | 924 | 41.3% | -17.3 | -0.019 | ±0.091 | -72.0 | 32 | 41 |
| trailing arranca 0.50R · dist 1.00R | 924 | 40.9% | -13.9 | -0.015 | ±0.091 | -71.8 | 32 | 31 |
| trailing arranca 0.75R · dist 0.25R | 924 | 42.0% | -17.0 | -0.018 | ±0.090 | -67.0 | 25 | 40 |
| trailing arranca 0.75R · dist 0.50R | 924 | 41.8% | -7.7 | -0.008 | ±0.091 | -70.3 | 23 | 37 |
| trailing arranca 0.75R · dist 0.75R | 924 | 41.3% | -16.3 | -0.018 | ±0.091 | -72.5 | 19 | 38 |
| trailing arranca 0.75R · dist 1.00R | 924 | 40.4% | -17.4 | -0.019 | ±0.092 | -73.6 | 19 | 30 |
| trailing arranca 1.00R · dist 0.25R | 924 | 40.8% | -15.3 | -0.017 | ±0.091 | -68.3 | 14 | 40 |
| trailing arranca 1.00R · dist 0.50R | 924 | 40.7% | -11.0 | -0.012 | ±0.091 | -70.4 | 13 | 33 |
| trailing arranca 1.00R · dist 0.75R | 924 | 40.6% | -12.3 | -0.013 | ±0.092 | -71.4 | 12 | 30 |
| trailing arranca 1.00R · dist 1.00R | 924 | 40.6% | -18.1 | -0.020 | ±0.092 | -73.0 | 12 | 27 |
| trailing arranca 1.50R · dist 0.25R | 924 | 39.3% | -19.6 | -0.021 | ±0.092 | -71.2 | 0 | 33 |
| trailing arranca 1.50R · dist 0.50R | 924 | 39.3% | -21.5 | -0.023 | ±0.092 | -72.3 | 0 | 31 |
| trailing arranca 1.50R · dist 0.75R | 924 | 39.3% | -17.3 | -0.019 | ±0.092 | -69.3 | 0 | 27 |
| trailing arranca 1.50R · dist 1.00R | 924 | 39.3% | -22.6 | -0.024 | ±0.092 | -70.3 | 0 | 25 |

### 4. Varredura — break-even + trailing

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 924 | 39.3% | -61.7 | -0.067 | ±0.091 | -88.6 | 0 | 0 |
| BE 0.75R + trailing 1.00R/0.50R | 924 | 55.8% | -8.1 | -0.009 | ±0.072 | -49.5 | 153 | 151 |
| BE 0.75R + trailing 0.75R/0.75R | 924 | 55.8% | -8.5 | -0.009 | ±0.072 | -50.5 | 153 | 148 |
| BE 0.75R + trailing 0.75R/0.50R | 924 | 55.8% | -8.7 | -0.009 | ±0.071 | -49.0 | 153 | 154 |
| BE 0.75R + trailing 1.00R/0.75R | 924 | 55.8% | -8.9 | -0.010 | ±0.072 | -50.5 | 153 | 148 |
| BE 0.75R + trailing 1.50R/0.50R | 924 | 55.8% | -10.5 | -0.011 | ±0.072 | -50.5 | 153 | 150 |
| BE 0.75R + trailing 1.50R/0.75R | 924 | 55.8% | -11.2 | -0.012 | ±0.071 | -51.2 | 153 | 147 |
| BE 0.50R + trailing 0.75R/0.50R | 924 | 63.7% | -14.3 | -0.015 | ±0.064 | -42.0 | 226 | 197 |
| BE 0.50R + trailing 1.00R/0.50R | 924 | 63.7% | -14.4 | -0.016 | ±0.064 | -42.0 | 226 | 195 |
| BE 0.50R + trailing 0.75R/0.75R | 924 | 63.7% | -15.5 | -0.017 | ±0.064 | -42.1 | 226 | 192 |
| BE 0.50R + trailing 1.00R/0.75R | 924 | 63.7% | -15.8 | -0.017 | ±0.064 | -42.1 | 226 | 192 |
| BE 0.50R + trailing 1.50R/0.50R | 924 | 63.7% | -17.2 | -0.019 | ±0.064 | -42.4 | 226 | 194 |
| BE 0.50R + trailing 1.50R/0.75R | 924 | 63.7% | -17.4 | -0.019 | ±0.064 | -42.1 | 226 | 191 |
| BE 1.00R + trailing 0.75R/0.50R | 924 | 50.6% | -18.0 | -0.019 | ±0.075 | -51.5 | 105 | 132 |
| BE 1.00R + trailing 1.00R/0.75R | 924 | 49.6% | -22.7 | -0.025 | ±0.075 | -55.4 | 95 | 128 |
| BE 1.00R + trailing 0.75R/0.75R | 924 | 50.3% | -24.1 | -0.026 | ±0.075 | -55.3 | 102 | 132 |
| BE 1.00R + trailing 1.50R/0.50R | 924 | 49.6% | -24.2 | -0.026 | ±0.076 | -55.2 | 95 | 130 |
| BE 1.00R + trailing 1.00R/0.50R | 924 | 49.6% | -24.2 | -0.026 | ±0.075 | -54.1 | 95 | 132 |
| BE 1.00R + trailing 1.50R/0.75R | 924 | 49.6% | -25.2 | -0.027 | ±0.075 | -56.1 | 95 | 127 |
| BE 0.30R + trailing 1.00R/0.50R | 924 | 71.1% | -42.1 | -0.046 | ±0.053 | -51.8 | 294 | 240 |
| BE 0.30R + trailing 0.75R/0.50R | 924 | 71.1% | -42.1 | -0.046 | ±0.053 | -52.3 | 294 | 242 |
| BE 0.30R + trailing 0.75R/0.75R | 924 | 71.1% | -42.3 | -0.046 | ±0.053 | -52.3 | 294 | 238 |
| BE 0.30R + trailing 1.00R/0.75R | 924 | 71.1% | -42.5 | -0.046 | ±0.053 | -52.3 | 294 | 238 |
| BE 0.30R + trailing 1.50R/0.75R | 924 | 71.1% | -42.8 | -0.046 | ±0.053 | -52.6 | 294 | 237 |
| BE 0.30R + trailing 1.50R/0.50R | 924 | 71.1% | -43.0 | -0.047 | ±0.053 | -52.5 | 294 | 239 |

### 5. Estabilidade mês a mês (R médio por mês)

| perfil | 2026-07 (n) | 2026-08 (n) | 2026-09 (n) |
|---|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | -0.103 (510) | -0.056 (391) | +0.544 (23) |
| BE 0.30R | -0.043 (510) | -0.075 (391) | -0.054 (23) |
| BE 0.50R | -0.038 (510) | -0.021 (391) | -0.146 (23) |
| BE 0.75R | -0.076 (510) | +0.018 (391) | +0.087 (23) |
| BE 0.50R + trailing 0.75R/0.50R | -0.021 (510) | -0.004 (391) | -0.076 (23) |
| BE 0.50R + trailing 1.00R/0.50R | -0.023 (510) | -0.002 (391) | -0.087 (23) |
