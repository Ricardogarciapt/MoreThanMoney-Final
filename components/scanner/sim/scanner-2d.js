// Desenho 2D (canvas) de um recorte da simulação: é o que aparece em cada cartão de
// "pontos-chave", só com as camadas que explicam aquele ponto do script.

import { tr } from './i18n.js'

const UP = '#22c58b'
const DN = '#ef4b5a'

function pill(ctx, x, y, text, color, { fg = '#0b0b0d', outline = false, size = 11, align = 'left' } = {}) {
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`
  const w = ctx.measureText(text).width + 12
  const h = size + 8
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  ctx.beginPath()
  ctx.roundRect(x0, y - h / 2, w, h, h / 2)
  if (outline) {
    ctx.fillStyle = 'rgba(8,8,10,0.85)'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = color
  } else {
    ctx.fillStyle = color
    ctx.fill()
    ctx.fillStyle = fg
  }
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x0 + 6, y + 0.5)
}

const pick = (spec, item, kind) => {
  const s = spec[kind]
  if (s == null || s === false) return false
  if (s === true) return true
  if (Array.isArray(s)) return s.includes(item.name ?? item.label)
  if (typeof s === 'function') return s(item)
  return false
}

/**
 * Desenha o cartão `card` da simulação `sim` em `canvas` com `progress` 0–1 (revela as velas).
 * O tamanho em CSS vem do próprio canvas; a densidade de píxeis é tratada aqui.
 */
export function drawCard(canvas, sim, card, progress = 1, lang = 'pt') {
  const T = (s) => tr(lang, s)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = canvas.clientWidth, H = canvas.clientHeight
  if (!W || !H) return
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr) }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  const [a, b] = card.win
  const cur = a + (b - a) * Math.max(0, Math.min(1, progress))
  const L = card.layers
  const cs = sim.candles
  // Escala de preço: velas do recorte e, se for o caso, os níveis do grupo em destaque.
  let lo = Infinity, hi = -Infinity
  for (let i = a; i <= b; i++) { lo = Math.min(lo, cs[i].l); hi = Math.max(hi, cs[i].h) }
  const grp = L.groups ? (card.group ?? [...(sim.groups || [])].reverse().find((g) => g.i0 >= a && g.i0 <= b)) : null
  if (grp) for (const it of grp.items) { lo = Math.min(lo, it.price); hi = Math.max(hi, it.price) }
  const padY = (hi - lo) * 0.14
  lo -= padY
  hi += padY
  const right = grp ? 96 : L.panel ? 170 : 14
  const X = (i) => 10 + ((i - a) / (b - a)) * (W - 10 - right)
  const Y = (p) => H - 14 - ((p - lo) / (hi - lo)) * (H - 28)
  const bw = Math.max(1.5, ((W - right) / (b - a)) * 0.62)

  // Grelha discreta.
  ctx.strokeStyle = 'rgba(210,166,60,0.07)'
  ctx.lineWidth = 1
  for (let k = 1; k < 5; k++) {
    const y = (H / 5) * k
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  // Áreas (banda Sensei).
  if (L.areas) {
    for (const ar of sim.areas || []) {
      const end = Math.min(b, Math.floor(cur))
      if (end <= a) continue
      ctx.beginPath()
      for (let i = a; i <= end; i++) i === a ? ctx.moveTo(X(i), Y(ar.upper[i])) : ctx.lineTo(X(i), Y(ar.upper[i]))
      for (let i = end; i >= a; i--) ctx.lineTo(X(i), Y(ar.lower[i]))
      ctx.closePath()
      ctx.fillStyle = 'rgba(210,166,60,0.16)'
      ctx.fill()
    }
  }

  // Zonas.
  for (const z of sim.zones || []) {
    if (!pick(L, z, 'zones')) continue
    const rev = z.reveal ?? z.i0
    if (rev > cur || z.i1 < a || z.i0 > b) continue
    const x0 = X(Math.max(a, z.i0)), x1 = X(Math.min(b, z.i1, cur))
    if (x1 <= x0) continue
    ctx.fillStyle = z.color
    ctx.globalAlpha = Math.min(0.5, z.opacity * 1.6)
    ctx.fillRect(x0, Y(z.top), x1 - x0, Y(z.bot) - Y(z.top))
    ctx.globalAlpha = 1
    if (z.edge != null) {
      ctx.strokeStyle = z.color
      ctx.globalAlpha = 0.8
      ctx.beginPath(); ctx.moveTo(x0, Y(z.edge)); ctx.lineTo(x1, Y(z.edge)); ctx.stroke()
      ctx.globalAlpha = 1
    }
    if (z.label && z.label.length > 1) pill(ctx, x0 + 2, Y(z.top) - 9, T(z.label), '#e9c46a', { outline: true, size: 9 })
  }

  // Velas.
  if (L.candles !== false) {
    ctx.lineWidth = 1
    for (let i = a; i <= Math.min(b, Math.floor(cur)); i++) {
      const c = cs[i]
      const col = c.c >= c.o ? UP : DN
      ctx.strokeStyle = col
      ctx.fillStyle = col
      ctx.globalAlpha = L.dimCandles ? 0.45 : 1
      ctx.beginPath(); ctx.moveTo(X(i), Y(c.h)); ctx.lineTo(X(i), Y(c.l)); ctx.stroke()
      const yt = Y(Math.max(c.o, c.c)), yb = Y(Math.min(c.o, c.c))
      ctx.fillRect(X(i) - bw / 2, yt, bw, Math.max(1, yb - yt))
      ctx.globalAlpha = 1
    }
  }

  // Linhas.
  for (const ln of sim.lines) {
    if (!pick(L, ln, 'lines')) continue
    ctx.strokeStyle = ln.color
    ctx.lineWidth = ln.width > 0.06 ? 2.2 : 1.6
    ctx.shadowColor = ln.color
    ctx.shadowBlur = 6
    ctx.beginPath()
    let started = false
    for (let i = a; i <= Math.min(b, Math.floor(cur)); i++) {
      const v = ln.pts[i]
      if (v == null) { started = false; continue }
      if (!started) { ctx.moveTo(X(i), Y(v)); started = true } else {
        if (ln.step) ctx.lineTo(X(i), Y(ln.pts[i - 1] ?? v))
        ctx.lineTo(X(i), Y(v))
      }
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  // Segmentos tracejados (CHoCH).
  for (const sg of sim.segments || []) {
    if (!L.segments || sg.i1 > cur || sg.i1 < a || sg.i0 > b) continue
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = sg.color
    ctx.lineWidth = 1.4
    const x0 = X(Math.max(a, sg.i0)), x1 = X(Math.min(b, sg.i1))
    ctx.beginPath(); ctx.moveTo(x0, Y(sg.price)); ctx.lineTo(x1, Y(sg.price)); ctx.stroke()
    ctx.setLineDash([])
    pill(ctx, (x0 + x1) / 2, Y(sg.price) - 10, T(sg.label), sg.color, { outline: true, size: 9, align: 'center' })
  }

  // Grupo de níveis em destaque.
  if (grp && grp.i0 <= cur) {
    const x1 = X(Math.min(b, cur)) + 8
    const entry = grp.items[0].price
    const labels = []
    for (const it of grp.items) {
      if (it.from != null && it.from > cur) continue
      if (it.to != null && it.to <= cur) continue
      const xs = X(Math.max(a, it.from ?? grp.i0))
      ctx.strokeStyle = it.color
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(xs, Y(it.price)); ctx.lineTo(x1, Y(it.price)); ctx.stroke()
      ctx.fillStyle = it.color
      ctx.globalAlpha = 0.06
      ctx.fillRect(xs, Math.min(Y(it.price), Y(entry)), x1 - xs, Math.abs(Y(it.price) - Y(entry)))
      ctx.globalAlpha = 1
      labels.push({ y: Y(it.price), it })
    }
    labels.sort((p, q) => q.y - p.y)
    for (let k = 1; k < labels.length; k++) if (labels[k].y > labels[k - 1].y - 17) labels[k].y = labels[k - 1].y - 17
    for (const l of labels) pill(ctx, x1 + 4, l.y, T(l.it.label), l.it.color, { size: 10 })
  }

  // Marcadores.
  for (const m of sim.markers || []) {
    if (!L.markers || m.i > cur || m.i < a || m.i > b) continue
    pill(ctx, X(m.i), Y(m.price) + (m.up ? 14 : -14), T(m.text), m.color, { fg: '#fff', size: m.small ? 9 : 10, align: 'center' })
  }

  // Painel (tabela de tendência ou confirmações).
  if (L.panel && sim.panel) {
    const ci = Math.min(b, Math.floor(cur))
    const rows = sim.panel.rows
    const pw = 154, rh = 16
    const px = W - pw - 8, py = 8
    ctx.fillStyle = 'rgba(8,8,10,0.88)'
    ctx.beginPath(); ctx.roundRect(px, py, pw, 22 + rows.length * rh, 10); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.textBaseline = 'middle'
    ctx.font = '700 10px Inter, system-ui, sans-serif'
    ctx.fillStyle = '#e9c46a'
    ctx.fillText(T(sim.panel.title), px + 10, py + 12)
    rows.forEach((r, k) => {
      const v = r.states[ci]
      const on = v === 'ok' || v === 'Alta' || v === 'Acima'
      ctx.font = '500 9.5px Inter, system-ui, sans-serif'
      ctx.fillStyle = '#a9a7a0'
      ctx.fillText(T(r.label), px + 10, py + 30 + k * rh)
      ctx.font = '700 9.5px Inter, system-ui, sans-serif'
      ctx.fillStyle = on ? UP : DN
      ctx.textAlign = 'right'
      ctx.fillText(v === 'ok' ? '✓' : T(v), px + pw - 10, py + 30 + k * rh)
      ctx.textAlign = 'left'
    })
  }
}
