# Pips, lotes e o preço de um erro

> Ninguém perde a conta por não saber o que é um pip. Perde-a por saber e não fazer a conta.

Pensa no talho. Pedes «um bocado de carne» e o talhante pesa. O preço por quilo é o mesmo para toda a gente, mas a conta final depende de quanto levas. No Forex é igual: o preço do par é o mesmo para todos, e a tua conta depende do tamanho da posição. Quem não sabe pesar, paga o que não queria.

Este capítulo é o mais aborrecido do livro. É também o que mais te protege.

## O pip

O **pip** é a unidade de medida do movimento. Na maioria dos pares é a quarta casa decimal:

- EUR/USD passa de 1,0850 para 1,0851: subiu **1 pip**.
- Nos pares com o iene, é a segunda casa: USD/JPY de 151,40 para 151,41 é 1 pip.
- O MetaTrader 5 mostra mais uma casa (1,08502). Esse último dígito é uma décima de pip, chamada «pipette».

Repara num pormenor do ecrã: nas Cotações, o MT5 mostra o spread em **pontos**, não em pips. Nos pares com cinco casas decimais, 10 pontos são 1 pip. Se vês «8» ao lado da hora, o spread é de 0,8 pips.

No ouro, a convenção varia de corretora para corretora. Antes de operares XAU/USD, confirma na especificação do contrato quanto vale cada movimento.

## O lote

O **lote** é o tamanho da posição.

| Nome | Lotes no MT5 | Unidades da moeda base |
|---|---|---|
| Standard | 1,00 | 100.000 |
| Mini | 0,10 | 10.000 |
| Micro | 0,01 | 1.000 |

E aqui está a ligação que interessa: o valor de cada pip depende do lote.

[[grafico:valor-pip]]

Numa conta em dólares, no EUR/USD, 1 pip vale cerca de 10 $ com 1 lote, 1 $ com 0,10 e 0,10 $ com 0,01. Se o preço andar 30 pips contra ti, a diferença entre um microlote e um lote standard é a diferença entre perder 3 $ e perder 300 $. O gráfico é o mesmo. A tua vida, não.

## No ecrã: o campo «Volume»

No MT5, o lote chama-se **Volume** e aparece na janela de ordem, logo por baixo do tipo de ordem. Ainda não vais abrir nenhuma (isso fica para o capítulo 6), mas vale a pena veres já onde está o número que mais dinheiro mexe na tua conta.

:::galeria O seletor de lotes
mt5-tel-ordem-lotes.png | Ao tocar no volume abre-se um seletor com botões de −0,10 a +0,10 e o número grande ao centro. É esse número que decide quanto vale cada pip.
:::

:::alerta Erro clássico · Escolher o lote «a olho»
Quem começa abre o MetaTrader 5, vê o campo «Volume» e escreve um número que «parece pouco». 0,50, porque é menos de um. Só que 0,50 lotes no EUR/USD são cerca de 5 $ por pip, e um movimento normal de 40 pips contra ti são 200 $. O volume não se escolhe a olho. Calcula-se, e vais aprender a fazê-lo no capítulo 5.
:::

:::historia A Marta, dia 4
Curiosa, a Marta abriu a janela de ordem e tocou no volume. O seletor dizia 0,01 e ela carregou três vezes em +0,10: 0,31. «Ainda é menos de metade de um lote.» Antes de fechar, fez a conta deste capítulo num papel: 0,31 lotes no EUR/USD são cerca de 3,10 $ por pip. Com um stop de 25 pips, perderia uns 78 $ numa só operação, perto de 15 % da demo. Fechou a janela sem colocar nada e escreveu no caderno: «O volume não é uma opinião».
:::

## O spread e o swap: os custos que não aparecem na fatura

Cada operação começa a perder. Quando compras, compras ao preço mais alto (ask). Quando fechas, vendes ao mais baixo (bid). Essa diferença, o spread, é o custo de entrada.

Com spread de 1 pip e 0,10 lotes no EUR/USD, cada operação custa cerca de 1 $. Parece nada. Agora multiplica.

[[grafico:custo-spread]]

Quem faz 200 operações por mês está a pagar 200 $ só para entrar, antes de saber se ganhou ou perdeu. É por isso que o método frio é lento de propósito: menos operações, mais escolhidas.

O **swap** é o juro que pagas (ou, às vezes, recebes) por manteres uma posição aberta de um dia para o outro. Às quartas-feiras, em muitas corretoras, cobra-se a triplicar por causa do fim de semana. Vês o valor na especificação do símbolo no MT5: no telemóvel, em **Cotações**, toca no par e escolhe **Especificações**; no PC, botão direito no símbolo e **Especificação**.

:::ecra MetaTrader 5 · Especificação · EUR/USD
Tamanho do contrato: 100.000
Volume mínimo: 0,01
Passo de volume: 0,01
Swap de compra: −6,8 pontos
Swap de venda: +1,2 pontos
Swap triplo: quarta-feira
:::

Valores ilustrativos. Abre a especificação do teu símbolo e escreve os teus.

## Alavancagem e margem: a lupa

A **alavancagem** deixa-te controlar uma posição maior do que o dinheiro que tens na conta. Com alavancagem de 30:1, para abrir 30.000 € de exposição precisas de 1.000 € de **margem**, que é o depósito que a corretora te bloqueia.

A alavancagem não muda a direção do mercado. Muda o tamanho do impacto. É uma lupa: aumenta o ganho e aumenta a perda, pela mesma medida.

Na União Europeia, para clientes de retalho, a ESMA limita a alavancagem: até 30:1 nos pares principais, 20:1 nos outros pares, no ouro e nos principais índices, e menos ainda noutros ativos. As corretoras reguladas na UE também têm de garantir que não perdes mais do que o saldo da conta (proteção contra saldo negativo).

:::destaque
A alavancagem que a corretora te dá é o máximo permitido, não uma recomendação. O teu risco decide-se pelo lote e pelo stop, nunca pela alavancagem disponível.
:::

Quando a perda aberta come a margem até um certo nível, a corretora avisa (margin call) e depois começa a fechar posições sozinha (stop out). Não é castigo. É a lupa a fazer o trabalho dela.

[[grafico:recuperacao-perdas]]

Este gráfico explica porque é que a proteção vale mais do que o ataque. Depois de perderes metade da conta, precisas de duplicar o que sobra só para voltar ao início. Ninguém se lembra disto na operação em que exagera no lote.

## Da minha vida: o segundo salto

Escolhi os paraquedistas tendo medo das alturas. A minha avó tinha-me dito uma coisa que nunca esqueci: «Tu não tens de ter medo. És uma pessoa que abraça os medos.» Era um miúdo magro. Nas provas físicas fiz 30 flexões quando eram precisas 35, passei nas barras e compensei nos agachamentos. Passei à justa. Por ter faltado a uma inspeção, era o mais velho de um curso de cerca de 400 e fiquei chefe de curso do 1.º pelotão, com decisões a cair-me em cima todos os dias. Da recruta ao curso de paraquedismo, passei de entrar à justa a ser o melhor do curso na parte física. Perdi o medo das alturas pelo caminho.

O curso foi encolhendo: de 400 para cem e poucos, e cerca de 53 nos saltos. No primeiro fui o primeiro à porta. Luz verde, salto, e uma sensação de liberdade que me fez decidir ali, no ar, que a vida militar era o que eu queria. No segundo salto as posições inverteram-se. Fui o último, e saltei já com a luz vermelha, fora da zona limpa. O salto correu bem. Foi na aterragem, no rolamento, que o joelho direito rebentou.

Faltava um dia. No dia seguinte, mais três saltos davam-me o brevê e a boina verde. Em vez disso, tive de tirar 1,8 cm de cartilagem e escolher entre um imobilizador com parafusos ou uma artroscopia no Hospital da Rábida, paga pelo meu seguro, porque o exército não a pagava. Saí dos paraquedistas para tratar a saúde. Foi a primeira vez que desisti de alguma coisa na vida, e disseram-me que não voltaria a correr.

Conto-te isto num capítulo sobre pips e lotes por uma razão simples: um erro pequeno, no sítio errado, pode custar uma coisa enorme. Uma vírgula no volume, um lote calculado à pressa, uma entrada «já que estou aqui» com a luz vermelha acesa. No mercado, como naquele salto, o tamanho do estrago não depende do tamanho do erro. Depende de onde ele acontece.

## A regra fria deste capítulo

:::cartao Regra fria n.º 3
Antes de cada operação sei três números: quanto vale 1 pip com o meu lote, quanto pago de spread e quanto perco se o stop for atingido. Se não sei, não entro.
:::

## Em resumo

- 1 pip é a quarta casa decimal na maioria dos pares; nos pares com o iene, a segunda.
- O valor do pip depende do lote: cerca de 10 $, 1 $ ou 0,10 $ no EUR/USD, numa conta em dólares.
- O spread paga-se em todas as operações; quem opera muito, paga muito.
- O swap paga-se por cada noite com a posição aberta.
- A alavancagem é uma lupa. O risco controla-se com lote e stop.
- No ecrã: spread em pontos (10 pontos = 1 pip) e o lote no campo «Volume».

:::exercicio Para fazer hoje
1. Na demo, abre a especificação do teu par (telemóvel: Cotações › par › Especificações; PC: botão direito › Especificação).
2. Copia para o caderno: tamanho do contrato, volume mínimo, swap de compra e de venda, dia do swap triplo.
3. Faz a conta: com 0,01 lotes, quanto perdes se o preço andar 25 pips contra ti? ____________
4. E com 0,10? ____________ E com 1,00? ____________
5. Olha para as três respostas e escreve qual delas te deixaria dormir. ____________
:::
