import PDFDocument from 'pdfkit'
import type { MetricasProvider } from '@/lib/sensei-provider-metricas'

/**
 * O guia que acompanha a licença do MTM Sensei EA, em PDF.
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

export async function gerarGuiaSensei(metricas?: MetricasProvider | null): Promise<Buffer> {
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
    doc.fillColor(OURO).fontSize(15).font('Helvetica-Bold').text(t, M, doc.y, { width: L })
    const y = doc.y + 4
    doc.moveTo(M, y).lineTo(M + L, y).lineWidth(0.7).strokeColor(OURO_ESCURO).stroke()
    doc.y = y + 12
  }

  const paragrafo = (t: string, cor = CINZA) => {
    doc.fillColor(cor).fontSize(10).font('Helvetica')
    cabe(doc.heightOfString(t, { width: L, lineGap: 2.5 }) + 8)
    doc.text(t, M, doc.y, { width: L, align: 'left', lineGap: 2.5 })
    doc.moveDown(0.45)
  }

  const passo = (n: number, t: string, d: string) => {
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
    const hTitulo = doc.heightOfString(tituloCaixa, { width: largura })
    doc.fontSize(9.5).font('Helvetica')
    const hCorpo = doc.heightOfString(corpo, { width: largura, lineGap: 2.5 })
    const altura = hTitulo + hCorpo + 32

    cabe(altura + 10)
    const topo = doc.y
    doc.rect(M, topo, L, altura).fillColor(CREME).fill()

    doc.fillColor(PRETO).fontSize(10).font('Helvetica-Bold').text(tituloCaixa, M + 14, topo + 13, {
      width: largura,
    })
    doc.fillColor(CINZA).fontSize(9.5).font('Helvetica').text(corpo, M + 14, topo + 13 + hTitulo + 6, {
      width: largura,
      lineGap: 2.5,
    })

    doc.y = topo + altura + 12
  }

  // ── Capa ────────────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 190).fillColor(PRETO).fill()
  doc.fillColor(OURO).fontSize(30).font('Helvetica-Bold').text('MTM SENSEI', M, 58)
  doc.fillColor('#FFFFFF').fontSize(15).font('Helvetica').text('Expert Advisor para MetaTrader 5', M, 96)
  doc
    .fillColor(CINZA_CLARO)
    .fontSize(9.5)
    .text('Guia de instalação, licença e presets  ·  MoreThanMoney', M, 122)
  doc.y = 220

  paragrafo(
    'Este guia leva-te do zero até ter o Sensei a correr numa conta MT5: instalar, activar a ' +
      'licença, escolher o preset certo e perceber o que o robô faz — e o que não faz.',
  )

  // ── Instalação ──────────────────────────────────────────────────────────────
  titulo('1. Instalar')
  paragrafo(
    'O pacote traz um instalador para cada sistema. Ele encontra o teu MetaTrader sozinho — mesmo ' +
      'se tiveres dois, de corretoras diferentes — copia tudo para o sítio certo e abre este guia.',
  )
  passo(1, 'Windows', 'Faz duplo clique em "Instalar no Windows.bat", dentro da pasta do pacote.')
  passo(
    2,
    'macOS',
    'Faz duplo clique em "Instalar no Mac.command". Se o Mac recusar por vir da internet: botão direito > Abrir.',
  )
  passo(
    3,
    'Compilar',
    'Abre o MetaEditor (F4) e compila por esta ordem, com F7: MTM_Sensei_v3, MTM_Sensei_Core, MTM_Sensei_AllInOne. O indicador primeiro, sempre.',
  )
  passo(
    4,
    'Verificar',
    'Arrasta Scripts > MTM > MTM_Setup para um gráfico. Ele aplica cores, indicador e modelo, e escreve no separador Especialistas um relatório do que está bem e do que falta.',
  )
  paragrafo(
    'Preferes fazer à mão? Ficheiro > Abrir Pasta de Dados, e arrasta a pasta MQL5 do pacote para ' +
      'lá dentro, aceitando juntar os ficheiros. Nada teu é apagado — vai tudo para subpastas MTM.',
  )

  // ── Licença ─────────────────────────────────────────────────────────────────
  titulo('2. Activar a licença')
  paragrafo(
    'A licença liga o EA a uma conta MT5. O EA pergunta ao nosso servidor se aquela chave serve ' +
      'para aquele número de conta — por isso o MetaTrader precisa de autorização para falar connosco.',
  )
  passo(
    1,
    'Permitir o endereço',
    'Ferramentas > Opções > Consultores. Liga "Permitir WebRequest para os seguintes URLs" e acrescenta:  https://www.morethanmoney.pt',
  )
  passo(
    2,
    'Colar a chave',
    'Ao pôr o EA no gráfico, escreve a chave (MTM-XXXX-XXXX-XXXX) no campo "Licença", no topo dos parâmetros.',
  )
  passo(
    3,
    'Confirmar',
    'No separador Especialistas deve aparecer "LICENCA: valida". Se não aparecer, a mensagem diz exactamente o que falta.',
  )
  paragrafo(
    'Se a internet cair, o EA continua a trabalhar até 72 horas com a última validação. Passado ' +
      'esse prazo pára de abrir ordens — as que já estão abertas continuam a ser geridas.',
  )
  paragrafo('Mudaste de conta ou de corretora? Pede-nos para libertar a licença e volta a ligá-la.')

  // ── Presets ─────────────────────────────────────────────────────────────────
  titulo('3. Que preset usar')
  paragrafo(
    'Carrega o preset em "Parâmetros de Entrada" > Carregar. Cada um traz o par, o tempo gráfico ' +
      'e o horário já afinados.',
  )

  const presets: Array<[string, string, string]> = [
    [
      'MTM_AllInOne_XAUUSD_H1.set',
      'Ouro, 1 hora',
      'O preset principal. Sessões de Londres e Nova Iorque, 08:00–21:00. É onde a estratégia foi mais trabalhada.',
    ],
    [
      'MTM_AllInOne_XAUUSD_M15.set',
      'Ouro, 15 minutos',
      'Mais entradas e mais ruído. Corre-o em demo primeiro, e durante mais tempo do que achas necessário.',
    ],
    [
      'MTM_AllInOne_BTCUSD_H1.set  ·  MTM_AllInOne_BTCUSD_M15.set',
      'Bitcoin, 1 hora e 15 minutos',
      'Pontos de partida, não recomendações. O Bitcoin muda de comportamento depressa.',
    ],
    [
      'MTM_AllInOne_US30_H1.set  ·  MTM_AllInOne_US30_M15.set',
      'US30, 1 hora e 15 minutos',
      'Pontos de partida. Confirma o spread do teu símbolo antes de os usares.',
    ],
  ]

  for (const [ficheiro, par, nota] of presets) {
    doc.fontSize(9).font('Helvetica')
    cabe(doc.heightOfString(nota, { width: L }) + 34)
    doc.fillColor(OURO).fontSize(9.5).font('Helvetica-Bold').text(ficheiro, M, doc.y, { width: L })
    doc.fillColor(PRETO).fontSize(9.5).font('Helvetica-Bold').text(par, M, doc.y + 1, { width: L })
    doc.fillColor(CINZA).fontSize(9).font('Helvetica').text(nota, M, doc.y + 1, { width: L, lineGap: 2 })
    doc.moveDown(0.6)
  }

  paragrafo(
    'Não encontras aqui XAUUSD em M5, nem EURUSD, GBPUSD ou USDJPY. Não é esquecimento: nessas ' +
      'combinações a estratégia não se aguentou, e preferimos não te dar um ficheiro que só serve ' +
      'para perder dinheiro devagar. Se os quiseres na mesma, configura à mão — mas fá-lo em demo.',
  )

  // ── O registo dos sinais ────────────────────────────────────────────────────
  titulo('4. O que a conta Sensei tem feito')

  if (metricas && metricas.porInstrumento.length > 0) {
    const desde = metricas.desde
      ? new Date(metricas.desde).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
      : '—'
    const ate = metricas.ate
      ? new Date(metricas.ate).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
      : '—'

    paragrafo(
      'Estes são os números da conta que alimenta o MTM Auto Sensei — ordens reais, lidas do ' +
        'histórico da corretora. Não são sinais publicados nem simulações. Cada saída parcial ' +
        'conta pelo seu peso: uma posição que fecha um terço no TP1, um terço no TP2 e o resto no ' +
        'breakeven vale a média das três, não vale o último preço.',
    )

    const corpo = metricas.porInstrumento
      .map(
        (i) =>
          `${i.symbol}   ·   ${i.trades} trades   ·   ${String(i.acertoPct).replace('.', ',')}% de acerto   ·   ` +
          `${i.pips >= 0 ? '+' : ''}${String(i.pips).replace('.', ',')} pips`,
      )
      .join('\n')

    caixa(
      `Por instrumento, com pelo menos 10 trades  —  de ${desde} a ${ate}`,
      `${corpo}\n\nAmostra de ${metricas.dias} ${metricas.dias === 1 ? 'dia' : 'dias'} e ` +
        `${metricas.totalTrades} trades fechadas. É pouco tempo para julgar uma estratégia: meses ` +
        'maus existem e não estão aqui dentro. Lê isto como o que é — o que a conta fez até agora, ' +
        'não o que vai fazer.',
    )

    paragrafo(
      'Instrumentos com menos de 10 trades ficam de fora da tabela. Abaixo desse número o acerto ' +
        'não descreve nada: dois ganhos seguidos dariam 100%.',
    )
    paragrafo(
      'Medimos em pips e não em dinheiro porque o mesmo trade vale cerca de 8 euros a quem opera ' +
        '0,01 lotes e 800 euros a quem opera 1 lote. A percentagem é igual para toda a gente, o ' +
        'dinheiro não. Resultados passados não indicam resultados futuros, e a tua corretora não ' +
        'é a nossa: o spread e o slippage que apanhas são teus.',
    )
  } else {
    paragrafo(
      'Os números actualizados da conta Sensei — trades, acerto e pips por instrumento — estão ' +
        'sempre em morethanmoney.pt/sensei-ea, lidos em direto do histórico da corretora.',
    )
  }

  // ── Antes de arriscar ───────────────────────────────────────────────────────
  titulo('5. Antes de arriscar dinheiro')
  paragrafo(
    'O filtro de spread vem DESLIGADO. Cada corretora usa casas decimais diferentes e um valor ' +
      'errado bloqueia todas as entradas em silêncio — foi o que nos custou dias a perceber. O ' +
      'MTM_Setup diz-te o spread do teu símbolo; usa cerca de 3× esse valor se o quiseres ligar.',
  )
  paragrafo(
    'O módulo de prop firm vem desligado. Liga-o só na conta de desafio e confirma os limites da ' +
      'tua empresa — os valores por defeito são um ponto de partida, não os limites deles.',
  )
  paragrafo(
    'A conta deve ser HEDGING se quiseres mais do que uma posição no mesmo par. Em NETTING elas ' +
      'fundem-se numa só e o volume soma.',
  )
  paragrafo(
    'Corre em demo primeiro, durante semanas, na mesma conta e corretora onde vais operar a ' +
      'sério. É a única forma de saber o que o teu contexto faz aos números.',
  )

  // ── Painel ──────────────────────────────────────────────────────────────────
  titulo('6. O painel')
  paragrafo(
    'Automático ligado/desligado, comprar e vender à mão, risco em % ou em lotes, fecho parcial, ' +
      'trailing (ATR ou pontos), fechar tudo, estilo de trading, idioma PT/EN e três vistas de ' +
      'gráfico. Arrasta os painéis pela barra de título para os pores onde quiseres.',
  )

  // ── Actualizações ───────────────────────────────────────────────────────────
  titulo('7. Actualizações')
  paragrafo(
    'O EA avisa-te no gráfico quando sai uma versão nova e diz o que mudou. Se ligares ' +
      '"Descarregar o build novo para a pasta Files", ele traz o ficheiro para MQL5\\Files — depois ' +
      'move-o para MQL5\\Experts\\MTM e volta a pôr no gráfico.',
  )
  paragrafo(
    'Não se substitui a si próprio, e ninguém o consegue fazer: o MetaTrader não deixa um EA ' +
      'escrever por cima do seu próprio ficheiro. Quem promete actualização totalmente automática ' +
      'está a usar uma DLL — que te obriga a autorizar código nativo na tua máquina — ou não está ' +
      'a dizer a verdade.',
  )
  paragrafo(
    'Há também afinações de risco e trailing que podem chegar do nosso lado, se ligares ' +
      '"Aceitar afinações do servidor". Vem desligado de propósito: mudar o risco de quem está a ' +
      'operar não é coisa para acontecer sem autorização.',
  )

  // ── Rodapé ──────────────────────────────────────────────────────────────────
  cabe(60)
  doc.moveDown(1.2)
  doc.moveTo(M, doc.y).lineTo(M + L, doc.y).lineWidth(0.7).strokeColor('#DDDDDD').stroke()
  doc.y += 10
  doc
    .fillColor(CINZA_CLARO)
    .fontSize(8)
    .font('Helvetica')
    .text(
      'MoreThanMoney  ·  morethanmoney.pt  ·  Software de apoio à decisão. Negociar com alavancagem ' +
        'implica risco de perda do capital investido. Nada aqui é aconselhamento de investimento.',
      M,
      doc.y,
      { width: L, lineGap: 1.5 },
    )

  doc.end()
  return feito
}
