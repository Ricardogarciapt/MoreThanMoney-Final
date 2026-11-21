# O caderno que ninguém apaga

> Uma blockchain é um caderno que toda a aldeia lê e ninguém consegue rasgar sozinho.

Imagina uma aldeia pequena onde toda a gente se conhece. Há um caderno na praça onde se regista quem deve o quê. Quando o padeiro vende pão a crédito ao ferreiro, escreve-se a linha: «ferreiro deve 5 € ao padeiro». Durante anos, o caderno fica nas mãos do merceeiro, que toma conta dele. O problema é óbvio: e se o merceeiro for desonesto e rasgar as páginas que não lhe convêm?

A solução da aldeia é simples. Em vez de um único caderno guardado por uma pessoa, há uma cópia em casa de cada família. Quando alguém escreve uma linha nova, todas as cópias são atualizadas. Para fazer batota, seria preciso alterar a maioria das cópias ao mesmo tempo, o que é muito mais difícil do que rasgar uma só.

Esta é a intuição por trás da blockchain. É um registo partilhado, copiado por muitos computadores, onde as transações ficam organizadas em blocos ligados uns aos outros.

[[grafico:blockchain-caderno]]

## O que é um bloco

Cada bloco é uma página do caderno. Tem um conjunto de transações (quem enviou o quê a quem), uma marca temporal e uma impressão digital da página anterior, a que se chama hash. Essa impressão digital liga um bloco ao anterior. Se alguém mudar uma vírgula numa página antiga, a impressão digital muda e a ligação com as páginas seguintes parte-se. A rede inteira deteta a incoerência.

Não precisas de saber fazer contas para perceber a ideia. Basta imaginar páginas coladas umas às outras com uma cola que se estraga se alguém mexer num pormenor.

A impressão digital, o hash, funciona como um selo de cera que só serve para aquela carta. Se a carta for aberta e fechada de novo com um texto diferente, o selo deixa de coincidir. Não precisas de saber como o hash é calculado para perceber que ele é sensível a qualquer alteração, por menor que seja. É esta sensibilidade que faz o caderno ser difícil de falsificar.

:::destaque
Na blockchain não se confia numa pessoa. Confia-se nas regras e no número de cópias independentes do registo.
:::

:::post @morethanmoney.pt
imagem: Um caderno que ninguém apaga.
legenda: É isto uma blockchain. Sem jargão, sem magia: um registo público que milhares de computadores guardam ao mesmo tempo. Quem te disser que é mais complicado do que isto quer vender-te alguma coisa.
:::

## Como se chega a acordo, com mineração e proof-of-stake

Se toda a gente pudesse escrever páginas ao mesmo tempo, o caderno ficaria confuso. É preciso uma regra para decidir quem escreve a próxima página e quem a valida. Há duas formas principais de o fazer.

**Proof-of-work (prova de trabalho).** É a forma usada pelo Bitcoin. Os participantes, chamados mineradores, competem para resolver um problema matemático difícil. Quem o resolve primeiro escreve o bloco e recebe uma recompensa. A ideia é que alterar o passado seria tão caro em energia e equipamento que não compensaria. O custo é real e consome muita eletricidade.

**Proof-of-stake (prova de participação).** É a forma usada pelo Ethereum desde setembro de 2022, num momento chamado The Merge. Em vez de gastar energia em cálculos, quem quer validar blocos bloqueia uma quantidade da própria moeda como garantia. Se validar mal, pode perder essa garantia. A lógica é que quem tem muito a perder tem razões para se portar bem.

As duas formas procuram o mesmo objetivo: ninguém decide sozinho o que é verdade no caderno.

## Porque é que isto interessa a quem começa

A blockchain explica porque é que as transações de cripto são, em regra, irreversíveis. Se enviares dinheiro para o endereço errado, não há banco que anule a operação. Não há atendimento ao cliente que faça uma devolução. Esta característica é uma vantagem para quem não quer censura, mas é um perigo para quem se engana ou é enganado.

:::alerta
Uma transação enviada numa blockchain pública não pode ser revertida. Antes de confirmares, confere o endereço, a rede e o valor. Duas vezes, se for preciso.
:::

:::ecra Carteira · Confirmar envio (exemplo)
Para: 0x7a...f3 (endereço de exemplo)
Rede: escolhe a rede antes de enviar
Valor: 50,00 €
Taxa de rede (exemplo): 0,40 €
Estado: aguarda confirmação
:::

:::historia
Caso ilustrativo: a Inês, a mesma enfermeira de Coimbra do primeiro capítulo, quis enviar 50 € em cripto a uma amiga. Copiou o endereço, mas copiou só metade, porque o telemóvel cortou a linha. Só percebeu quando já tinha confirmado. Não havia ninguém a quem pedir a devolução. Não foi um drama, foi uma lição: a liberdade da blockchain exige cuidado humano.
:::

:::conversa WhatsApp · Amiga (exemplo)
Amiga: Já me mandaste os 50?
eu: Mandei. Mas copiei mal o endereço, que linha estúpida.
Amiga: E agora?
eu: Agora não há volta a dar. Por isso confere sempre duas vezes.
:::

## Exercício com papel e lápis

:::exercicio Um registo de três blocos
1. Numa folha, desenha três quadrados ligados por setas. Cada quadrado é um bloco.
2. Dentro de cada quadrado, escreve uma transação imaginária entre duas pessoas da tua família.
3. Num dos quadrados do meio, muda um valor. Pergunta-te que quadrados ficam «suspeitos» depois disso.
4. Escreve, numa frase, porque é que a cópia partilhada torna a fraude mais difícil.

____________________________________________________________

____________________________________________________________
:::

:::cartao Antes de confirmar qualquer envio
- Confere o endereço, letra a letra, e não só o início e o fim.
- Confirma a rede. Se a rede errada, o dinheiro pode nunca chegar.
- Confere o valor e a taxa. Não confies só no que o botão diz.
:::

## Em resumo

- Uma blockchain é um registo partilhado, organizado em blocos ligados entre si.
- Alterar um bloco antigo obriga a alterar todos os seguintes, o que é difícil e visível.
- O Bitcoin usa proof-of-work (mineração); o Ethereum passou a proof-of-stake em setembro de 2022.
- As transações em blockchains públicas são, em regra, irreversíveis.
- A segurança começa por ti: confirma sempre endereço, rede e valor.

## Para fazer hoje

1. Escolhe uma transação real que já fizeste (uma transferência, um pagamento) e pergunta-te quem a poderia anular.
2. Compara a resposta com a forma como a blockchain funciona. A diferença vai ficar-te na memória.
3. Guarda no telemóvel uma nota com as três perguntas do cartão acima, para as leres antes de qualquer envio.
