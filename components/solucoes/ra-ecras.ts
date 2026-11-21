/**
 * Os ecrãs da SOLUÇÃO ESCOLHIDA, pintados em canvas (600×1300) para o telemóvel 3D/RA.
 *
 * Pedido do Ricardo (21/11/2026): o «Ver em 3D» tem de fazer a renderização da opção que vai ser
 * usada, não um ecrã genérico. Cada solução (kit) tem o seu ecrã com a marca, a cor e os serviços
 * do negócio: agenda com horas livres, conversa do assistente com as perguntas que a IA escreveu,
 * orçamento em PDF, quadro de clientes, faturas arrumadas, publicações e avaliações, loja.
 *
 * Exemplos ilustrativos: sem números de resultados; nomes de pessoas são fictícios.
 */

export type Tr = (pt: string) => string

export interface DadosEcra {
  marca: string
  principal: string
  corFundo: string
  corTexto: string
  fonte: string
  slogan: string
  servicos: { s: string; p: string }[]
  boasVindas: string
  faq: { p: string; r: string }[]
}

export const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif"
export const W = 600
export const H = 1300

export function claro(hex: string): boolean {
  const h = hex.replace("#", "")
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
}

export function redondo(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

export function cortar(g: CanvasRenderingContext2D, s: string, max: number): string {
  if (g.measureText(s).width <= max) return s
  let x = s
  while (x.length > 1 && g.measureText(`${x}…`).width > max) x = x.slice(0, -1)
  return `${x}…`
}

/** Parte um texto em linhas que cabem em `max` (no máximo `linhas`). */
export function quebrar(g: CanvasRenderingContext2D, s: string, max: number, linhas = 4): string[] {
  const out: string[] = []
  let atual = ""
  for (const p of s.split(/\s+/)) {
    const t = atual ? `${atual} ${p}` : p
    if (g.measureText(t).width > max && atual) {
      out.push(atual)
      atual = p
      if (out.length === linhas) break
    } else atual = t
  }
  if (out.length < linhas && atual) out.push(atual)
  if (out.length === linhas && s.length > out.join(" ").length) out[linhas - 1] = cortar(g, `${out[linhas - 1]}…`, max)
  return out
}

interface Pincel {
  g: CanvasRenderingContext2D
  c: HTMLCanvasElement
  d: DadosEcra
  sobre: string
  texto: string
  cartao: string
  linha: string
  suave: string
}

function tela(d: DadosEcra, titulo: string): Pincel & { y: number } {
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const g = c.getContext("2d")!
  const escuro = !claro(d.corFundo)
  const p: Pincel = {
    g,
    c,
    d,
    sobre: claro(d.principal) ? "#111" : "#fff",
    texto: d.corTexto,
    cartao: escuro ? "rgba(255,255,255,0.07)" : "#ffffff",
    linha: escuro ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
    suave: escuro ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)",
  }
  g.save()
  redondo(g, 0, 0, W, H, 70)
  g.clip()
  g.fillStyle = d.corFundo
  g.fillRect(0, 0, W, H)
  // barra da marca
  const grad = g.createLinearGradient(0, 0, W, 220)
  grad.addColorStop(0, d.principal)
  grad.addColorStop(1, `${d.principal}d0`)
  g.fillStyle = grad
  g.fillRect(0, 0, W, 210)
  g.fillStyle = p.sobre
  g.globalAlpha = 0.85
  g.font = `600 26px ${SANS}`
  g.fillText("9:41", 56, 66)
  g.fillText("●●● ▮", W - 140, 66)
  g.globalAlpha = 0.2
  g.beginPath()
  g.arc(84, 145, 34, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
  g.font = `800 36px ${d.fonte}`
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.fillText((d.marca.trim()[0] ?? "M").toUpperCase(), 84, 147)
  g.textAlign = "left"
  g.textBaseline = "alphabetic"
  g.font = `800 34px ${d.fonte}`
  g.fillText(cortar(g, d.marca, W - 200), 134, 140)
  g.globalAlpha = 0.85
  g.font = `500 24px ${SANS}`
  g.fillText(cortar(g, titulo, W - 200), 134, 176)
  g.globalAlpha = 1
  return { ...p, y: 250 }
}

function fechar(p: Pincel): HTMLCanvasElement {
  const { g } = p
  g.fillStyle = p.texto
  g.globalAlpha = 0.35
  redondo(g, W / 2 - 90, H - 40, 180, 10, 5)
  g.fill()
  g.globalAlpha = 1
  g.restore()
  return p.c
}

function botao(p: Pincel, texto: string, y = H - 190) {
  const { g } = p
  redondo(g, 50, y, W - 100, 100, 50)
  g.fillStyle = p.d.principal
  g.fill()
  g.fillStyle = p.sobre
  g.font = `800 34px ${SANS}`
  g.textAlign = "center"
  g.fillText(cortar(g, texto, W - 160), W / 2, y + 62)
  g.textAlign = "left"
}

function rotulo(p: Pincel, texto: string, y: number) {
  const { g } = p
  g.fillStyle = p.suave
  g.font = `700 22px ${SANS}`
  g.fillText(texto.toUpperCase(), 50, y)
}

function pilula(p: Pincel, x: number, y: number, texto: string, ativa: boolean, riscada = false): number {
  const { g } = p
  g.font = `600 26px ${SANS}`
  const w = g.measureText(texto).width + 44
  redondo(g, x, y, w, 62, 31)
  g.fillStyle = ativa ? p.d.principal : p.cartao
  g.fill()
  g.strokeStyle = ativa ? p.d.principal : p.linha
  g.lineWidth = 2
  g.stroke()
  g.fillStyle = ativa ? p.sobre : p.texto
  g.globalAlpha = riscada ? 0.3 : 1
  g.fillText(texto, x + 22, y + 41)
  if (riscada) {
    g.fillRect(x + 18, y + 31, w - 36, 2)
  }
  g.globalAlpha = 1
  return w
}

function cartaoRect(p: Pincel, x: number, y: number, w: number, h: number) {
  const { g } = p
  redondo(g, x, y, w, h, 26)
  g.fillStyle = p.cartao
  g.fill()
  g.strokeStyle = p.linha
  g.lineWidth = 2
  g.stroke()
}

function bolha(p: Pincel, texto: string, y: number, ia: boolean): number {
  const { g } = p
  g.font = `500 26px ${SANS}`
  const linhas = quebrar(g, texto, 380, 4)
  const lw = Math.max(...linhas.map((l) => g.measureText(l).width)) + 48
  const h = linhas.length * 36 + 32
  const x = ia ? 44 : W - 44 - lw
  redondo(g, x, y, lw, h, 28)
  g.fillStyle = ia ? p.cartao : p.d.principal
  g.fill()
  if (ia) {
    g.strokeStyle = p.linha
    g.lineWidth = 2
    g.stroke()
  }
  g.fillStyle = ia ? p.texto : p.sobre
  linhas.forEach((l, i) => g.fillText(l, x + 24, y + 48 + i * 36))
  return y + h + 18
}

/* ─────────── um ecrã por solução ─────────── */

function agenda(d: DadosEcra, t: Tr): HTMLCanvasElement {
  const p = tela(d, t("Marcar"))
  let { y } = p
  rotulo(p, t("Serviço"), y)
  y += 20
  let x = 50
  d.servicos.slice(0, 3).forEach((s, i) => {
    p.g.font = `600 26px ${SANS}`
    if (x + p.g.measureText(s.s).width + 44 > W - 50) return
    x += pilula(p, x, y, s.s, i === 0) + 12
  })
  y += 110
  rotulo(p, t("Dia"), y)
  y += 20
  x = 50
  ;[t("Hoje"), t("Amanhã"), t("Sexta")].forEach((dia, i) => {
    x += pilula(p, x, y, dia, i === 1) + 12
  })
  y += 110
  rotulo(p, t("Horas livres"), y)
  y += 20
  const horas = ["09:30", "10:30", "11:00", "14:30", "16:00", "17:30"]
  horas.forEach((h, i) => {
    const col = i % 3
    const lin = Math.floor(i / 3)
    pilula(p, 50 + col * 172, y + lin * 80, h, i === 1, i === 3)
  })
  y += 190
  // lembrete
  cartaoRect(p, 50, y, W - 100, 150)
  p.g.fillStyle = p.d.principal
  p.g.beginPath()
  p.g.arc(110, y + 75, 32, 0, Math.PI * 2)
  p.g.fill()
  p.g.fillStyle = p.sobre
  p.g.font = `800 30px ${SANS}`
  p.g.textAlign = "center"
  p.g.fillText("🔔", 110, y + 86)
  p.g.textAlign = "left"
  p.g.fillStyle = p.texto
  p.g.font = `700 26px ${SANS}`
  p.g.fillText(cortar(p.g, t("Lembrete na véspera"), 330), 162, y + 64)
  p.g.fillStyle = p.suave
  p.g.font = `500 22px ${SANS}`
  p.g.fillText(cortar(p.g, t("Confirmar ou remarcar num toque"), 360), 162, y + 102)
  botao(p, t("Confirmar marcação"))
  return fechar(p)
}

function assistente(d: DadosEcra, t: Tr): HTMLCanvasElement {
  const p = tela(d, t("Assistente · responde na hora"))
  let y = p.y
  y = bolha(p, d.boasVindas, y, true)
  const faq = d.faq.length ? d.faq : [{ p: t("Têm vaga amanhã?"), r: t("Tenho estas horas livres. Queres que marque?") }]
  for (const q of faq.slice(0, 2)) {
    if (y > H - 420) break
    y = bolha(p, q.p, y, false)
    if (y > H - 380) break
    y = bolha(p, q.r, y, true)
  }
  // a escrever…
  if (y < H - 300) {
    redondo(p.g, 44, y, 120, 60, 30)
    p.g.fillStyle = p.cartao
    p.g.fill()
    p.g.fillStyle = p.suave
    for (let i = 0; i < 3; i++) {
      p.g.beginPath()
      p.g.arc(80 + i * 24, y + 30, 7, 0, Math.PI * 2)
      p.g.fill()
    }
  }
  // caixa de escrever
  redondo(p.g, 40, H - 170, W - 80, 90, 45)
  p.g.fillStyle = p.cartao
  p.g.fill()
  p.g.strokeStyle = p.linha
  p.g.stroke()
  p.g.fillStyle = p.suave
  p.g.font = `500 26px ${SANS}`
  p.g.fillText(t("Escreve uma mensagem…"), 80, H - 115)
  p.g.fillStyle = p.d.principal
  p.g.beginPath()
  p.g.arc(W - 90, H - 125, 32, 0, Math.PI * 2)
  p.g.fill()
  p.g.fillStyle = p.sobre
  p.g.font = `800 30px ${SANS}`
  p.g.textAlign = "center"
  p.g.fillText("➤", W - 88, H - 114)
  p.g.textAlign = "left"
  return fechar(p)
}

function orcamento(d: DadosEcra, t: Tr): HTMLCanvasElement {
  const p = tela(d, t("Pedir orçamento"))
  let { y } = p
  const perguntas = [
    { q: t("O que precisas?"), r: d.servicos[0]?.s ?? t("Serviço") },
    { q: t("Para quando?"), r: t("Esta semana") },
    { q: t("Fotos do pedido"), r: "" },
  ]
  for (const pr of perguntas) {
    rotulo(p, pr.q, y)
    y += 18
    if (pr.r) {
      pilula(p, 50, y, cortar(p.g, pr.r, 400), true)
      y += 100
    } else {
      for (let i = 0; i < 3; i++) {
        redondo(p.g, 50 + i * 170, y, 150, 120, 20)
        const gr = p.g.createLinearGradient(50 + i * 170, y, 200 + i * 170, y + 120)
        gr.addColorStop(0, `${d.principal}55`)
        gr.addColorStop(1, `${d.principal}15`)
        p.g.fillStyle = gr
        p.g.fill()
      }
      y += 160
    }
  }
  // o PDF
  cartaoRect(p, 50, y, W - 100, 300)
  p.g.fillStyle = d.principal
  redondo(p.g, 50, y, W - 100, 70, 26)
  p.g.fill()
  p.g.fillStyle = p.sobre
  p.g.font = `800 26px ${SANS}`
  p.g.fillText(cortar(p.g, `PDF · ${t("Orçamento pronto")}`, W - 160), 80, y + 46)
  p.g.fillStyle = p.texto
  for (let i = 0; i < 3; i++) {
    p.g.globalAlpha = 0.85
    p.g.font = `600 24px ${SANS}`
    p.g.fillText(cortar(p.g, d.servicos[i]?.s ?? "—", 300), 80, y + 125 + i * 52)
    p.g.globalAlpha = 0.6
    const pr = d.servicos[i]?.p ?? ""
    const w = p.g.measureText(pr).width
    p.g.fillText(pr, W - 80 - w, y + 125 + i * 52)
  }
  p.g.globalAlpha = 1
  botao(p, t("Aceitar e marcar"))
  return fechar(p)
}

function crm(d: DadosEcra, t: Tr): HTMLCanvasElement {
  const p = tela(d, t("Clientes e seguimento"))
  let { y } = p
  let x = 50
  ;[t("Novos"), t("Em conversa"), t("Marcados")].forEach((e, i) => {
    x += pilula(p, x, y, e, i === 1) + 10
  })
  y += 100
  const pessoas = [
    { n: "Marta S.", e: t("Seguimento enviado"), q: true },
    { n: "Rui C.", e: t("Pediu preço"), q: true },
    { n: "Inês P.", e: t("Marcou visita"), q: false },
    { n: "João M.", e: t("Sem resposta: lembrar sexta"), q: false },
  ]
  for (const pe of pessoas) {
    if (y + 140 > H - 220) break
    cartaoRect(p, 50, y, W - 100, 124)
    p.g.fillStyle = `${d.principal}33`
    p.g.beginPath()
    p.g.arc(108, y + 62, 34, 0, Math.PI * 2)
    p.g.fill()
    p.g.fillStyle = p.texto
    p.g.font = `800 28px ${SANS}`
    p.g.textAlign = "center"
    p.g.fillText(pe.n[0], 108, y + 72)
    p.g.textAlign = "left"
    p.g.font = `700 28px ${SANS}`
    p.g.fillText(pe.n, 164, y + 54)
    p.g.fillStyle = p.suave
    p.g.font = `500 22px ${SANS}`
    p.g.fillText(cortar(p.g, pe.e, 300), 164, y + 90)
    if (pe.q) {
      p.g.fillStyle = d.principal
      p.g.beginPath()
      p.g.arc(W - 90, y + 62, 12, 0, Math.PI * 2)
      p.g.fill()
    }
    y += 140
  }
  botao(p, t("Ver quem precisa de mim"))
  return fechar(p)
}

function faturas(d: DadosEcra, t: Tr): HTMLCanvasElement {
  const p = tela(d, t("Faturas do mês"))
  let { y } = p
  const linhas = [t("Fornecedor de produtos"), t("Eletricidade"), t("Telecomunicações"), t("Renda do espaço")]
  for (const l of linhas) {
    cartaoRect(p, 50, y, W - 100, 120)
    p.g.fillStyle = `${d.principal}30`
    redondo(p.g, 76, y + 26, 68, 68, 16)
    p.g.fill()
    p.g.fillStyle = p.texto
    p.g.font = `700 30px ${SANS}`
    p.g.textAlign = "center"
    p.g.fillText("📄", 110, y + 72)
    p.g.textAlign = "left"
    p.g.font = `700 26px ${SANS}`
    p.g.fillText(cortar(p.g, l, 320), 166, y + 54)
    p.g.fillStyle = p.suave
    p.g.font = `500 22px ${SANS}`
    p.g.fillText(cortar(p.g, `✓ ${t("Arrumada na pasta do mês")}`, 330), 166, y + 90)
    y += 136
  }
  cartaoRect(p, 50, y + 10, W - 100, 110)
  p.g.fillStyle = d.principal
  p.g.font = `700 26px ${SANS}`
  p.g.fillText(cortar(p.g, `➤ ${t("Enviadas ao contabilista")}`, W - 160), 80, y + 76)
  botao(p, t("Abrir a pasta"))
  return fechar(p)
}

function redes(d: DadosEcra, t: Tr): HTMLCanvasElement {
  const p = tela(d, t("Publicações e avaliações"))
  let { y } = p
  cartaoRect(p, 50, y, W - 100, 470)
  const gr = p.g.createLinearGradient(50, y, W - 50, y + 300)
  gr.addColorStop(0, d.principal)
  gr.addColorStop(1, `${d.principal}40`)
  p.g.fillStyle = gr
  redondo(p.g, 66, y + 16, W - 132, 290, 20)
  p.g.fill()
  p.g.fillStyle = p.sobre
  p.g.font = `800 40px ${d.fonte}`
  quebrar(p.g, d.slogan, W - 200, 2).forEach((l, i) => p.g.fillText(l, 96, y + 130 + i * 50))
  p.g.fillStyle = p.texto
  p.g.font = `500 24px ${SANS}`
  quebrar(p.g, `${d.servicos[0]?.s ?? ""} · ${d.marca}`, W - 180, 2).forEach((l, i) => p.g.fillText(l, 80, y + 352 + i * 34))
  pilula(p, 80, y + 392, `✓ ${t("Aprovar")}`, true)
  y += 500
  cartaoRect(p, 50, y, W - 100, 230)
  p.g.fillStyle = "#F5B400"
  p.g.font = `700 30px ${SANS}`
  p.g.fillText("★★★★★", 80, y + 52)
  p.g.fillStyle = p.texto
  p.g.font = `500 24px ${SANS}`
  p.g.fillText(cortar(p.g, t("«Atendimento impecável.»"), W - 160), 80, y + 96)
  p.g.fillStyle = p.suave
  p.g.font = `italic 500 22px ${SANS}`
  quebrar(p.g, `${t("Resposta")}: ${t("Obrigado! Ficamos à tua espera na próxima visita.")}`, W - 160, 3).forEach((l, i) => p.g.fillText(l, 80, y + 140 + i * 30))
  return fechar(p)
}

function loja(d: DadosEcra, t: Tr): HTMLCanvasElement {
  const p = tela(d, t("Loja"))
  let { y } = p
  const prods = d.servicos.slice(0, 4)
  while (prods.length < 4) prods.push({ s: t("Produto"), p: "" })
  prods.forEach((pr, i) => {
    const col = i % 2
    const lin = Math.floor(i / 2)
    const x = 50 + col * 258
    const yy = y + lin * 360
    cartaoRect(p, x, yy, 242, 340)
    const gr = p.g.createLinearGradient(x, yy, x + 242, yy + 210)
    gr.addColorStop(0, `${d.principal}${["66", "44", "55", "33"][i]}`)
    gr.addColorStop(1, `${d.principal}10`)
    p.g.fillStyle = gr
    redondo(p.g, x + 12, yy + 12, 218, 200, 18)
    p.g.fill()
    p.g.fillStyle = p.texto
    p.g.font = `700 24px ${SANS}`
    quebrar(p.g, pr.s, 210, 2).forEach((l, k) => p.g.fillText(l, x + 16, yy + 250 + k * 30))
    p.g.fillStyle = d.principal
    p.g.font = `800 24px ${SANS}`
    p.g.fillText(cortar(p.g, pr.p, 200), x + 16, yy + 320)
  })
  y += 740
  botao(p, `🛒 ${t("Finalizar compra")}`)
  return fechar(p)
}

export const ECRAS_KIT: Record<string, (d: DadosEcra, t: Tr) => HTMLCanvasElement> = {
  "agenda-lembretes": agenda,
  "agente-ia": assistente,
  orcamento,
  crm,
  faturas,
  redes,
  loja,
}
