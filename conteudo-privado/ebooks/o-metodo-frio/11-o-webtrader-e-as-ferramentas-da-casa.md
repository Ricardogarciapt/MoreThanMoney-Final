# O WebTrader e as ferramentas da casa

> O MetaTrader ensinou-te a porta. Agora mostro-te a casa que construímos para quem aprende.

Até aqui usaste o MetaTrader 5, e fizeste bem. É a plataforma que quase todas as corretoras oferecem e vais encontrá-la em qualquer lado. Mas, ao longo destes anos a ensinar, vi sempre os mesmos tropeções: o lote calculado de cabeça, o stop esquecido, o diário num caderno à parte, o histórico que ninguém revê, a gestão da posição feita à mão e com o coração aos saltos.

Foi para isso que a MoreThanMoney construiu o seu próprio **WebTrader**. Abre no browser e no telemóvel, sem instalar nada. Serve a mesma plataforma para três tipos de conta: uma **conta demo** para treinares, as contas **simuladas MTM Funded** com regras, e as **tuas contas na corretora** (TradeLocker e MetaTrader) ligadas ao mesmo ecrã. A regra fria do lote, o stop obrigatório, o diário e a revisão deixam de ser disciplina que tens de lembrar e passam a estar dentro da ferramenta.

Para mim, é aqui que está o futuro da aprendizagem: o aluno aprende, treina e negoceia no mesmo sítio onde o professor vê o que ele fez, com os mesmos números.

## Da minha vida: onde eu aprendi, e porque fiz diferente

Quando decidi aprender trading, em plena crise de 2021, paguei uma plataforma de educação com uma subscrição cara. Não vou dizer o nome. Aprendi coisas úteis lá, e a disciplina que trazia da vida militar fez o resto. Mas lembro-me bem do que custava, ao fim do mês, a quem ganhava 1.037 €. E lembro-me de pensar que metade das pessoas que precisavam daquilo nunca o iam poder pagar.

Cerca de seis meses depois saí do meu «emprego de sonho». Hoje sou livre, estou com a minha família, tenho investimentos (e também erros, que estão todos neste livro) e não trabalho para ninguém. Quando fundei a MoreThanMoney, prometi a mim próprio duas coisas: que ninguém ia ter de pagar o preço de aprender sozinho, e que o preço da entrada não ia ser o que me cobraram a mim.

[[foto: rg-mentoria.jpg | Uma conversa à mesa vale mais do que cem vídeos vistos sozinho às duas da manhã. | lado]]

## Porque é que a MTM custa menos

Não é caridade, é desenho. Há três razões, e são todas verificáveis:

1. **Construímos as ferramentas em casa.** O WebTrader, os scanners, as contas simuladas e a cópia de estratégias são nossos. Não pagamos a terceiros por cada aluno, por isso não temos de passar esse custo para ti.
2. **A corretora paga parte da conta.** Quem abre conta numa corretora parceira e a valida pode ter acesso ao Premium sem pagar a mensalidade enquanto a conta estiver ativa. Os planos e as condições estão sempre atualizados em morethanmoney.pt.
3. **Não vivemos de fazer-te sentir pobre.** Nada de esquemas de recrutamento, nada de pagar para subir de nível, nada de prints de lucros para te empurrar. O modelo é simples: ferramentas, aulas e comunidade por um preço que cabe num ordenado português.

## Porque não acredito em aprender trading só com o YouTube grátis

Também temos vídeos grátis no YouTube, e vais ver os links já a seguir. Servem para explicar como funciona cada ferramenta. O que eu não acredito é que se aprenda **trading** só com vídeos grátis. Por quatro razões:

- **O vídeo grátis é pago com a tua atenção.** O algoritmo premeia o que te prende ao ecrã: o lucro espetacular, a promessa, a pressa. Raramente premeia o vídeo aborrecido sobre o tamanho do lote, que é o que te salva a conta.
- **Não há ordem.** Saltas de uma estratégia para outra e nunca dás 40 operações seguidas ao mesmo plano.
- **Ninguém vê os teus erros.** Um vídeo não te diz que puseste o stop no sítio errado. Uma pessoa e um histórico partilhado dizem.
- **Ninguém responde por aquilo.** Quem não ganha nada contigo também não perde nada se te correr mal.

Grátis é ótimo para espreitar. Para mudar de vida, precisas de método, de ferramentas e de alguém que te veja trabalhar.

## Entrar no WebTrader

Abre **morethanmoney.pt/webtrader** no computador ou no telemóvel. Entras com a tua conta MTM (email, Google ou PrimeVerse). Se só tens os dados de uma conta simulada, há uma terceira porta: **Entrar só com credenciais de conta**, com o login, a palavra-passe e o servidor «MTM Funded», como no MetaTrader.

[[foto: wt-entrar.png | O ecrã de entrada do WebTrader: conta MTM, Google, PrimeVerse ou só as credenciais da conta. | larga]]

No topo, o **seletor de contas** mostra todas as tuas contas no mesmo sítio: a demo, as contas MTM Funded e as contas da corretora que ligaste (TradeLocker ou MetaTrader). Trocas de conta sem sair do ecrã. Para este capítulo usei uma conta de demonstração com 1.000 $, o tamanho de uma primeira conta realista.

:::nota
No telemóvel, o botão «Adicionar ao ecrã principal» instala o WebTrader como uma app. No iPhone: Partilhar › Adicionar ao ecrã principal.
:::

## Simple ou Pro

O WebTrader tem dois modos, e trocas entre eles no topo (ou com **Alt+M** no computador):

| Modo | Para quem | O que vês |
|---|---|---|
| **SIMPLE** | Telemóvel, quem começa | O gráfico no ecrã todo, SELL · volume · BUY grandes em baixo e uma gaveta com Posições, Ordens, Histórico e Mais |
| **PRO** | Computador, quem já analisa | Até 4 gráficos, a lista de símbolos, o ticket, o calendário e, em baixo, Posições · Ordens · Histórico · Estatísticas · Diário · Alertas · Conta |

[[foto: wt-pro.png | O modo PRO: gráfico ao centro, lista e ticket à direita, posições e histórico em baixo. | larga]]

## Abrir uma posição, passo a passo

É o mesmo método do capítulo 6, mas com a conta do risco feita por ti.

1. **Escolhe o símbolo** na lista (ou toca no nome do símbolo no modo SIMPLE).
2. No **ticket**, escolhe **Mercado** ou **Pendente** (Limit ou Stop).
3. Em vez de escreveres o lote, muda o volume para **Risco** e escreve **1 %** (ou o valor em dólares). O WebTrader calcula o lote a partir da distância ao stop.
4. Escreve o **SL** e o **TP**, ou arrasta as linhas diretamente no gráfico. Escrever desenha a linha; arrastar a linha escreve o número. Nunca há duas versões da mesma ordem.
5. Lê o resumo: direção, entrada, stop, alvo, lote, **risco em dinheiro e em percentagem**, relação risco/retorno e margem.
6. Carrega em **Confirmar**.

[[foto: wt-ticket.png | O ticket com o volume em modo Risco: mexes no stop e o lote recalcula-se sozinho. | larga]]

:::alerta Erro clássico · Ligar a negociação num clique no primeiro dia
O WebTrader tem um modo «num clique», como o MetaTrader e o TradingView: com ele ligado, tocar em BUY envia logo. É útil para quem já tem a mão treinada. No primeiro mês, deixa-o desligado. A confirmação é a tua última verificação antes de saltar.
:::

[[grafico:webtrader-ordem]]

## Gestão automática: o que o motor faz por ti

Esta é a parte que o MetaTrader no telemóvel não te dá. Em cada posição tens três botões:

| Botão | O que faz |
|---|---|
| **Auto BE** | Quando o preço anda X pips a teu favor, o stop passa para a entrada (com um pequeno ganho, se quiseres). Daí para a frente, a operação já não te tira dinheiro. |
| **Auto Trailing** | O stop segue o preço a uma distância fixa, só a teu favor. Nunca recua. |
| **Trailing já** | Liga o trailing a partir de agora, à distância que escolheres. |

No bloco **Avançado** do ticket podes ainda dividir a saída em **TP1, TP2 e TP3**, cada um com uma percentagem do volume, mover o stop para a entrada quando o TP1 é atingido e pôr validade numa ordem pendente.

O importante é **quem executa**. Nas contas MTM Funded e de demonstração, é o motor da MTM, preço a preço, num servidor. Nas tuas contas da corretora (TradeLocker e MetaTrader), os mesmos botões, com o mesmo significado, ficam gravados e são executados no servidor da MTM. O browser nunca move um stop de dinheiro real: se fechares o separador, a gestão não para a meio.

[[foto: wt-gestao.png | Uma posição aberta com Auto BE e Auto Trailing. O stop sobe sozinho, nunca desce. | larga]]

[[grafico:auto-be-trailing]]

:::historia A Marta, dia 26
A Marta passou a última semana da demo para o WebTrader. Abriu um Buy Limit no EURUSD com risco de 1 %, e o lote saiu 0,04 sem fazer contas. Ligou o Auto BE a +15 pips e foi trabalhar. No intervalo, viu a notificação: o preço tinha subido, o stop estava na entrada. Ao fim do turno, a operação tinha fechado no alvo. O que a fez sorrir não foi o resultado. Foi não ter aberto a app nem uma vez durante o turno.
:::

## Navegar: lista, gráficos e scanners no gráfico

- **Lista de símbolos:** com a variação das últimas 24 horas e um mini-gráfico. Arrasta para mudar a ordem, toca na estrela para os favoritos.
- **Estado do mercado:** ao lado do nome do símbolo vês se o mercado está **aberto ou fechado** e quanto falta para fechar, e a percentagem de traders comprados. É o horário do capítulo 7 sem teres de fazer contas de fuso.
- **Multi-gráfico (PRO):** 1, 2 ou 4 gráficos, cada um com o seu símbolo e o seu tempo. O H4 num, o H1 no outro, como no capítulo 4.
- **Estudos MTM no gráfico:** os scanners da casa desenham-se diretamente no gráfico do WebTrader. Quando um scanner ou uma ideia MTM dá um sinal, abre-se uma folha com todos os números (entrada, stop, alvo, lote, risco em dinheiro e em percentagem). Daí só tens três portas: confirmar, ajustar ou descartar. Um sinal nunca entra sozinho.

[[foto: wt-mercado.png | O estado do mercado ao lado do símbolo: aberto, fechado e quanto falta para fechar. | larga]]

## Trabalhar com as estratégias da casa e os sinais delas

O WebTrader não é só um sítio para clicar em comprar e vender. As estratégias da casa vivem dentro dele: na barra por cima do gráfico tens o GoldKiller, o MTM Scanner, o Sensei, o TrendShot e as outras. Liga **uma de cada vez**. Duas estratégias no mesmo gráfico são duas opiniões a gritar ao mesmo tempo, e o método frio precisa de uma só voz.

- **GoldKiller:** quando há sinal, aparece uma barra por cima do gráfico com a direção, a entrada, o stop e o alvo, e um botão **«Usar este sinal»**. Esse botão só pré-preenche o ticket. Quem confirma és tu.
- **MTM Scanner:** desenha a estrutura do mercado (BOS, CHoCH) e, quando dá sinal, marca no gráfico a entrada, o stop e dois alvos com o risco-retorno escrito (1:2 e 1:4).
- **Sensei:** é o mais didático. Mostra uma tabela de confirmações (tendência, momento, estrutura, volatilidade) com uma nota de 0 a 20, e uma checklist do que ainda falta. Enquanto diz «a aguardar sinal», não há operação.
- **TrendShot:** médias de tendência e os níveis de entrada e alvos na escala de preço.

[[foto: wt-estrategia-scanner.png | O MTM Scanner ligado sozinho: entrada, stop e dois alvos com o risco-retorno, já desenhados. | larga]]

O caminho é sempre o mesmo:

1. Escolhe o ativo e o tempo do teu plano.
2. Liga a estratégia que estudaste, e só essa.
3. Espera que ela dê sinal. Sem sinal, não há trade.
4. Usa o sinal (ou copia os números para o ticket) e põe o volume em **Risco %**.
5. Confirma, liga o Auto BE e o Auto Trailing, e escreve no diário que estratégia usaste.

Ao fim de um mês, o diário diz-te que estratégia funciona contigo. É por isso que o setup tem uma etiqueta própria («Sinal GoldKiller», «Sinal Sensei», «Sinal MTM Scanner»).

[[foto: wt-estrategia-sensei.png | O Sensei: dez confirmações em vinte e a checklist do que falta. Ainda não é sinal. | larga]]

## Histórico, estatísticas e diário

No painel de baixo estão as três peças do capítulo 9, já ligadas entre si:

- **Histórico:** cada operação fechada, com entrada, saída, resultado e as saídas parciais.
- **Estatísticas:** a curva de saldo e de capital, o drawdown, a taxa de acerto, o ganho médio contra a perda média e os agrupamentos por símbolo, estratégia, hora e dia da semana. Sempre em dólares da conta, nunca em promessas.
- **Diário:** uma nota por operação, com a emoção, o setup, as etiquetas e o print. Escreves o porquê ao lado do próprio histórico, e não num caderno que fica em casa.

[[foto: wt-historico.png | Histórico e estatísticas lado a lado: a revisão de domingo do capítulo 9 em dois toques. | larga]]

## Calendário e alertas

O **calendário económico** está dentro do WebTrader, com os eventos de impacto médio e alto das moedas que negocias. A regra dos 30 minutos do capítulo 7 cumpre-se sem mudar de app. Os **alertas de preço** aparecem como linhas amarelas no gráfico e, quando o preço lá chega, recebes uma notificação no telemóvel.

## Partilhar a auditoria

No separador **Conta** podes gerar um **link público de auditoria**. A página mostra as tuas operações, os resultados em R e em pips, o drawdown e o risco, **sem nome, sem email e sem palavras-passe**. O login só aparece se tu quiseres. Revogas quando quiseres, e o link antigo deixa de abrir.

Serve para mostrares o teu trabalho a um mentor, a um colega ou a ti próprio daqui a seis meses. É o contrário de um print de lucro: mostra tudo, os dias bons e os maus.

[[foto: wt-auditoria.png | O link de auditoria: tudo à vista, nada de dados pessoais. | larga]]

## TradeLocker e WebTrader, lado a lado

Se a tua corretora usa **TradeLocker**, não tens de escolher. Ligas a conta TradeLocker ao WebTrader e ela aparece no seletor, com o emblema da plataforma. Podes continuar a usar a app da TradeLocker para o que gostas nela, e usar o WebTrader para o que ela não faz da mesma maneira: a gestão automática no servidor (Auto BE, Auto Trailing, saídas parciais), os scanners MTM no gráfico, o diário ao lado do histórico e a auditoria partilhável. Com contas MetaTrader acontece o mesmo.

[[grafico:webtrader-contas]]

## As ferramentas da casa

Os scanners da MoreThanMoney marcam automaticamente zonas, tendência e possíveis entradas, no TradingView e no gráfico do WebTrader. Não decidem por ti. Poupam-te tempo e ajudam-te a não ver o que não está lá. Estas são as quatro que mais uso com quem começa, a começar pela que mais recomendo.

:::scanner DEFY
foto: sc-defy.jpg
estilo: Exaustão e níveis-chave
ativos: Forex, ouro, índices
tempo: 15 minutos a 1 hora
É a ferramenta em que mais confio para ensinar. Desenha bandas de exaustão e níveis-chave, e só dá sinal com confirmações (as estrelas). Cada sinal chega com tudo marcado na vela: entrada, uma linha de aviso, o stop e três alvos fixos. Não há nada para inventar. Ou o plano está no gráfico, ou não há operação.
:::

:::scanner Golden Zone
foto: sc-golden-zone.jpg
estilo: Scalping a favor da tendência
ativos: Ouro (XAUUSD)
tempo: 5 minutos
Não te manda correr atrás do preço. Marca uma zona e espera que o preço volte lá. Um visto é um aviso, não uma entrada. Uma bandeira branca quer dizer que acabou.
:::

:::scanner Momentum
foto: sc-momentum.jpg
estilo: Seguimento de direção
ativos: Forex, ouro, índices, cripto
tempo: 15 minutos a 1 hora
Funciona por cores: verde compra, vermelho vende, com cinco confirmações a valer um ponto cada. As caixas lilás marcam mercado lateral, e mercado lateral é sítio onde não se entra.
:::

:::scanner Aurum Flow
foto: sc-aurum-flow.jpg
estilo: Rompimento da range de abertura
ativos: Ouro e cripto
tempo: Abertura das sessões
Marca a range da abertura e espera que o preço a rompa. O stop fica na aresta oposta, por isso sabes o risco antes de entrar. É a ferramenta mais simples de explicar e das mais difíceis de cumprir: exige esperar pela hora certa.
:::

### Onde aprender a usá-las

Cada ferramenta tem uma playlist grátis no YouTube com o que é, as confirmações e um exemplo na prática, e um **bootcamp** em vídeo, narrado por mim, com o comportamento da estratégia animado do princípio ao fim.

| Ferramenta | Playlist e bootcamp | Página da ferramenta |
|---|---|---|
| **DEFY** | youtube.com/playlist?list=PLGgrpPKdUTXs | morethanmoney.pt/scanner/defy |
| **Golden Zone** | youtube.com/playlist?list=PLV0hwsHYlTJI | morethanmoney.pt/scanner/golden-zone |
| **Momentum** | youtube.com/playlist?list=PLN4Z40YVHXW0 | morethanmoney.pt/scanner/momentum |
| **Aurum Flow** | youtube.com/playlist?list=PLdRz7aeu-CNM | morethanmoney.pt/scanner/aurum-flow |

### Como se tem acesso

Os vídeos são grátis. As ferramentas, não. Há duas maneiras de as usares:

1. **Comprar o scanner que queres**, por semestre ou para sempre, na página de cada um, ou o **Pack de Scanners**, com todos, por mês.
2. **Ser membro da MoreThanMoney**. Os planos de membro dão-te as aulas, a comunidade, o WebTrader e as estratégias e ideias da casa, e há planos que já juntam os scanners.

Os preços e o que entra em cada plano estão sempre atualizados em morethanmoney.pt/upgrade. Não os escrevo aqui para não ficarem desatualizados no papel.

:::alerta Erro clássico · Comprar uma ferramenta para não ter de ter um plano
Um scanner não substitui o plano numa página do capítulo 8. Se não sabes o teu risco por operação, a tua janela e as tuas regras de paragem, o melhor scanner do mundo só te dá sinais mais bonitos para fazeres os mesmos erros. Primeiro o método. Depois a ferramenta.
:::

## A regra fria deste capítulo

:::cartao Regra fria n.º 11
A ferramenta trabalha para o meu plano, nunca o contrário. Volume em risco, stop antes de confirmar, gestão automática ligada, diário ao lado do histórico. Um sinal só pré-preenche: quem decide sou eu.
:::

## Em resumo

- O WebTrader da MTM junta demo, contas MTM Funded e contas da corretora (TradeLocker e MetaTrader) no mesmo ecrã.
- SIMPLE para o telemóvel, PRO para o computador.
- O volume em modo Risco calcula o lote a partir do stop. Escrever ou arrastar dá o mesmo resultado.
- Auto BE, Auto Trailing e saídas parciais são executados no servidor, mesmo com o separador fechado.
- Histórico, estatísticas e diário vivem juntos. A auditoria partilha tudo sem dados pessoais.
- DEFY, Golden Zone, Momentum e Aurum Flow: vídeos grátis para aprender, acesso por compra do scanner ou como membro.

:::exercicio Para fazer hoje
1. Entra em morethanmoney.pt/webtrader e abre uma conta de demonstração com o teu saldo realista.
2. Abre uma ordem pendente com o volume em modo Risco a 1 %. Lote calculado: ______
3. Liga o Auto BE nessa posição. A quantos pips? ______
4. Escreve a nota do diário dessa operação dentro do WebTrader.
5. Vê uma playlist de uma das ferramentas da casa e escreve, numa frase, quando é que ela diz «não entres»: ____________
:::
