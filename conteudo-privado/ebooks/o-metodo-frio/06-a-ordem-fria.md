# A ordem fria

> O clique é a parte mais fácil. O difícil é tudo o que decides antes dele.

Há um momento em que o polegar fica por cima do botão «Comprar» e o coração acelera. Se nesse momento ainda estás a decidir onde fica o stop, já perdeste o controlo da operação. A ordem fria é aquela em que, quando o polegar chega ao botão, já está tudo escrito: entrada, stop, alvo e lote. O clique é só a assinatura.

Repara no caminho que fizeste até aqui. Montaste a bancada (capítulo 1), aprendeste a ler as Cotações (2), sabes quanto vale um pip no teu volume (3), desenhaste o mapa no gráfico (4) e calculaste o lote pelo risco (5). Este capítulo junta tudo num só ecrã: a janela de ordem.

## Os tipos de ordem no MT5

| Tipo | O que faz | Quando usar |
|---|---|---|
| **Execução a mercado** | Compra ou vende já, ao preço atual | Quando o preço está na tua zona e o plano diz «entra» |
| **Buy Limit** | Compra se o preço **descer** até ao teu nível | Esperar uma correção para comprar mais barato |
| **Sell Limit** | Vende se o preço **subir** até ao teu nível | Esperar uma subida para vender mais caro |
| **Buy Stop** | Compra se o preço **subir** acima do teu nível | Entrar quando o preço rompe uma resistência |
| **Sell Stop** | Vende se o preço **descer** abaixo do teu nível | Entrar quando o preço rompe um suporte |

[[grafico:limit-stop]]

As ordens pendentes (limit e stop) têm uma vantagem enorme para quem trabalha: deixas a ordem no sítio certo e vais à tua vida. O preço vem ter contigo ou não vem, e as duas coisas estão bem.

[[grafico:fluxo-operacao]]

## O stop-loss e o take-profit

O **stop-loss (SL)** é o preço onde a operação fecha sozinha se correr mal. O **take-profit (TP)** é o preço onde fecha sozinha se correr bem.

- O stop põe-se onde a tua ideia **deixa de fazer sentido**. Se compras porque o preço está num suporte, o stop vai abaixo desse suporte, não «20 pips porque sim».
- O alvo põe-se onde há uma razão para o preço parar: a próxima resistência, a próxima zona.
- Os dois definem-se **antes** de entrar.

:::alerta Erro clássico · Entrar sem stop «só por um bocadinho»
«Abro já e ponho o stop depois.» O depois nunca chega a tempo. O preço anda 30 pips contra ti num minuto de notícias, e agora pôr o stop significa aceitar uma perda que não estava planeada. Então não pões. Esperas. É assim que uma operação de 10 € de risco se transforma numa de 200. Nenhuma ordem sai sem stop. Nenhuma.
:::

## No ecrã: a ordem pendente, passo a passo

Este é o ecrã que mais conta no livro inteiro. Repara que a app deixa preencher tudo **antes** de carregares no botão.

:::galeria Do tipo de ordem ao botão
mt5-tel-ordem-mercado.png | 1. Escolhe o tipo (aqui, Sell Limit), o volume em lotes e o preço.
mt5-tel-grafico-sltp.png | 2. Ativa o S/L: a linha aparece no gráfico com a perda em dinheiro.
:::

:::galeria Confirmar sem pressa
mt5-tel-ordem.png | 3. Confere volume, preço e S/L. Só depois tocas em «Colocar».
mt5-tel-ordem-executada.png | 4. «Feito»: o número da ordem, o preço e o stop.
:::

1. Em **Cotações**, toca no par e escolhe **Nova ordem**.
2. No topo escolhe o tipo: **Execução a mercado**, **Buy Limit**, **Sell Limit**, **Buy Stop** ou **Sell Stop**.
3. Em **Volume**, escreve o lote que calculaste no capítulo 5. Não o que «parece bem».
4. Em **Preço**, escreve o preço do teu plano.
5. Ativa **S/L** e **T/P** e escreve os preços. Por baixo do campo tens três maneiras de os ver: **Preço**, **Pips** e **USD** (ou a moeda da tua conta). Usa a vista em dinheiro para confirmares que perdes exatamente o teu risco se o stop for tocado.
6. Lê tudo outra vez e toca em **Colocar**.
7. Espera pelo **Feito**. Vai a **Negociação** e confirma que a ordem lá está com o stop.
8. Tira um print. Vai para a pasta «Diário».

:::nota O ecrã que te protege
No passo 2 a app mostra a perda em dinheiro antes de confirmares. Se esse valor te faz engolir em seco, o lote está grande demais. Volta ao capítulo 5.
:::

No teu caso, a ordem fria fica assim: tipo Buy Limit, volume 0,02, preço 1,08200, S/L 1,07950, T/P 1,08700. São 25 pips de risco para 50 de alvo, uma relação risco:retorno de 1:2 (exemplo ilustrativo).

No computador é igual: **F9** (ou o botão **Nova ordem**) abre a mesma janela, com os mesmos campos, e nenhum deles fica em branco. No PC tens uma vantagem: podes arrastar as linhas do S/L e do T/P diretamente no gráfico.

[[foto: mt5-desktop-ordem.jpg | MetaTrader 5 no computador: janela «Nova ordem» com Stop Loss e Take Profit, e o histórico em baixo. Imagem: MetaQuotes (metatrader5.com). | larga]]

## Os erros de ecrã que custam dinheiro

:::alerta Erro clássico · A vírgula no lote
Querias 0,10 e escreveste 1,0. No telemóvel isto acontece com um dedo mais gordo. Antes de colocar, lê o volume em voz alta.
:::

:::alerta Erro clássico · Trocar Limit por Stop
Buy Limit compra mais **barato** do que o preço atual. Buy Stop compra mais **caro**. Troca-os e entras exatamente no sítio errado. Volta ao gráfico deste capítulo sempre que hesitares.
:::

:::alerta Erro clássico · Stop em pips quando querias preço
O campo do S/L muda conforme escolhes Preço, Pips ou USD. Confirma o separador antes de escrever o número.
:::

:::historia A Marta, dia 12
A primeira ordem a sério, ainda na demo. Buy Limit no EURUSD, numa zona que tinha desenhado no domingo. A Marta escreveu o volume, o preço, o stop e o alvo, e ia tocar em «Colocar» quando se lembrou de ler em voz alta. «Volume: um vírgula zero.» Tinha escrito 1,0 em vez de 0,02. Na vista em USD, o stop custava 250 $, metade da conta. Corrigiu, leu outra vez, colocou. Depois foi a Negociação ver a ordem lá parada, à espera. Não sentiu adrenalina nenhuma. Sentiu que tinha feito o trabalho.
:::

## Depois do «Feito»: o separador Negociação

Uma ordem colocada não é uma ordem esquecida. O terceiro botão da barra de baixo, **Negociação**, mostra-te tudo o que está vivo na conta.

[[foto: mt5-android-negociacao.jpg | O separador de negociação e o histórico no MetaTrader 5 para Android e tablet. É aqui que vês saldo, capital e margem. Imagem: MetaQuotes (metatrader5.com). | larga]]

- No topo: **saldo**, **capital**, **margem** e **margem livre**.
- Por baixo: as **posições** abertas, com o resultado a mexer, e as **ordens pendentes** à espera.
- Para **modificar** ou **fechar**, mantém o dedo na posição ou na ordem e escolhe a opção. No PC, duplo clique ou botão direito.

**Saldo** é o dinheiro sem contar com posições abertas. **Capital** (*equity*) é o saldo mais ou menos o que as posições abertas estão a ganhar ou a perder. Numa demo de 500 € sem nada aberto, os dois mostram 500,00 € (ilustrativo). Quando tens uma operação aberta, olha sempre para o capital: é esse o número real.

:::alerta Erro clássico · Afastar o stop quando o preço se aproxima
O preço está a dois pips do teu stop e tu modificas a posição para arrastar o S/L para mais longe, «para dar espaço». Acabaste de mudar o plano a meio, com o coração, e de aumentar o risco que tinhas aceitado. Um stop só se mexe numa direção: a favor da operação, para proteger. Nunca para longe.
:::

## A checklist antes de clicar

Cola isto perto do ecrã. Se uma das respostas for «não», a ordem não sai.

:::cartao Checklist da ordem fria
- O par e a hora estão no meu plano?
- Há notícias fortes nos próximos 30 minutos?
- Sei porque entro, numa frase?
- O stop está onde a ideia deixa de fazer sentido?
- O lote saiu da conta do risco, e a vista em dinheiro confirma?
- A relação risco:retorno é de pelo menos 1:1,5?
- Estou calmo? (de 1 a 5, pelo menos 3)
:::

:::conversa Notas do telemóvel · eu
eu: Vontade de entrar no GBP/USD agora. Subiu 60 pips numa hora.
eu: Checklist: não está no plano. Não sei onde pôr o stop. Calma: 2 em 5.
eu: Não entro. Anotei no diário como «vontade, não plano».
:::

Este é o tipo de nota que vale mais do que qualquer operação ganha. Aprendes a reconhecer a vontade antes de ela te custar dinheiro.

## Mapa rápido: onde está cada coisa

Agora que já usaste todos os ecrãs, guarda este mapa. Serve de cábula até os dedos saberem o caminho sozinhos.

| Quero… | No telemóvel | No PC |
|---|---|---|
| Ver preços | Cotações | Observação do mercado (Ctrl+M) |
| Acrescentar um par | Cotações › + | Observação do mercado › botão direito › Símbolos |
| Abrir uma ordem | Cotações › par › Nova ordem | F9 |
| Mudar o período do gráfico | Gráfico › manter o dedo › período | Barra de períodos, em cima |
| Pôr um indicador | Gráfico › *f* | Inserir › Indicadores |
| Desenhar uma zona ou Fibonacci | Gráfico › objetos | Inserir › Objetos |
| Ver posições e margem | Negociação | Caixa de ferramentas › Negociação |
| Ver o que já fechou | Histórico | Caixa de ferramentas › Histórico |
| Calendário económico | Configurações › Tradays | Caixa de ferramentas › Calendário |
| Alertas de preço | Chegam por push, criados no PC (capítulo 7) | Caixa de ferramentas › Alertas |

## A regra fria deste capítulo

:::cartao Regra fria n.º 6
Nenhuma ordem sai sem stop. O stop nunca se afasta. A checklist faz-se sempre, mesmo quando «é óbvio». Leio o volume em voz alta antes de colocar.
:::

## Em resumo

- Existem ordens a mercado e pendentes (limit e stop); as pendentes deixam-te viver a tua vida.
- Limit: o preço volta até ti. Stop: o preço rompe e segue.
- O stop vai onde a ideia deixa de fazer sentido; o alvo, onde há razão para o preço parar.
- Na janela de ordem, tudo preenchido antes de «Colocar», com a vista em dinheiro a confirmar o risco.
- Depois do «Feito», confirmas em Negociação. O stop só se mexe a teu favor.
- A checklist de sete perguntas decide se a ordem sai ou não.

:::exercicio Para fazer hoje
1. Na demo, abre três ordens pendentes no teu par: uma Buy Limit, uma Sell Limit e uma Buy Stop, todas com SL e TP.
2. Em cada uma, confirma na vista em dinheiro que o stop custa o teu risco de 1 %.
3. Vai a Negociação e confirma que as três aparecem com os níveis certos.
4. Modifica uma delas (muda o alvo) e depois cancela as três. O objetivo era só treinar os dedos.
5. Escreve no caderno a frase que vais usar para justificar cada entrada a partir de agora: «Entro porque ____________».
:::
