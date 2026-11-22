# Módulo 13 — Risco e tamanho de posição (≈15 min)
**Objetivo:** fazer com que nenhuma operação possa estragar a conta, ajustando o tamanho a partir da distância do stop e nunca do desejo de ganhar.  **No fim, o aluno consegue:** 1) definir o risco máximo por operação em 1 % do saldo; 2) calcular o tamanho de uma posição a partir da distância do stop; 3) ler a alavancagem útil e o painel de conta do Aurum Flow; 4) definir um limite diário e regras de paragem para as séries de perdas.

**Nota de produção:** usar um saldo de 1 000 € de conta simulada em todo o módulo, sempre com «exemplo ilustrativo» no ecrã e em voz. O painel do Aurum Flow é gravado com dados do dia, com valores desfocados.

## Aula 13.1 — Risco de 1 % por operação (≈3 min)
**Gancho (0:00–0:20):** "Podes ter a melhor estratégia do mundo e acabar sem conta. Basta uma sequência de operações grandes e más. A defesa não é acertar mais. É perder pouco de cada vez."

**[CENA 1]** Ruben em plano médio, fundo quase preto. Texto no ecrã: «Conteúdo educativo. O risco de perda é real.»
**NARRAÇÃO:** Este é o módulo mais chato do nível três e, para muita gente, o mais importante. Antes de falarmos de números, o aviso habitual. Conteúdo educativo. O risco de perda é real e pode ser total. Esta aula não te promete que vais ganhar. Promete-te uma coisa mais modesta e mais útil: que uma operação má não te tira aquilo que levaste anos a juntar. Essa é a única promessa que um curso sobre risco pode fazer com honestidade. E mesmo essa depende de ti, de cumprires a regra todos os dias, sem exceções que pareçam razoáveis no momento.

**[CENA 2]** Animação: uma barra de saldo dividida em cem fatias iguais, com uma fatia dourada acesa. Texto: «1 % do saldo por operação».
**NARRAÇÃO:** A regra que vamos usar é esta: arriscas no máximo um por cento do saldo em cada operação. Um por cento, e não aquilo que achas que o sinal merece. Se tens mil euros de conta simulada, o risco máximo de uma operação é de dez euros. E atenção: risco não é o montante investido. É quanto perdes se o stop for atingido. São coisas diferentes, e a confusão entre as duas é a origem de muitas contas que desaparecem. Repara que a fatia dourada é pequena de propósito. Uma fatia pequena não te deixa cair. Exemplo ilustrativo, com conta simulada, como sempre.

**[CENA 3]** Dois blocos lado a lado. À esquerda: «investido 500 € · stop −2 % · risco 10 €». À direita: «investido 200 € · stop −15 % · risco 30 €». Rótulo: exemplo ilustrativo.
**NARRAÇÃO:** Olha para estes dois casos, exemplos ilustrativos. No primeiro, investes quinhentos euros, mas o stop está a dois por cento. Se for atingido, perdes dez euros. No segundo, investes apenas duzentos, mas o stop está a quinze por cento, e perdes trinta. Quem olha só para o montante investido acha que o primeiro é o grande risco. Está enganado. O número que controla a conta é a perda no stop. Por isso a pergunta certa não é «quanto invisto?», é «quanto perco se o stop for atingido?». Essa pergunta protege o saldo, e é a que vamos treinar durante todo o módulo.

**[CENA 4]** Ruben com o caderno aberto. Na página, a fórmula: «risco máximo = saldo × 1 %». Por baixo: «1 000 € × 1 % = 10 €».
**NARRAÇÃO:** Escreve a fórmula no topo do caderno: saldo vezes um por cento. Com mil euros simulados, o teto de perda de cada operação são dez euros. Esse teto não muda porque o sinal te parece bom. Um sinal entusiasmante não te autoriza a arriscar mais. Um sinal fraco pode levar-te a arriscar menos, e isso também está certo. O que muda de operação para operação é o tamanho da posição, e isso é a próxima aula. O risco fica fixo. Se alguma vez escreveres outro número no caderno, pára e volta a esta página. O erro está na conta, nunca no mercado.

**[CENA 5]** Ruben em plano próximo, a falar para a câmara. Texto: «dez perdas seguidas de 1 % ≈ 10 % da conta».
**NARRAÇÃO:** Vamos ser realistas. Vais perder operações. Isso faz parte do método e não é sinal de que o método está avariado. Com um por cento, uma perda é um arranhão. Dez perdas seguidas de um por cento cada tiram-te cerca de dez por cento da conta. É um mau período, que se recupera com paciência e com regras. O que destrói contas é o contrário: arriscar dez ou vinte por cento numa só operação porque desta vez é diferente. Se alguma vez ouvires essa frase na tua cabeça, lembra-te da fórmula. Ela não discute. Calcula. E é por isso que funciona.

**[CENA 6]** Ruben em plano médio, fundo carvão. Lista no ecrã: «1 % do saldo · risco é a perda no stop · 1 000 € → 10 €».
**NARRAÇÃO:** Resumo. O risco de cada operação é um por cento do saldo. Não é o que investes, é o que perdes se o stop for atingido. Esta regra protege-te das sequências, porque nenhuma perda isolada te pode tirar o jogo. Ela também te obriga a uma coisa que o DCA já te ensinou: decidir o tamanho antes de sentires a pressão do mercado. Na próxima aula pegamos nesta regra e calculamos o tamanho exato da posição, a partir da distância do stop que aprendeste no módulo doze. Não é magia. É uma divisão.

**Texto no ecrã:** 1 % do saldo · risco = perda no stop · 1 000 € → 10 €
**Pergunta de verificação:** Tens 1 000 € em conta simulada. Qual é o risco máximo numa operação? Resposta: 10 €, um por cento. Exemplo ilustrativo.
**Fecho / CTA da aula:** "Próxima aula: calcular o tamanho a partir da distância do stop."

## Aula 13.2 — Calcular o tamanho a partir da distância do stop (≈3–4 min)
**Gancho (0:00–0:20):** "Já sabes quanto podes perder: dez euros. Falta a pergunta que quase ninguém faz: quanto posso comprar para que, se o stop for atingido, perca exatamente esses dez?"

**[CENA 1]** Ecrã com o exemplo do módulo 12: entrada em 100, stop a 98. Rótulo: exemplo ilustrativo.
**NARRAÇÃO:** Vamos usar o exemplo do módulo doze, com a entrada em cem e o stop dois por cento abaixo, em noventa e oito. Exemplo ilustrativo, como sempre. A conta simulada tem mil euros e o risco máximo é de dez. A pergunta é: quanto devo ter investido nesta posição para que o stop, se for atingido, custe exatamente dez euros? Não é um número que se adivinha. Tem uma fórmula, e a fórmula cabe num cartão. Vou mostrar-ta devagar, com a calculadora na mão, para que possas refazer a conta sozinho sem olhar para mim.

**[CENA 2]** Diagrama com a fórmula em destaque: «Tamanho = risco em € ÷ distância do stop em %».
**NARRAÇÃO:** A fórmula é esta: o tamanho da posição é igual ao risco em euros a dividir pela distância do stop em percentagem. O risco são dez euros. A distância do stop são dois por cento. Dez a dividir por dois por cento, ou por zero vírgula zero dois na conta, dá quinhentos. Quinhentos euros de posição. Se o preço cair dois por cento, perdes dois por cento de quinhentos, que são dez euros. Exatamente o teu risco, nem mais um cêntimo. Cada peça tem um papel: o risco define o teto, o stop define a distância, e o tamanho é o que encaixa entre os dois.

**[CENA 3]** Tabela no ecrã: «stop 2 % → posição 500 € · stop 4 % → 250 € · stop 5 % → 200 €». Texto: «mesmo risco, tamanhos diferentes».
**NARRAÇÃO:** Repara no que acontece quando mudas só a distância do stop, mantendo o risco em dez euros. Com o stop a dois por cento, a posição é de quinhentos euros. Com o stop a quatro por cento, cai para duzentos e cinquenta. Com o stop a cinco por cento, fica em duzentos. O risco é sempre dez. Um stop mais largo obriga a uma posição mais pequena. Um stop mais curto deixa-te comprar mais. Exemplo ilustrativo, mas a lição é firme: nunca escolhas o tamanho antes de saberes onde está o stop. É o stop que manda na posição, e não o contrário.

**[CENA 4]** Ruben no caderno, com quatro passos numerados: «1 saldo · 2 risco de 1 % · 3 distância do stop em % · 4 tamanho = 2 ÷ 3».
**NARRAÇÃO:** Escreve o procedimento em quatro passos, sempre pela mesma ordem. Um: o saldo da conta. Dois: o risco, um por cento desse saldo. Três: a distância do stop em percentagem, tirada do plano do sinal. Quatro: divides o dois pelo três. Esse resultado é o tamanho. Se não tens a distância do stop, não tens sinal, e não há tamanho que se possa calcular. Não adivinhes a distância nem a arredondes para o que te convém. Ela vem do plano escrito antes de entrares, e é aí que deve ficar.

**[CENA 5]** Ruben com um segundo exemplo no caderno: «10 € ÷ 3 % = 333 € → fica em 330 €». Rótulo: exemplo ilustrativo.
**NARRAÇÃO:** Segundo exemplo, também ilustrativo. O stop está agora a três por cento. Dez a dividir por zero vírgula zero três dá trezentos e trinta e três. Não arredondas para cima. Arredondar para cima é aumentar o risco sem querer, e uma conta que cresce sem te aperceberes é exatamente o que queremos evitar. Arredondas para baixo, para trezentos e trinta, sem hesitar. Repara que o stop mais largo deu uma posição mais pequena, como vimos há pouco. A regra bate sempre certo, e é isso que a torna confiável. Quando não bate, o erro está na conta.

**[CENA 6]** Ruben em plano médio. Frase no ecrã: «Stop primeiro, tamanho depois.»
**NARRAÇÃO:** Resumo. Primeiro o stop, depois o tamanho. A fórmula é o risco em euros a dividir pela distância do stop em percentagem, e arredondas sempre para baixo. Não há opinião nesta conta. Há uma distância, um risco e um resultado. Se algum dia sentires que o tamanho «devia» ser maior porque o sinal é bom, lembra-te desta aula: a convicção não entra na fórmula. Na próxima aula olhamos para a alavancagem, que muita gente confunde com o tamanho, e para o painel de conta do Aurum Flow, que mostra várias destas contas já feitas.

**Texto no ecrã:** tamanho = risco € ÷ distância do stop % · arredonda para baixo · stop primeiro
**Pergunta de verificação:** Risco de 10 €, stop a 5 %. Qual é o tamanho? Resposta: 200 €. Exemplo ilustrativo.
**Fecho / CTA da aula:** "Próxima aula: alavancagem útil e o painel de conta."

## Aula 13.3 — Alavancagem útil e o painel de conta (≈3 min)
**Gancho (0:00–0:20):** "A alavancagem é o botão que mais gente confunde com o tamanho da posição. E confundir os dois é o caminho mais curto para perder mais do que querias."

**[CENA 1]** Ecrã com um controlo de alavancagem a mexer. Texto: «alavancagem ≠ tamanho ≠ risco».
**NARRAÇÃO:** Vamos separar três coisas que parecem uma só. A alavancagem é o multiplicador que a plataforma te dá para abrir uma posição maior do que o dinheiro que tens depositado. O tamanho, ou notional, é o valor total da posição. E o risco é quanto perdes se o stop for atingido. A alavancagem não cria risco do nada. Ela muda quanto dinheiro tens de reservar como margem, e torna fácil abrir posições grandes sem dares por isso. Se o tamanho e o stop não mudaram, o risco também não mudou, seja qual for a alavancagem que escolheste.

**[CENA 2]** Painel de conta do Aurum Flow, com os valores de hoje desfocados. Texto: «alavancagem útil · notional · fees · risco % por operação».
**NARRAÇÃO:** O painel de conta do Aurum Flow mostra quatro coisas para o tamanho que escolheste. A alavancagem útil: a alavancagem de que a posição precisa, para o tamanho escolhido, e não o máximo que a plataforma oferece. O notional, que é o valor total da posição. O custo de fees, à entrada e à saída, que come parte do resultado. E o risco em percentagem por operação. Os valores no ecrã estão desfocados, porque não interessam para a lição. O que interessa é aprenderes a ler os quatro, e não a decorar números.

**[CENA 3]** Ruben com o exemplo no ecrã: «conta 1 000 € · posição 500 € · alavancagem útil ≈ 1×». Rótulo: exemplo ilustrativo.
**NARRAÇÃO:** Aplica isto ao exemplo de há pouco: conta de mil euros, posição de quinhentos. A alavancagem útil é baixa, cerca de uma vez. Quer dizer que a posição cabe na conta sem esticar nada. Agora imagina que o painel te mostrava dez vezes para a mesma posição. O que mudava? O tamanho continuava a ser quinhentos e o stop continuava a dois por cento. A única coisa que mudava era a margem que a plataforma pede para segurar a posição. Quem escolhe a alavancagem não escolhe o risco. O risco já estava escrito no stop e na fórmula.

**[CENA 4]** Ruben no caderno, com a regra escrita em destaque: «usa a alavancagem que o tamanho pede, nunca a máxima».
**NARRAÇÃO:** A regra que escreves no caderno é esta, sem exceções: a alavancagem que uso é a que o tamanho calculado exige, nunca a máxima oferecida, mesmo que a plataforma a apresente como a opção normal. Se a conta cabe sem alavancar, não alavanco. Se a posição exige alguma alavancagem, o painel mostra-ta. E confirmas sempre o notional antes de carregar em confirmar. Não é uma regra de medo, é uma regra de precisão. A plataforma mostra o máximo porque é o que mostra. O teu interesse é outro: é o tamanho que calculaste na aula anterior, e mais nada.

**[CENA 5]** Ruben com a conta das fees no ecrã: «exemplo ilustrativo: taxa de 0,1 % por lado · posição 500 € → 0,50 € à entrada + 0,50 € à saída».
**NARRAÇÃO:** Por fim, as fees. Num exemplo ilustrativo, com uma taxa de zero vírgula um por cento por lado, uma posição de quinhentos paga cinquenta cêntimos à entrada e cinquenta cêntimos à saída. Parece pouco. Mas, com um stop de dois por cento e um risco de dez euros, um euro de fees é dez por cento do risco que definiste. Não é um detalhe. Por isso o painel mostra o custo, e por isso olhas para ele antes de confirmar, e não depois. A taxa real é a da tua plataforma, e está nas condições dela. Confirma-a. Não uses a minha como se fosse a tua.

**[CENA 6]** Ruben em plano médio. Texto no ecrã: «alavancagem ≠ tamanho ≠ risco · 4 números no painel · fees contam».
**NARRAÇÃO:** Resumo. A alavancagem é a forma como a plataforma pede margem. O tamanho é o valor da posição. O risco é a perda no stop. Não confundas as três. O painel do Aurum Flow mostra a alavancagem útil, o notional, as fees e o risco por operação, e a tua regra é olhar para os quatro antes de carregar em qualquer botão. Na última aula do módulo falamos do que acontece depois de uma perda, de um dia mau, e de como se pára a tempo, antes que um dia mau vire uma semana má.

**Texto no ecrã:** alavancagem ≠ tamanho ≠ risco · 4 números no painel · fees contam
**Pergunta de verificação:** Posição de 500 € numa conta de 1 000 €. A alavancagem útil é alta ou baixa? Resposta: baixa, cerca de uma vez. A posição cabe na conta sem esticar. Exemplo ilustrativo.
**Fecho / CTA da aula:** "Última aula: limite diário e regras de paragem."

## Aula 13.4 — Limite diário, séries de perdas e regras de paragem (≈3 min)
**Gancho (0:00–0:20):** "A pior decisão de uma conta raramente é a primeira perda. É a quarta, depois de uma manhã má, quando decides que «agora é que é»."

**[CENA 1]** Ruben em plano médio. Texto no ecrã: «o dia mau também se planeia».
**NARRAÇÃO:** Última aula do módulo, e talvez a que mais te poupa. Tudo o que vimos até agora trata de operações isoladas. Mas quem perde dinheiro, quase sempre, perde em sequência. Uma perda, depois outra, depois uma terceira, e a cabeça começa a pedir uma recuperação imediata. Essa vontade tem nome: perseguir perdas. E o antídoto não é força de vontade, que se gasta depressa. É uma regra escrita antes de começar o dia. Quem decide o que faz depois de três perdas às dez da manhã já está a decidir com a cabeça em modo de vingança. Por isso, a decisão tem de estar tomada antes.

**[CENA 2]** Gráfico de barras com três barras vermelhas, cada uma marcada «−1 %». Rótulo: exemplo ilustrativo.
**NARRAÇÃO:** Olha para esta série, exemplo ilustrativo. Três perdas de um por cento cada. Na conta de mil euros, são cerca de trinta euros. Dói, mas não é o fim. O problema começa quando a quarta operação sai maior, porque a pessoa quer recuperar depressa. Nesse momento, o risco deixa de estar no um por cento da regra e passa a ser uma aposta de desespero. Ninguém decide isso de propósito. Acontece aos poucos, com a justificação de que «desta vez compensa». A regra de paragem existe para impedir essa passagem, e para que não tenhas de a discutir contigo mesmo no pior momento.

**[CENA 3]** Ruben com o caderno, a escrever três regras de paragem. Texto: «limite diário · série de perdas · paragem é paragem».
**NARRAÇÃO:** Escreve três regras de paragem, com os teus números. A primeira é o limite diário de perda. Por exemplo, e é só um exemplo ilustrativo, dois por cento do saldo num dia: atingiste, fechas a plataforma. A segunda é a série de perdas: três perdas seguidas no mesmo dia, e paras. A terceira é a mais importante: depois de uma paragem, não voltas ao ecrã nesse dia, nem para «ver se o sinal melhorou». Esta é a regra que mais contas salva, porque o mercado não te deve nada e volta sempre amanhã. Os números que escreves são os teus. Os que uso aqui são pequenos de propósito.

**[CENA 4]** Checklist de dois minutos no ecrã: «limite escrito? · série escrita? · máximo de operações? · notícias da janela vistas?».
**NARRAÇÃO:** Antes de cada sessão, faz uma rotina de dois minutos. O limite diário está escrito? A série de perdas está escrita? Sabes quantas operações vais tomar, no máximo? Viste as notícias da janela? Se a resposta a alguma for não, não começas. Repara que esta rotina não diz nada sobre o mercado. Diz tudo sobre ti. É a parte do trading que mais se parece com o ritual de sexta do DCA: regras antes do dinheiro, e não durante. Quem tem esta rotina feita não precisa de ser mais esperto que o mercado. Precisa de ser mais previsível do que a sua própria emoção.

**[CENA 5]** Ecrã com o texto: «Missão do módulo 13: calculadora de tamanho para 5 sinais, em conta simulada de 1 000 €».
**NARRAÇÃO:** Missão do módulo. Escolhe cinco sinais passados do Aurum Flow e faz as contas numa conta simulada de mil euros. Para cada sinal, preenche a calculadora de tamanho: o risco em euros, a distância do stop em percentagem, o tamanho calculado arredondado para baixo, a alavancagem útil que o painel mostra e o custo de fees. Não abras nenhuma posição real para isto. Precisas de fazer a conta cinco vezes, sem saltar nenhuma. Se uma delas te deixar dúvidas, volta à fórmula e não ao instinto. A calculadora não tem opinião. A tua intuição tem, e é por isso que a calculadora vem primeiro.

**[CENA 6]** Ruben em plano próximo, com o aviso no ecrã: «Conteúdo educativo, não é aconselhamento financeiro. O risco de perda é real, e pode ser total.»
**NARRAÇÃO:** Fecho do módulo treze, e do bloco de risco. Um por cento por operação. Tamanho a partir do stop. Alavancagem que o tamanho pede, e nunca a máxima. Limite diário e série de perdas escritos antes do primeiro sinal. Nenhuma destas regras te garante lucro. O que fazem é limitar o que uma má sequência te pode tirar, e isso já é muito. Conteúdo educativo, não é aconselhamento financeiro. O risco de perda é real, e pode ser total. No módulo catorze vemos como executar sem emoção, com o WebTrader, as contas simuladas e o MTM Auto.

**Texto no ecrã:** calculadora de tamanho · missão: 5 sinais · paragem é paragem
**Pergunta de verificação:** Depois de três perdas seguidas no mesmo dia, qual é a regra? Resposta: paras e não voltas ao ecrã nesse dia. A regra foi escrita antes.
**Fecho / CTA da aula:** "Fim do Módulo 13. Próximo: Módulo 14, Executar sem emoção. Botão no ecrã: «Continuar para o Módulo 14»."
