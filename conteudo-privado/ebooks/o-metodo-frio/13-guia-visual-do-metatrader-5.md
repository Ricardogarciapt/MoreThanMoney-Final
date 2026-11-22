# Guia visual do MetaTrader 5

> Pôr a app ao lado do livro e seguir com o dedo. Ninguém aprende a nadar a ler sobre a água.

Os capítulos explicam o porquê. Este guia mostra o onde. Juntei aqui, por temas, os ecrãs do MetaTrader 5 no telemóvel que vais usar todos os dias: da conta demo à confirmação de uma ordem. São capturas reais da app, numa conta de exemplo e com os dados da conta desfocados. Os números que lá aparecem (lotes, preços, saldos) são do exemplo, não são recomendação.

Abre a tua demo, pousa o telemóvel ao lado do livro e faz cada passo à medida que lês.

[[foto: mt5-tel-trio.png | Cotações, gráfico e janela de ordem: os três ecrãs onde vais passar quase todo o tempo. | larga]]

## 1. A barra de baixo: cinco botões

Tudo no MT5 do telemóvel começa na barra de baixo. Da esquerda para a direita:

| Botão | Para que serve |
|---|---|
| **Cotações** (setas) | A lista de pares, com o preço de venda e o de compra |
| **Gráfico** (velas) | O gráfico do par escolhido |
| **Negociação** (linha) | As posições abertas, o saldo, o capital e a margem |
| **Histórico** (relógio) | O que já fechou: é daqui que sai o diário |
| **Configurações** (roda dentada) | Contas, notícias, calendário e definições |

:::nota Se te perderes
Toca em Cotações. É o ponto de partida de quase tudo, como a porta de casa.
:::

## 2. Configurações: abrir a conta demo

:::galeria O primeiro ecrã a visitar
mt5-tel-conta.png | Em Configurações: Nova conta, notícias, calendário (Tradays) e gráficos.
:::

1. Toca em **Configurações** e depois em **Nova conta**.
2. Procura a corretora pelo nome e escolhe o servidor **demo**.
3. Escolhe um saldo realista, igual ao dinheiro que um dia vais mesmo usar. Treinar com 100 000 € quando vais começar com 500 € ensina-te os reflexos errados.
4. Guarda o número da conta e a palavra-passe fora do telemóvel.

Neste ecrã também ficam as **Notícias** e o calendário económico (**Tradays**), que usamos no capítulo 7.

## 3. Cotações: ler o preço

:::galeria Cada linha é um par
mt5-tel-cotacoes.png | Venda à esquerda, compra à direita. Por baixo, o mínimo (L) e o máximo (H) do dia.
:::

Em cada linha tens:

- **O par** (EURUSD, GBPCAD…) e, por cima, a variação do dia em pontos e em percentagem.
- **A hora do último preço** e, ao lado, o **spread** em pontos: a diferença entre comprar e vender.
- **Dois preços grandes.** O da esquerda é o preço a que vendes (Bid) e o da direita é o preço a que compras (Ask).
- **L e H**: o mínimo e o máximo do dia.

:::cartao Vermelho não é perder
As cores só dizem se o último preço desceu (vermelho) ou subiu (azul) em relação ao anterior. Não têm nada a ver com a tua conta.
:::

Para abrir uma ordem ou um gráfico, toca no par e escolhe a opção no menu que aparece.

### Acrescentar um par à lista

:::galeria Procurar pelo nome
mt5-tel-procurar-simbolo.png | Toca no «+» em Cotações e escreve o nome do par. Os ativos vêm arrumados por grupos: Forex, matérias-primas, índices e cripto.
:::

Mantém a lista curta. Os pares do teu plano e pouco mais. Uma lista com quarenta linhas convida a procurar oportunidades em vez de esperar pelas tuas.

## 4. O gráfico: o mesmo par em dois tempos

:::galeria Mudar o tempo muda a história
mt5-tel-grafico.png | M1: cada vela é um minuto. Muito ruído.
mt5-tel-grafico-velas.png | H1: cada vela é uma hora. A tendência vê-se melhor.
:::

- **Mudar o período:** toca no gráfico e escolhe M1, M5, M15, M30, H1, H4, D1… No método frio decides primeiro no H1 ou no H4 e só depois afinas a entrada num tempo menor (capítulo 5).
- **A linha do preço:** a etiqueta colorida à direita marca o preço atual.
- **Indicadores:** o botão *f* no topo. Põe um, no máximo dois.
- **Objetos:** linhas, zonas e Fibonacci também estão no topo. Desenha as tuas zonas antes de pensar em entrar.

:::galeria Período e indicadores
mt5-tel-periodos.png | Mantém o dedo no gráfico para escolher o período: minutos, horas e dias.
mt5-tel-indicadores.png | No botão f escolhes o indicador por famílias: tendência, osciladores, volumes.
:::

:::galeria Desenhar e afinar
mt5-tel-objetos.png | A lista de objetos desenhados, por par. Daqui editas, escondes ou apagas.
mt5-tel-fibonacci.png | As propriedades de um Fibonacci: pontos, níveis, cor e estilo.
:::

### Pôr o gráfico a teu gosto

:::galeria Menos ruído, mais leitura
mt5-tel-definicoes-grafico.png | Em Configurações › Gráficos escolhes velas japonesas e o que aparece no ecrã.
mt5-tel-cores.png | As cores de cada parte do gráfico. Escolhe um esquema e não mexas mais.
:::

Liga só o que usas. A linha Ask ajuda a ver o preço de compra. A contagem para o fecho da vela ajuda a não decidir a meio de uma vela. O resto pode ficar desligado.

:::alerta Erro clássico · Viver no M1
No gráfico de 1 minuto tudo parece uma oportunidade. É o tempo em que se fazem mais operações e se pensa menos. Abre-o só quando já decidiste num tempo maior.
:::

## 5. A ordem pendente, passo a passo

Este é o ecrã que mais conta. Repara que a app deixa preencher tudo **antes** de carregares no botão.

:::galeria Do tipo de ordem ao botão
mt5-tel-ordem-mercado.png | 1. Escolhe o tipo (aqui, Sell Limit), o volume em lotes e o preço.
mt5-tel-grafico-sltp.png | 2. Ativa o S/L: a linha aparece no gráfico com a perda em dinheiro.
:::

:::galeria Confirmar sem pressa
mt5-tel-ordem.png | 3. Confere volume, preço e S/L. Só depois tocas em «Colocar».
mt5-tel-ordem-executada.png | 4. «Feito»: o número da ordem, o preço e o stop.
:::

1. Em **Cotações**, toca no par e escolhe **Nova ordem**.
2. No topo escolhe o tipo: **Execução a mercado**, **Buy Limit**, **Sell Limit**, **Buy Stop** ou **Sell Stop** (o capítulo 4 explica quando usar cada um).
3. Em **Volume**, escreve o lote que calculaste no capítulo 6. Não o que «parece bem».
4. Em **Preço**, escreve o preço do teu plano.
5. Ativa **S/L** e **T/P** e escreve os preços. Por baixo do campo tens três maneiras de os ver: **Preço**, **Pips** e **USD** (ou a moeda da tua conta). Usa USD para veres quanto perdes se o stop for tocado.
6. Lê tudo outra vez e toca em **Colocar**.
7. Espera pelo **Feito**. Vai a **Negociação** e confirma que a ordem lá está com o stop.

:::nota O ecrã que te protege
No passo 2 a app mostra a perda em dinheiro antes de confirmares. Se esse valor te faz engolir em seco, o lote está grande demais. Volta ao capítulo 6.
:::

## 6. Mapa rápido: onde está cada coisa

| Quero… | Onde toco |
|---|---|
| Ver preços | Cotações |
| Abrir uma ordem | Cotações › par › Nova ordem |
| Mudar o tempo do gráfico | Gráfico › tocar no ecrã › período |
| Pôr um indicador | Gráfico › *f* |
| Desenhar uma zona ou Fibonacci | Gráfico › objetos |
| Ver posições e margem | Negociação |
| Ver o que já fechou | Histórico |
| Calendário económico | Configurações › Tradays |
| Abrir outra conta demo | Configurações › Nova conta |

## 7. Os erros de ecrã que custam dinheiro

:::alerta Erro clássico · A vírgula no lote
Querias 0,10 e escreveste 1,0. No telemóvel isto acontece com um dedo mais gordo. Antes de colocar, lê o volume em voz alta.
:::

:::galeria O seletor de lotes
mt5-tel-ordem-lotes.png | Ao tocar no volume abre-se um seletor com botões de −0,10 a +0,10. Confirma o número grande antes de fechar.
:::

:::alerta Erro clássico · Trocar Limit por Stop
Buy Limit compra mais **barato** do que o preço atual. Buy Stop compra mais **caro**. Troca-os e entras exatamente no sítio errado.
:::

:::alerta Erro clássico · Stop em pips quando querias preço
O campo do S/L muda conforme escolhes Preço, Pips ou USD. Confirma o separador antes de escrever o número.
:::

## A regra fria deste guia

Nenhuma ordem sai sem passares por estes três ecrãs: o gráfico no teu tempo de decisão, a janela de ordem com S/L preenchido e a confirmação em Negociação. Se faltar um, não houve ordem fria.

*Conteúdo educativo. Capturas reais da app MetaTrader 5, numa conta de exemplo e com os dados da conta desfocados. Os valores mostrados não são recomendação. Negociar Forex e CFD com alavancagem envolve risco elevado de perda.*
