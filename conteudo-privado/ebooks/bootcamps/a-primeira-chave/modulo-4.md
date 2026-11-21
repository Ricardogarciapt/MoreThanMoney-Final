# Módulo 4 — A tua chave: carteiras e seed phrase (≈17 min)
**Objetivo:** perceber a diferença entre custódia própria e de terceiros, guardar a seed phrase sem a expor e montar um plano de cópia de segurança.  **No fim, o aluno consegue:** 1) distinguir carteira quente de carteira fria e explicar quando cada uma faz sentido; 2) explicar o que é a seed phrase e as regras que nunca se quebram; 3) montar um plano de guarda com duas cópias em locais separados.

## Aula 4.1 — Carteiras quentes e frias (≈4–5 min)
**Gancho (0:00–0:20):** "A carteira não guarda moedas. Nunca guardou. Guarda chaves. E quem tem a chave tem o dinheiro."

**[CENA 1]** Animação de uma carteira aberta, de onde sai uma chave dourada. Por trás, a blockchain aparece como uma grelha de páginas, e a chave aponta para uma delas.
**NARRAÇÃO:** Vamos fazer uma correção logo à partida, porque é a confusão mais comum. Uma carteira de criptomoedas não é um cofre com moedas dentro. As moedas vivem na blockchain, no caderno partilhado de que falámos no módulo 1. A carteira guarda as chaves que permitem assinar operações, e são essas chaves que dão acesso ao valor. Quem percebe isto muda a forma como pensa sobre segurança, porque deixa de procurar o sítio onde estão as moedas e passa a procurar o sítio onde estão as chaves. Pensa numa analogia do quotidiano: o número do cartão do banco não te dá dinheiro, mas quem o tiver e souber o código pode gastar. Com cripto, a chave faz esse papel, só que sem balcão nem serviço de reclamações.

**[CENA 2]** Uma chave dourada em destaque sobre fundo carvão. A frase aparece devagar: «Em cripto, quem tem a chave tem o dinheiro.»
**NARRAÇÃO:** É por isso que a metáfora deste bootcamp é a chave. Em cripto, quem tem a chave tem o dinheiro. Não há um gerente a quem pedir reposição, nem um balcão onde explicar que perdeste o cartão. Se a chave se perde, o acesso perde-se. Se a chave é roubada, o valor também. Isto pode parecer duro, mas é exatamente o que dá sentido à expressão «ser dono do teu dinheiro». Ser dono também quer dizer ser responsável.

**[CENA 3]** Um ecrã de telemóvel com uma aplicação aberta, e um cadeado pequeno a piscar no canto. Legenda: «carteira quente».
**NARRAÇÃO:** Existem dois grandes tipos de carteira. O primeiro é a carteira quente. É uma aplicação ou um programa ligado à internet. É cómoda, rápida, e serve para operações do dia a dia. O risco é que, por estar ligada, está mais exposta: a um telemóvel infetado, a um site falso, a uma aplicação copiada que parece igual à original. A comodidade e a exposição andam sempre juntas. Uma aplicação bem feita não é por isso insegura, mas exige que confirmes sempre de onde a descarregaste.

**[CENA 4]** Um dispositivo físico, pequeno, a ser ligado a um computador com um cabo. Ao lado, um ecrã no próprio aparelho pede confirmação. Legenda: «carteira fria».
**NARRAÇÃO:** O segundo é a carteira fria. É um dispositivo físico, muitas vezes do tamanho de uma pen, que guarda as chaves offline. Para assinar uma operação, tens de a ligar e confirmar no próprio aparelho. Um exemplo comercial conhecido é a Ledger, que existe na loja MTM. A vantagem é que a chave não sai do dispositivo. A desvantagem é que é menos prática, e se a perderes sem cópia de segurança, o problema continua. Já lá vamos.

**[CENA 5]** Gráfico animado `tipos-carteira`: duas colunas comparadas em barras. «Comodidade», «exposição», «uso diário», «guarda de longo prazo». Cada barra cresce até ao seu lugar.
**NARRAÇÃO:** Vamos com uma comparação simples. A carteira quente é como ter dinheiro na carteira de bolso: está à mão, serve para o café. A carteira fria é como ter um cofre em casa, com uma chave que só tu usas, para as poupanças. Nenhuma das duas é a resposta universal. Depende de quanto tens, com que frequência mexes, e quanto risco estás disposto a assumir. O gráfico mostra o trade-off: quanto mais comodidade, mais exposição. Não é uma tabela de qualidade. Uma carteira fria não é melhor em todas as situações; é melhor para certas situações.

**[CENA 6]** Ruben a apontar para uma regra escrita numa placa: «valor pequeno, uso frequente → quente. Valor parado → fria.»
**NARRAÇÃO:** Há uma regra prática que deves guardar. Valores pequenos e de uso frequente podem viver numa carteira quente. Valores que não mexes durante meses merecem uma fria. E nenhuma carteira te protege de um erro teu, como enviar para o endereço errado, ou assinar algo que não compreendeste. A segurança técnica não substitui a atenção. Antes de confirmares qualquer operação, lê o que estás a confirmar. Repara também que uma carteira fria não te livra de burlas. Se alguém te convencer a assinar uma operação maliciosa no próprio aparelho, a tecnologia está lá, mas quem decide és tu.

**[CENA 7]** Caso ilustrativo: o Tiago, o programador de Braga, a olhar para o telemóvel com uma mensagem de «conta recuperada» no ecrã.
**NARRAÇÃO:** Atenção: o endereço da carteira é público, como um número de conta. Pode ser partilhado para receber. Mas a chave privada e a frase de recuperação nunca. Caso ilustrativo: o Tiago tinha quase tudo numa aplicação de telemóvel. Um dia perdeu o aparelho. Conseguiu recuperar a conta porque tinha a frase de recuperação guardada, mas passou um fim de semana inteiro a tratar disso. Ficou a saber que a comodidade tem um preço, e que o preço se paga em tempo, em stress e em atenção.

**Texto no ecrã:** chave · carteira quente · carteira fria · endereço público · chave privada nunca
**Fecho / CTA da aula:** Exercício: faz uma lista de onde tens, ou pensas ter, cripto. Para cada sítio, escreve se é uma carteira quente, uma carteira fria, ou uma plataforma que guarda por ti. Pergunta de verificação: porque é que a carteira não é o sítio onde as moedas estão, e o que é que ela guarda então?

## Aula 4.2 — A seed phrase: as palavras que valem tudo (≈4–5 min)
**Gancho (0:00–0:20):** "Doze ou vinte e quatro palavras, por uma ordem certa. Quem as tiver, tem o dinheiro. Ninguém mais precisa de ti para nada."

**[CENA 1]** Uma grelha de doze caixas numeradas, a preencher-se palavra a palavra, com a legenda «seed phrase».
**NARRAÇÃO:** Quando crias uma carteira, a aplicação ou o dispositivo gera uma frase de recuperação. Chama-se seed phrase, ou frase semente. Normalmente tem doze ou vinte e quatro palavras, em ordem específica. Essa frase é, na prática, a chave-mestra da tua carteira. Não é uma senha que podes mudar quando quiseres. É a própria origem das chaves, e quem a tem consegue recriar a carteira em qualquer lado. Pensa nela como a combinação de um cofre e não como a porta: quem a sabe abre o cofre de qualquer sítio, a qualquer hora, e não deixa um rasto que alguém consiga seguir a tempo. Repara também que a frase é gerada uma vez, no momento da criação. Por isso, é o momento em que tens de estar mais atento.

**[CENA 2]** Um telemóvel perdido numa mesa, e ao lado uma folha de papel com as palavras escritas à mão. Uma seta mostra que a carteira reaparece num computador novo.
**NARRAÇÃO:** Porque é que é tão importante? Porque, se perderes o telemóvel, se a aplicação falhar, se o dispositivo avariar, podes recriar a carteira noutro sítio só com essas palavras. Sem elas, não há recuperação. E com elas, quem as tiver consegue fazer tudo o que tu fazes. Não precisa da tua palavra-passe, nem do teu código, nem de ti. Esta é a diferença que mais gente não percebe.

**[CENA 3]** Um ecrã com quatro regras numeradas a aparecer uma a uma, com um ícone de proibido ao lado de cada uma.
**NARRAÇÃO:** Por isso, há regras que se cumprem sempre. Não há exceções. Primeira regra: nunca introduzas a seed phrase num site. Nem para verificar, nem para recuperar, nem para desbloquear. Nenhuma plataforma séria, nenhum suporte legítimo, nenhuma aplicação oficial te vai pedir essas palavras. Segunda regra: nunca a envies a ninguém, por mensagem, email, chamada ou fotografia. Se alguém se apresentar como suporte e pedir a frase, é burla. Ponto final.

**[CENA 4]** Ecrã de um telemóvel com uma chamada a aparecer, e um nome genérico: «Suporte». Por baixo, a frase: «Confirme as palavras para validar a sua conta.»
**NARRAÇÃO:** Terceira regra: nunca a fotografes, nem a guardes no telemóvel, no computador, no email, num bloco de notas, ou numa nuvem. Qualquer cópia digital é uma cópia que pode ser roubada, e muitas vezes sem que dês por isso. Quarta regra: escreve à mão, em papel, com caneta. E nunca no mesmo sítio onde guardas o cartão do banco ou as tuas palavras-passe.

**[CENA 5]** Exemplo ilustrativo: a Inês ao telefone, com uma folha de notas em cima da mesa e um ponto de interrogação a crescer no ecrã.
**NARRAÇÃO:** Parece exagero? Pensa nisto. A maioria das pessoas que perdem cripto não perdem por causa do mercado. Perdem porque deram as palavras a alguém que lhes ligou a dizer que era do suporte. Exemplo ilustrativo: a Inês recebeu uma chamada de um número que dizia pertencer a uma plataforma. A pessoa do outro lado era simpática, tinha um tom profissional e pediu-lhe as palavras «para confirmar a identidade». Ela desligou. Depois percebeu que tinha estado a um passo de perder tudo, e que a pressa fazia parte do esquema.

**[CENA 6]** Três palavras-chave em destaque, uma a uma: «urgência», «autoridade», «pedido de palavras». Por baixo, a legenda: «sempre o mesmo guião».
**NARRAÇÃO:** Repara no padrão. Urgência, autoridade, pedido de palavras. É sempre o mesmo guião, e muda apenas o nome da plataforma e o tom da voz. Quando sentires a pressão a subir, para. Ninguém legítimo precisa de ti com essa pressa. Nenhuma mensagem, nenhum vídeo e nenhuma chamada que comece com urgência é uma boa razão para desbloquear fosse o que fosse. A pressa é a ferramenta preferida de quem quer o teu dinheiro antes de tu pensares. E se a chamada te obriga a decidir já, a resposta é desligar e ligar tu para o número oficial. Vamos ver todos os padrões de burla no módulo 5.

**[CENA 7]** Ruben com uma folha limpa à frente, a escrever as palavras uma a uma, com o número ao lado de cada uma, e depois a conferir com o dedo.
**NARRAÇÃO:** Vamos ao procedimento correto para guardar. Abre uma folha limpa, escreve as palavras uma a uma, com o número ao lado, e confirma duas vezes. Depois guarda a folha num sítio seco e seguro. Não a dobres demasiado, porque papel e humidade não se dão bem. Se alguma vez escreveres uma palavra errada, não tentes adivinhar a correção no ecrã de ninguém. Recomeça a folha com calma, em casa, sem ninguém a apressar-te. E não a mostres nem a fotografes, nem sequer para te lembrares de uma palavra. Se algum dia precisares de recuperar, usas só a aplicação oficial, descarregada das lojas oficiais, e nunca um link que te enviaram.

**Texto no ecrã:** seed phrase · doze ou vinte e quatro palavras · nunca no ecrã, nunca em mensagem · papel e caneta
**Fecho / CTA da aula:** Exercício: sem olhar para nenhuma frase real, escreve numa folha as quatro regras de ouro, e depois confere se as escreveste todas. Pergunta de verificação: se alguém te pede a seed phrase para «resolver um problema», o que é que essa pessoa pode fazer com ela?

## Aula 4.3 — Not your keys, not your coins (≈4–5 min)
**Gancho (0:00–0:20):** "Deixar cripto numa plataforma é parecido com deixar dinheiro num banco. É cómodo. Mas quem tem a chave?"

**[CENA 1]** Frase em destaque, a dourado sobre carvão: «not your keys, not your coins». Por baixo, a tradução: «se não tens as chaves, não tens as moedas».
**NARRAÇÃO:** Há uma frase que os veteranos repetem: not your keys, not your coins. Em português, quer dizer: se não tens as chaves, não tens as moedas. Vamos perceber o que isso significa, sem dramatizar, porque a frase não quer dizer que deixar cripto numa plataforma seja automaticamente um erro. Quer dizer que tens de saber o que estás a aceitar quando o fazes.

**[CENA 2]** Ilustração de uma plataforma como um grande cofre com muitas gavetas. Cada gaveta tem um nome de utilizador. Uma delas está marcada: «o teu saldo».
**NARRAÇÃO:** Quando compras cripto numa plataforma e a deixas lá, a plataforma guarda as chaves por ti. Chama-se a isto custódia de terceiros. É a forma mais cómoda. Recuperas a palavra-passe se a esqueceres, vês o saldo no ecrã, e podes vender com um clique. Para muita gente, esta comodidade é exatamente o que procura, e não há mal nisso, desde que a escolha seja consciente.

**[CENA 3]** Uma linha entre duas caixas: «plataforma» e «tu». A linha fica fina e tremeluzente, com um ícone de alerta.
**NARRAÇÃO:** O preço dessa comodidade é que passas a depender da plataforma. Se a plataforma tiver um problema técnico, se for atacada, se for mal gerida, ou se deixar de operar, o teu acesso pode ficar bloqueado. Em alguns casos, o dinheiro pode não voltar. Não é o cenário mais comum, mas é exatamente o que a palavra custódia significa: alguém guarda aquilo que é teu, e tens de confiar nessa guarda. Pensa num banco tradicional: o dinheiro está em teu nome, mas é o banco que tem os sistemas, e confias que os mantém seguros. Com cripto é parecido, só que a regulação e os direitos de recuperação variam muito de caso para caso.

**[CENA 4]** Ecrã dividido: à esquerda, uma carteira própria com uma chave na mão de quem a usa. À direita, um cofre de plataforma com um cadeado que não é o teu.
**NARRAÇÃO:** E também há o contrário. Uma carteira própria, sem custódia, dá-te controlo total. Mas se perdes a chave, perdes tudo, e não há ninguém a quem pedir ajuda. O risco passa de quem te guarda para ti próprio. Repara que a palavra recuperar pode ter dois sentidos: recuperar a conta, quando esqueceste a palavra-passe, e recuperar o dinheiro, quando algo corre mal. O primeiro é normal. O segundo depende de quem guarda e das regras que aceitaste ao registar-te. Não existe, em abstrato, uma escolha certa. Existe a escolha certa para o teu caso, para o teu valor, para a tua forma de lidar com a tecnologia.

**[CENA 5]** Gráfico simples: uma barra grande, marcada «operações», sobre uma barra pequena, marcada «poupança parada». Uma seta indica a divisão.
**NARRAÇÃO:** Muita gente faz uma solução híbrida. Deixa na plataforma o valor que usa para negociar, e leva para uma carteira fria o valor que quer guardar durante meses. Não é a única forma de fazer, mas é uma forma razoável de separar o que mexe do que descansa. E separar é, muitas vezes, a melhor proteção que existe. Não te esqueças do essencial: separar não é fugir. Quem separa tem um plano para cada parte, e isso é o que distingue a gestão da improvisação.

**[CENA 6]** Uma regra escrita num quadro: «quanto mais valor e menos uso → mais controlo próprio. Quanto menos valor e mais uso → plataforma regulada, com suporte.»
**NARRAÇÃO:** Vamos a uma regra prática. Quanto mais valor tens, menos tempo de espera aceitas, e maior é a necessidade de controlo próprio. Quanto menos valor e mais uso, mais faz sentido estar numa plataforma regulada, com suporte e com recuperação de conta. Ninguém te obriga a escolher um extremo. Podes andar pelo meio, desde que saibas em que ponto estás. Antes de deixares valor em qualquer sítio, lê os termos de custódia, procura quem é responsável e como se recupera uma conta. Se não encontras essa informação, é mais uma pergunta que deves fazer antes de avançar.

**[CENA 7]** Caso ilustrativo: o Rui, o professor de Leiria, a olhar para um caderno onde escreveu uma lista de passos, com um visto a cada um.
**NARRAÇÃO:** Caso ilustrativo: o Rui, o professor de Leiria, tinha tudo numa plataforma e nunca tinha pensado nisso. Quando percebeu a diferença, não mudou tudo de um dia para o outro. Não se trata de ser melhor ou pior. Trata-se de saber onde estão as tuas responsabilidades. Começou por passar a parte que não mexia para uma carteira fria, e manteve o resto onde estava para as operações. Fez a mudança com calma, e registou cada passo. Demorou algumas semanas, e disse que foi o melhor investimento de tempo que fez em cripto.

**Texto no ecrã:** custódia de terceiros · carteira própria · separar o que mexe do que descansa · plataforma regulada
**Fecho / CTA da aula:** Exercício: pega na lista que fizeste na aula 4.1 e marca, para cada valor, se está em custódia de terceiros ou se tens as chaves. Depois responde: se a plataforma onde está esse valor ficasse indisponível amanhã, quanto tempo levaria até perceberes o que estava a acontecer? Pergunta de verificação: o que é que muda na tua vida se a plataforma onde guardas cripto deixar de funcionar amanhã?

## Aula 4.4 — O plano de guarda: cópias que sobrevivem (≈4–5 min)
**Gancho (0:00–0:20):** "Um papel molhado não lê. Uma foto roubada não protege. Como é que se guarda uma chave durante vinte anos?"

**[CENA 1]** Três ícones animados em fila: uma chama, uma gota de água, um relógio com a legenda «anos». Cada um atravessa a cópia de segurança sem a destruir.
**NARRAÇÃO:** Chegámos à última aula do módulo, e ao plano que vais montar. A ideia central é esta: a cópia de segurança tem de sobreviver a três coisas. Fogo, água e o teu próprio esquecimento. Parece uma lista exagerada, mas é a lista de problemas que mais gente reporta quando perde o acesso. Um bom plano pensa nestes três riscos desde o início, e não quando já é tarde.

**[CENA 2]** Uma placa de metal a rodar lentamente, com as palavras gravadas. Legenda: «Cryptotag Zeus, existe na loja MTM».
**NARRAÇÃO:** Papel é barato e serve para começar. Mas papel degrada-se, com humidade, com o tempo, com um café derramado. Por isso, muitas pessoas usam placas de metal, com as palavras gravadas ou estampadas. Um produto que existe na loja MTM é o Cryptotag Zeus, uma placa de metal para registar a seed. Não é o único método, e não é obrigatório. É uma forma de ter uma cópia que não se estraga com facilidade, e isso já é muito.

**[CENA 3]** Um plano de quatro passos a aparecer num quadro: «1. quantas cópias», «2. onde», «3. quem sabe», «4. testar».
**NARRAÇÃO:** Vamos construir o plano em quatro passos. Primeiro, decide quantas cópias queres. Duas é o mínimo razoável. Uma cópia só significa que, se se perder, perdes tudo. E se a cópia de papel e a de metal estiverem no mesmo sítio, não estás a fazer duas cópias. Estás a fazer uma, duas vezes. Mais do que três complica a gestão e aumenta a exposição. Duas cópias bem guardadas são, para a maioria das pessoas, o equilíbrio certo entre segurança e simplicidade.

**[CENA 4]** Mapa simples de uma casa e de um local exterior, com duas cópias marcadas em sítios diferentes. Uma seta pontilhada liga os dois sítios.
**NARRAÇÃO:** Segundo, escolhe locais diferentes. Se as duas cópias estão na mesma gaveta, um incêndio ou um assalto leva as duas. Pensa em casa, e num sítio de confiança fora dela, com acesso seguro e discreto. O objetivo não é esconder, é dispersar o risco. Uma cópia que sobrevive a um problema em casa é uma cópia que te salva.

**[CENA 5]** Duas pessoas num ecrã com um cadeado entre elas. A do lado esquerdo tem um envelope fechado. A do lado direito não tem nada na mão.
**NARRAÇÃO:** Terceiro, decide quem sabe o quê. Ninguém precisa de saber a frase. Basta que alguém de confiança saiba que existe um plano, e onde estão as cópias, para o caso de algo te acontecer. Essa pessoa não precisa de ter as palavras. Se tiver, passa a ser mais um ponto de falha, e mais um sítio onde a frase pode ser copiada sem que tu saibas.

**[CENA 6]** Um ecrã de teste: uma carteira vazia, uma frase a ser introduzida, e um visto verde a aparecer quando a carteira recupera com sucesso.
**NARRAÇÃO:** Quarto, testa a recuperação. Esta é a parte que quase ninguém faz, e é a mais importante. Com um valor zero ou irrelevante, numa aplicação oficial, tenta recriar a carteira só com a frase escrita. Se conseguires, a cópia funciona. Se não conseguires, descobriste o problema agora, e não quando precisares de verdade. Um teste falhado hoje é uma lição barata. Um teste que se descobre falhado daqui a dez anos é uma perda. Repete o teste sempre que mudares de carteira ou de aplicação, e pelo menos uma vez por ano, porque as aplicações mudam e a memória também.

**[CENA 7]** Caso ilustrativo: a Inês com uma placa de metal numa mão e uma folha de papel dobrada na outra, numa mesa de madeira.
**NARRAÇÃO:** Caso ilustrativo: a Inês gravou a frase numa placa de metal, guardou uma segunda cópia em papel num cofre de um familiar, e fez o teste de recuperação com um valor simbólico numa carteira de teste. Demorou uma tarde. Para ela, foi a tarde mais útil do ano em matéria de cripto. Não porque tenha ganho alguma coisa, mas porque deixou de depender da sorte. Repara que o plano não exige nada de técnico. Exige método e disciplina. A Inês não teve de ser especialista. Teve de ter um plano e de o cumprir.

**[CENA 8]** Ruben a fechar um caderno, com a frase «a chave tem de funcionar antes de a usares a sério» a aparecer no canto.
**NARRAÇÃO:** A ideia que quero que leves daqui é que os quatro passos têm um objetivo comum: que a tua chave continue a existir quando tu já não estiveres atento a ela. Uma chave que só funciona na tua cabeça não é uma chave. É uma esperança. E a esperança não é um plano de segurança. Pensa nisto como um seguro: não gostas de pagar, mas nunca o vês como desperdício no dia em que precisas dele.

**Texto no ecrã:** duas cópias · locais diferentes · quem sabe o quê · testar a recuperação
**Fecho / CTA da aula:** Exercício final do módulo: escreve o teu plano em cinco linhas. Quantas cópias, onde ficam, quem sabe que existem, quando fazes o teste, e o que fazes se o teste falhar. Guarda essa folha junto da checklist do módulo 3. Pergunta de verificação: se a tua cópia em papel estivesse encharcada hoje, o que farias para não perder o acesso?

**Missão do módulo 4:** esta semana, faz o teste de recuperação com um valor zero ou irrelevante, numa aplicação oficial, e escreve o resultado. Se não conseguiste recuperar, não avances para o módulo 5 sem resolver o problema. A chave tem de funcionar antes de a usares a sério.
