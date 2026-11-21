# Risco: o colete

> Não se controla o que o mercado faz. Controla-se quanto de ti fica exposto a cada decisão.

Há um tipo de colete que ninguém quer vestir, porque não é bonito e não promete nada. É o colete que aguenta o impacto quando tudo o resto falha. Na gestão de risco, o colete é a regra que te impede de sair do jogo depois de uma série má.

É muito comum ver quem começa a dedicar horas a encontrar a entrada perfeita e cinco minutos a decidir o tamanho da posição. Esse é o erro. O tamanho da posição é a decisão que mais pesa na tua conta, e é a que mais se ignora.

:::destaque
Antes de perguntares quanto podes ganhar, pergunta quanto estás disposto a perder numa única operação, e escreve o número.
:::

## A regra do 1%

A regra que defendo nesta casa é simples: não arriscar mais de 1% do capital numa mesma operação. Parece conservadora. É. E é precisamente por isso que aguenta.

Exemplo ilustrativo, com valores redondos e conta em dólares para simplificar: uma conta de 2 000 $. Um 1% são 20 $. Isso significa que, se a operação correr mal e atingir o stop-loss, perdes 20 $ e nada mais. Não 200 $, não «o que faltava para recuperar».

[[foto: rg-cerebro.jpg | O risco gere-se aqui, antes de chegar ao botão de comprar. | polaroid]]

## A fórmula do tamanho da posição

O tamanho da posição liga três coisas: o risco que aceitas, a distância do stop e o valor de cada pip. A fórmula é esta:

**Tamanho (em lotes) = Risco em dinheiro ÷ (Distância do stop em pips × Valor do pip por lote)**

Vamos por partes, com o exemplo da conta de 2 000 $:

| Passo | Cálculo | Resultado |
|---|---|---|
| 1. Risco em dinheiro | 1% de 2 000 $ | 20 $ |
| 2. Distância do stop | Definida antes de entrares, por exemplo | 25 pips em EUR/USD |
| 3. Valor do pip por lote standard | Em EUR/USD, com conta em dólares | cerca de 10 $ |
| 4. Valor de risco por lote | 25 pips × 10 $ | 250 $ |
| 5. Tamanho da posição | 20 $ ÷ 250 $ | 0,08 lotes |

Ou seja, 0,08 lotes, que é o mesmo que 8 microlotes (cada microlote é 0,01 de lote). Confirma a conta: se o preço atingir o stop de 25 pips, a perda é 25 × (0,08 × 10 $) = 25 × 0,80 $ = 20 $. Bate certo com o risco que definiste.

:::alerta
Se o stop for mais largo, o tamanho da posição tem de ser menor, não maior. Muita gente faz o contrário: aperta o stop para caber num lote grande. Isso põe a conta à mercê do primeiro ruído do mercado.
:::

Nota honesta: o valor do pip de um par depende da moeda da conta e do câmbio do dia. Com conta em euros, o número muda. Por isso, antes de usares a fórmula, confirma na corretora o valor do pip para o instrumento que estás a usar. No ouro, a convenção de pip e de tamanho do contrato também varia de corretora para corretora.

:::exercicio Calcula a tua posição
1. Escreve o valor da tua conta (pode ser um valor hipotético): ____________
2. Calcula 1% desse valor. Risco em dinheiro: ____________
3. Define a distância do stop, em pips, antes de olhares para o preço: ____________
4. Confirma na corretora o valor do pip por lote para o instrumento: ____________
5. Aplica a fórmula: risco ÷ (pips × valor do pip). Tamanho: ____________ lotes
6. Faz a prova: pips × valor do pip × tamanho deve dar o teu risco em dinheiro. Confirmou? ____
:::

:::ecra Calculadora de posição (exemplo ilustrativo)
Saldo da conta: 1.000 $
Risco por operação: 1 % = 10 $
Distância ao stop: 50 pips
Valor por pip (0,01 lote): ≈ 0,10 $
Lote máximo: 0,02
:::

## Risco e retorno: a conta do equilíbrio

Outra ideia que muda a forma como vês uma operação é a relação entre o risco e o retorno esperado. Se arriscas 1 para ganhar 2, a operação é 1:2. Parece uma regra de sorte, mas é só matemática.

Quando sabes quanto arriscas e quanto podes ganhar, há uma taxa de acerto mínima para estares no zero, antes de custos. A fórmula é 1 ÷ (1 + R), em que R é o rácio de retorno.

| Relação risco:retorno | Taxa de acerto de equilíbrio (antes de custos) |
|---|---|
| 1:1 | 50% |
| 1:2 | 33,3% |
| 1:3 | 25% |

A leitura da tabela é esta: com 1:2, precisas de acertar em cerca de um terço das operações para não perder dinheiro, sem contar spreads nem comissões. Com 1:1, precisas de acertar metade. Os custos sobem sempre esse limiar, e é por isso que ignorar o spread é um erro tão caro.

[[grafico:winrate-rr]]

Repara que estes números não são uma previsão de ninguém. São uma conta de equilíbrio. Dizem-te o mínimo que precisas para não perder, e mais nada.

## Sequências de perdas são normais

Este é o ponto onde a maioria desiste. Uma sequência de perdas não significa que o sistema está partido, nem que tu és mau a isto. Significa que a probabilidade fez o seu trabalho.

Imagina uma conta de 1 000 € que perde dez operações seguidas. O que acontece depende do risco por operação:

| Risco por operação | Capital após 10 perdas seguidas |
|---|---|
| 1% | cerca de 904 € |
| 2% | cerca de 817 € |
| 5% | cerca de 599 € |
| 10% | cerca de 349 € |

Exemplo ilustrativo, hipotético. A tabela mostra o que a regra faz: com 1%, uma série muito má tira-te cerca de 10% do capital. Com 10%, tira-te dois terços. A mesma sequência, com dois comportamentos completamente diferentes.

[[grafico:risco-sequencias]]

Agora uma pergunta que costumo fazer a quem começa: quantas sequências de perdas são prováveis? Pensa numa moeda ao ar, com 50% de hipóteses para cada lado. Se lançares a moeda 100 vezes, a probabilidade de aparecer pelo menos uma sequência de cinco ou mais «perdas» (caras, no exemplo) é de cerca de 81%. Não é um azar raro. É o esperado.

[[grafico:sequencia-perdas]]

:::destaque
Uma sequência de perdas não é prova de que o plano está errado. Antes de a julgares, tens de saber se a dimensão da perda cabia no risco que tinhas definido.
:::

:::historia
Caso ilustrativo. Um operador tem uma semana de cinco perdas. Em vez de parar, aumenta o lote na sexta-feira para «recuperar tudo de uma vez». A sexta-feira acaba pior do que a semana inteira. O plano não falhou na sexta. Falhou no momento em que o tamanho da posição deixou de seguir a regra.
:::

:::cartao Regras do colete
- Nunca mais de 1 % por operação.
- Stop definido antes de entrar.
- Duas perdas seguidas: paro o dia.
- Perdi 5 % na semana: paro a semana.
- Nunca mexer no stop para longe.
:::

## Como fica o colete no dia a dia

Três regras simples que te ajudam a manter o colete vestido:

- Definir o risco em dinheiro e o stop antes de entrares. Nunca depois.
- Nunca aumentar o tamanho da posição para recuperar uma perda.
- Quando a perda diária atingir o limite que escreveste, fechar o ecrã. O limite diário é o capítulo 9.

:::story
Qual destas regras é a que mais te custa cumprir?
sticker: Stop antes de entrar | Parar depois de 2 perdas
:::

## Em resumo

- Antes de tudo, decide quanto estás disposto a perder numa operação.
- Na regra do 1%, numa conta de 2 000 $, o risco é 20 $, e o tamanho depende da distância do stop.
- A fórmula é risco ÷ (pips × valor do pip). Confirma sempre o valor do pip na corretora.
- Com 1:2, a taxa de acerto de equilíbrio é de cerca de 33%, antes de custos.
- Sequências de perdas são normais. A diferença está no risco que deixaste aceitar.

## A tua missão desta semana

Escreve a tua regra de risco numa folha: o valor do teu risco por operação, a forma de calcular o tamanho da posição e o limite de perda diária. Assina, data e guarda-a onde a vejas antes de cada operação.

:::destaque
Conteúdo educativo, não é aconselhamento financeiro. Os exemplos são hipotéticos e não são previsão de resultados. O risco de perda é real, e pode perder parte ou a totalidade do capital.
:::
