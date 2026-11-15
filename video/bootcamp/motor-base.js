// Base comum dos gráficos «fiéis ao indicador» (trendshot.js, defy.js…): matemática do Pine
// (ema, alma, stdev, atr, pivots, rsi, supertrend) e desenho estilo TradingView (grelha, eixos, velas, etiquetas).
// Cada motor regista-se em window.MOTORES[<slug>] = { grafico(r, o, el), camadas3d: [...] }.
// O mercado é sintético (ilustrativo): nunca é histórico real.
;(function (G) {
  const rng = seed => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }
  const ema = (src, n) => { const a = 2 / (n + 1); let e = src[0]; return src.map(x => (e = e + a * (x - e))) }
  const sma = (src, n) => src.map((_, i) => { const j0 = Math.max(0, i - n + 1); let s = 0; for (let j = j0; j <= i; j++) s += src[j]; return s / (i - j0 + 1) })
  const stdev = (src, n) => src.map((_, i) => { const j0 = Math.max(0, i - n + 1), k = i - j0 + 1; let m = 0; for (let j = j0; j <= i; j++) m += src[j]; m /= k; let q = 0; for (let j = j0; j <= i; j++) q += (src[j] - m) ** 2; return Math.sqrt(q / k) })
  // ta.alma(src, len, offset, sigma)
  const alma = (src, len, off, sig) => { const m = off * (len - 1), s = len / sig, w = []; for (let k = 0; k < len; k++) w.push(Math.exp(-((k - m) ** 2) / (2 * s * s)))
    return src.map((_, i) => { let ws = 0, v = 0; for (let k = 0; k < len; k++) { const j = i - (len - 1) + k; if (j < 0) continue; ws += w[k]; v += w[k] * src[j] } return v / ws }) }
  const rma = (src, n) => { const o = []; src.forEach((x, i) => o.push(i < n ? src.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1) : (o[i - 1] * (n - 1) + x) / n)); return o }
  const trueRange = c => c.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)) : x.h - x.l)
  const atr = (c, n) => rma(trueRange(c), n)
  const rsi = (cl, n) => { const up = cl.map((x, i) => i ? Math.max(0, x - cl[i - 1]) : 0), dn = cl.map((x, i) => i ? Math.max(0, cl[i - 1] - x) : 0), u = rma(up, n), d = rma(dn, n); return u.map((x, i) => d[i] === 0 ? 100 : 100 - 100 / (1 + x / d[i])) }
  // ta.pivothigh/low(src, esq, dir): valor na vela i (confirmado dir velas depois) ou null
  const pivo = (c, esq, dir, alto) => c.map((_, i) => { const j = i - dir; if (j - esq < 0) return null; const ref = alto ? c[j].h : c[j].l
    for (let q = j - esq; q <= j + dir; q++) if (q !== j && (alto ? c[q].h > ref || (q > j && c[q].h === ref) : c[q].l < ref || (q > j && c[q].l === ref))) return null; return ref })
  // ta.supertrend(fator, atrLen) → direcção (-1 = alta, 1 = baixa, como no Pine)
  function supertrend(c, f, n) { const a = atr(c, n), dir = [], up = [], dn = []
    c.forEach((x, i) => { const m = (x.h + x.l) / 2; let u = m - f * a[i], d = m + f * a[i]
      if (i) { if (c[i - 1].c > up[i - 1]) u = Math.max(u, up[i - 1]); if (c[i - 1].c < dn[i - 1]) d = Math.min(d, dn[i - 1]) }
      up.push(u); dn.push(d); let dr = i ? dir[i - 1] : 1
      if (i) dr = dr === 1 ? (x.c > dn[i - 1] ? -1 : 1) : (x.c < up[i - 1] ? 1 : -1); dir.push(dr) }); return dir }
  const lowest = (arr, i, n) => { let m = Infinity; for (let q = Math.max(0, i - n + 1); q <= i; q++) m = Math.min(m, arr[q]); return m }
  const highest = (arr, i, n) => { let m = -Infinity; for (let q = Math.max(0, i - n + 1); q <= i; q++) m = Math.max(m, arr[q]); return m }
  const barssince = (cond, i) => { for (let q = i; q >= 0; q--) if (cond[q]) return i - q; return Infinity }

  // série de velas a partir de um roteiro [[n velas, deriva em ATR/vela, ruído?, volume×?], …]
  function velas(roteiro, seed, p0, A, minutos0 = 9 * 60, passo = 5) {
    const R = rng(seed), c = []; let p = p0, n0 = 0
    roteiro.forEach(([n, d, ru = .8, vm = 1, choque = 0]) => { for (let i = 0; i < n; i++) {
      const dd = typeof d === 'function' ? d(i, n) : d, ch = i === 0 ? choque : 0
      const o = p, cl = o + (dd + ch + (R() - .5) * ru) * A
      const h = Math.max(o, cl) + R() * .45 * A * (ch ? .25 : 1), l = Math.min(o, cl) - R() * .45 * A * (ch ? .25 : 1)
      c.push({ o, h, l, c: cl, v: (900 + R() * 600 + Math.abs(dd) * 700 + (ch ? 2600 : 0)) * vm, t: minutos0 + (c.length - n0) * passo }); p = cl } })
    return c
  }

  // janela visível: «ate» 0,62 (ou D.frac) = vela do sinal (como no gráfico genérico do motor), «zoom» aproxima o sinal
  function janela(D, ate, zoom) {
    const span = Math.max(60, (D.sig - D.ini) / (D.frac || .62))
    const n = Math.min(D.N, D.ini + Math.max(8, Math.round(span * ate)) + 1)
    const fim0 = Math.min(D.N, D.ini + Math.round(span)), fim1 = Math.min(D.N, D.sig + 40)
    const iniV = Math.round(D.ini + (Math.max(D.ini, D.sig - 50) - D.ini) * zoom)
    const fimV = Math.max(n, Math.round(fim0 + (fim1 - fim0) * zoom))
    return { iniV, fimV, ult: Math.min(n, fimV) - 1 }
  }

  const fmt = (v, d = 2) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  const hhmm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') }

  // tela TradingView: devolve funções de coordenadas e de desenho para um frame
  function tela(g, W, H, esc, J, hi, lo, cores, extra = 12) {
    const ax = 96 * esc, topo = 18, base = H - 34 * esc, largura = W - ax, nb = J.fimV - J.iniV + extra
    const X = i => (i - J.iniV + .5) / nb * largura, bw = largura / nb * .7
    const pad = (hi - lo) * .08; hi += pad; lo -= pad
    const Y = p => topo + (hi - p) / (hi - lo) * (base - topo)
    const F = (peso, px, fam = 'Inter') => `${peso} ${Math.round(px * esc)}px ${fam}`
    g.clearRect(0, 0, W, H); g.fillStyle = cores.fundo; g.fillRect(0, 0, W, H)
    const passos = [.0005, .001, .0025, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000]
    const passo = passos.find(s => (hi - lo) / s < 9) || 1000, dec = passo < .01 ? 5 : passo < 1 ? 2 : passo < 10 ? 1 : passo >= 500 ? 0 : 2
    g.font = F(500, 15, 'JetBrains Mono'); g.textAlign = 'left'; g.lineWidth = 1
    for (let p = Math.ceil(lo / passo) * passo; p < hi; p += passo) { const y = Y(p); g.strokeStyle = cores.grelha; g.beginPath(); g.moveTo(0, y); g.lineTo(largura, y); g.stroke(); g.fillStyle = cores.eixo; g.fillText(fmt(p, dec), largura + 8, y + 5) }
    return { ax, topo, base, largura, nb, X, Y, bw, F, hi, lo, dec,
      horas(D) { let xa = -1e9; for (let i = J.iniV; i < J.fimV; i++) if (D.c[i] && D.c[i].t % 60 === 0) { const x = X(i); if (x - xa < 64 * esc) continue; xa = x; g.strokeStyle = cores.grelha; g.beginPath(); g.moveTo(x, topo); g.lineTo(x, base); g.stroke(); g.fillStyle = cores.eixo; g.textAlign = 'center'; g.fillText(hhmm(D.c[i].t), x, H - 10 * esc); g.textAlign = 'left' }
        g.strokeStyle = '#2A2E39'; g.beginPath(); g.moveTo(largura, 0); g.lineTo(largura, H); g.moveTo(0, base); g.lineTo(W, base); g.stroke() },
      clip() { g.save(); g.beginPath(); g.rect(0, 0, largura, base); g.clip() },
      linha(arr, cor, a, w = 2, i0 = J.iniV, i1 = J.ult, tracejado) { if (!a) return; g.globalAlpha = a; g.strokeStyle = cor; g.lineWidth = w * esc; if (tracejado) g.setLineDash([7 * esc, 6 * esc]); g.beginPath(); let on = false
        for (let i = Math.max(J.iniV, i0); i <= i1; i++) { const v = arr[i]; if (v == null || isNaN(v)) { on = false; continue } const y = Y(v); on ? g.lineTo(X(i), y) : g.moveTo(X(i), y); on = true }
        g.stroke(); g.setLineDash([]); g.globalAlpha = 1 },
      faixa(a1, a2, cor, a, i0 = J.iniV, i1 = J.ult) { if (!a) return; g.globalAlpha = a; g.fillStyle = cor; g.beginPath(); let ok = []
        for (let i = Math.max(J.iniV, i0); i <= i1; i++) if (a1[i] != null && a2[i] != null) ok.push(i)
        if (ok.length < 2) { g.globalAlpha = 1; return } ok.forEach((i, q) => q ? g.lineTo(X(i), Y(a1[i])) : g.moveTo(X(i), Y(a1[i]))); [...ok].reverse().forEach(i => g.lineTo(X(i), Y(a2[i]))); g.closePath(); g.fill(); g.globalAlpha = 1 },
      vela(v, i, cor) { g.strokeStyle = cor; g.fillStyle = cor; g.lineWidth = Math.max(1, 1.2 * esc); g.beginPath(); g.moveTo(X(i), Y(v.h)); g.lineTo(X(i), Y(v.l)); g.stroke(); const y1 = Y(Math.max(v.o, v.c)), y2 = Y(Math.min(v.o, v.c)); g.fillRect(X(i) - bw / 2, y1, bw, Math.max(1.5, y2 - y1)) },
      // etiqueta tipo label.style_label_left (seta para a esquerda)
      etiqueta(txt, x, y, cor, corTxt = '#fff', px = 14) { g.font = F(600, px); const tw = g.measureText(txt).width + 16 * esc, lh = (px + 8) * esc
        g.fillStyle = cor; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6 * esc, y - lh / 2); g.lineTo(x + 6 * esc + tw, y - lh / 2); g.lineTo(x + 6 * esc + tw, y + lh / 2); g.lineTo(x + 6 * esc, y + lh / 2); g.closePath(); g.fill()
        g.fillStyle = corTxt; g.fillText(txt, x + 14 * esc, y + px * .36 * esc) },
      // label.style_label_up / _down (balão com bico a apontar para a vela)
      balao(linhas, x, y, cor, corTxt, paraCima, px = 16) { g.font = F(700, px); const tw = Math.max(...linhas.map(t => g.measureText(t).width)) + 18 * esc, lh = (px + 4) * esc, h = lh * linhas.length + 8 * esc, bico = 8 * esc
        const y0 = paraCima ? y + bico : y - bico - h; g.fillStyle = cor; g.beginPath(); g.moveTo(x, y); g.lineTo(x - bico, paraCima ? y0 : y0 + h); g.lineTo(x + bico, paraCima ? y0 : y0 + h); g.closePath(); g.fill()
        g.beginPath(); g.roundRect(x - tw / 2, y0, tw, h, 4 * esc); g.fill(); g.fillStyle = corTxt; g.textAlign = 'center'; linhas.forEach((t, q) => g.fillText(t, x, y0 + 4 * esc + lh * (q + .8))); g.textAlign = 'left' },
      preco(v, cor) { const y = Y(v); g.fillStyle = cor; g.fillRect(largura, y - 11 * esc, ax, 22 * esc); g.fillStyle = '#fff'; g.font = F(600, 14, 'JetBrains Mono'); g.fillText(fmt(v, dec), largura + 6 * esc, y + 5 * esc) },
      rotulo(txt, a) { if (!txt || !a) return; g.globalAlpha = a; g.font = F(700, 20); const tw = g.measureText(txt).width + 28 * esc; g.fillStyle = 'rgba(19,23,34,.9)'; g.strokeStyle = '#D2A63C'; g.lineWidth = 2; g.beginPath(); g.roundRect(14 * esc, 12 * esc, tw, 36 * esc, 8); g.fill(); g.stroke(); g.fillStyle = '#E9C46A'; g.fillText(txt, 28 * esc, 37 * esc); g.globalAlpha = 1 },
    }
  }

  G.MB = { rng, ema, sma, stdev, alma, rma, atr, rsi, pivo, supertrend, lowest, highest, barssince, velas, janela, tela, fmt, hhmm }
  G.MOTORES = G.MOTORES || {}
})(typeof window !== 'undefined' ? window : globalThis)
