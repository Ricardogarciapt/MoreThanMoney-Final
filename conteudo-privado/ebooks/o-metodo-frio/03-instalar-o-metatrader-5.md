# Instalar o MetaTrader 5 sem tropeçar

> A plataforma não te faz trader. Mas um botão carregado por engano pode fazer-te perder o mês.

O MetaTrader 5 (MT5) é a plataforma onde vais ver gráficos e abrir ordens. É gratuita, existe para telemóvel, computador e browser, e é usada por muitas corretoras no mundo. A app é da MetaQuotes. A conta é da corretora. Esta distinção parece um pormenor e não é: o MT5 é só a janela. O dinheiro, quando existir, está na corretora.

O primeiro objetivo deste capítulo é simples: teres o MT5 a funcionar numa **conta demo** e saberes onde está cada coisa, antes de tocares em dinheiro real.

[[foto: rg-telefone.jpg | Grande parte do meu trabalho de análise começa no telemóvel. A regra é a mesma do computador: plano antes, clique depois. | lado]]

## Passo a passo no telemóvel

1. Instala a app **MetaTrader 5** na App Store ou no Google Play. Confirma que o programador é a MetaQuotes.
2. Abre a app e escolhe **Abrir conta demo** (ou «Gerir contas» e depois o «+»).
3. Procura o servidor da tua corretora. Se ainda não tens corretora, há servidores de demonstração na própria lista.
4. Preenche os dados da conta demo e escolhe um saldo **realista**. Se no mundo real ias começar com 500 €, a demo também é de 500 €. Treinar com 100.000 fictícios ensina-te a ser descuidado.
5. Guarda o número da conta e a palavra-passe num sítio seguro.

:::alerta Erro clássico · Treinar com um saldo de fantasia
A demo vem muitas vezes com 10.000 ou 100.000 por defeito. Com esse saldo, um lote de 0,50 parece pequeno e uma perda de 300 parece nada. Depois passas para uma conta real de 500 € com os mesmos hábitos. A demo só te ensina alguma coisa se tiver o tamanho da tua vida.
:::

## Os cinco separadores que importam

A app tem cinco separadores no fundo do ecrã. Aprende-os pela ordem em que os vais usar:

| Separador | Para que serve |
|---|---|
| **Cotações** | A lista de pares. Toca num para ver detalhes ou abrir uma ordem. |
| **Gráfico** | O gráfico do par escolhido, com velas, timeframes e ferramentas de desenho. |
| **Negociação** | O saldo, o capital, a margem e as posições abertas. |
| **Histórico** | Todas as operações fechadas, com resultado. É a matéria-prima do teu diário. |
| **Mensagens / Definições** | Notificações, contas e preferências. |

[[foto: mt5-android-negociacao.jpg | O separador de negociação e o histórico no MetaTrader 5 para Android e tablet. É aqui que vês saldo, capital e margem. Imagem: MetaQuotes (metatrader5.com). | larga]]

*Os ecrãs reais da app, organizados por temas, estão no **Guia visual do MetaTrader 5**, no fim do livro.*


Numa conta demo acabada de abrir com 500 €, o separador «Negociação» mostra saldo 500,00 €, capital 500,00 €, margem 0,00 € e margem livre 500,00 € (valores ilustrativos).

**Saldo** é o dinheiro sem contar com posições abertas. **Capital** (equity) é o saldo mais ou menos o que as posições abertas estão a ganhar ou a perder. Quando tens uma operação aberta, olha sempre para o capital: é esse o número real.

## Arrumar o gráfico (menos é mais)

Toca no gráfico e põe-no assim:

- **Velas** (não linhas nem barras), porque mostram abertura, fecho, máximo e mínimo de cada período.
- **Timeframe** de trabalho: começa no H1 (uma vela por hora) e usa o H4 ou o D1 para ver a direção maior.
- **Nenhum indicador**, por agora. Sim, nenhum. No capítulo 5 explico porquê.
- **Linha do preço de compra** visível, para perceberes o spread a olho.

:::post @ricardogarciapt
imagem: Gráfico limpo. Cabeça limpa.
legenda: Doze indicadores no ecrã não te dão doze confirmações. Dão-te doze desculpas. Começa com velas e duas zonas desenhadas à mão.
:::

## Corretora: as quatro perguntas antes de abrir conta

Quando passares da demo para a conta real (e só passas no capítulo 11), faz estas quatro perguntas:

1. **Quem me regula?** Procura a entidade e o número de licença no site do regulador, não só no site da corretora.
2. **Que entidade fica com a minha conta?** Muitos grupos têm várias entidades em países diferentes, com regras diferentes.
3. **Quanto custa?** Spread típico, comissões, swap, custos de levantamento.
4. **Consigo levantar?** Lê as regras de levantamento antes de depositar.

:::nota
A conta tem de estar sempre em meu nome. Se alguém me pede acesso, palavra-passe ou «procuração» para operar por mim, a conversa acaba ali.
:::

## A regra fria deste capítulo

:::cartao Regra fria n.º 3
A demo tem o tamanho da minha vida real. O mesmo saldo, os mesmos lotes, as mesmas horas. Se não é a sério na demo, não vai ser a sério na real.
:::

## Em resumo

- O MT5 é a janela; a conta e o dinheiro estão na corretora.
- Abre uma demo com um saldo igual ao que usarias na vida real.
- Aprende os cinco separadores: Cotações, Gráfico, Negociação, Histórico e Definições.
- Olha para o capital, não para o saldo, quando tens posições abertas.
- Antes da conta real, as quatro perguntas: regulação, entidade, custos, levantamentos.

:::exercicio Para fazer hoje
1. Instala o MT5 e abre uma conta demo com um saldo realista: ____________ €
2. Adiciona às Cotações o par que escolheste no capítulo 1.
3. Põe o gráfico em velas, H1, sem indicadores. Tira um print e guarda-o numa pasta chamada «Diário».
4. No separador Negociação, escreve o teu saldo, capital e margem livre: ____________
:::
