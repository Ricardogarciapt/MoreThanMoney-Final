# Módulo 11 — Perpétuos a sério (≈17 min)
**Objetivo:** perceber o que é um perpétuo antes de lhe tocar: o funding que se paga, a margem que se escolhe, a liquidação que pode acontecer e os custos que não aparecem no botão de compra. Assim, a alavancagem é uma escolha, não um impulso.  **No fim, o aluno consegue:** 1) explicar o funding e quem paga a quem; 2) escolher entre margem isolada e cruzada e dizer porquê; 3) calcular, de forma simplificada, um preço de liquidação; 4) somar as fees e o custo real de uma operação; 5) dimensionar uma posição pelo stop e não pela alavancagem.

**Nota de produção:** todos os números são exemplos ilustrativos e dizem-se em voz alta e no ecrã. Não mostrar saldos reais. O painel de conta grava-se com uma conta simulada e valores de teste. Os perpétuos têm risco de perda do valor que colocas em margem, e nada do que se grava pode sugerir o contrário.

## Aula 11.1 — O que é um perpétuo e o funding (≈3–4 min)
**Gancho (0:00–0:20):** "Um perpétuo é um contrato que não expira. Parece simples, e a parte que não expira é exatamente a que te vai custar atenção."

**[CENA 1]** Ruben em plano médio, fundo quase preto, pormenores a ouro. Texto no ecrã: «Conteúdo educativo. O risco de perda é real.»
**NARRAÇÃO:** Antes de qualquer número, o aviso que vai estar no ecrã durante todo este módulo: conteúdo educativo. O risco de perda é real. Nos perpétuos pode perder-se tudo o que colocaste em margem, e isso acontece mais depressa do que a maioria pensa. Este módulo é para perceber, não para começar. O nível três é opcional. E antes de qualquer euro real, o que vale é a conta simulada, como já sabes desde o início do bootcamp. Dito isto, vamos ao que é um perpétuo. Quero que saias daqui com uma frase clara.

**[CENA 2]** Animação: um contrato com uma seta infinita e a palavra «sem data de validade». Texto no ecrã: «perpétuo = sem data».
**NARRAÇÃO:** Um contrato de futuros normal tem uma data de expiração. No fim dessa data, liquida-se, e acabou. Um perpétuo não tem essa data. Fica aberto enquanto quiseres e enquanto tiveres margem para o manter. Para se manter parecido com o preço à vista, o perpétuo usa um mecanismo que se chama funding. Não é uma taxa de corretagem. É um pagamento que acontece de tempos a tempos, entre quem está comprado e quem está vendido. Quando o perpétuo está acima do preço à vista, quem está comprado paga a quem está vendido. Quando está abaixo, acontece o contrário. É a parte que mais gente ignora, e pesa mais do que parece em posições abertas dias seguidos.

**[CENA 3]** Tabela no ecrã: «Exemplo ilustrativo · posição comprada de 1.000 € de nocional · funding de 0,05 % por período». Ruben aponta para a tabela.
**NARRAÇÃO:** Vamos a um exemplo ilustrativo. Tens uma posição comprada com mil euros de valor nocional, que é o tamanho total da posição, e não o dinheiro que puseste. O funding está a zero vírgula zero cinco por cento por período de pagamento. Por período, pagas cinquenta cêntimos. Se o funding for positivo, quem está comprado paga. Se for negativo, quem está comprado recebe. O número serve só para fazer a conta, e o funding muda com o tempo. Interessa-te o mecanismo: quem fica muito tempo em posição com o funding a jogar contra si paga uma pequena parte, todos os dias, e isso não aparece no gráfico das velas.

**[CENA 4]** Ecrã dividido em dois: à esquerda o gráfico do perpétuo, à direita o gráfico do preço à vista, com a diferença entre os dois a piscar. Texto no ecrã: «perpétuo contra preço à vista».
**NARRAÇÃO:** Porque é que o perpétuo se mantém perto do preço à vista? Porque o funding empurra. Quando há muita gente comprada e o perpétuo fica acima do preço real, o funding fica positivo, e quem está comprado paga para manter a posição. Isso tende a arrefecer a procura do lado comprado. Ao contrário, quando há muita gente vendida, o funding fica negativo, e quem vende é que paga. Não é magia, é um incentivo. Na prática, o funding é um custo ou um rendimento que corre enquanto a posição está aberta, e muda de sinal conforme o ambiente do mercado.

**[CENA 5]** Folha de exercício com uma linha do tempo de três dias, e campos «funding pago» por dia. Ruben com a caneta na mão.
**NARRAÇÃO:** Exercício de dois minutos, em papel. Uma posição comprada de mil euros de nocional, com funding de zero vírgula zero cinco por cento por período, e três períodos por dia, que é um dos formatos comuns. Quanto pagas em vinte e quatro horas? Três períodos de cinquenta cêntimos dão um euro e cinquenta. Um euro e cinquenta por dia, sobre um nocional de mil. Exemplo ilustrativo, claro. Agora repete a conta com a posição aberta uma semana inteira. Se o funding jogar contra ti todos os dias, quanto pagas no total? Faz a conta sem calculadora, e só depois confirma. Na próxima aula vemos o que acontece à tua margem quando as coisas correm mal.

**Texto no ecrã:** perpétuo = sem data · funding = pagamento entre posições · exemplo ilustrativo · paga-se enquanto a posição está aberta
**Pergunta de verificação:** Estás comprado e o funding está positivo. Quem paga? Resposta: tu, quem está comprado. Com funding positivo, o pagamento vai de quem compra para quem vende.
**Fecho / CTA da aula:** "Próxima aula: margem isolada e margem cruzada."

## Aula 11.2 — Margem isolada e margem cruzada (≈3–4 min)
**Gancho (0:00–0:20):** "Duas contas com o mesmo saldo podem reagir de maneira completamente diferente à mesma queda. A diferença está numa escolha que quase ninguém lê."

**[CENA 1]** Ecrã de um painel de margem simulado, com duas opções, «isolada» e «cruzada». Texto no ecrã: «margem: o que te protege e o que arrisca».
**NARRAÇÃO:** A margem é o dinheiro que colocas para segurar a posição. Não é o custo da posição toda, é a garantia. Quando abres um perpétuo com alavancagem, a plataforma exige uma margem inicial, e é essa margem que sobe e desce com o mercado. Existem duas formas de a organizar: isolada e cruzada. A diferença não está na alavancagem. Está em quem paga quando a posição corre mal. Esta escolha parece técnica, mas é uma das decisões de risco mais importantes deste módulo, e muitas vezes é a que se toma sem pensar.

**[CENA 2]** Animação com duas caixas. Na isolada, uma caixa pequena com um muro à volta, só com uma posição lá dentro. Na cruzada, uma caixa grande com várias posições e um só saldo partilhado.
**NARRAÇÃO:** Margem isolada quer dizer que cada posição tem a sua própria garantia. Se pões cem euros numa posição, só esses cem euros estão em risco. Se a posição for liquidada, perdes esses cem, e o resto da conta fica intacto. Margem cruzada quer dizer que todas as posições partilham o saldo disponível. Uma posição em dificuldade pode usar o dinheiro das outras para aguentar. Parece uma vantagem, e às vezes é, mas tem um custo: uma única posição má pode arrastar a conta inteira. Para quem está a aprender, isso é um problema grande.

**[CENA 3]** Tabela comparativa no ecrã: «isolada: limite por posição · cruzada: partilha o saldo». Ruben aponta para a linha do risco.
**NARRAÇÃO:** Vamos pôr as duas lado a lado, com um exemplo ilustrativo. Tens uma conta simulada de mil euros e abres duas posições. Com margem isolada, dás cem euros a cada uma. Se a primeira correr mal e for liquidada, perdes esses cem, e a segunda continua com os seus cem. Com margem cruzada, as duas usam o saldo total de mil. Se a primeira correr mal, a segunda pode usar o que sobra, e a liquidação só acontece quando a conta inteira chega ao limite. Ou seja, a cruzada aguenta mais tempo, mas quando falha, falha em conjunto. Os números são para a conta, não para qualquer posição real.

**[CENA 4]** Ruben a falar para a câmara, com um cartão na mão. Texto no ecrã: «A cruzada não te protege. Só adia.»
**NARRAÇÃO:** Uma opinião minha, que podes discutir: para quem está a começar, a margem isolada é a escolha que recomendo. Quem está a começar ainda não tem um plano de risco testado, e a isolada obriga-te a decidir quanto põe cada posição. Esse limite é um ensino. Com a cruzada, a conta funciona como um só bolo, e é fácil dar mais margem a uma posição que está a perder, na esperança de que recupere. Chama-se pôr mais dinheiro numa coisa que já está a correr mal. A cruzada tem o seu lugar para quem já tem regras escritas e testadas, mas não é onde se começa.

**[CENA 5]** Folha de exercício com duas colunas, «isolada» e «cruzada», e um campo: «o que acontece à outra posição se a primeira correr mal?».
**NARRAÇÃO:** Exercício de três minutos. Se a plataforma que usas to permitir, faz em conta simulada: abre duas posições pequenas com a mesma alavancagem, uma em margem isolada e outra em cruzada. Se não der, faz no papel. Preenche a folha: quanto dinheiro está dentro de cada posição, o que acontece à outra se a primeira correr mal, e qual das duas te deixa mais tranquilo. Não há resposta certa para a última pergunta, só a tua. Na próxima aula vemos o que é a liquidação e como se calcula, de forma simplificada, com uma conta ilustrativa.

**Texto no ecrã:** isolada: o risco fica na posição · cruzada: o risco é da conta toda · escolhe antes de abrir
**Pergunta de verificação:** Com margem cruzada, o que pode a posição com problemas usar para aguentar? Resposta: o saldo das outras posições, e por isso o risco passa a ser da conta toda.
**Fecho / CTA da aula:** "Próxima aula: a liquidação, com uma conta ilustrativa."

## Aula 11.3 — Liquidação, com uma conta ilustrativa (≈3–4 min)
**Gancho (0:00–0:20):** "A liquidação é o momento em que a plataforma fecha a tua posição porque já não há garantia suficiente. Ninguém te pergunta. Acontece."

**[CENA 1]** Ruben com o caderno aberto numa página com uma conta a lápis. Texto no ecrã: «Exemplo ilustrativo».
**NARRAÇÃO:** Vamos fazer a conta da liquidação passo a passo, com uma conta ilustrativa. Não é a conta de ninguém. São números redondos, para veres a mecânica. Imagina uma conta simulada com quinhentos euros de margem numa posição comprada, com alavancagem de dez vezes. Dez vezes quer dizer que a posição tem um valor nocional de cinco mil euros. Os quinhentos são a tua garantia, os cinco mil são o tamanho da aposta. Esta diferença é o centro desta aula. E repara: o exemplo é ilustrativo, e a plataforma que usares pode ter números e regras diferentes.

**[CENA 2]** Animação: uma barra de margem a encher-se de dourado, com um traço vermelho que desce devagar à medida que o preço cai. Texto no ecrã: «margem a consumir-se».
**NARRAÇÃO:** Quando o preço se mexe contra a tua posição, a perda sai da margem. Com cinco mil de nocional, cada um por cento de movimento contra ti vale cinquenta euros. Se o preço descer dez por cento, perdes quinhentos, e a margem fica a zero. Numa conta simplificada, é aí que a liquidação acontece: quando a perda consome a margem. Só que isto é uma simplificação, e a diferença é importante. Na prática, a plataforma exige uma margem mínima de manutenção, e liquida antes de a margem chegar a zero. Por isso o preço de liquidação real fica um pouco mais perto da entrada do que a conta simples diz.

**[CENA 3]** Tabela no ecrã: «entrada 100 · liquidação simplificada ≈ 90 · exemplo ilustrativo». Ruben aponta para os números.
**NARRAÇÃO:** Vamos ao preço. Imagina que a posição é comprada à entrada de cem. Com esta conta simplificada, a liquidação fica perto de noventa, porque é a queda de dez por cento que a margem de quinhentos aguenta sobre os cinco mil de nocional. Repara na lógica por trás: aproximadamente um a dividir pela alavancagem. Dez vezes dá dez por cento. Vinte vezes dá cinco por cento. Quanto mais alavancagem, mais curta a distância até à liquidação. Ou seja, a alavancagem não te dá mais tempo. Encurta a margem de erro. Este número é um exemplo ilustrativo, e não é uma regra para qualquer posição.

**[CENA 4]** Ruben a falar para a câmara, com a frase no ecrã: «Liquidação não é um número. É uma data que chega sem avisar.»
**NARRAÇÃO:** E agora o ponto que quero que guardes. A liquidação não avisa. Não há um momento em que a plataforma te diz que vai fechar, e não há garantia de que o preço para exatamente no valor que calculaste. Num mercado rápido, com uma vela longa e de repente, o preço pode passar pelo nível de liquidação em segundos, e o fecho acontece ao preço que houver nesse momento, que pode ser pior do que o número que escreveste. Por isso, o preço de liquidação que vês no ecrã é um limite de referência e não uma proteção. A proteção, se existir, está noutro sítio: é o stop, que vamos ver mais à frente neste nível.

**[CENA 5]** Ruben a fechar o caderno. Cartão no ecrã: «Recalcula sempre antes de abrir.»
**NARRAÇÃO:** Missão desta aula: pega numa conta ilustrativa, numa simulação, e calcula a liquidação simplificada para três alavancagens, cinco, dez e vinte. Escreve a distância percentual até ao preço de liquidação em cada caso. Depois confirma no painel da plataforma que usas, se o tiver. Se os números não batem, procura a diferença, que costuma estar na margem de manutenção e nas fees. Não abras nenhuma posição real para fazer esta conta, nem por curiosidade. Na próxima aula falamos dos custos, que é onde a conta costuma ser mais cara do que parece.

**Texto no ecrã:** nocional = margem × alavancagem · a liquidação chega sem aviso · exemplo ilustrativo · alavancagem encurta a margem de erro
**Pergunta de verificação:** Com a mesma margem de quinhentos euros, o que acontece ao preço de liquidação quando passas de dez para vinte vezes? Resposta: fica mais perto da entrada, porque a mesma garantia sustenta um nocional maior.
**Fecho / CTA da aula:** "Próxima aula: as fees, o custo real de uma operação."

## Aula 11.4 — Fees e o custo real (≈3–4 min)
**Gancho (0:00–0:20):** "Uma operação pode parecer que correu bem e, quando fazes a conta às fees, já não sobrou nada. Esta aula é a das contas que ninguém faz à frente do ecrã."

**[CENA 1]** Ruben com uma folha de fatura, título «fatura ilustrativa». Texto no ecrã: «custos que não se veem».
**NARRAÇÃO:** Vamos falar de dinheiro que sai sem se ver. Nos perpétuos há pelo menos três tipos de custo. A fee de abertura, a fee de fecho e o funding que já vimos. Há ainda um custo escondido, que é o spread, a diferença entre o preço de compra e o de venda no momento. Cada um é pequeno, mas somados e multiplicados pela alavancagem e pela frequência, podem comer uma parte grande do que pensavas ter. Esta fatura é ilustrativa, sem valores de nenhuma plataforma em concreto. A tua plataforma autorizada tem as suas tabelas, e tens de as ler antes de abrir.

**[CENA 2]** Animação: uma seta de entrada e uma seta de saída, cada uma com uma pequena fatia cortada. Texto no ecrã: «maker · taker».
**NARRAÇÃO:** A fee depende da forma como entras. Quando colocas uma ordem que fica à espera no livro de ordens, e não é executada de imediato, costumas pagar uma fee mais baixa, chamada de maker. Quando a ordem entra de imediato e leva liquidez do mercado, pagas uma fee mais alta, a de taker. As plataformas variam, por isso confirma no menu de taxas da plataforma autorizada, antes de abrir, a fee de cada tipo de ordem. Pergunta-te também se o tipo de ordem que vais usar é o que queres, e não o mais rápido de clicar.

**[CENA 3]** Tabela no ecrã: «nocional 5.000 € · fee de 0,05 % por lado · exemplo ilustrativo». Ruben aponta para os números.
**NARRAÇÃO:** Exemplo ilustrativo, com números redondos. Nocional de cinco mil euros, e uma fee de zero vírgula zero cinco por cento por cada lado da operação, abertura e fecho. Abrir custa dois euros e meio. Fechar custa outros dois euros e meio. Total, cinco euros, numa operação de cinco mil. Parece pouco. Agora olha para a margem: quinhentos euros. Cinco euros em quinhentos são um por cento da garantia, só em fees, antes de o mercado se mexer. Se repetires esta operação dez vezes com a mesma margem, são cinquenta euros, dez por cento da garantia, a ir para a plataforma. Nenhum desses cinquenta euros aparece no gráfico.

**[CENA 4]** Ruben a falar para a câmara, com o painel de conta simulado a aparecer ao lado. Texto no ecrã: «custo de fees para o tamanho da conta».
**NARRAÇÃO:** É aqui que o painel de conta do Aurum Flow Cripto ajuda. Mostra o nocional, a alavancagem útil e o custo de fees para o tamanho da tua conta, antes de abrires. A pergunta que deves fazer sempre é esta: se a operação der exatamente o que o plano prevê, quanto fica depois das fees? Se a resposta for quase nada, a operação pode não valer o esforço, por mais bonita que pareça no gráfico. Isto não é uma garantia de nada. É uma conta de cabeça que te protege de uma ilusão.

**[CENA 5]** Folha de exercício com campos: «nocional», «fee de abrir», «fee de fechar», «custo total», «em % da margem». Ruben a apontar para o primeiro campo.
**NARRAÇÃO:** Exercício de cinco minutos, no papel. Uma margem de mil euros, alavancagem de cinco vezes, e uma fee de zero vírgula zero cinco por cento por lado. Qual é o nocional? Cinco mil. Quanto custa abrir? Dois euros e meio. Quanto custa fechar? Outros dois euros e meio. Qual é o custo total, em percentagem da margem? Meio por cento. Agora repete com alavancagem de vinte vezes, mantendo a mesma margem. Não precisas de acertar a fee da tua plataforma. Precisas de perceber que o custo sobe com o nocional, e não com a margem que puseste. Na próxima aula vemos a parte mais importante do módulo: porque é que a alavancagem não muda o risco certo.

**Texto no ecrã:** nocional · fee por lado · custo total · % da margem · exemplo ilustrativo
**Pergunta de verificação:** Porque é que as fees sobem quando aumentas a alavancagem, com a mesma margem? Resposta: porque a fee se calcula sobre o nocional, e o nocional sobe com a alavancagem.
**Fecho / CTA da aula:** "Próxima aula: a alavancagem e o risco certo."

## Aula 11.5 — A alavancagem não muda o risco certo (≈3–4 min)
**Gancho (0:00–0:20):** "Alavancagem parece um acelerador. Mas se fosse só um acelerador, o que travava o carro? A resposta é o stop e o tamanho da posição, e não o número que aparece no ecrã."

**[CENA 1]** Ruben em plano médio, fundo quase preto. Texto no ecrã: «O risco define-se pelo stop e pelo tamanho».
**NARRAÇÃO:** Chegamos à aula que resume o nível três, e talvez seja a mais importante do módulo. Quando alguém te diz que vai usar cinco vezes, ou vinte vezes, a pergunta certa não é quanto é a alavancagem. A pergunta certa é: quanto perco se o stop for atingido? Essa pergunta tem uma resposta que não depende da alavancagem. Depende de duas coisas: a distância do stop e o tamanho da posição. A alavancagem só diz quanta margem precisas para segurar essa posição. Vamos ver porquê com contas, e com exemplos ilustrativos, claro.

**[CENA 2]** Animação com uma fórmula no ecrã: «perda = nocional × distância do stop». Texto no ecrã: «risco = nocional × stop».
**NARRAÇÃO:** A fórmula cabe num guardanapo: a perda, se o stop for atingido, é igual ao nocional multiplicado pela distância do stop em percentagem. Mais nada. Não entra a alavancagem. Entra o tamanho da posição, que é o nocional, e entra o sítio onde estás disposto a sair. Com isto, o risco por operação fica definido antes de abrires. Se queres perder no máximo um por cento da tua conta, escolhes o nocional e a distância do stop de forma que a perda, nesse caso, seja um por cento. E a alavancagem fica como consequência dessa escolha, e não como ponto de partida.

**[CENA 3]** Três colunas no ecrã com a mesma conta: «conta: 1.000 € · risco: 10 € (1 %)». Exemplo ilustrativo.
**NARRAÇÃO:** Vamos com a mesma conta de mil euros, com um risco de dez euros por operação, que é um por cento. Primeiro caso: stop a dois por cento do preço de entrada. Nocional: dez a dividir por dois por cento, dá quinhentos euros. Alavancagem, face à conta, meia vez. Segundo caso: stop a um por cento. Nocional de mil euros, alavancagem de uma vez. Terceiro caso: stop a meio por cento. Nocional de dois mil, alavancagem de duas vezes. Nos três, se o stop for atingido, perdes exatamente dez euros. O que mudou foi o nocional e a alavancagem, e não o risco. Este é o ponto que quero que guardes.

**[CENA 4]** Ruben com o caderno aberto. Cartão no ecrã: «Stop não é garantia.»
**NARRAÇÃO:** Uma ressalva importante: o stop é uma ordem, e uma ordem pode ser executada a um preço pior do que o que escreveste, se o mercado der um salto. Num movimento brusco, o fecho pode sair mais longe do que o nível marcado. Por isso o stop reduz o risco, mas não o elimina. E a liquidação continua a existir, porque se a margem for pequena demais para a distância do stop, a plataforma fecha a posição antes de o stop chegar. A regra não é «ponho stop e fico descansado». A regra é: o stop fica longe o suficiente para o ruído normal, e a posição é pequena o suficiente para que um salto não te arrase a conta.

**[CENA 5]** Ruben a fechar o caderno. Texto no ecrã: «Nível 3: só em conta simulada, até 30 operações com diário.»
**NARRAÇÃO:** Vamos à regra do nível três, que não se negoceia. Este nível faz-se só em conta simulada, MTM Funded ou WebTrader, até cumprires trinta operações com diário completo. Trinta, e não três. O diário regista a data, o plano, o stop, o nocional, o risco em euros, a fee, o motivo de entrada, o motivo de saída e o que aprendeste. Só depois de trinta operações é que se pode pensar numa conta real, e essa decisão é tua, nunca com o dinheiro da renda. Missão desta aula: abre a tua conta simulada, faz o cálculo de risco com o modelo da aula, regista as primeiras linhas do diário, e escreve no topo da folha: zero de trinta.

**Texto no ecrã:** risco = nocional × distância do stop · alavancagem é margem, não risco · stop não é garantia · 30 operações em simulada
**Pergunta de verificação:** Com mil euros e risco de dez euros, o que acontece ao risco se trocares um stop de um por cento por meio por cento? Resposta: o nocional sobe para dois mil e a alavancagem para duas vezes, mas a perda, se o stop for atingido, continua a ser de dez euros.
**Fecho / CTA da aula:** "Fim do Módulo 11. Próximo módulo: 12, A estratégia Aurum Flow Cripto. Botão no ecrã: «Continuar para o Módulo 12»."
