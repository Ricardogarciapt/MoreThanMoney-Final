import PDFDocument from 'pdfkit'

/**
 * O guia que acompanha a licença do MTM Sensei SCALP EDITION, em PDF.
 *
 * Irmão do `sensei-ea-guia.ts`, e deliberadamente uma cópia e não um módulo partilhado: são dois
 * produtos que se vendem em separado, e um guia que mudasse sozinho porque alguém mexeu no outro
 * era exactamente o tipo de acidente que a separação das duas árvores foi feita para evitar.
 *
 * É gerado em código e não exportado de um Canva porque muda com o produto: os presets, o registo
 * dos sinais e o passo do WebRequest têm de estar certos no dia em que o cliente descarrega, e um
 * PDF estático fica desactualizado sem ninguém dar por isso.
 *
 * ── Sobre posicionar coisas nesta página ──────────────────────────────────────────────────────
 * O pdfkit tem um cursor (`doc.y`) que só avança quando se escreve texto no fluxo. `rect().fill()`
 * NÃO o avança. A primeira versão desenhava a caixa e depois escrevia com deslocamentos à mão
 * (`doc.y - 62`) — resultado: o parágrafo caía por cima do que já lá estava e do título seguinte.
 *
 * Aqui mede-se antes de desenhar (`heightOfString`), desenha-se o fundo com a altura certa, e
 * escreve-se com coordenadas absolutas dentro dela. No fim põe-se o cursor abaixo da caixa. É mais
 * comprido de escrever e não se pode sobrepor a nada.
 */

const OURO = '#D2A63C'
const OURO_ESCURO = '#BB8525'
const PRETO = '#0A0A0A'
const CINZA = '#4A4A4A'
const CINZA_CLARO = '#8A8A8A'
const CREME = '#FAF6EC'

const M = 56 // margem

/**
 * O pdfkit escreve as fontes base em WinAnsi, que não tem setas nem o sinal de menos tipográfico.
 * Um carácter fora dessa tabela não dá erro: sai um par de símbolos aleatórios no meio da frase,
 * e só se descobre a olhar para o PDF. Aconteceu — a seta de "Ferramentas → Opções" saía como !'.
 *
 * Por isso todo o texto passa por aqui antes de ser desenhado. É uma linha de defesa contra um
 * erro que não se vê no código nem rebenta em lado nenhum.
 */
function seguro(t: string): string {
  return t
    .replace(/[\u2192\u27A1]/g, '>')
    .replace(/\u2212/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
}


export async function gerarGuiaScalp(): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: M,
    info: { Title: 'MTM Sensei EA — Guia', Author: 'MoreThanMoney' },
  })
  const pedacos: Buffer[] = []
  doc.on('data', (c: Buffer) => pedacos.push(c))
  const feito = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(pedacos))))

  const L = doc.page.width - M * 2
  const fundo = doc.page.height - M // onde a página acaba

  /** Abre página nova se o que vem a seguir não couber. Sem isto, cortava-se a meio. */
  const cabe = (altura: number) => {
    if (doc.y + altura > fundo) doc.addPage()
  }

  const titulo = (t: string) => {
    cabe(70)
    doc.moveDown(1.1)
    doc.fillColor(OURO).fontSize(15).font('Helvetica-Bold').text(seguro(t), M, doc.y, { width: L })
    const y = doc.y + 4
    doc.moveTo(M, y).lineTo(M + L, y).lineWidth(0.7).strokeColor(OURO_ESCURO).stroke()
    doc.y = y + 12
  }

  const paragrafo = (t: string, cor = CINZA) => {
    doc.fillColor(cor).fontSize(10).font('Helvetica')
    cabe(doc.heightOfString(t, { width: L, lineGap: 2.5 }) + 8)
    doc.text(seguro(t), M, doc.y, { width: L, align: 'left', lineGap: 2.5 })
    doc.moveDown(0.45)
  }

  const passo = (n: number, tCru: string, dCru: string) => {
    const t = seguro(tCru)
    const d = seguro(dCru)
    doc.fontSize(9.5).font('Helvetica')
    const alturaD = doc.heightOfString(d, { width: L - 26, lineGap: 2 })
    cabe(alturaD + 26)

    const topo = doc.y
    doc.circle(M + 8, topo + 7, 8).fillColor(OURO).fill()
    doc.fillColor(PRETO).fontSize(9).font('Helvetica-Bold').text(String(n), M + 4.5, topo + 3.5, {
      width: 8,
      align: 'center',
    })
    doc.fillColor(PRETO).fontSize(10.5).font('Helvetica-Bold').text(t, M + 26, topo, { width: L - 26 })
    doc.fillColor(CINZA).fontSize(9.5).font('Helvetica').text(d, M + 26, doc.y + 1, {
      width: L - 26,
      lineGap: 2,
    })
    doc.moveDown(0.7)
  }

  /** Caixa com fundo. Mede primeiro, desenha depois — ver a nota no topo do ficheiro. */
  const caixa = (tituloCaixa: string, corpo: string) => {
    const largura = L - 28
    doc.fontSize(10).font('Helvetica-Bold')
    const hTitulo = doc.heightOfString(seguro(tituloCaixa), { width: largura })
    doc.fontSize(9.5).font('Helvetica')
    const hCorpo = doc.heightOfString(seguro(corpo), { width: largura, lineGap: 2.5 })
    const altura = hTitulo + hCorpo + 32

    cabe(altura + 10)
    const topo = doc.y
    doc.rect(M, topo, L, altura).fillColor(CREME).fill()

    doc.fillColor(PRETO).fontSize(10).font('Helvetica-Bold').text(seguro(tituloCaixa), M + 14, topo + 13, {
      width: largura,
    })
    doc.fillColor(CINZA).fontSize(9.5).font('Helvetica').text(seguro(corpo), M + 14, topo + 13 + hTitulo + 6, {
      width: largura,
      lineGap: 2.5,
    })

    doc.y = topo + altura + 12
  }

  // ── Capa ────────────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 190).fillColor(PRETO).fill()
  doc.fillColor(OURO).fontSize(30).font('Helvetica-Bold').text('MTM SENSEI', M, 50)
  doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text('SCALP EDITION', M, 84)
  doc.fillColor('#FFFFFF').fontSize(13).font('Helvetica').text('Expert Advisor para MetaTrader 5', M, 116)
  doc
    .fillColor(CINZA_CLARO)
    .fontSize(9.5)
    .text('Guia de instalação, licença e configuração  ·  MoreThanMoney', M, 140)
  doc.y = 220

  paragrafo(
    'Este guia leva-te do zero até ter a Scalp Edition a trabalhar numa conta MT5. Lê-o todo antes ' +
      'de a pôres com dinheiro a sério — sobretudo a página sobre o que esperar, porque esta EA ' +
      'perde a maior parte das trades por desenho, e isso assusta quem não estava à espera.',
  )

  caixa(
    'Não confundas com o MTM Sensei EA',
    'São duas ferramentas diferentes e cada uma tem a sua licença. O MTM Sensei EA entra a mercado ' +
      'em M15/H1, leva stop loss e alvos, e faz poucas trades por dia. A Scalp Edition trabalha em ' +
      'M5 com ordens pendentes, não tem stop loss fixo e faz dezenas de ciclos por dia. Uma chave ' +
      'não abre a outra: se a colares na EA errada, o log diz-te exactamente isso.',
  )

  // ── Instalação ──────────────────────────────────────────────────────────────
  titulo('1. Instalar')
  paragrafo(
    'O pacote traz um instalador para cada sistema. Ele encontra o teu MetaTrader sozinho — mesmo ' +
      'se tiveres duas corretoras instaladas, copia para as duas.',
  )
  passo(1, 'Descompacta o ZIP', 'Guarda a pasta onde quiseres. O instalador tem de ficar ao lado da pasta MQL5.')
  passo(2, 'Corre o instalador', 'Windows: "Instalar no Windows.bat". macOS: "Instalar no Mac.command" (se o Mac recusar, botão direito → Abrir).')
  passo(3, 'Actualiza o MetaTrader', 'No MT5: Ficheiro → Actualizar pastas. Ou fecha e abre.')
  passo(4, 'Põe no gráfico', 'Abre XAUUSD em M5 e arrasta Consultores → MTM → MTM_Sensei_Scalp. No separador Comum, liga "Permitir negociação automática".')

  // ── Licença ─────────────────────────────────────────────────────────────────
  titulo('2. Activar a licença')
  paragrafo(
    'A licença prende-se ao número da conta MT5. É o único dado que não se inventa: quem o atribui ' +
      'é a corretora. Por isso não há ficheiros de activação nem DLLs — a EA pergunta ao nosso ' +
      'servidor e o MetaTrader precisa de autorização para essa pergunta.',
  )
  passo(1, 'Autoriza o endereço', 'Ferramentas → Opções → Consultores → "Permitir WebRequest para os seguintes URLs" → acrescenta https://www.morethanmoney.pt')
  passo(2, 'Cola a chave', 'Nos parâmetros da EA, campo "Chave". Chega-te por email depois da compra.')
  passo(3, 'Confirma no log', 'Separador Especialistas: "Licenca activa". O painel também o mostra, em verde, no rodapé.')
  caixa(
    'É aqui que toda a gente tropeça uma vez',
    'Se aparecer "Permite o endereço no MetaTrader", não é a chave que está errada — é o passo 1 ' +
      'que falta. O MetaTrader bloqueia pedidos à internet por defeito, e nenhum EA do mundo ' +
      'contorna isso sem te pedir autorização primeiro.',
  )

  // ── Configuração ────────────────────────────────────────────────────────────
  titulo('3. Configurar')
  paragrafo(
    'A EA traz um único preset — MTM_SenseiScalp_XAUUSD.set — e serve para qualquer corretora. As ' +
      'distâncias estão gravadas em dólares e convertidas no arranque, por isso funcionam tanto ' +
      'num ouro de duas casas decimais como num de três, sem tocares em nada.',
  )
  paragrafo(
    'Carrega-o em Parâmetros → Carregar. Depois só precisas de conferir uma coisa, e é importante:',
  )
  caixa(
    'A janela horária é HORA DO SERVIDOR, não a tua',
    'O preset traz 13:00–17:00, que é a tarde de Londres com a abertura de Nova Iorque lá dentro — ' +
      'medido num servidor GMT+0. Se a tua corretora correr noutro fuso (muitas andam em GMT+2 ou ' +
      'GMT+3), soma a diferença. A EA escreve as duas horas no log quando arranca: "relogios → ' +
      'servidor HH:MM (GMT+X) | tu HH:MM (GMT+Y)". Esta é a única definição que muda de conta para ' +
      'conta, e é também a que mais pesa no resultado.',
  )

  doc.addPage()

  // ── O painel ────────────────────────────────────────────────────────────────
  titulo('4. O painel')
  paragrafo('Tudo o que precisas de fazer no dia-a-dia está no painel, no canto do gráfico.')
  passo(1, 'INICIAR', 'A EA arranca parada de propósito. Este botão é o que a liga — e é o mesmo estado que ela lê para abrir ordens, não há uma segunda definição a discordar.')
  passo(2, 'FECHAR TUDO', 'Fecha posições e apaga pendentes, imediatamente.')
  passo(3, 'LADO', 'Inverte a leitura: onde o Sensei diz compra, arma venda. Fecha o que estiver aberto ao trocar, porque o que lá está foi armado pela regra antiga.')
  passo(4, 'LOTE / RISCO', 'Clica no texto para trocar entre lote fixo e percentagem do saldo. Os botões − e + mexem no valor. Vale para as ordens seguintes, não mexe nas que já estão abertas.')
  paragrafo(
    'Por baixo tens a leitura do Sensei, os ciclos do dia contra o tecto, o resultado do dia, a ' +
      'próxima notícia e o estado da licença.',
    CINZA_CLARO,
  )

  // ── Dimensionamento ─────────────────────────────────────────────────────────
  titulo('5. Quanto arriscar')
  paragrafo(
    'O defeito é 0,01 lotes fixos, e foi assim que a configuração foi medida. Numa conta pequena é ' +
      'também o único que cabe: 0,01 em ouro ocupa cerca de 41 USD de margem a 1:100, portanto numa ' +
      'conta de 100 USD só há espaço para duas posições ao mesmo tempo.',
  )
  paragrafo(
    'A alternativa é o modo percentagem, que faz o lote crescer com a conta — e encolher quando ela ' +
      'encolhe. Troca-se no painel. Não uses percentagem numa conta pequena: o lote mínimo já é ' +
      'maior do que a percentagem pediria, e o resultado é arriscares mais do que pensas.',
  )

  // ── Notícias ────────────────────────────────────────────────────────────────
  titulo('6. Filtro de notícias')
  paragrafo(
    'Vem ligado, e por defeito FECHA as posições na janela do evento em vez de apenas não abrir ' +
      'novas. A razão é o desenho da EA: como não há stop loss fixo, quem fecha o lado errado é a ' +
      'ordem de reversão — e numa notícia de alto impacto essa ordem é preenchida onde houver ' +
      'liquidez, não onde está desenhada. Trinta minutos antes e depois, só alto impacto.',
  )
  paragrafo(
    'A fonte é o calendário do próprio MetaTrader. Há corretoras cujo servidor não o serve; para ' +
      'essas, o instalador copia um ficheiro de reserva para a pasta Common.',
    CINZA_CLARO,
  )

  doc.addPage()

  // ── O que esperar ───────────────────────────────────────────────────────────
  titulo('7. O que esperar — lê isto antes de arriscar')
  caixa(
    'Três em cada quatro trades vão perder, e está tudo bem',
    'Nos testes, a maior parte dos ciclos fechou com uma perda pequena — o custo do spread — e o ' +
      'resultado veio de uma minoria de trades que correram muito. Sequências longas de pequenas ' +
      'perdas são o funcionamento normal desta EA, não uma avaria. Se isso te tira o sono, esta ' +
      'ferramenta não é para ti, e é melhor sabê-lo antes.',
  )
  paragrafo(
    'A EA gasta o tecto de ciclos do dia quase sempre. Na prática negoceia a primeira hora da janela ' +
      'e pára. Não é um erro: é o travão que impede um dia lateral de comer a conta às fatias.',
  )
  caixa(
    'Não há stop loss fixo, e isso tem um preço',
    'Quem fecha o lado errado é a ordem de reversão, e quando ela dispara há uma perda realizada. ' +
      'Não há desenho que evite isso. O que segura a conta são três limites, e vêm todos ligados: ' +
      'spread máximo, tecto de ciclos por dia e perda máxima diária. Baixá-los ou desligá-los só se ' +
      'souberes exactamente porquê.',
  )
  paragrafo(
    'Os números dos testes vêm do Strategy Tester, que gera os ticks e preenche as ordens pendentes ' +
      'a preços ideais — que é precisamente onde este desenho vive ou morre. Põe em conta demo, ' +
      'durante semanas, na corretora onde vais operar, antes de acreditares em qualquer resultado. ' +
      'Nós dizemos-te isto porque é verdade, não porque soe bem.',
    CINZA,
  )

  // ── Rodapé ──────────────────────────────────────────────────────────────────
  cabe(70)
  doc.moveDown(1)
  doc.rect(M, doc.y, L, 1).fillColor('#E5E0D5').fill()
  doc.y += 14
  doc
    .fillColor(CINZA_CLARO)
    .fontSize(8.5)
    .font('Helvetica')
    .text(
      'MoreThanMoney  ·  morethanmoney.pt/sensei-scalp  ·  Negociar envolve risco de perda. ' +
        'Resultados passados não garantem resultados futuros.',
      M,
      doc.y,
      { width: L },
    )

  doc.end()
  return feito
}
