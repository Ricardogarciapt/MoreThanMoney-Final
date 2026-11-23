# Ler o gráfico sem bola de cristal

> O gráfico não te diz o que vai acontecer. Diz-te onde é que outras pessoas já mudaram de ideias.

Há quem olhe para um gráfico como quem lê a sina. Procura um padrão, uma figura, um sinal secreto que diga «agora sobe». Não existe. O que o gráfico te mostra é um registo: onde o preço esteve, onde parou, onde voltou para trás. A partir daí, o teu trabalho é marcar as zonas onde faz sentido agir e definir antecipadamente o que fazes se o preço lá chegar.

Ler um gráfico, no método frio, é desenhar um mapa. Não é adivinhar o destino. E o mapa desenha-se no segundo botão da barra de baixo: **Gráfico**.

## A vela

Já deixaste o gráfico em velas japonesas no capítulo 1. Agora vais perceber porquê. Cada vela mostra um período (um minuto no M1, uma hora no H1) e guarda quatro preços:

[[grafico:anatomia-vela]]

- **Corpo**: entre a abertura e o fecho. Dourado (ou verde, ou azul, conforme as tuas cores) se fechou acima da abertura; escuro (ou vermelho) se fechou abaixo.
- **Pavios**: o máximo e o mínimo a que o preço chegou nesse período.

Um pavio comprido em cima quer dizer que o preço subiu e foi empurrado para baixo antes de a vela fechar. É informação, não profecia.

## No ecrã: o mesmo par em dois tempos

Abre o gráfico do teu par: em **Cotações**, toca no par e escolhe **Gráfico**. Agora repara no que muda quando mudas o período.

:::galeria Mudar o tempo muda a história
mt5-tel-grafico.png | M1: cada vela é um minuto. Muito ruído.
mt5-tel-grafico-velas.png | H1: cada vela é uma hora. A tendência vê-se melhor.
:::

[[grafico:tempos-grafico]]

Para mudar o período, mantém o dedo no gráfico e escolhe M1, M5, M15, M30, H1, H4, D1… No PC, tens os botões na barra de cima.

:::galeria Escolher o período
mt5-tel-periodos.png | Mantém o dedo no gráfico para escolher o período: minutos, horas e dias.
:::

Mais dois gestos que poupam tempo: **arrasta** para a esquerda e para a direita para andares no tempo, e **afasta ou junta dois dedos** para veres mais ou menos velas. A etiqueta colorida à direita marca o preço atual.

:::alerta Erro clássico · Viver no M1
No gráfico de 1 minuto tudo parece uma oportunidade. É o tempo em que se fazem mais operações e se pensa menos. Abre-o só quando já decidiste num tempo maior.
:::

## Tendência: topos e fundos

A forma mais simples de ler a direção é olhar para os topos e os fundos:

| Tendência | Topos | Fundos | O que procuras |
|---|---|---|---|
| **Alta** | cada vez mais altos | cada vez mais altos | compras em correções |
| **Baixa** | cada vez mais baixos | cada vez mais baixos | vendas em subidas |
| **Lateral** | mais ou menos ao mesmo nível | mais ou menos ao mesmo nível | ficar de fora, ou operar os limites com cuidado |

Começa sempre pelo gráfico maior (H4 ou diário) para saber a direção, e só depois desce ao H1 para escolher o momento. Ir contra a direção do gráfico maior é remar contra a maré com um remo de plástico.

:::nota
Primeiro o mapa (H4 ou D1). Depois a rua (H1). Nunca ao contrário.
:::

:::historia A Marta, dia 6
Depois de um turno da noite, a Marta abriu o EURUSD no M1 e viu sete «oportunidades» em vinte minutos. Cada vela verde parecia o início de uma subida, cada vermelha o fim do mundo. Lembrou-se da nota do post-it, mudou para o H4 e ficou a olhar. Em quatro dias, o preço tinha feito três fundos cada vez mais altos. As sete oportunidades do M1 eram só ruído dentro de uma subida tranquila. Fechou a app e foi dormir.
:::

## Suporte e resistência são zonas, não linhas

**Suporte** é uma zona onde o preço tem parado de cair. **Resistência** é uma zona onde tem parado de subir. Desenha-as como faixas, não como linhas finas: o preço raramente respeita um número exato ao pip.

1. No gráfico H4, procura dois ou três sítios onde o preço inverteu mais do que uma vez.
2. Desenha um retângulo que apanhe os pavios e os corpos dessa zona.
3. Repete para cima e para baixo do preço atual. Duas zonas de cada lado chegam.

Quando uma resistência é rompida com força, muitas vezes passa a funcionar como suporte, e vice-versa. Mas «muitas vezes» não é «sempre», e é por isso que o stop existe.

### No ecrã: desenhar a zona

No telemóvel, os desenhos chamam-se **objetos** e estão no ícone das formas, no topo do gráfico.

1. Toca no ícone dos objetos e escolhe **Retângulo**.
2. Toca num canto da zona e arrasta até ao canto oposto.
3. Para afinar, toca no desenho e arrasta os pontos. Para mudar a cor ou apagar, mantém o dedo em cima.
4. Escolhe sempre a mesma cor para suportes e outra para resistências. Daqui a um mês agradeces.

:::galeria Desenhar e afinar
mt5-tel-objetos.png | A lista de objetos desenhados, por par. Daqui editas, escondes ou apagas.
mt5-tel-fibonacci.png | As propriedades de um Fibonacci: pontos, níveis, cor e estilo.
:::

## Fibonacci, sem misticismo

A ferramenta de retração de Fibonacci marca níveis percentuais de uma correção: 38,2 %, 50 % e 61,8 % são os mais usados. A matemática vem da sequência de Fibonacci, mas o motivo pelo qual funciona às vezes é mais simples: muita gente olha para os mesmos níveis.

1. Numa tendência de alta, liga o fundo ao topo do último movimento (no telemóvel: objetos › **Retração de Fibonacci**).
2. O MT5 desenha os níveis. Repara se algum deles coincide com uma zona de suporte que já tinhas desenhado.
3. A coincidência entre zona e nível é um sítio interessante para planear uma entrada. Um nível sozinho, não.

[[foto: mt5-analise-tecnica.jpg | No computador, as ferramentas de Fibonacci estão no menu «Inserir › Objetos › Fibonacci». Vários gráficos e prazos lado a lado: é aqui que o ecrã grande ajuda. Imagem: MetaQuotes (metatrader5.com). | larga]]

:::post @ricardogarciapt
imagem: Desenha o mapa antes de saíres de casa.
legenda: Zonas marcadas ao domingo, plano escrito, ordens pendentes no sítio. Durante a semana, o mercado vem ter contigo. Ou não vem, e também está certo.
:::

## Indicadores: no máximo um

Os indicadores estão no botão ***f*** no topo do gráfico. O MT5 traz dezenas, arrumados por famílias: tendência (médias móveis, bandas), osciladores (RSI, estocástico, MACD), volumes. Podes até pôr vários na mesma janela.

:::galeria O botão f
mt5-tel-indicadores.png | No botão f escolhes o indicador por famílias: tendência, osciladores, volumes.
:::

Saber onde estão não quer dizer usá-los todos.

:::alerta Erro clássico · Encher o gráfico de indicadores
RSI, MACD, três médias móveis, bandas, estocástico. O ecrã fica uma árvore de Natal e a decisão fica mais difícil, não mais fácil, porque há sempre um indicador a dizer que sim e outro a dizer que não. Escolhes o que te dá razão. Isso é viés de confirmação com luzes. No método frio, o gráfico tem velas, zonas e, no máximo, uma ferramenta.
:::

Se quiseres experimentar um, escolhe uma média móvel simples no H4, só para ver a direção. Para tirar um indicador, mantém o dedo em cima dele e escolhe apagar (no PC: botão direito › Lista de indicadores).

## O que os scanners fazem por ti

Na MoreThanMoney usamos scanners que marcam automaticamente zonas, tendência e possíveis entradas. Um scanner não decide por ti: poupa-te tempo a desenhar e ajuda-te a não ver o que não está lá. A regra continua igual: entrada, stop, alvo e lote saem do teu plano. No «Destruí Tudo» explico com detalhe a leitura por regressão de tendência que uso. Aqui fica o essencial: ferramenta boa nas mãos de quem não tem regras continua a ser só uma ferramenta.

## Da minha vida: ler o terreno, não adivinhar

Depois do joelho, fiz cerca de dois anos de contrato na cavalaria e depois a vida civil levou-me a restaurantes, armazéns e logística. Por volta de 2007 estava desempregado e concorri a tudo o que me pudesse devolver uma farda: paraquedistas outra vez, rangers, operações especiais, polícia aérea e fuzileiros. Entrei nos Fuzileiros sem saber nadar.

Ninguém me deu uma bola de cristal para atravessar aquele curso. Deram-me um mapa: provas, horários, pistas, padrões que se repetiam. A pista de lodo e a pista de combate tinham sempre os mesmos sítios onde as pessoas caíam. Quem os conhecia preparava-se para eles. Treinava três vezes por dia e a minha nota de natação passou de 9 para quase 20. Acabei o curso de nove meses, aos 27 anos, em 12.º lugar.

Um gráfico é isso. Não te diz o que vai acontecer. Mostra-te onde é que o terreno já fez as pessoas cair ou levantar-se, e deixa-te decidir antes o que fazes quando lá chegares.

## A regra fria deste capítulo

:::cartao Regra fria n.º 4
Mapa primeiro: direção no H4, momento no H1. Zonas, não linhas. No máximo uma ferramenta no ecrã.
:::

## Em resumo

- O gráfico é um registo de onde o preço mudou de direção, não uma bola de cristal.
- Uma vela guarda quatro preços: abertura, fecho, máximo e mínimo.
- O período muda a história: decide no H4, afina no H1, foge do M1.
- Topos e fundos dizem-te a tendência; suporte e resistência desenham-se como zonas, com os objetos da app.
- Fibonacci vale quando coincide com uma zona; sozinho, não.
- Indicadores no botão *f*: no máximo um.

:::exercicio Para fazer hoje
1. No teu par, abre o H4. Escreve a tendência: alta, baixa ou lateral: ____________
2. Desenha, com os objetos da app, duas zonas de suporte e duas de resistência.
3. Traça um Fibonacci no último movimento e vê se algum nível coincide com uma zona.
4. Muda para o M1 durante um minuto e depois volta ao H4. Escreve o que sentiste em cada um: ____________
5. Tira um print e guarda-o na pasta «Diário». Escreve por baixo: «Se o preço chegar a ____ , o meu plano é ____ ».
:::
