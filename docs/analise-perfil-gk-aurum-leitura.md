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
