import fs from "fs"
import path from "path"
import PDFDocument from "pdfkit"
import QRCode from "qrcode"
import type { CertTemplate } from "./config"
import { formatPtDate, firstLastName } from "./config"
import { getSiteUrl } from "@/lib/mail-transport"

// Gerador de certificados: usa os fundos limpos exportados do Canva (public/certificados)
// e sobrepõe nome / nota / código de validação. Coordenadas calibradas visualmente
// (canvas 1123x794, texto ancorado pela linha de base = baselineY).

const W = 1123
const H = 794

type Field = {
  cx: number // centro horizontal
  baselineY: number // linha de base das letras
  maxW: number
  size: number
  color: string
  prefix?: string
  suffix?: string
}
type TemplateConfig = {
  bg: string
  name: Field
  grade?: Field
  footerColor: string
}

const TEMPLATES: Record<CertTemplate, TemplateConfig> = {
  "fast-start": {
    bg: "fast-start-bg.png",
    name: { cx: 590, baselineY: 402, maxW: 800, size: 92, color: "#d8a441" },
    footerColor: "#c8c8c8",
  },
  bootcamp: {
    bg: "bootcamp-bg.png",
    name: { cx: 560, baselineY: 378, maxW: 840, size: 70, color: "#d8a441" },
    grade: { cx: 716, baselineY: 548, maxW: 170, size: 19, color: "#d8a441" },
    footerColor: "#c8c8c8",
  },
  "teste-final": {
    bg: "teste-final-bg.png",
    name: { cx: 575, baselineY: 388, maxW: 840, size: 43, color: "#a86a22" },
    grade: { cx: 575, baselineY: 628, maxW: 780, size: 17, color: "#1c1206", prefix: "Classificação final: ", suffix: " valores" },
    footerColor: "#3a2a10",
  },
}

// ---- carregamento de assets (fs em dev/serverless, fallback fetch do CDN) ----
const assetCache = new Map<string, Buffer>()

async function loadAsset(name: string): Promise<Buffer> {
  const cached = assetCache.get(name)
  if (cached) return cached
  try {
    const p = path.join(process.cwd(), "public", "certificados", name)
    const buf = fs.readFileSync(p)
    if (buf?.length) {
      assetCache.set(name, buf)
      return buf
    }
  } catch {
    /* fallback */
  }
  const url = `${getSiteUrl()}/certificados/${name}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha a carregar asset do certificado: ${name} (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  assetCache.set(name, buf)
  return buf
}

// Ajusta o tamanho para o texto caber numa linha dentro da largura.
function fitFontSize(doc: PDFKit.PDFDocument, text: string, font: string, maxSize: number, minSize: number, maxWidth: number): number {
  doc.font(font)
  let size = maxSize
  while (size > minSize) {
    doc.fontSize(size)
    if (doc.widthOfString(text) <= maxWidth) break
    size -= 1
  }
  return size
}

// Desenha texto centrado em cx com a base das letras em baselineY.
function drawBaseline(doc: PDFKit.PDFDocument, text: string, f: Field, font: string, size: number) {
  doc.font(font).fillColor(f.color).fontSize(size)
  const ascent = ((doc as any)._font.ascender / 1000) * size
  const yTop = f.baselineY - ascent
  doc.text(text, f.cx - f.maxW / 2, yTop, { width: f.maxW, align: "center", lineBreak: false })
}

export type CertificateInput = {
  template: CertTemplate
  name: string
  gradeText?: string | null // ex.: "17,2" — a moldura (prefixo/sufixo) vem do template
  code: string
  date?: Date
}

// Geometria do QR (canto inferior direito) — fundo branco para garantir leitura.
const QR_BOX = 112
const QR_MARGIN = 18
const QR_X = W - QR_BOX - QR_MARGIN
const QR_Y = H - QR_BOX - QR_MARGIN

export async function generateCertificatePdf(input: CertificateInput): Promise<Buffer> {
  const cfg = TEMPLATES[input.template]
  const site = getSiteUrl()
  const validateUrl = `${site}/avaliacoes/validar/${input.code}`

  const [bg, scriptFont, qrPng] = await Promise.all([
    loadAsset(cfg.bg),
    loadAsset("GreatVibes-Regular.ttf"),
    QRCode.toBuffer(validateUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
      color: { dark: "#101011", light: "#ffffff" },
    }),
  ])

  const displayName = firstLastName(input.name) || input.name

  return await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [W, H], margin: 0 })
      const chunks: Buffer[] = []
      doc.on("data", (c) => chunks.push(c as Buffer))
      doc.on("end", () => resolve(Buffer.concat(chunks)))
      doc.on("error", reject)

      doc.registerFont("Script", scriptFont)
      doc.image(bg, 0, 0, { width: W, height: H })

      // nome (primeiro + último, script dourado, auto-ajuste)
      const ns = fitFontSize(doc, displayName, "Script", cfg.name.size, 22, cfg.name.maxW)
      drawBaseline(doc, displayName, cfg.name, "Script", ns)

      // nota
      if (cfg.grade && input.gradeText) {
        const g = cfg.grade
        const label = `${g.prefix || ""}${input.gradeText}${g.suffix || ""}`
        drawBaseline(doc, label, g, "Times-Bold", g.size)
      }

      // QR de validação (canto inferior direito, sobre fundo branco arredondado)
      doc.save()
      doc.roundedRect(QR_X, QR_Y, QR_BOX, QR_BOX, 8).fill("#ffffff")
      doc.image(qrPng, QR_X + 8, QR_Y + 8, { width: QR_BOX - 16, height: QR_BOX - 16 })
      doc.restore()

      // rodapé: código de validação + data de emissão (à esquerda do QR)
      const footer = `Certificado nº ${input.code}  ·  Emitido em ${formatPtDate(input.date)}  ·  Validar: aponta a câmara ao QR →`
      doc.font("Helvetica").fillColor(cfg.footerColor).fontSize(9)
      doc.text(footer, 40, H - 24, { width: QR_X - 60, align: "center", lineBreak: false })

      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}
