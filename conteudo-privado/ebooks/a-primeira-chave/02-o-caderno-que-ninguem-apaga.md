# O caderno que ninguém apaga

> Uma blockchain é um caderno que toda a aldeia lê e ninguém consegue rasgar sozinho.

Imagina uma aldeia pequena onde toda a gente se conhece. Há um caderno na praça, onde se regista quem deve o quê. Quando o padeiro vende pão a crédito ao ferreiro, escreve-se a linha: «ferreiro deve 5 € ao padeiro». Durante anos, o caderno está nas mãos do merceeiro, que toma conta dele. O problema é óbvio: e se o merceeiro for desonesto e rasgar as páginas que não lhe convêm?

A solução da aldeia é simples. Em vez de um único caderno guardado por uma pessoa, há uma cópia do caderno em casa de cada família. Quando alguém escreve uma nova linha, todas as cópias são atualizadas. Para batota, seria preciso alterar a maioria das cópias ao mesmo tempo, o que é muito mais difícil do que rasgar uma só.

Esta é a intuição por trás da blockchain. É um registo partilhado, distribuído por muitos computadores, onde as transações ficam organizadas em blocos ligados uns aos outros.

[[grafico:blockchain-caderno]]

## O que é um bloco

Cada bloco é uma página do caderno. Tem um conjunto de transações (quem enviou o quê a quem), uma marca temporal e uma impressão digital da página anterior, chamada hash. Essa impressão digital liga um bloco ao anterior. Se alguém mudar uma vírgula numa página antiga, a impressão digital muda, e a ligação com as páginas seguintes parte-se. Toda a rede deteta a incoerência.

Não precisas de saber fazer contas para perceber a ideia. Basta que as páginas estejam coladas umas às outras por uma cola que se estraga se alguém mexer num pormenor.

:::destaque
Na blockchain, não se confia numa pessoa. Confia-se nas regras e na quantidade de cópias independentes do registo.
:::

## Como se chega a acordo: mineração e proof-of-stake

Se toda a gente pudesse escrever páginas ao mesmo tempo, o caderno ficaria confuso. Precisa de haver uma regra para decidir quem escreve a próxima página e quem a valida. Há duas formas principais de o fazer.

**Proof-of-work (prova de trabalho).** É a forma usada pelo Bitcoin. Os participantes, chamados mineradores, competem a resolver um problema matemático difícil. Quem o resolve primeiro escreve o bloco e recebe uma recompensa. A ideia é que alterar o passado seria tão caro em energia e equipamento que não compensaria. O custo é real: consome muita eletricidade.

**Proof-of-stake (prova de participação).** É a forma usada pelo Ethereum desde setembro de 2022, num momento chamado The Merge. Em vez de gastar energia em cálculos, quem quer validar blocos bloqueia uma quantidade da própria moeda como garantia. Se validar mal, pode perder essa garantia. A lógica é que quem tem muito a perder tem razões para se portar bem.

Repara que as duas formas procuram o mesmo objetivo: ninguém decide sozinho o que é verdade no caderno.

## E porque é que isto interessa a um iniciante?

Porque a blockchain explica porque é que as transações de cripto são, em regra, irreversíveis. Se enviares dinheiro para o endereço errado, não há um banco que possa anular a operação. Não há atendimento ao cliente que possa «devolver» aquilo. Esta característica é uma vantagem para quem não quer censura, mas é um perigo para quem se engana ou é enganado.

:::alerta
Uma transação enviada numa blockchain pública não pode ser revertida. Antes de confirmares, confere o endereço, a rede e o valor. Duas vezes, se for preciso.
:::

## Uma história pequena

:::historia
Caso ilustrativo: a Inês, 29 anos, enfermeira em Coimbra, quis enviar 50 € em cripto a uma amiga. Copiou o endereço, mas copiou só metade, porque o telemóvel cortou a linha. Só percebeu quando já tinha confirmado. Não havia ninguém a quem pedir a devolução. Esta história não é um drama, é uma lição: a liberdade da blockchain exige cuidado humano.
:::

## Exercício: escreve o teu próprio caderno

:::exercicio Um registo de três linhas
1. Numa folha, desenha três quadrados ligados por setas. Cada quadrado é um bloco.
2. Dentro de cada quadrado, escreve uma transação imaginária entre duas pessoas da tua família.
3. Num dos quadrados do meio, muda um valor. Pergunta-te: que quadrados ficam «suspeitos» depois disso?
4. Escreve, em uma frase, porque é que a cópia partilhada torna a fraude mais difícil.

____________________________________________________________

____________________________________________________________
:::

## Em resumo

- Uma blockchain é um registo partilhado, organizado em blocos ligados entre si.
- Alterar um bloco antigo obriga a alterar todos os seguintes, o que é difícil e visível.
- O Bitcoin usa proof-of-work (mineração); o Ethereum passou a proof-of-stake em setembro de 2022.
- As transações em blockchains públicas são, em regra, irreversíveis.
- A segurança começa por ti: confirma sempre endereço, rede e valor.

## A tua missão desta semana

Escolhe uma transação real que já fizeste (uma transferência, um pagamento) e pergunta-te quem a pode anular. Depois compara com a forma como a blockchain funciona. A diferença vai ficar-te na memória.
