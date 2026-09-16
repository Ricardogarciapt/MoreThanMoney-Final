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

