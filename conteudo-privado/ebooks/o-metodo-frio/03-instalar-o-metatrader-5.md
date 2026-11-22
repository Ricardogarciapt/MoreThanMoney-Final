# Instalar o MetaTrader sem tropeçar

> A plataforma não te faz trader. Mas um botão carregado por engano pode fazer-te perder o mês.

O MetaTrader 5 (MT5) é a plataforma onde vais ver gráficos e abrir ordens. É gratuita, existe para telemóvel, computador e browser, e é usada por muitas corretoras no mundo. A app é da MetaQuotes. A conta é da corretora. Esta distinção parece um pormenor e não é: o MT5 é só a janela. O dinheiro, quando existir, está na corretora.

O primeiro objetivo deste capítulo é simples: teres o MetaTrader a funcionar numa **conta demo**, no telemóvel e no computador, e saberes onde está cada coisa, antes de tocares em dinheiro real.

[[foto: rg-telefone.jpg | Grande parte do meu trabalho de análise começa no telemóvel. A regra é a mesma do computador: plano antes, clique depois. | lado]]

## MT4 ou MT5?

Vais ouvir falar das duas. São da mesma empresa, a MetaQuotes, e fazem o essencial da mesma maneira: gráficos, ordens com stop e alvo, histórico.

| | MetaTrader 4 | MetaTrader 5 |
|---|---|---|
| Idade | A versão antiga, ainda muito usada no Forex | A versão atual, com mais mercados |
| Tipos de ordem pendente | 4 | 6 (junta Buy Stop Limit e Sell Stop Limit) |
| Períodos do gráfico | 9 | 21 |
| Calendário económico na app | Não | Sim |

O que importa mesmo: **a conta é de uma plataforma só.** Uma conta MT5 não entra no MT4 e o contrário também não. Quando abres conta, a corretora pergunta qual queres. Neste livro uso o MT5. Se a tua corretora só tem MT4, tudo o que aqui está funciona, só muda o sítio de um ou outro botão.

## No telemóvel: instalar e entrar

1. Abre a **Google Play** (Android) ou a **App Store** (iPhone) e procura «MetaTrader 5» (ou «MetaTrader 4»).
2. Confirma que o programador é a **MetaQuotes**. Há cópias com nomes parecidos. Nunca instales a app a partir de um link enviado por mensagem.
3. Abre a app. Na primeira vez ela oferece logo uma conta demo num servidor da própria MetaQuotes. Serve para espreitar, mas o ideal é a demo da tua corretora, com as mesmas condições da conta real.
4. Vai a **Configurações › Nova conta** (no MT4: **Configurações › Nova conta** ou **Gerir contas › +**) e escreve o nome da corretora.
5. Escolhe o servidor. Os que têm «Demo» no nome são de treino. Os que têm «Live» ou «Real» são de dinheiro a sério.
6. Toca em **Abrir conta demo** e preenche os dados. Ou, se já tens conta, em **Entrar com uma conta existente** e escreve o número da conta, a palavra-passe e o servidor exatamente como vieram no email da corretora.
7. Escolhe um saldo **realista**. Se no mundo real ias começar com 500 €, a demo também é de 500 €.
8. Guarda o número da conta, a palavra-passe e o nome do servidor num sítio seguro, fora do telemóvel.

:::alerta Erro clássico · Treinar com um saldo de fantasia
A demo vem muitas vezes com 10.000 ou 100.000 por defeito. Com esse saldo, um lote de 0,50 parece pequeno e uma perda de 300 parece nada. Depois passas para uma conta real de 500 € com os mesmos hábitos. A demo só te ensina alguma coisa se tiver o tamanho da tua vida.
:::

:::nota Se a palavra-passe não entra
Nove em cada dez vezes o problema é o servidor. «Corretora-Demo» e «Corretora-Live01» são servidores diferentes. Copia o nome do servidor do email, letra a letra.
:::

## No computador: o terminal

O telemóvel chega para acompanhar e para colocar uma ordem preparada. Para analisar com calma, o ecrã grande ajuda. O terminal de PC é a versão completa.

1. Descarrega o terminal **do site da tua corretora** ou do site oficial **metatrader5.com** (MT4: metatrader4.com). Há versão para Windows e para Mac. Nunca de sites de terceiros.
2. Corre o instalador e aceita as opções por defeito. No fim, o terminal abre sozinho.
3. Se abrir uma janela a pedir para abrir conta, fecha-a. Vai a **Ficheiro › Entrar na conta de negociação** (em inglês, *File › Login to Trade Account*) e escreve o número da conta, a palavra-passe e o servidor. A mesma conta funciona no telemóvel e no PC ao mesmo tempo.
4. No canto de baixo, à direita, tem de aparecer a velocidade da ligação (por exemplo «45 ms»). Se aparecer «Sem ligação», o servidor ou a palavra-passe estão errados.

Os nomes dos menus variam um pouco com a língua escolhida no terminal (muitas vezes vem em português do Brasil). Ponho também o nome em inglês quando ajuda.

O ecrã do terminal tem quatro zonas:

| Zona | Onde está | Para que serve |
|---|---|---|
| **Observação do mercado** | À esquerda, em cima | A lista de pares com venda e compra, como as Cotações do telemóvel |
| **Navegador** | À esquerda, em baixo | As tuas contas, os indicadores e os scripts |
| **Gráficos** | Ao centro | Um separador por gráfico aberto |
| **Caixa de ferramentas** | Em baixo | Negociação, Histórico, Diário e Alertas |

Para abrir uma ordem no PC carregas em **F9** (ou no botão **Nova ordem**). A janela é a mesma do telemóvel, com os mesmos campos: tipo, volume, preço, S/L e T/P.

:::cartao Atalhos que poupam cliques
**F9** nova ordem · **Ctrl+M** observação do mercado · **Ctrl+T** caixa de ferramentas · **+ / −** aproximar ou afastar o gráfico · **F8** propriedades do gráfico
:::

## Telemóvel e PC a falar um com o outro

Podes receber no telemóvel os alertas que puseste no PC. Na app, em **Configurações › Mensagens**, encontras o teu **MetaQuotes ID**, um código de oito caracteres. No terminal, vai a **Ferramentas › Opções › Notificações** (*Tools › Options › Notifications*), ativa as notificações push e cola esse código. A partir daí, um alerta de preço criado no PC chega ao telemóvel, mesmo com o computador longe.

Isto é útil para a regra deste livro: deixas a ordem e os alertas preparados no PC e não ficas a olhar para o ecrã.

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
- Uma conta é de uma plataforma só: MT4 ou MT5.
- Instala só a partir da loja oficial, do site da corretora ou do site da MetaQuotes.
- Abre uma demo com um saldo igual ao que usarias na vida real.
- Aprende os cinco separadores: Cotações, Gráfico, Negociação, Histórico e Definições.
- Olha para o capital, não para o saldo, quando tens posições abertas.
- Antes da conta real, as quatro perguntas: regulação, entidade, custos, levantamentos.

:::exercicio Para fazer hoje
1. Instala o MT5 no telemóvel e no computador e abre uma conta demo com um saldo realista: ____________ €
2. Entra com a mesma conta nos dois. Servidor: ____________
3. Adiciona às Cotações o par que escolheste no capítulo 1.
4. Põe o gráfico em velas, H1, sem indicadores. Tira um print e guarda-o numa pasta chamada «Diário».
5. No separador Negociação, escreve o teu saldo, capital e margem livre: ____________
:::
