import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { getSiteUrl } from '@/lib/mail-transport'

/**
 * Certificados do Torneio e do MTM Funded.
 *
 * Desenhado, não montado sobre uma imagem. Os certificados das avaliações assentam em fundos
 * exportados do Canva, e para o torneio esses fundos não existem — esperar por eles era não
 * ter certificados no dia 15. Se um dia houver arte própria, entra em `FUNDO` e o resto
 * mantém-se.
 *
 * O código de validação é PÚBLICO e verificável em /mtmfunded/certificado/<código>. Um
 * certificado que ninguém pode confirmar não vale mais do que um print — e este vai ser
 * mostrado a quem contrata e a quem financia.
 */

const W = 842 // A4 paisagem, em pontos
const H = 595
const OURO = '#D2A63C'
const OURO_ESCURO = '#BB8525'
const FUNDO = '#0A0B0F'
const TEXTO = '#F5F3EE'

export type TipoCertificado = 'participacao' | 'classificacao' | 'desafio' | 'financiado' | 'payout'

export interface CertificadoInput {
  tipo: TipoCertificado
  nome: string
  /** "Trading Tournament · 3.º Trimestre 2026" */
  prova: string
  /** 1, 2, 3… quando é de classificação. */
  posicao?: number | null
  /** Resultado em %, quando faz sentido mostrá-lo. */
  resultadoPct?: number | null
  codigo: string
  data?: Date
  /** Valor pago, nos certificados de pagamento. É o número que o documento certifica. */
  valorUsd?: number | null
  /**
   * Substitui o título por omissão do tipo.
   *
   * Existe para o caso das FASES: «Desafio Concluído» num certificado de primeira fase promete
   * o que não aconteceu. Com isto, o título diz «Fase 1 de 2 concluída» e a linha de baixo diz
   * qual é o desafio — sem repetir a palavra «concluído» duas vezes na mesma folha.
   */
  titulo?: string | null
}

const TITULOS: Record<TipoCertificado, string> = {
  participacao: 'Certificado de Participação',
  classificacao: 'Certificado de Classificação',
  desafio: 'Desafio Concluído',
  financiado: 'Trader Financiado',
  payout: 'Certificado de Pagamento',
}

function ordinal(n: number): string {
  return `${n}.º lugar`
}

function ficheiro(nome: string): string | null {
  const p = path.join(process.cwd(), 'public', 'certificados', nome)
  return fs.existsSync(p) ? p : null
}

export async function gerarCertificadoPdf(input: CertificadoInput): Promise<Buffer> {
  const site = getSiteUrl()
  // `/mtmfunded/certificates` é a casa dos certificados: mostra este, deixa o dono
  // descarregá-lo, e mostra os outros a quem chegar aqui por curiosidade. O endereço antigo
  // (`/mtmfunded/certificado/…`) continua a funcionar — há certificados impressos com ele.
  const urlValidacao = `${site}/mtmfunded/certificates/${input.codigo}`
  const data = input.data ?? new Date()

  const qr = await QRCode.toBuffer(urlValidacao, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
    color: { dark: '#0A0B0F', light: '#FFFFFF' },
  })

  const doc = new PDFDocument({ size: [W, H], margin: 0 })
  const pedacos: Buffer[] = []
  doc.on('data', (d: Buffer) => pedacos.push(d))
  const terminado = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(pedacos))))

  /**
   * FUNDO com gradiente, e não um rectângulo chapado.
   *
   * Dois gradientes sobrepostos: um vertical que levanta o centro da folha, e um halo dourado
   * por trás do nome. É o que separa um certificado de uma folha preta com texto — e um
   * certificado é para ser mostrado a terceiros, onde o aspecto é metade do argumento.
   *
   * Tudo desenhado aqui, em vectores. Uma imagem de fundo gerada fora obrigaria a distribuir
   * um ficheiro com o código, a mantê-lo sincronizado com as medidas do PDF, e a re-exportá-lo
   * de cada vez que alguém mexesse numa margem.
   */
  const fundoVertical = doc.linearGradient(0, 0, 0, H)
  fundoVertical.stop(0, '#0E1016').stop(0.45, '#0A0B0F').stop(1, '#07080B')
  doc.rect(0, 0, W, H).fill(fundoVertical)

  // O halo por trás do nome: dourado muito diluído, a abrir do centro.
  const halo = doc.radialGradient(W / 2, 300, 10, W / 2, 300, 380)
  halo.stop(0, OURO, 0.13).stop(1, OURO, 0)
  doc.rect(0, 120, W, 330).fill(halo)

  // Cantos dourados em vez de uma moldura fechada: a moldura inteira esmaga o conteúdo numa
  // folha A4 em paisagem, e estes marcam o documento sem o encaixotar.
  doc.lineWidth(1.6).strokeColor(OURO)
  const c = 46
  for (const [x, y, dx, dy] of [
    [30, 30, 1, 1], [W - 30, 30, -1, 1], [30, H - 30, 1, -1], [W - 30, H - 30, -1, -1],
  ] as Array<[number, number, number, number]>) {
    doc.moveTo(x + dx * c, y).lineTo(x, y).lineTo(x, y + dy * c).stroke()
  }
  doc.lineWidth(0.5).strokeColor(OURO_ESCURO).rect(40, 40, W - 80, H - 80).stroke()

  // Logótipo do MTM FUNDED. Sem ele, o nome da marca em texto — um certificado sem
  // identificação nenhuma não serve para nada.
  // A versão de 500px, e não o original de 1400: o PDF embute a imagem tal como ela é, e o
  // original transformava um certificado de 40 KB num anexo de email de 2,2 MB.
  const logo =
    ficheiro('../mtmfunded/logo-mtm-funded-v2-pdf.png') ??
    ficheiro('../mtmfunded/logo-mtm-funded-v2.png') ??
    ficheiro('../logo-mtm.png') ??
    ficheiro('logo-mtm.png')
  let temLogo = false
  if (logo) {
    try {
      // 168pt de largura: o logótipo do Funded é largo e baixo, e a 120 ficava ilegível.
      doc.image(logo, W / 2 - 84, 52, { width: 168 })
      temLogo = true
    } catch { /* segue sem logo */ }
  }
  // A marca aparece UMA vez: em imagem quando há logótipo, em texto quando não há. Escrever
  // as duas dava "MORE THAN MONEY" duas vezes seguidas, que é como um certificado deixa de
  // parecer feito por alguém.
  if (!temLogo) {
    doc.fillColor(OURO).font('Helvetica-Bold').fontSize(17)
      .text('MORE THAN MONEY', 0, 74, { width: W, align: 'center', characterSpacing: 5 })
    doc.fillColor('#6E6A5F').font('Helvetica').fontSize(8.5)
      .text('DIGITAL MINDS', 0, 100, { width: W, align: 'center', characterSpacing: 5 })
  } else {
    doc.fillColor('#6E6A5F').font('Helvetica').fontSize(8.5)
      .text('TRADE · EVOLVE · EARN', 0, 178, { width: W, align: 'center', characterSpacing: 5 })
  }

  doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(30)
    .text(input.titulo || TITULOS[input.tipo], 0, 206, { width: W, align: 'center' })

  doc.fillColor('#8A8578').font('Helvetica').fontSize(12)
    .text('Certifica-se que', 0, 262, { width: W, align: 'center' })

  // O nome é o que se lê primeiro e à distância.
  doc.fillColor(OURO).font('Helvetica-Bold').fontSize(38)
    .text(input.nome, 60, 288, { width: W - 120, align: 'center', lineBreak: false })

  /**
   * A frase muda com o TIPO, e não é um detalhe de estilo.
   *
   * O modelo genérico dizia «concluiu Pagamento de 1.234 USD» num certificado de pagamento —
   * uma frase que não quer dizer nada e que estraga o documento onde ele mais tem de ser
   * preciso, que é justamente onde certifica dinheiro.
   */
  const linha =
    input.tipo === 'payout'
      ? 'recebeu, da More Than Money, o pagamento de'
      : input.posicao
        ? `alcançou o ${ordinal(input.posicao)} no ${input.prova}`
        : input.tipo === 'participacao'
          ? `participou no ${input.prova}`
          : input.tipo === 'financiado'
            ? `é Trader Financiado da More Than Money — ${input.prova}`
            : `concluiu ${input.prova}`

  doc.fillColor(TEXTO).font('Helvetica').fontSize(14)
    .text(linha, 80, 348, { width: W - 160, align: 'center' })

  if (input.tipo === 'payout' && input.valorUsd != null && Number.isFinite(input.valorUsd)) {
    // O VALOR é o que este documento certifica: vai grande, a seguir à frase.
    doc.fillColor(OURO).font('Helvetica-Bold').fontSize(34)
      .text(
        `${Number(input.valorUsd).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`,
        0, 374, { width: W, align: 'center' },
      )
    doc.fillColor('#8A8578').font('Helvetica').fontSize(11)
      .text(
        'referente ao seu desempenho em conta financiada MTM Funded',
        80, 416, { width: W - 160, align: 'center' },
      )
  } else if (input.resultadoPct != null && Number.isFinite(input.resultadoPct)) {
    const sinal = input.resultadoPct > 0 ? '+' : ''
    doc.fillColor(OURO_ESCURO).font('Helvetica-Bold').fontSize(16)
      .text(`Resultado: ${sinal}${input.resultadoPct.toFixed(2)}%`, 0, 378, { width: W, align: 'center' })
  }

  doc.fillColor('#8A8578').font('Helvetica').fontSize(10)
    .text(
      data.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }),
      0, input.tipo === 'payout' ? 444 : 432, { width: W, align: 'center' },
    )

  // Código + QR: é isto que separa um certificado de uma imagem bonita.
  doc.fillColor('#6E6A5F').font('Helvetica').fontSize(8)
    .text('CÓDIGO DE VALIDAÇÃO', 60, H - 96, { characterSpacing: 2 })
  doc.fillColor(OURO).font('Helvetica-Bold').fontSize(13)
    .text(input.codigo, 60, H - 82)
  doc.fillColor('#6E6A5F').font('Helvetica').fontSize(7.5)
    .text(urlValidacao.replace(/^https?:\/\//, ''), 60, H - 62, { width: 320 })

  try {
    doc.image(qr, W - 60 - 88, H - 60 - 88, { width: 88 })
  } catch { /* sem QR o código continua a validar */ }

  doc.end()
  return terminado
}

/**
 * Código de validação.
 *
 * Prefixo por tipo (lê-se de relance o que é), ano, e seis caracteres aleatórios. Sem
 * sequência: um código previsível deixa adivinhar certificados que não são nossos.
 */
export function gerarCodigo(tipo: TipoCertificado, quando: Date = new Date()): string {
  const prefixos: Record<TipoCertificado, string> = {
    participacao: 'TP', classificacao: 'TC', desafio: 'DF', financiado: 'FT', payout: 'PO',
  }
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem I/O/0/1: confundem-se ao ler em voz alta
  let aleatorio = ''
  const bytes = require('crypto').randomBytes(6) as Buffer
  for (let i = 0; i < 6; i++) aleatorio += alfabeto[bytes[i] % alfabeto.length]
  return `${prefixos[tipo]}-${quando.getFullYear()}-${aleatorio}`
}
