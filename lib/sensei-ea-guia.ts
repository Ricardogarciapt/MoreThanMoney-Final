import PDFDocument from 'pdfkit'

/**
 * O guia que acompanha a licença do MTM Sensei EA, em PDF.
 *
 * É gerado em código e não exportado de um Canva porque muda com o produto: os presets, os
 * números dos testes e o passo do WebRequest têm de estar certos no dia em que o cliente
 * descarrega, e um PDF estático fica desactualizado sem ninguém dar por isso.
 *
 * Os números que aqui aparecem são os do backtest e estão identificados como tal. Nenhum deles
 * é apresentado como rendimento esperado — porque não é.
 */

const OURO = '#D2A63C'
const OURO_ESCURO = '#BB8525'
const PRETO = '#0A0A0A'
const CINZA = '#4A4A4A'
const CINZA_CLARO = '#8A8A8A'

const M = 56 // margem

export async function gerarGuiaSensei(): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: M, info: { Title: 'MTM Sensei EA — Guia', Author: 'MoreThanMoney' } })
  const pedacos: Buffer[] = []
  doc.on('data', (c: Buffer) => pedacos.push(c))
  const feito = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(pedacos))))

  const L = doc.page.width - M * 2

  const titulo = (t: string) => {
    doc.moveDown(1.1)
    doc.fillColor(OURO).fontSize(15).font('Helvetica-Bold').text(t, M, doc.y)
    doc.moveTo(M, doc.y + 4).lineTo(M + L, doc.y + 4).lineWidth(0.7).strokeColor(OURO_ESCURO).stroke()
    doc.moveDown(0.7)
  }

  const paragrafo = (t: string) => {
    doc.fillColor(CINZA).fontSize(10).font('Helvetica').text(t, M, doc.y, { width: L, align: 'left', lineGap: 2.5 })
    doc.moveDown(0.45)
  }

  const passo = (n: number, t: string, d: string) => {
    const topo = doc.y
    doc.circle(M + 8, topo + 7, 8).fillColor(OURO).fill()
    doc.fillColor(PRETO).fontSize(9).font('Helvetica-Bold').text(String(n), M + 4.5, topo + 3.5)
    doc.fillColor(PRETO).fontSize(10.5).font('Helvetica-Bold').text(t, M + 26, topo, { width: L - 26 })
    doc.fillColor(CINZA).fontSize(9.5).font('Helvetica').text(d, M + 26, doc.y + 1, { width: L - 26, lineGap: 2 })
    doc.moveDown(0.7)
  }

  // ── Capa ────────────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 190).fillColor(PRETO).fill()
  doc.fillColor(OURO).fontSize(30).font('Helvetica-Bold').text('MTM SENSEI', M, 58)
  doc.fillColor('#FFFFFF').fontSize(15).font('Helvetica').text('Expert Advisor para MetaTrader 5', M, 96)
  doc.fillColor(CINZA_CLARO).fontSize(9.5).text('Guia de instalação, licença e presets  ·  MoreThanMoney', M, 122)
  doc.y = 220

  paragrafo(
    'Este guia leva-te do zero até ter o Sensei a correr numa conta MT5: instalar, activar a ' +
      'licença, escolher o preset certo e perceber o que o robô faz — e o que não faz.',
  )

  // ── Instalação ──────────────────────────────────────────────────────────────
  titulo('1. Instalar')
  passo(1, 'Abrir a pasta de dados', 'No MetaTrader 5: Ficheiro > Abrir Pasta de Dados.')
  passo(2, 'Copiar a pasta MQL5', 'Arrasta a pasta MQL5 do pacote para dentro, aceitando juntar os ficheiros. Nada teu é apagado — vai tudo para subpastas MTM.')
  passo(3, 'Ficheiro de notícias', 'A pasta Common do pacote vai para a pasta Common do MetaTrader (sobe dois níveis a partir da pasta de dados). Fica em Common\\Files\\mtm_news.csv.')
  passo(4, 'Compilar', 'MetaEditor (F4) e compila por esta ordem: MTM_Sensei_v3, MTM_Sensei_Core, MTM_Sensei_AllInOne. O indicador primeiro, sempre.')
  passo(5, 'Verificar', 'Arrasta Scripts > MTM > MTM_Setup para um gráfico. Ele aplica cores, indicador e modelo, e escreve no separador Especialistas um relatório do que está bem e do que falta.')

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
  passo(2, 'Colar a chave', 'Ao pôr o EA no gráfico, escreve a chave (MTM-XXXX-XXXX-XXXX) no campo "Licença", no topo dos parâmetros.')
  passo(3, 'Confirmar', 'No separador Especialistas deve aparecer "LICENCA: valida". Se não aparecer, a mensagem diz exactamente o que falta.')
  paragrafo(
    'Se a internet cair, o EA continua a trabalhar até 72 horas com a última validação. Passado ' +
      'esse prazo pára de abrir ordens — as que já estão abertas continuam a ser geridas.',
  )
  paragrafo('Mudaste de conta ou de corretora? Pede-nos para libertar a licença e volta a ligá-la.')

  doc.addPage()

  // ── Presets ─────────────────────────────────────────────────────────────────
  titulo('3. Que preset usar')
  paragrafo(
    'Carrega o preset em "Parâmetros de Entrada" > Carregar. Cada um traz o par, o tempo gráfico ' +
      'e o horário já afinados.',
  )

  const linhas: Array<[string, string, string]> = [
    ['MTM_AllInOne_XAUUSD_H1.set', 'Ouro, 1 hora', 'O único validado. Sessões de Londres e Nova Iorque, 08:00–21:00.'],
    ['MTM_AllInOne_XAUUSD_M15.set', 'Ouro, 15 min', 'Resultado praticamente nulo nos testes. Só para experimentar em demo.'],
    ['MTM_AllInOne_BTCUSD_H1.set', 'Bitcoin, 1 hora', 'Por validar — negativo nos testes feitos.'],
    ['MTM_AllInOne_US30_H1.set', 'US30, 1 hora', 'Por validar — histórico insuficiente para concluir.'],
  ]
  for (const [ficheiro, par, nota] of linhas) {
    doc.fillColor(OURO).fontSize(9.5).font('Helvetica-Bold').text(ficheiro, M, doc.y, { width: L })
    doc.fillColor(PRETO).fontSize(9.5).font('Helvetica-Bold').text(par, M, doc.y, { width: L })
    doc.fillColor(CINZA).fontSize(9).font('Helvetica').text(nota, M, doc.y, { width: L, lineGap: 2 })
    doc.moveDown(0.55)
  }

  paragrafo(
    'EURUSD, GBPUSD e USDJPY foram testados e perdem dinheiro. Não vêm presets para eles de ' +
      'propósito. XAUUSD em M5 deu -55,6% no período testado — não usar.',
  )

  // ── O que os testes dizem ───────────────────────────────────────────────────
  titulo('4. O que os testes dizem (e o que não dizem)')
  doc.rect(M, doc.y, L, 74).fillColor('#FAF6EC').fill()
  doc.fillColor(PRETO).fontSize(10).font('Helvetica-Bold').text('XAUUSD H1, 31 meses de backtest', M + 14, doc.y - 62, { width: L - 28 })
  doc
    .fillColor(CINZA)
    .fontSize(9.5)
    .font('Helvetica')
    .text(
      '+24,6% acumulado  ·  138 trades  ·  cerca de +0,79% ao mês, em média.\n' +
        'Isto é o resultado de um teste sobre histórico, não uma promessa. Meses negativos fazem parte.',
      M + 14,
      doc.y + 2,
      { width: L - 28, lineGap: 2 },
    )
  doc.y += 26
  doc.moveDown(1)

  paragrafo(
    'Um backtest não inclui slippage real, alargamento de spread em notícias, nem a corretora que ' +
      'tens. Corre primeiro em demo, durante semanas, na mesma conta e corretora onde vais operar ' +
      'a sério. É a única forma de saber o que o teu contexto faz aos números.',
  )

  // ── Antes de arriscar ───────────────────────────────────────────────────────
  titulo('5. Antes de arriscar dinheiro')
  paragrafo(
    '· O filtro de spread vem DESLIGADO. Cada corretora usa casas decimais diferentes e um valor ' +
      'errado bloqueia todas as entradas em silêncio. O MTM_Setup diz-te o spread do teu símbolo; ' +
      'usa cerca de 3× esse valor se o quiseres ligar.',
  )
  paragrafo('· O módulo de prop firm vem desligado. Liga-o só na conta de desafio e confirma os limites da tua empresa.')
  paragrafo('· A conta deve ser HEDGING se quiseres mais do que uma posição no mesmo par. Em NETTING elas fundem-se.')
  paragrafo('· Corre em demo primeiro. Sempre.')

  // ── Painel ──────────────────────────────────────────────────────────────────
  titulo('6. O painel')
  paragrafo(
    'Automático ligado/desligado, comprar e vender à mão, risco em % ou em lotes, fecho parcial, ' +
      'trailing (ATR ou pontos), fechar tudo, estilo de trading, idioma PT/EN e três vistas de ' +
      'gráfico. Arrasta os painéis pela barra de título para os pores onde quiseres.',
  )

  // ── Rodapé ──────────────────────────────────────────────────────────────────
  doc.moveDown(1.5)
  doc.moveTo(M, doc.y).lineTo(M + L, doc.y).lineWidth(0.7).strokeColor('#DDDDDD').stroke()
  doc.moveDown(0.6)
  doc
    .fillColor(CINZA_CLARO)
    .fontSize(8)
    .font('Helvetica')
    .text(
      'MoreThanMoney  ·  morethanmoney.pt  ·  Software de apoio à decisão. Negociar com alavancagem ' +
        'implica risco de perda do capital. Nada aqui é aconselhamento de investimento.',
      M,
      doc.y,
      { width: L, lineGap: 1.5 },
    )

  doc.end()
  return feito
}
