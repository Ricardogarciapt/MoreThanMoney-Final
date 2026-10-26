/**
 * GRÁFICO DE VELAS PRÓPRIO PARA OS ALERTAS MTM — sem chaves e sem terceiros pagos.
 *
 * Porquê: a imagem dos alertas era desenhada pelo chart-img (render do gráfico TradingView) e esse
 * serviço tem uma quota DIÁRIA (BASIC 50/dia, PRO 500/dia). Com ~300 entradas por dia, cada uma com
 * o seu URL de imagem, a quota esgota-se todos os dias e o chart-img passa a responder
 * 429 «Limit Exceeded» — a partir daí TODOS os alertas caíam no cartão sintético /api/og/signal,
 * que só tem linhas e números, sem uma única vela. Era essa a «representação gráfica errada».
 *
 * Este módulo desenha o gráfico a partir das MESMAS velas públicas que já servem o WebTrader e o
 * Terminal MTM (lib/mercado/velas-referencia.ts → Binance/Yahoo, sem chave). O nível de preço da
 * referência é ancorado à ENTRADA do sinal no instante do sinal (fatorAncorado/reescalar), por isso
 * as velas e as linhas Entry/SL/TP ficam na mesma escala. Se não houver âncora fiável numa
 * referência que não esteja ao nosso nível, essa referência é recusada: melhor não desenhar do que
 * desenhar o instrumento errado.
 *
 * Saída em SVG (o cartão do alerta é um <img>, logo serve na perfeição) — não gasta CPU a
 * rasterizar nem depende do Satori.
 */
import {
  TF_SEG,
  type RefMercado,
  type VelaRef,
  fatorAncorado,
  fatorValido,
  referenciasPara,
  reescalar,
} from '@/lib/mercado/referencias'
import { buscarVelasRef } from '@/lib/mercado/velas-referencia'
import { linhasDaEstrategia, type LinhaEstrategia, type MarcaEstrategia } from '@/lib/sinais/grafico-estrategia'

const GOLD = '#D2A63C'
const GREEN = '#16b981'
const RED = '#ef4444'
const BLUE = '#3b82f6'
const INK = '#0b0d12'
const PANEL = '#12151d'
const GRID = '#1b1f2b'
const MUTED = '#9AA0AA'

/** Quantas velas se desenham e quantas ficam depois do instante do sinal. */
const VELAS = 110
const VELAS_DEPOIS = 35
/** Mínimo para o desenho valer a pena (menos do que isto não é um gráfico). */
export const VELAS_MINIMAS = 12

export interface SinalGrafico {
  ticker: string
  timeframe: string | null | undefined
  direcao: 'buy' | 'sell'
  entry: number | null
  sl: number | null
  tps: number[]
  /** Instante do sinal (unix, segundos). */
  emSeg: number
  alertName?: string | null
  largura?: number
  altura?: number
  /** Marca da estratégia (nome + cor) — lib/sinais/grafico-estrategia. */
  marca?: MarcaEstrategia
  /** Indicadores da estratégia, um valor por vela desenhada. */
  linhas?: LinhaEstrategia[]
  /** Velas a mais pedidas ANTES da janela (aquecimento dos indicadores). */
  historico?: number
}

/** Timeframe do alerta TradingView ("15", "60", "240", "1D") → timeframe das referências. */
export function tfParaRef(tf: string | null | undefined): string {
  const t = String(tf ?? '').trim().toUpperCase()
  if (!t) return 'H1'
  if (t === 'D' || t === '1D' || t === 'D1') return 'D1'
  if (t === 'W' || t === '1W') return 'D1' // as referências não têm semanal: o diário é o mais próximo
  const min = Number(t)
  if (!Number.isFinite(min) || min <= 0) return 'H1'
  if (min >= 1440) return 'D1'
  if (min >= 240) return 'H4'
  if (min >= 60) return 'H1'
  if (min >= 15) return 'M15'
  if (min >= 5) return 'M5'
  return 'M1'
}

/**
 * Nome da corretora → nome do catálogo das referências. Tira o sufixo dos perpétuos (`.P`) e
 * traduz os poucos nomes que o mapa das referências conhece por outro alias.
 */
export function simboloBase(ticker: string): string {
  const s = String(ticker || '').trim().toUpperCase().replace(/^[A-Z]+:/, '').replace(/\.(P|S)$/, '')
  const alias: Record<string, string> = { NATURALGAS: 'GAS', NATGAS: 'GAS', NGAS: 'GAS', USOUSD: 'USOIL', UKOUSD: 'UKOIL' }
  return alias[s] ?? s
}

/** Casas decimais pelo tamanho do preço — só quando os níveis do sinal não as ditam. */
function casas(v: number): number {
  const a = Math.abs(v)
  return a >= 1000 ? 2 : a >= 100 ? 3 : a >= 1 ? 5 : 5
}

/**
 * Casas do SINAL: as que a corretora escreveu nos níveis (XAUUSD 4274.31 → 2, EURJPY 180.589 → 3,
 * EURUSD 1.16452 → 5). É isto que faz a imagem falar a mesma língua do cartão do alerta.
 */
function casasDoSinal(niveis: (number | null | undefined)[], reserva: number): number {
  let d = -1
  for (const n of niveis) {
    if (n == null || !Number.isFinite(n)) continue
    const txt = String(n)
    const i = txt.indexOf('.')
    d = Math.max(d, i < 0 ? 0 : Math.min(6, txt.length - i - 1))
  }
  return d >= 0 ? d : casas(reserva)
}
function fmt(v: number | null | undefined, d?: number): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(d ?? casas(v))
}
/** Largura aproximada de um texto em negrito (maiúsculas são mais largas) — só para encostar rótulos. */
function larguraTexto(t: string, tam: number): number {
  let em = 0
  for (const ch of t) em += ch === ' ' ? 0.28 : /[A-Z0-9]/.test(ch) ? 0.66 : 0.54
  return Math.round(em * tam)
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Velas do sinal, já na escala dos preços do sinal. Percorre as referências do símbolo pela ordem
 * do catálogo e devolve a primeira que serve; [] se nenhuma servir.
 */
export async function velasDoSinal(sig: SinalGrafico): Promise<VelaRef[]> {
  const base = simboloBase(sig.ticker)
  const refs = referenciasPara(base)
  if (!refs.length) return []

  const tf = tfParaRef(sig.timeframe)
  const seg = TF_SEG[tf] ?? 3600
  // Janela: ~75 velas antes do sinal e ~35 depois (mostra também o que a trade fez).
  const ate = sig.emSeg + VELAS_DEPOIS * seg
  const ancora = sig.entry != null && sig.entry > 0 ? { preco: sig.entry, emSeg: sig.emSeg } : null

  for (const ref of refs) {
    const velas = await pedirVelas(ref, tf, ate, VELAS + Math.max(0, sig.historico ?? 0))
    if (velas.length < VELAS_MINIMAS) continue
    // Folga da âncora: normalmente 4 velas. Nos índices e acções a referência é o índice à vista,
    // que fecha horas antes do CFD (GER40 tem sinais às 16:45 UTC e o ^GDAXI fecha às 15:30) — aí
    // ancora-se ao último fecho disponível. O limite 0,9–1,1 do fator continua a barrar disparates.
    const f = fatorAncorado(velas, ancora, ref.sessaoCurta ? 4 * 86400 : 4 * seg)
    if (fatorValido(f)) return reescalar(velas, f, casasDoSinal([sig.entry, sig.sl, ...sig.tps], velas[velas.length - 1].c))
    // Sem âncora: só se a referência já estiver ao nosso nível (forex e cripto estão).
    if (ref.sameLevel) return velas
  }
  return []
}

function pedirVelas(ref: RefMercado, tf: string, ateSeg: number, limite: number): Promise<VelaRef[]> {
  // `ateSeg` no futuro (sinal fresco) é inofensivo: as fontes limitam ao presente.
  return buscarVelasRef(ref, tf, limite, ateSeg).catch(() => [])
}

/** Velas de aquecimento pedidas antes da janela, para as médias da estratégia já virem formadas. */
const AQUECIMENTO = 160

/**
 * Velas + indicadores da estratégia do sinal, já cortados à janela desenhada. Sem marca de
 * estratégia com indicadores, é o mesmo que `velasDoSinal`.
 */
export async function graficoDaEstrategia(
  sig: SinalGrafico & { marca: MarcaEstrategia },
): Promise<{ velas: VelaRef[]; linhas: LinhaEstrategia[] }> {
  const todas = await velasDoSinal({ ...sig, historico: AQUECIMENTO })
  if (todas.length < VELAS_MINIMAS) return { velas: [], linhas: [] }
  const linhas = linhasDaEstrategia(sig.marca, todas, simboloBase(sig.ticker))
  const corte = Math.max(0, todas.length - VELAS)
  return {
    velas: todas.slice(corte),
    linhas: linhas.map((l) => ({ ...l, valores: l.valores.slice(corte) })),
  }
}

interface Nivel { preco: number; cor: string; texto: string }

/**
 * Um texto do desenho. Vem também à parte porque o PNG (Satori/resvg) não tem fontes para os
 * <text> de um SVG embebido — saíam todos em branco; lá desenham-se como texto do próprio Satori.
 */
export interface TextoSvg {
  x: number
  /** linha de base, como no SVG */
  y: number
  texto: string
  cor: string
  tam: number
  peso?: number
  espacamento?: number
  ancora?: 'start' | 'middle' | 'end'
}

export interface DesenhoVelas {
  largura: number
  altura: number
  svg: string
  svgSemTexto: string
  textos: TextoSvg[]
}

/** O desenho completo (SVG com texto, SVG sem texto e os textos à parte). */
export function desenhoVelasSinal(sig: SinalGrafico, velas: VelaRef[]): DesenhoVelas {
  const W = sig.largura ?? 1200
  const H = sig.altura ?? 760
  const RODAPE = 140
  const TOPO = 56
  const EIXO = 116 // faixa à direita para os preços
  const areaX0 = 14
  const areaX1 = W - EIXO
  const areaY0 = TOPO + 10
  const areaY1 = H - RODAPE - 14
  const areaH = areaY1 - areaY0
  const areaW = areaX1 - areaX0

  const niveis: Nivel[] = []
  const dec = casasDoSinal([sig.entry, sig.sl, ...sig.tps], velas[velas.length - 1].c)
  if (sig.entry != null && sig.entry > 0) niveis.push({ preco: sig.entry, cor: BLUE, texto: `ENTRADA ${fmt(sig.entry, dec)}` })
  if (sig.sl != null && sig.sl > 0) niveis.push({ preco: sig.sl, cor: RED, texto: `SL ${fmt(sig.sl, dec)}` })
  sig.tps.forEach((tp, i) => niveis.push({ preco: tp, cor: GREEN, texto: `TP${i + 1} ${fmt(tp, dec)}` }))

  const precos = [...velas.map((v) => v.h), ...velas.map((v) => v.l), ...niveis.map((n) => n.preco)]
  const cru = { min: Math.min(...precos), max: Math.max(...precos) }
  const folga = (cru.max - cru.min || Math.abs(cru.max) * 0.001 || 1) * 0.06
  const min = cru.min - folga
  const max = cru.max + folga
  const span = max - min || 1
  const y = (p: number) => areaY1 - ((p - min) / span) * areaH

  const passo = areaW / velas.length
  const corpo = Math.max(1.5, Math.min(11, passo * 0.62))
  const x = (i: number) => areaX0 + passo * (i + 0.5)

  const dirCor = sig.direcao === 'sell' ? RED : GREEN
  const dirTxt = sig.direcao === 'sell' ? 'VENDA' : 'COMPRA'

  const partes: string[] = []
  const textos: TextoSvg[] = []
  const txt = (t: TextoSvg) => {
    textos.push(t)
    const a = t.ancora && t.ancora !== 'start' ? ` text-anchor="${t.ancora}"` : ''
    const p = t.peso ? ` font-weight="${t.peso}"` : ''
    const e = t.espacamento ? ` letter-spacing="${t.espacamento}"` : ''
    partes.push(`<text x="${+t.x.toFixed(1)}" y="${+t.y.toFixed(1)}" fill="${t.cor}" font-size="${t.tam}"${p}${e}${a} font-family="system-ui,-apple-system,Segoe UI,sans-serif">${esc(t.texto)}</text>`)
  }
  partes.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${INK}"/>`)

  // ── grelha + eixo dos preços ────────────────────────────────────────────────
  // O rótulo da grelha cala-se quando cairia por cima do crachá de um nível da trade.
  const yNiveis = niveis.map((n) => y(n.preco))
  for (let i = 0; i <= 4; i++) {
    const py = areaY0 + (areaH * i) / 4
    const pv = max - (span * i) / 4
    partes.push(`<line x1="${areaX0}" y1="${py.toFixed(1)}" x2="${areaX1}" y2="${py.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`)
    if (yNiveis.some((yn) => Math.abs(yn - py) < 17)) continue
    txt({ x: areaX1 + 8, y: py + 4, cor: MUTED, tam: 15, texto: fmt(pv, dec) })
  }

  // ── velas ───────────────────────────────────────────────────────────────────
  for (let i = 0; i < velas.length; i++) {
    const v = velas[i]
    const sobe = v.c >= v.o
    const cor = sobe ? GREEN : RED
    const cx = x(i)
    const yo = y(v.o)
    const yc = y(v.c)
    const topo = Math.min(yo, yc)
    const alt = Math.max(1, Math.abs(yc - yo))
    partes.push(`<line x1="${cx.toFixed(1)}" y1="${y(v.h).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${y(v.l).toFixed(1)}" stroke="${cor}" stroke-width="1.2" opacity="0.9"/>`)
    partes.push(`<rect x="${(cx - corpo / 2).toFixed(1)}" y="${topo.toFixed(1)}" width="${corpo.toFixed(1)}" height="${alt.toFixed(1)}" fill="${cor}" opacity="0.9"/>`)
  }

  // ── indicadores da estratégia ───────────────────────────────────────────────
  // Recortados à área das velas: uma média fora da escala não pode invadir o eixo nem o rodapé.
  const linhas = (sig.linhas ?? []).filter((l) => l.valores.length === velas.length)
  if (linhas.length) {
    partes.push(`<defs><clipPath id="area"><rect x="${areaX0}" y="${areaY0}" width="${areaW}" height="${areaH}"/></clipPath></defs>`)
    for (const l of linhas) {
      const troços: string[][] = [[]]
      l.valores.forEach((v, i) => {
        if (!Number.isFinite(v)) {
          if (troços[troços.length - 1].length) troços.push([])
          return
        }
        troços[troços.length - 1].push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      })
      for (const t of troços) {
        if (t.length < 2) continue
        partes.push(
          `<polyline clip-path="url(#area)" points="${t.join(' ')}" fill="none" stroke="${l.cor}" stroke-width="${l.espessura ?? 2}"${l.tracejada ? ' stroke-dasharray="6 5"' : ''} stroke-linejoin="round" opacity="0.95"/>`,
        )
      }
    }
    // Legenda dos indicadores, no canto INFERIOR esquerdo da área, sobre uma placa: em cima
    // pisava os rótulos do SL/TP quando o nível calhava junto ao topo.
    const larguraLegenda = linhas.reduce((acc, l) => acc + 40 + Math.round(l.nome.length * 8.2), 0)
    const ly = areaY1 - 12
    partes.push(`<rect x="${areaX0 + 4}" y="${ly - 20}" width="${larguraLegenda + 8}" height="28" rx="6" fill="${PANEL}" opacity="0.88"/>`)
    let lx = areaX0 + 10
    for (const l of linhas) {
      partes.push(`<line x1="${lx}" y1="${ly - 5}" x2="${lx + 22}" y2="${ly - 5}" stroke="${l.cor}" stroke-width="3"${l.tracejada ? ' stroke-dasharray="5 4"' : ''}/>`)
      txt({ x: lx + 28, y: ly, cor: l.cor, tam: 14, peso: 600, texto: l.nome })
      lx += 40 + Math.round(l.nome.length * 8.2)
    }
  }

  // ── momento do sinal (vertical tracejada) ───────────────────────────────────
  const iSinal = indiceDoInstante(velas, sig.emSeg)
  if (iSinal >= 0) {
    const cx = x(iSinal)
    partes.push(`<line x1="${cx.toFixed(1)}" y1="${areaY0}" x2="${cx.toFixed(1)}" y2="${areaY1}" stroke="${GOLD}" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.75"/>`)
  }

  // ── linhas da trade ─────────────────────────────────────────────────────────
  for (const n of niveis) {
    const py = y(n.preco)
    if (py < areaY0 - 2 || py > areaY1 + 2) continue
    partes.push(`<line x1="${areaX0}" y1="${py.toFixed(1)}" x2="${areaX1}" y2="${py.toFixed(1)}" stroke="${n.cor}" stroke-width="2"/>`)
    txt({ x: areaX0 + 8, y: py - 6, cor: n.cor, tam: 16, peso: 600, texto: n.texto })
    partes.push(`<rect x="${areaX1}" y="${(py - 12).toFixed(1)}" width="${EIXO}" height="24" fill="${n.cor}"/>`)
    txt({ x: areaX1 + 8, y: py + 5, cor: '#08131a', tam: 15, peso: 700, texto: fmt(n.preco, dec) })
  }

  // ── cabeçalho ───────────────────────────────────────────────────────────────
  partes.push(`<rect x="0" y="0" width="${W}" height="${TOPO}" fill="${PANEL}"/>`)
  // Faixa da cor da estratégia: é por ela que o membro reconhece o scanner antes de ler.
  if (sig.marca) partes.push(`<rect x="0" y="0" width="${W}" height="4" fill="${sig.marca.cor}"/>`)
  txt({ x: 18, y: 36, cor: '#ffffff', tam: 24, peso: 700, texto: sig.ticker.toUpperCase() })
  // Largura aproximada do ticker a 24px bold (~14,2 px por letra) + folga, para o crachá não pisar.
  const largTicker = 18 + Math.round(sig.ticker.trim().length * 14.2) + 14
  partes.push(`<rect x="${largTicker}" y="15" width="92" height="26" rx="6" fill="${dirCor}"/>`)
  txt({ x: largTicker + 46, y: 34, cor: '#08131a', tam: 15, peso: 800, ancora: 'middle', texto: dirTxt })
  const nomeEstrategia = sig.marca?.nome || sig.alertName || 'MTM'
  txt({ x: largTicker + 108, y: 35, cor: sig.marca?.cor ?? MUTED, tam: 17, peso: 700, texto: nomeEstrategia })
  txt({ x: largTicker + 108 + larguraTexto(nomeEstrategia, 17) + 6, y: 35, cor: MUTED, tam: 17, texto: `· ${rotuloTf(sig.timeframe)}` })
  txt({ x: W - 18, y: 35, cor: GOLD, tam: 17, peso: 800, espacamento: 2, ancora: 'end', texto: 'MORE THAN MONEY' })

  // ── rodapé com os parâmetros ────────────────────────────────────────────────
  partes.push(`<rect x="0" y="${H - RODAPE}" width="${W}" height="${RODAPE}" fill="${PANEL}"/>`)
  partes.push(`<line x1="0" y1="${H - RODAPE}" x2="${W}" y2="${H - RODAPE}" stroke="${GOLD}" stroke-width="2"/>`)
  const chips: { rotulo: string; valor: string; cor: string }[] = [
    { rotulo: 'ENTRADA', valor: fmt(sig.entry, dec), cor: BLUE },
    { rotulo: 'STOP LOSS', valor: fmt(sig.sl, dec), cor: RED },
    ...sig.tps.map((tp, i) => ({ rotulo: `TP${i + 1}`, valor: fmt(tp, dec), cor: GREEN })),
  ]
  const largChip = Math.min(210, (W - 40) / Math.max(1, chips.length))
  chips.forEach((c, i) => {
    const cx = 20 + largChip * i
    const cy = H - RODAPE + 36
    partes.push(`<rect x="${cx}" y="${cy - 22}" width="3" height="56" fill="${c.cor}"/>`)
    txt({ x: cx + 14, y: cy - 4, cor: MUTED, tam: 15, espacamento: 1, texto: c.rotulo })
    txt({ x: cx + 14, y: cy + 26, cor: c.cor, tam: 25, peso: 700, texto: c.valor })
  })
  txt({ x: 20, y: H - 16, cor: MUTED, tam: 14, texto: '@morethanmoney.pt' })
  txt({ x: W - 20, y: H - 16, cor: MUTED, tam: 14, ancora: 'end', texto: 'Material educativo · Não é aconselhamento financeiro · Trading tem risco' })

  const abrir = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">`
  return {
    largura: W,
    altura: H,
    svg: `${abrir}${partes.join('')}</svg>`,
    svgSemTexto: `${abrir}${partes.filter((p) => !p.startsWith('<text')).join('')}</svg>`,
    textos,
  }
}

/** SVG do gráfico: velas + linhas da trade + rodapé com os parâmetros e a marca MTM. */
export function svgVelasSinal(sig: SinalGrafico, velas: VelaRef[]): string {
  return desenhoVelasSinal(sig, velas).svg
}

/** Índice da vela que contém o instante (−1 se estiver fora da janela desenhada). */
function indiceDoInstante(velas: VelaRef[], emSeg: number): number {
  if (!velas.length || emSeg < velas[0].t) return -1
  let idx = -1
  for (let i = 0; i < velas.length; i++) {
    if (velas[i].t <= emSeg) idx = i
    else break
  }
  return idx
}

/** "15" → "M15", "240" → "H4" (só para escrever no cabeçalho). */
export function rotuloTf(tf: string | null | undefined): string {
  const r = tfParaRef(tf)
  return r
}
