# Perfil de break-even e trailing — GoldKiller e Aurum Flow

Corrido a 2026-09-16 22:02 UTC · velas 15m do TradingView · janela de 288 barras (3 dias) por sinal.

> Só leitura: nada foi escrito em `mtmauto_providers` nem em nenhuma outra tabela.

## A leitura, em duas páginas

*(Números revistos a 16/09 depois da correcção da 2.ª parcial no replay partilhado. Esta parte é escrita à mão — `docs/analise-perfil-gk-aurum-leitura.md`. Tudo o que vem a seguir é gerado pelo script e não tem opinião nenhuma lá dentro.)*

### GoldKiller — proposta: BE a 0,30R; o trailing é neutro (se o quiser, 1R de arranque e 0,5R de distância)

| | valor |
|---|---|
| Amostra | 214 sinais medidos de 217 · 12/07 a 16/09 (2 meses). Os 3 que ficaram de fora são alertas de domingo às 22:05, em que o feed OANDA ainda não tinha vela na meia hora seguinte |
| Onde está o MFE | mediana **0,96R**; 73% dos sinais chega a +0,3R, 61% a +0,5R, só 50% a +1R |
| Sem gestão nenhuma | −0,005R por trade — empate (79% bate no stop, o TP1 paga o resto) |
| **BE 0,30R (+0,05R de folga)** | **+0,093R por trade**, +19,9R no total, 73% de vitórias, salvou 64 e cortou 43 |
| Trailing 1,0R / 0,5R | +0,045R sozinho; **junto com o BE 0,30R é neutro** (+0,093 contra +0,093) |
| Intervalo de confiança | ±0,118R a 95% — **contém o zero** |

O par que decide: a 0,30R o break-even **salva 64 trades e corta 43**, três para dois. A partir de
0,50R a razão fica quase empatada (38/36) e o ganho total cai para um terço, e a 1R já só salva 13. Isto bate
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
demais. O controlo em M5 (47 sinais, só setembro; medido ANTES da correcção das parciais de 16/09, por refazer) mantinha o BE 0,30R positivo (+0,079R), mas não
serve para validar distâncias de 10 pips — a vela de M5 ainda tem 41 pips de amplitude mediana.

**A ressalva honesta.** São 213 trades e dois meses. O intervalo de 95% do R médio do perfil
proposto é ±0,118 à volta de +0,093: em linguagem de gente, **isto não é estatisticamente
distinguível de zero**, é a melhor aposta com os dados que há. E a tabela mês a mês mostra a
vantagem a encolher: +0,183 em julho, +0,026 em agosto, −0,010 em setembro (só 26 trades). Se o
dono ligar isto, vale a pena voltar a medir daqui a um mês antes de o dar por assente.

### Aurum Flow — proposta: em R, e a pergunta não é o break-even

| | valor |
|---|---|
| Amostra | 924 sinais medidos de 924 · 24/07 a 16/09, 42 símbolos |
| Onde está o MFE | mediana **0,95R**; 71% chega a +0,3R, 49% a +1R |
| Sem gestão nenhuma | **−0,024R por trade**, −22,2R no total (80% bate no stop) |
| Melhor perfil medido | **BE 0,75R + trailing 0,75R / 0,75R** → +0,022R por trade (+20,1R); o aplicado (BE 0,75R + trailing 1,0R / 0,5R) dá +0,020R (+18,8R) |
| BE agressivo (0,30R) | 71% de vitórias e mesmo assim −0,032R — a pior das opções com gestão |
| Intervalo de confiança | ±0,071R — **nenhum perfil é distinguível de zero** |

**Confirma-se o que o dono já aprovou: o Aurum só pode ser configurado em R.** Duas razões, e a
segunda é a que interessa. A primeira é dimensional: são 42 símbolos com preços de 0,07 $ a
120 000 $. A segunda é que a configuração de hoje está inerte por causa disso — `trailing_arranca_pips
= 40` passa pelo motor como `40 × pipSize`, e `pipSizeForSymbol` devolve 1 para cripto (é a regra da
casa, e está certa): 40 unidades **de preço**. Num ONDO a 0,39 $ o trailing nunca arma; num BTC a
120 000 $ arma ao primeiro suspiro. O mesmo número, os dois extremos. Vale a pena confirmar isto no
caminho de execução dos perpétuos antes de mexer, mas no motor de sinais é o que lá está.

**O par que decide, aqui, diz o contrário do GoldKiller.** O BE a 0,30R salva 281 trades e corta
238 — parece bom e é mau: sobe a taxa de vitórias para 71% e mesmo assim é o **pior** perfil em R.
Os trades que ele salva valem +0,05R cada; os que corta valiam muito mais. Só a partir de 0,75R é
que a conta fica a favor (140 salvos, 136 cortados, mas os salvos pesam mais), e é por isso que o
melhor perfil tem o break-even LONGE, não perto.

**O aviso que não quero dourar:** o melhor que a gestão faz é levar a expectativa de −0,024R para
+0,020R — **um empate**, sem significado estatístico. A
decisão em cima da mesa não é «que break-even ponho no Aurum» — é «ponho o Aurum a executar?». Se
for para executar, é com BE 0,75R e trailing a arrancar a 1R com 0,5R de distância, e sabendo que a
expectativa medida é zero antes de custos de funding.

E o n grande engana: dos 924 sinais, **510 são de julho e 391 de agosto** — e a maior parte cai
entre 24/07 e 05/08, com dezenas de símbolos a disparar nos mesmos dias. Em setembro há 23 sinais.
Isto não são dois meses de amostra independente; é essencialmente **uma janela de mercado de duas
semanas**, com os trades muito correlacionados entre si. O intervalo de confiança calculado (±0,071)
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

**Janela medida:** 2026-07-12 → 2026-09-16 · **sinais medidos:** 214 de 217 entradas na base.

**Ficaram de fora:**

- 3 — sem velas no histórico à hora do sinal

### 1. Distribuição do MFE (excursão máxima a favor antes do stop)

| medida | p25 | p50 | p75 | p90 |
|---|---:|---:|---:|---:|
| MFE em R | 0.22 | 0.96 | 3.09 | 8.98 |
| MFE em pips | 20.9 | 99.8 | 284.9 | 918.7 |
| risco inicial R em pips | 83.6 | 88.2 | 91.8 | 170.4 |
| MAE em R | -1.65 | -1.26 | -1.08 | -1.00 |

Sem gestão nenhuma: 170 bateram no stop, 44 fecharam nos alvos, 0 ainda estavam abertas ao fim de 3 dias.

Fracção de sinais que chegou a estar em lucro de **0.3R**: 73% · **0.5R**: 61% · **0.75R**: 54% · **1R**: 50% · **1.5R**: 41% · **2R**: 34%.

**A que distância ficam os alvos do próprio sinal** (em R, mediana): TP1 1.13R · TP2 2.13R · último alvo 4.22R. É o último alvo que manda no pedaço que corre — quanto mais longe estiver, mais o desfecho do resto da posição é decidido pelo trailing e não pelo alvo.

**Resolução:** a vela de 15m tem uma amplitude mediana de 68.7 pips = **0.73R**. Qualquer gatilho ou distância abaixo disto está a ser medido com uma régua maior do que a coisa que se mede: os números saem optimistas e não se deve configurar por eles.

### 2. Varredura — break-even sozinho

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 214 | 43.5% | -1.0 | -0.005 | ±0.158 | -13.6 | 0 | 0 |
| BE 0.30R | 214 | 73.4% | +19.9 | +0.093 | ±0.118 | -8.7 | 64 | 43 |
| BE 0.50R | 214 | 61.2% | +6.4 | +0.030 | ±0.135 | -9.4 | 38 | 36 |
| BE 0.75R | 214 | 53.7% | +2.5 | +0.012 | ±0.145 | -12.7 | 22 | 28 |
| BE 1.00R | 214 | 49.5% | +5.3 | +0.025 | ±0.149 | -10.9 | 13 | 19 |

### 3. Varredura — trailing sozinho

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 214 | 43.5% | -1.0 | -0.005 | ±0.158 | -13.6 | 0 | 0 |
| trailing arranca 0.50R · dist 0.25R | 214 | 61.2% | +11.1 | +0.052 | ±0.120 | -9.2 | 38 | 61 |
| trailing arranca 0.50R · dist 0.50R | 214 | 61.2% | +1.9 | +0.009 | ±0.121 | -10.6 | 38 | 58 |
| trailing arranca 0.50R · dist 0.75R | 214 | 48.6% | +1.0 | +0.005 | ±0.126 | -10.5 | 37 | 56 |
| trailing arranca 0.50R · dist 1.00R | 214 | 45.8% | +6.7 | +0.032 | ±0.133 | -9.7 | 36 | 49 |
| trailing arranca 0.75R · dist 0.25R | 214 | 53.7% | +7.1 | +0.033 | ±0.133 | -10.2 | 22 | 51 |
| trailing arranca 0.75R · dist 0.50R | 214 | 53.7% | +0.5 | +0.002 | ±0.132 | -11.8 | 22 | 49 |
| trailing arranca 0.75R · dist 0.75R | 214 | 53.7% | -3.4 | -0.016 | ±0.133 | -13.5 | 22 | 51 |
| trailing arranca 0.75R · dist 1.00R | 214 | 46.7% | +1.0 | +0.005 | ±0.138 | -10.3 | 21 | 47 |
| trailing arranca 1.00R · dist 0.25R | 214 | 49.5% | +11.1 | +0.052 | ±0.142 | -10.2 | 13 | 44 |
| trailing arranca 1.00R · dist 0.50R | 214 | 49.5% | +9.6 | +0.045 | ±0.143 | -10.5 | 13 | 42 |
| trailing arranca 1.00R · dist 0.75R | 214 | 49.5% | +4.7 | +0.022 | ±0.141 | -10.3 | 13 | 42 |
| trailing arranca 1.00R · dist 1.00R | 214 | 49.5% | +2.1 | +0.010 | ±0.142 | -10.7 | 13 | 42 |
| trailing arranca 1.50R · dist 0.25R | 214 | 45.3% | +11.4 | +0.053 | ±0.153 | -11.6 | 4 | 41 |
| trailing arranca 1.50R · dist 0.50R | 214 | 45.3% | +7.2 | +0.033 | ±0.151 | -11.8 | 4 | 40 |
| trailing arranca 1.50R · dist 0.75R | 214 | 45.3% | +3.3 | +0.016 | ±0.148 | -11.7 | 4 | 38 |
| trailing arranca 1.50R · dist 1.00R | 214 | 45.3% | +1.4 | +0.007 | ±0.148 | -11.7 | 4 | 34 |

### 4. Varredura — break-even + trailing

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 214 | 43.5% | -1.0 | -0.005 | ±0.158 | -13.6 | 0 | 0 |
| BE 0.30R + trailing 0.75R/0.50R | 214 | 73.4% | +20.7 | +0.097 | ±0.108 | -6.4 | 64 | 61 |
| BE 0.30R + trailing 1.00R/0.50R | 214 | 73.4% | +19.8 | +0.093 | ±0.110 | -6.6 | 64 | 62 |
| BE 0.30R + trailing 1.50R/0.50R | 214 | 73.4% | +18.1 | +0.084 | ±0.112 | -8.7 | 64 | 64 |
| BE 0.30R + trailing 1.50R/0.75R | 214 | 73.4% | +17.0 | +0.079 | ±0.111 | -9.5 | 64 | 62 |
| BE 0.30R + trailing 0.75R/0.75R | 214 | 73.4% | +16.6 | +0.077 | ±0.108 | -8.5 | 64 | 60 |
| BE 0.30R + trailing 1.00R/0.75R | 214 | 73.4% | +16.5 | +0.077 | ±0.109 | -8.5 | 64 | 61 |
| BE 1.00R + trailing 1.00R/0.50R | 214 | 49.5% | +9.6 | +0.045 | ±0.143 | -10.5 | 13 | 42 |
| BE 1.00R + trailing 1.50R/0.50R | 214 | 49.5% | +8.8 | +0.041 | ±0.146 | -10.4 | 13 | 45 |
| BE 1.00R + trailing 1.50R/0.75R | 214 | 49.5% | +5.7 | +0.027 | ±0.144 | -10.4 | 13 | 43 |
| BE 1.00R + trailing 1.00R/0.75R | 214 | 49.5% | +4.7 | +0.022 | ±0.141 | -10.3 | 13 | 42 |
| BE 0.50R + trailing 1.00R/0.50R | 214 | 61.2% | +4.5 | +0.021 | ±0.125 | -9.5 | 38 | 59 |
| BE 0.50R + trailing 1.50R/0.50R | 214 | 61.2% | +4.0 | +0.019 | ±0.128 | -10.0 | 38 | 61 |
| BE 0.50R + trailing 0.75R/0.50R | 214 | 61.2% | +2.7 | +0.013 | ±0.122 | -9.6 | 38 | 56 |
| BE 0.50R + trailing 1.50R/0.75R | 214 | 61.2% | +2.2 | +0.010 | ±0.126 | -11.0 | 38 | 59 |
| BE 0.50R + trailing 1.00R/0.75R | 214 | 61.2% | +1.6 | +0.007 | ±0.124 | -10.5 | 38 | 58 |
| BE 0.50R + trailing 0.75R/0.75R | 214 | 61.2% | +0.9 | +0.004 | ±0.123 | -10.4 | 38 | 57 |
| BE 0.75R + trailing 0.75R/0.50R | 214 | 53.7% | +0.5 | +0.002 | ±0.132 | -11.8 | 22 | 49 |
| BE 1.00R + trailing 0.75R/0.50R | 214 | 53.7% | +0.5 | +0.002 | ±0.132 | -11.8 | 22 | 49 |
| BE 0.75R + trailing 1.00R/0.50R | 214 | 53.7% | +0.5 | +0.002 | ±0.135 | -12.8 | 22 | 53 |
| BE 0.75R + trailing 1.50R/0.50R | 214 | 53.7% | +0.5 | +0.002 | ±0.138 | -12.5 | 22 | 55 |
| BE 0.75R + trailing 1.50R/0.75R | 214 | 53.7% | -2.1 | -0.010 | ±0.136 | -13.3 | 22 | 53 |
| BE 0.75R + trailing 1.00R/0.75R | 214 | 53.7% | -3.3 | -0.015 | ±0.133 | -13.2 | 22 | 52 |
| BE 1.00R + trailing 0.75R/0.75R | 214 | 53.7% | -3.4 | -0.016 | ±0.133 | -13.5 | 22 | 51 |
| BE 0.75R + trailing 0.75R/0.75R | 214 | 53.7% | -3.5 | -0.016 | ±0.133 | -13.4 | 22 | 51 |

### 5. O mesmo em pips (o GoldKiller é um símbolo só)

O risco inicial mediano é de **88.2 pips**, por isso 1R ≈ 88 pips — mas esse número ANDOU: 84 pips em julho, 89 em agosto, 169 em setembro. Os gatilhos em pips abaixo estão convertidos em R sinal a sinal, com o risco daquele sinal.

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 214 | 43.5% | -1.0 | -0.005 | ±0.158 | -13.6 | 0 | 0 |
| BE 10 pips (+2 de folga) | 214 | 79.0% | +21.3 | +0.100 | ±0.108 | -8.2 | 76 | 50 |
| BE 15 pips (+2 de folga) | 214 | 77.6% | +20.7 | +0.097 | ±0.111 | -9.2 | 73 | 49 |
| BE 20 pips (+2 de folga) | 214 | 74.8% | +17.2 | +0.080 | ±0.115 | -7.9 | 67 | 47 |
| BE 25 pips (+2 de folga) | 214 | 73.8% | +18.6 | +0.087 | ±0.118 | -8.9 | 65 | 45 |
| BE 30 pips (+2 de folga) | 214 | 70.1% | +10.8 | +0.051 | ±0.121 | -10.5 | 57 | 45 |
| BE 40 pips (+2 de folga) | 214 | 65.0% | +4.8 | +0.022 | ±0.128 | -10.3 | 46 | 41 |
| BE 50 pips (+2 de folga) | 214 | 60.3% | +2.7 | +0.012 | ±0.135 | -10.4 | 36 | 36 |

### 6. Trailing em pips

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 214 | 43.5% | -1.0 | -0.005 | ±0.158 | -13.6 | 0 | 0 |
| trailing 20/10 pips | 214 | 74.8% | +41.8 | +0.195 | ±0.107 | -5.2 | 67 | 58 |
| trailing 20/15 pips | 214 | 74.8% | +36.7 | +0.171 | ±0.106 | -5.4 | 67 | 62 |
| trailing 20/20 pips | 214 | 74.8% | +31.9 | +0.149 | ±0.105 | -5.7 | 67 | 63 |
| trailing 20/30 pips | 214 | 63.6% | +22.8 | +0.107 | ±0.105 | -6.5 | 66 | 66 |
| trailing 30/10 pips | 214 | 70.1% | +35.4 | +0.165 | ±0.113 | -6.2 | 57 | 58 |
| trailing 30/15 pips | 214 | 70.1% | +29.9 | +0.140 | ±0.112 | -6.3 | 57 | 62 |
| trailing 30/20 pips | 214 | 70.1% | +25.7 | +0.120 | ±0.111 | -6.5 | 57 | 63 |
| trailing 30/30 pips | 214 | 70.1% | +17.7 | +0.083 | ±0.110 | -6.9 | 57 | 64 |
| trailing 40/10 pips | 214 | 65.0% | +28.2 | +0.132 | ±0.120 | -7.7 | 46 | 58 |
| trailing 40/15 pips | 214 | 65.0% | +23.1 | +0.108 | ±0.118 | -7.8 | 46 | 61 |
| trailing 40/20 pips | 214 | 65.0% | +18.5 | +0.086 | ±0.117 | -8.0 | 46 | 62 |
| trailing 40/30 pips | 214 | 65.0% | +11.8 | +0.055 | ±0.116 | -8.2 | 46 | 61 |
| trailing 60/10 pips | 214 | 58.9% | +20.9 | +0.097 | ±0.128 | -10.1 | 33 | 55 |
| trailing 60/15 pips | 214 | 58.9% | +17.2 | +0.080 | ±0.127 | -10.1 | 33 | 58 |
| trailing 60/20 pips | 214 | 58.9% | +12.9 | +0.060 | ±0.125 | -10.2 | 33 | 58 |
| trailing 60/30 pips | 214 | 58.9% | +7.4 | +0.034 | ±0.124 | -10.3 | 33 | 57 |

### 7. Os dois juntos, em pips

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 214 | 43.5% | -1.0 | -0.005 | ±0.158 | -13.6 | 0 | 0 |
| BE 15 + trailing 30/15 | 214 | 77.6% | +39.4 | +0.184 | ±0.103 | -4.8 | 73 | 64 |
| BE 15 + trailing 40/15 | 214 | 77.6% | +38.1 | +0.178 | ±0.104 | -5.2 | 73 | 65 |
| BE 25 + trailing 30/15 | 214 | 73.8% | +36.3 | +0.170 | ±0.108 | -5.3 | 65 | 63 |
| BE 15 + trailing 60/15 | 214 | 77.6% | +35.9 | +0.168 | ±0.105 | -6.2 | 73 | 64 |
| BE 15 + trailing 30/20 | 214 | 77.6% | +35.5 | +0.166 | ±0.102 | -5.1 | 73 | 65 |
| BE 20 + trailing 30/15 | 214 | 74.8% | +34.9 | +0.163 | ±0.106 | -5.6 | 67 | 63 |
| BE 25 + trailing 40/15 | 214 | 73.8% | +34.6 | +0.161 | ±0.108 | -5.6 | 65 | 64 |
| BE 15 + trailing 40/20 | 214 | 77.6% | +34.2 | +0.160 | ±0.102 | -5.5 | 73 | 66 |
| BE 20 + trailing 40/15 | 214 | 74.8% | +33.3 | +0.156 | ±0.107 | -5.9 | 67 | 64 |
| BE 15 + trailing 60/20 | 214 | 77.6% | +33.1 | +0.155 | ±0.103 | -6.3 | 73 | 64 |
| BE 25 + trailing 30/20 | 214 | 73.8% | +32.3 | +0.151 | ±0.107 | -5.5 | 65 | 64 |
| BE 20 + trailing 60/15 | 214 | 74.8% | +31.4 | +0.147 | ±0.108 | -6.7 | 67 | 64 |
| BE 20 + trailing 30/20 | 214 | 74.8% | +31.3 | +0.146 | ±0.105 | -5.7 | 67 | 64 |
| BE 25 + trailing 60/15 | 214 | 73.8% | +30.8 | +0.144 | ±0.110 | -6.7 | 65 | 64 |
| BE 25 + trailing 40/20 | 214 | 73.8% | +30.7 | +0.144 | ±0.107 | -5.7 | 65 | 65 |
| BE 30 + trailing 30/15 | 214 | 70.1% | +29.9 | +0.140 | ±0.112 | -6.3 | 57 | 62 |
| BE 40 + trailing 30/15 | 214 | 70.1% | +29.9 | +0.140 | ±0.112 | -6.3 | 57 | 62 |
| BE 20 + trailing 40/20 | 214 | 74.8% | +29.9 | +0.140 | ±0.106 | -5.9 | 67 | 65 |
| BE 20 + trailing 60/20 | 214 | 74.8% | +28.5 | +0.133 | ±0.107 | -6.8 | 67 | 64 |
| BE 30 + trailing 40/15 | 214 | 70.1% | +27.9 | +0.130 | ±0.112 | -6.7 | 57 | 63 |
| BE 25 + trailing 60/20 | 214 | 73.8% | +27.8 | +0.130 | ±0.108 | -6.8 | 65 | 64 |
| BE 30 + trailing 30/20 | 214 | 70.1% | +25.7 | +0.120 | ±0.111 | -6.5 | 57 | 63 |
| BE 40 + trailing 30/20 | 214 | 70.1% | +25.7 | +0.120 | ±0.111 | -6.5 | 57 | 63 |
| BE 30 + trailing 60/15 | 214 | 70.1% | +24.7 | +0.115 | ±0.114 | -7.3 | 57 | 63 |
| BE 30 + trailing 40/20 | 214 | 70.1% | +23.9 | +0.112 | ±0.111 | -6.7 | 57 | 64 |
| BE 40 + trailing 40/15 | 214 | 65.0% | +23.1 | +0.108 | ±0.118 | -7.8 | 46 | 61 |
| BE 30 + trailing 60/20 | 214 | 70.1% | +21.6 | +0.101 | ±0.112 | -7.4 | 57 | 63 |
| BE 40 + trailing 40/20 | 214 | 65.0% | +18.5 | +0.086 | ±0.117 | -8.0 | 46 | 62 |
| BE 40 + trailing 60/15 | 214 | 65.0% | +18.3 | +0.086 | ±0.119 | -8.1 | 46 | 61 |
| BE 40 + trailing 60/20 | 214 | 65.0% | +14.9 | +0.070 | ±0.118 | -8.2 | 46 | 61 |

### 8. Estabilidade mês a mês (R médio por mês)

| perfil | 2026-07 (n) | 2026-08 (n) | 2026-09 (n) |
|---|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | +0.048 (98) | -0.038 (90) | -0.090 (26) |
| BE 0.30R | +0.183 (98) | +0.026 (90) | -0.010 (26) |
| BE 0.50R | +0.085 (98) | -0.024 (90) | +0.010 (26) |
| BE 0.75R | +0.063 (98) | -0.028 (90) | -0.046 (26) |
| BE 0.50R + trailing 0.75R/0.50R | +0.053 (98) | -0.035 (90) | +0.024 (26) |
| BE 0.50R + trailing 1.00R/0.50R | +0.065 (98) | -0.026 (90) | +0.015 (26) |

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
| sem gestão (só parciais + SL + TP final) | 924 | 40.7% | -22.2 | -0.024 | ±0.086 | -67.2 | 0 | 0 |
| BE 0.30R | 924 | 71.1% | -29.6 | -0.032 | ±0.052 | -42.4 | 281 | 238 |
| BE 0.50R | 924 | 63.7% | -3.0 | -0.003 | ±0.062 | -41.2 | 213 | 189 |
| BE 0.75R | 924 | 55.8% | +5.9 | +0.006 | ±0.070 | -47.6 | 140 | 136 |
| BE 1.00R | 924 | 49.6% | -10.0 | -0.011 | ±0.073 | -56.1 | 82 | 115 |

### 3. Varredura — trailing sozinho

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 924 | 40.7% | -22.2 | -0.024 | ±0.086 | -67.2 | 0 | 0 |
| trailing arranca 0.50R · dist 0.25R | 924 | 44.6% | +6.0 | +0.006 | ±0.084 | -58.1 | 36 | 55 |
| trailing arranca 0.50R · dist 0.50R | 924 | 44.3% | +12.2 | +0.013 | ±0.085 | -63.1 | 33 | 47 |
| trailing arranca 0.50R · dist 0.75R | 924 | 42.4% | +6.7 | +0.007 | ±0.085 | -64.4 | 29 | 44 |
| trailing arranca 0.50R · dist 1.00R | 924 | 42.0% | +8.9 | +0.010 | ±0.086 | -64.1 | 29 | 36 |
| trailing arranca 0.75R · dist 0.25R | 924 | 43.1% | +6.3 | +0.007 | ±0.085 | -59.0 | 22 | 53 |
| trailing arranca 0.75R · dist 0.50R | 924 | 42.9% | +15.6 | +0.017 | ±0.086 | -62.3 | 20 | 41 |
| trailing arranca 0.75R · dist 0.75R | 924 | 42.4% | +7.9 | +0.009 | ±0.086 | -64.7 | 16 | 41 |
| trailing arranca 0.75R · dist 1.00R | 924 | 41.5% | +5.4 | +0.006 | ±0.086 | -65.9 | 16 | 35 |
| trailing arranca 1.00R · dist 0.25R | 924 | 41.9% | +8.0 | +0.009 | ±0.086 | -60.3 | 11 | 47 |
| trailing arranca 1.00R · dist 0.50R | 924 | 41.8% | +11.9 | +0.013 | ±0.086 | -62.7 | 10 | 37 |
| trailing arranca 1.00R · dist 0.75R | 924 | 41.7% | +11.8 | +0.013 | ±0.087 | -64.3 | 9 | 36 |
| trailing arranca 1.00R · dist 1.00R | 924 | 41.7% | +4.7 | +0.005 | ±0.087 | -65.8 | 9 | 33 |
| trailing arranca 1.50R · dist 0.25R | 924 | 40.7% | +1.5 | +0.002 | ±0.087 | -63.8 | 0 | 34 |
| trailing arranca 1.50R · dist 0.50R | 924 | 40.7% | +1.2 | +0.001 | ±0.087 | -64.7 | 0 | 31 |
| trailing arranca 1.50R · dist 0.75R | 924 | 40.7% | +6.6 | +0.007 | ±0.087 | -61.4 | 0 | 29 |
| trailing arranca 1.50R · dist 1.00R | 924 | 40.7% | +1.0 | +0.001 | ±0.087 | -62.1 | 0 | 28 |

### 4. Varredura — break-even + trailing

| perfil | trades | % vit. | R total | R médio | IC 95% do R médio | pior seq. | BE salvou | cortou cedo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | 924 | 40.7% | -22.2 | -0.024 | ±0.086 | -67.2 | 0 | 0 |
| BE 0.75R + trailing 0.75R/0.75R | 924 | 55.8% | +20.1 | +0.022 | ±0.071 | -44.6 | 140 | 151 |
| BE 0.75R + trailing 1.00R/0.75R | 924 | 55.8% | +19.6 | +0.021 | ±0.071 | -44.6 | 140 | 151 |
| BE 0.75R + trailing 1.00R/0.50R | 924 | 55.8% | +18.8 | +0.020 | ±0.071 | -44.2 | 140 | 154 |
| BE 0.75R + trailing 0.75R/0.50R | 924 | 55.8% | +18.4 | +0.020 | ±0.070 | -43.9 | 140 | 157 |
| BE 0.75R + trailing 1.50R/0.75R | 924 | 55.8% | +17.5 | +0.019 | ±0.071 | -44.8 | 140 | 150 |
| BE 0.75R + trailing 1.50R/0.50R | 924 | 55.8% | +16.7 | +0.018 | ±0.071 | -44.7 | 140 | 153 |
| BE 1.00R + trailing 0.75R/0.50R | 924 | 50.6% | +9.9 | +0.011 | ±0.074 | -49.2 | 92 | 139 |
| BE 0.50R + trailing 0.75R/0.50R | 924 | 63.7% | +8.7 | +0.009 | ±0.063 | -38.9 | 213 | 200 |
| BE 0.50R + trailing 1.00R/0.50R | 924 | 63.7% | +8.3 | +0.009 | ±0.063 | -39.2 | 213 | 198 |
| BE 0.50R + trailing 0.75R/0.75R | 924 | 63.7% | +7.3 | +0.008 | ±0.063 | -39.3 | 213 | 195 |
| BE 0.50R + trailing 1.00R/0.75R | 924 | 63.7% | +7.0 | +0.008 | ±0.063 | -39.3 | 213 | 195 |
| BE 1.00R + trailing 1.00R/0.75R | 924 | 49.6% | +6.3 | +0.007 | ±0.075 | -52.7 | 82 | 131 |
| BE 0.50R + trailing 1.50R/0.50R | 924 | 63.7% | +5.9 | +0.006 | ±0.063 | -39.7 | 213 | 197 |
| BE 0.50R + trailing 1.50R/0.75R | 924 | 63.7% | +5.5 | +0.006 | ±0.063 | -39.6 | 213 | 194 |
| BE 1.00R + trailing 0.75R/0.75R | 924 | 50.3% | +5.0 | +0.005 | ±0.074 | -51.1 | 89 | 136 |
| BE 1.00R + trailing 1.50R/0.75R | 924 | 49.6% | +4.1 | +0.004 | ±0.075 | -53.0 | 82 | 130 |
| BE 1.00R + trailing 1.50R/0.50R | 924 | 49.6% | +3.5 | +0.004 | ±0.075 | -52.7 | 82 | 133 |
| BE 1.00R + trailing 1.00R/0.50R | 924 | 49.6% | +3.3 | +0.004 | ±0.074 | -52.2 | 82 | 135 |
| BE 0.30R + trailing 0.75R/0.50R | 924 | 71.1% | -22.1 | -0.024 | ±0.053 | -41.4 | 281 | 246 |
| BE 0.30R + trailing 1.00R/0.50R | 924 | 71.1% | -22.5 | -0.024 | ±0.053 | -41.4 | 281 | 244 |
| BE 0.30R + trailing 0.75R/0.75R | 924 | 71.1% | -22.9 | -0.025 | ±0.053 | -41.6 | 281 | 242 |
| BE 0.30R + trailing 1.00R/0.75R | 924 | 71.1% | -23.1 | -0.025 | ±0.053 | -41.6 | 281 | 242 |
| BE 0.30R + trailing 1.50R/0.50R | 924 | 71.1% | -23.6 | -0.026 | ±0.053 | -41.4 | 281 | 243 |
| BE 0.30R + trailing 1.50R/0.75R | 924 | 71.1% | -23.6 | -0.026 | ±0.053 | -41.6 | 281 | 241 |

### 5. Estabilidade mês a mês (R médio por mês)

| perfil | 2026-07 (n) | 2026-08 (n) | 2026-09 (n) |
|---|---:|---:|---:|
| sem gestão (só parciais + SL + TP final) | -0.043 (510) | -0.018 (391) | +0.279 (23) |
| BE 0.30R | -0.024 (510) | -0.042 (391) | -0.054 (23) |
| BE 0.50R | -0.006 (510) | +0.009 (391) | -0.146 (23) |
| BE 0.75R | -0.031 (510) | +0.052 (391) | +0.062 (23) |
| BE 0.50R + trailing 0.75R/0.50R | +0.005 (510) | +0.020 (391) | -0.076 (23) |
| BE 0.50R + trailing 1.00R/0.50R | +0.003 (510) | +0.022 (391) | -0.087 (23) |
