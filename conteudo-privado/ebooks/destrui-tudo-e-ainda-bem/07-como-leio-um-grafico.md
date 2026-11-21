# Como leio um gráfico

> Um gráfico não te diz o que vai acontecer. Diz-te onde é que o preço já esteve, e isso é mais do que a maioria das pessoas olha.

Quem olha pela primeira vez para um gráfico de preços vê velas verdes e vermelhas a subir e a descer, e nada mais. Parece um electrocardiograma sem médico. A maior parte do que se vê é ruído, e o trabalho é separar o ruído do que se repete.

Este capítulo é sobre a ferramenta que mais uso para isso: a regressão de tendência. Não te vou pedir que acredites em nada. Vou explicar a ideia de forma que consigas testá-la tu, no papel, antes de a veres num ecrã com dinheiro envolvido.

## Começar pelo café

Imagina que vais todas as manhãs a um café no Porto e que pagas, em média, 1,20 €. Um dia pagas 1,25 €. No outro, 1,18 €. Numa semana, há um dia em que pagam 1,80 €. Achas estranho, certo? Não é normal. Sabes que o café «costuma» custar 1,20 €, e que os desvios à volta desse valor são pequenos.

Agora imagina que, no mês seguinte, a casa sobe o preço para 1,50 €, e fica aí. Esse novo nível já não é um desvio: é um novo normal. A tua referência tem de mudar. Este exemplo tem as duas ideias que sustentam tudo o resto: existe uma média à volta da qual o preço oscila, e essa média pode mudar.

[[foto: rg-tablet.jpg | Um gráfico é uma conversa entre quem compra e quem vende. Não é uma bola de cristal. | larga]]

## A linha média

Uma regressão linear é uma forma matemática de encontrar a reta que melhor se ajusta a uma série de pontos. Num gráfico de preços, essa reta mostra a direção geral do movimento e funciona como um «centro» à volta do qual o preço oscila.

Não precisas de saber a fórmula para perceber a ideia. Imagina que pões uma régua sobre o gráfico, de forma a que os pontos fiquem mais ou menos equilibrados dos dois lados. A reta que sobra é a linha média.

Para treinar, faz o exercício abaixo. Usa valores hipotéticos, sem qualquer relação com mercados reais.

:::exercicio Calcular a média à mão
Exemplo ilustrativo: dez valores de um produto, em euros, ao longo de dez dias.

| Dia | Valor |
|---|---|
| 1 | 10,00 |
| 2 | 10,20 |
| 3 | 10,10 |
| 4 | 10,40 |
| 5 | 10,30 |
| 6 | 10,60 |
| 7 | 10,50 |
| 8 | 10,70 |
| 9 | 10,60 |
| 10 | 10,90 |

1. Soma os dez valores. Resultado: 104,30 €.
2. Divide por 10. Média: 10,43 €.
3. Marca no gráfico de papel os dez pontos e traça uma reta horizontal em 10,43 €.
4. Repara em quantos pontos ficam acima e quantos abaixo. A reta dá-te a referência, não a previsão.

Dia em que o valor foi mais longe da média: ____________
Quanto estava afastado: ____________
:::

## O elástico

É aqui que a imagem do elástico ajuda. Pensa na linha média como um ponto preso a um elástico. Quando o preço se afasta muito, o elástico estica e puxa-o de volta. Quanto mais se afasta, maior a tensão.

Os analistas de regressão desenham, em geral, duas bandas paralelas à linha, afastadas por um certo múltiplo do desvio padrão. Essas bandas dizem-te quando o afastamento é invulgar. Quando o preço toca numa banda, a pergunta não é «vai voltar?», mas sim «o que é que mudou para ele se afastar tanto?».

:::destaque
A regressão mede o afastamento em relação a um centro. Não mede a razão desse afastamento, e não garante que o preço volta.
:::

Esta distinção é tudo. Um elástico pode ficar esticado durante muito tempo se o chão mudar debaixo dele. No café do exemplo, o preço nunca voltou aos 1,20 €, porque a casa mudou de política. Nos mercados acontece o mesmo: uma notícia económica, uma decisão de um banco central ou uma mudança de humor coletivo podem deslocar a média, e a tua régua fica desatualizada.

:::historia
Caso ilustrativo. Uma pessoa vê o preço afastado da linha e decide que «tem de voltar». Espera, depois espera mais, e a conta cresce contra ela. A linha média não falhou. Quem falhou foi a crença de que a linha é uma promessa.
:::

:::nota
Antes de olhar para o gráfico:
• Tendência de cima: subir, descer ou lado?
• Estou longe ou perto da linha média?
• Há notícias fortes hoje?
:::

## O que faz um scanner

A ideia de um scanner, como o Scanner GoldKiller que temos no TradingView, é automatizar o trabalho repetitivo: aplicar a mesma regra de leitura a todo o gráfico e assinalar quando o preço entra numa zona que essa regra considera invulgar. Poupa-te a fazer as contas à mão, e poupa-te sobretudo a olhar para o gráfico o dia todo. Os detalhes técnicos de cada indicador estão na documentação do produto, e vale a pena lê-los antes de confiares nele.

O que o scanner não faz é decidir por ti. Um alerta é informação, não uma ordem. Antes de qualquer decisão continuas a ter de responder a quatro perguntas: qual é o contexto (há notícias importantes hoje?), qual é o teu plano (onde entras, onde sais se estiveres errado), quanto estás disposto a perder (esse é o capítulo 8) e se estás em condições emocionais de seguir o plano.

:::alerta
Um scanner que assinala muito não é melhor por assinalar muito. Se o sinal aparece sem contexto, lê-lo como garantia é um erro. Nenhuma ferramenta substitui a tua leitura do risco.
:::

:::post @morethanmoney.pt
imagem: Um scanner não decide por ti. Mostra-te onde olhar.
legenda: Ferramentas como o Scanner GoldKiller ajudam a filtrar o ruído. A decisão, o risco e a responsabilidade continuam a ser teus. Conteúdo educativo.
:::

## Ler sem te enganares

Há três erros que vejo repetir-se em quem começa a ler gráficos:

| Erro | O que fazer em vez disso |
|---|---|
| Ver padrões em todo o lado | Definir de antemão o que conta como padrão e quantas vezes o viste |
| Usar a linha como alvo | Usar a linha como referência e definir a saída antes de entrar |
| Mudar a janela temporal até a história encaixar | Escolher um período e manter o mesmo durante semanas |

O último é o mais traiçoeiro. Se mudas o período de análise até encontrares a linha que te dá razão, não estás a ler o gráfico. Estás a fazê-lo confirmar o que já pensavas.

:::destaque
Conteúdo educativo, não é aconselhamento financeiro. Ler gráficos não garante resultados, e o risco de perda é real.
:::

:::cartao Ler um gráfico em 5 passos
1. Gráfico de cima: qual é a tendência?
2. Onde está o preço face à média?
3. O elástico está esticado ou relaxado?
4. Onde ficaria o meu stop?
5. Se não vejo claro, não entro.
:::

## Em resumo

- A regressão de tendência traça uma linha média à volta da qual o preço oscila, e essa média pode mudar.
- As bandas mostram afastamentos invulgares, não garantias de regresso.
- Um scanner automatiza a leitura, mas o alerta é informação e não uma ordem.
- Antes de agir, precisas de contexto, de um plano escrito e de um limite de perda.
- O maior erro é mudar a janela ou a regra até o gráfico confirmar a tua opinião.

[[grafico:regressao-tendencia]]

## A tua missão desta semana

Pega num gráfico de um ativo que te interesse (um par de moedas ou o ouro, em conta de demonstração ou em papel), traça à mão uma linha média para os últimos 20 períodos e escreve, numa folha, quantas vezes o preço ficou acima e quantas abaixo. Não tires conclusões. Limita-te a observar.
