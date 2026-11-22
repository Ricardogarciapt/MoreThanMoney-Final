# Montar a bancada

> A plataforma não te faz trader. Mas um botão carregado por engano pode fazer-te perder o mês.

Ninguém aprende carpintaria a ler sobre madeira. Primeiro monta-se a bancada, arruma-se cada ferramenta no sítio e só depois se corta a primeira tábua. Neste livro é igual. Antes de falarmos de mercado, de pips ou de ordens, vais ter o MetaTrader instalado numa **conta demo**, no telemóvel e no computador, e vais saber onde está cada botão. A partir daqui, cada capítulo traz uma ideia nova e o ecrã da app onde ela se aplica.

O MetaTrader 5 (MT5) é a plataforma onde vais ver gráficos e abrir ordens. É gratuito, existe para telemóvel, computador e browser, e é usado por muitas corretoras no mundo. A app é da MetaQuotes. A conta é da corretora. Esta distinção parece um pormenor e não é: o MT5 é só a janela. O dinheiro, quando existir, está na corretora.

[[foto: rg-telefone.jpg | Grande parte do meu trabalho de análise começa no telemóvel. A regra é a mesma do computador: plano antes, clique depois. | lado]]

:::historia A Marta, dia 1
A Marta tem 34 anos e trabalha por turnos num hospital. Num intervalo, recebe no WhatsApp uma mensagem de um conhecido de um conhecido: «Instala por este link, é a versão pro do MetaTrader». Quase carregou. Depois lembrou-se de uma frase que tinha lido: a app verdadeira está na loja oficial e o programador chama-se MetaQuotes. Apagou a mensagem e foi à Google Play. Foi a primeira regra fria que cumpriu sem saber que era uma.
:::

*A Marta é uma personagem de exemplo, construída a partir das dúvidas que ouço todas as semanas a quem começa. Vais acompanhá-la até ao fim do livro.*

## MT4 ou MT5?

Vais ouvir falar das duas. São da mesma empresa e fazem o essencial da mesma maneira: gráficos, ordens com stop e alvo, histórico.

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
4. Vai a **Configurações › Nova conta** e escreve o nome da corretora.
5. Escolhe o servidor. Os que têm «Demo» no nome são de treino. Os que têm «Live» ou «Real» são de dinheiro a sério.
6. Toca em **Abrir conta demo** e preenche os dados. Ou, se já tens conta, em **Entrar com uma conta existente** e escreve o número da conta, a palavra-passe e o servidor exatamente como vieram no email da corretora.
7. Escolhe um saldo **realista**. Se no mundo real ias começar com 500 €, a demo também é de 500 €.
8. Guarda o número da conta, a palavra-passe e o nome do servidor num sítio seguro, fora do telemóvel.

:::galeria O primeiro ecrã a visitar
mt5-tel-conta.png | Em Configurações: a conta, Nova conta, as notícias, o calendário (Tradays) e as definições dos gráficos.
:::

:::alerta Erro clássico · Treinar com um saldo de fantasia
A demo vem muitas vezes com 10.000 ou 100.000 por defeito. Com esse saldo, um lote de 0,50 parece pequeno e uma perda de 300 parece nada. Depois passas para uma conta real de 500 € com os mesmos hábitos. A demo só te ensina alguma coisa se tiver o tamanho da tua vida.
:::

:::nota Se a palavra-passe não entra
Nove em cada dez vezes o problema é o servidor. «Corretora-Demo» e «Corretora-Live01» são servidores diferentes. Copia o nome do servidor do email, letra a letra.
:::

:::historia A Marta, dia 1, à noite
A demo abriu com 100 000 por defeito. A Marta apagou-a e abriu outra com 500 €, o dinheiro que um dia admite usar. A palavra-passe não entrou à primeira: tinha escolhido o servidor «Live». Trocou para «Demo» e entrou. Escreveu os três dados num caderno que já tem na capa «O meu método».
:::

## A barra de baixo: cinco botões

Tudo no MT5 do telemóvel começa na barra de baixo. Aprende os cinco botões pela ordem em que os vais usar neste livro:

[[foto: mt5-tel-trio.png | Cotações, gráfico e janela de ordem: os três ecrãs onde vais passar quase todo o tempo. Capturas reais da app, numa conta de exemplo. | larga]]

| Botão | Para que serve | Onde o aprofundamos |
|---|---|---|
| **Cotações** (setas) | A lista de pares, com o preço de venda e o de compra | Capítulo 2 |
| **Gráfico** (velas) | O gráfico do par escolhido, com períodos, indicadores e desenhos | Capítulo 4 |
| **Negociação** (linha) | As posições abertas, o saldo, o capital e a margem | Capítulo 6 |
| **Histórico** (relógio) | O que já fechou: é daqui que sai o diário | Capítulo 9 |
| **Configurações** (roda dentada) | Contas, mensagens, notícias, calendário e definições | Este capítulo e o 7 |

:::nota Se te perderes
Toca em Cotações. É o ponto de partida de quase tudo, como a porta de casa.
:::

## Arrumar o gráfico antes de o usares

Uma bancada desarrumada faz-te pegar na ferramenta errada. Antes de abrires um único gráfico, vai a **Configurações › Gráficos** e deixa-o assim:

- **Velas japonesas** (não linhas nem barras), porque mostram abertura, fecho, máximo e mínimo de cada período. No capítulo 4 aprendes a lê-las.
- **Linha Ask** ligada, para veres o preço de compra e, a olho, o spread.
- **Contagem para o fecho da vela** ligada, para não decidires a meio de uma vela.
- **Nenhum indicador**, por agora. Sim, nenhum. No capítulo 4 explico porquê.
- **Um esquema de cores** escolhido uma vez. Depois não mexas mais.

:::galeria Menos ruído, mais leitura
mt5-tel-definicoes-grafico.png | Configurações › Gráficos: velas japonesas e o que aparece no ecrã.
mt5-tel-cores.png | As cores de cada parte do gráfico. Escolhe um esquema e esquece o assunto.
:::

:::post @ricardogarciapt
imagem: Gráfico limpo. Cabeça limpa.
legenda: Doze indicadores no ecrã não te dão doze confirmações. Dão-te doze desculpas. Começa com velas e duas zonas desenhadas à mão.
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
| **Caixa de ferramentas** | Em baixo | Negociação, Histórico, Diário, Alertas e Calendário |

:::cartao Atalhos que poupam cliques
**F9** nova ordem · **Ctrl+M** observação do mercado · **Ctrl+T** caixa de ferramentas · **+ / −** aproximar ou afastar o gráfico · **F8** propriedades do gráfico
:::

## Telemóvel e PC a falar um com o outro

Podes receber no telemóvel os alertas que puseste no PC. Na app, em **Configurações › Mensagens**, encontras o teu **MetaQuotes ID**, um código de oito caracteres. No terminal, vai a **Ferramentas › Opções › Notificações** (*Tools › Options › Notifications*), ativa as notificações push e cola esse código. Para testar, carrega em **Testar**: a mensagem tem de chegar ao telemóvel em segundos.

Faz isto hoje, mesmo que ainda não percebas para que serve. No capítulo 7 vais usar estes alertas para deixares de olhar para o ecrã à espera que o preço chegue.

## A regra fria deste capítulo

:::cartao Regra fria n.º 1
A demo tem o tamanho da minha vida real. O mesmo saldo, os mesmos lotes, as mesmas horas. Se não é a sério na demo, não vai ser a sério na real.
:::

## Em resumo

- O MT5 é a janela; a conta e o dinheiro estão na corretora.
- Uma conta é de uma plataforma só: MT4 ou MT5.
- Instala só a partir da loja oficial, do site da corretora ou do site da MetaQuotes.
- Abre uma demo com um saldo igual ao que usarias na vida real.
- Cinco botões: Cotações, Gráfico, Negociação, Histórico e Configurações.
- Gráfico arrumado antes de usado: velas, linha Ask, nenhum indicador.
- Telemóvel e PC ligados pelo MetaQuotes ID.

:::exercicio Para fazer hoje
1. Instala o MT5 no telemóvel e no computador e abre uma conta demo com um saldo realista: ____________ €
2. Entra com a mesma conta nos dois. Servidor: ____________
3. Em Configurações › Gráficos, põe velas japonesas, linha Ask e nenhum indicador.
4. Liga o PC ao telemóvel com o MetaQuotes ID e faz o teste da notificação.
5. Cria uma pasta chamada «Diário». No capítulo 9 vais perceber porquê.
:::
