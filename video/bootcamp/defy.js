// DEFY — o gráfico do indicador, como aparece no TradingView (tema Classic), para os vídeos.
// Segue docs/pine/defy.pine: bandas de previsão ALMA 89 (1,382 / 2 / 2,618 desvios, centradas e com a
// projecção tracejada a desvanecer nas últimas 44 velas, zona 2–2,618 preenchida), nuvem EMA 8/21 (Active),
// velas bull / transição / bear e dourada na vela forte, níveis-chave (pivots 10 agrupados, os 10 mais
// próximos espaçados ≥ 2 ATR200, linha tracejada cinzenta + zona), Volume Breaks (Supertrend 3/10 + volume),
// fichas de pontuação (vela válida Strict/Soft + fecho a romper o fractal 2-2 + ≥3 de 15 confluências +
// toque na banda interior; filtro +5), plano ENTRY / WARNING / SL (1 ATR para lá do WARNING) / TP 1–3
// (Standard 1R/2R/3R) com ✓/✗, setas do Trend Tracker (Track) e a marca «DEFY». Mercado sintético.
;(function (G) {
  const M = G.MB
  const C = { fundo: '#131722', grelha: 'rgba(42,46,57,.55)', eixo: '#787B86', bull: '#1E4FD8', bear: '#C0262D', neutral: '#9AA0A6', gold: '#FFD600', lvl: '#787B86', volTxt: '#E6B800', marca: '#8E44EC' }
  const LEN = 89, H2 = Math.floor((LEN - 1) / 2), M1 = 1.382, M2 = 2, M3 = 2.618, AQUEC = 300, CAIXA = 10
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})` }

  // XAUUSD em M15 (ATR ≈ 2,5 $). Deriva por troço em ATR/vela; o 5.º campo é o «choque» da vela de sinal.
  const lento = (i) => Math.sin(i / 11) * .22 + Math.sin(i / 29) * .12
  const ROTEIROS = {
    compra:    [[AQUEC, lento], [32, -.42], [3, .35, .4], [4, -.4, .4], [1, 0, .1, 3, 2.6], [70, .3]],
    venda:     [[AQUEC, lento], [32, .42], [3, -.35, .4], [4, .4, .4], [1, 0, .1, 3, -2.6], [70, -.3]],
    tendencia: [[AQUEC, lento], [28, -.38], [3, .35, .4], [4, -.4, .4], [1, 0, .1, 3, 2.4], [40, .38], [12, -.3], [3, .3, .4], [3, -.35, .4], [1, 0, .1, 3, 2.2], [40, .3]],
    falha:     [[AQUEC, lento], [32, -.42], [3, .35, .4], [4, -.4, .4], [1, 0, .1, 3, 2.6], [5, .2], [40, -.45]],
  }

  function serie(cenario = 'compra', seed = 7) {
    const c = M.velas(ROTEIROS[cenario] || ROTEIROS.compra, seed, 2650, 2.5, 7 * 60 - AQUEC * 15, 15)
    const N = c.length, cl = c.map(x => x.c), hl3 = c.map(x => (x.h + x.l + x.c) / 3), hs = c.map(x => x.h), ls = c.map(x => x.l)
    // bandas causais (sinais) e centradas (desenho)
    const basis = M.alma(hl3, LEN, .75, 6), dev = M.ema(M.stdev(hl3, LEN), 5)
    const lo1 = basis.map((b, i) => b - dev[i] * M1), lo2 = basis.map((b, i) => b - dev[i] * M2), lo3 = basis.map((b, i) => b - dev[i] * M3)
    const up1 = basis.map((b, i) => b + dev[i] * M1), up2 = basis.map((b, i) => b + dev[i] * M2), up3 = basis.map((b, i) => b + dev[i] * M3)
    const cB = M.alma(hl3, LEN, .5, 6), cD = M.stdev(hl3, LEN)
    // centradas: o valor da vela i desenha-se em i - H2
    const banda = k => { const a = new Array(N).fill(null); for (let i = 0; i < N; i++) { const j = i - H2; if (j >= 0) a[j] = cB[i] + cD[i] * k } return a }
    const B = { c: banda(0), u1: banda(M1), u2: banda(M2), u3: banda(M3), l1: banda(-M1), l2: banda(-M2), l3: banda(-M3) }
    // projecção (últimas H2 velas até «ult»), calculada à vista: janela gaussiana truncada
    const proj = ult => { const sg = LEN / 6, out = []; for (let j = H2; j >= 0; j--) { let ws = 0, sm = 0; const k0 = Math.max(0, j - H2)
        for (let k = k0; k <= j + H2; k++) { const v = hl3[ult - k]; if (v == null) continue; const w = Math.exp(-((k - j) ** 2) / (2 * sg * sg)); ws += w; sm += w * v }
        const m = sm / ws; let q = 0, n = 0; for (let k = k0; k <= j + H2; k++) { const v = hl3[ult - k]; if (v == null) continue; q += (v - m) ** 2; n++ }
        out.push({ x: ult - j, m, sd: Math.sqrt(q / n), bloco: Math.min(3, Math.floor((H2 - j) / Math.ceil((H2 + 1) / 4))) }) } return out }
    // nuvem / velas / momento
    const fast = M.ema(cl, 8), slow = M.ema(cl, 21), cloudUp = fast.map((f, i) => f >= slow[i])
    const trend = c.map((x, i) => x.c > fast[i] && fast[i] > slow[i] ? 1 : x.c < fast[i] && fast[i] < slow[i] ? -1 : 0)
    const mom = M.ema(cl.map((x, i) => x - cl[Math.max(0, i - 5)]), 5), momUp = mom.map((m, i) => i > 0 && m > mom[i - 1])
    const atr = M.atr(c, 14), atrL = M.atr(c, 200), rsi = M.rsi(cl, 14)
    const body = c.map(x => Math.abs(x.c - x.o)), rng = c.map(x => x.h - x.l), avgBody = M.sma(body, 20), vol = c.map(x => x.v), avgVol = M.sma(vol, 20)
    const upW = c.map(x => x.h - Math.max(x.o, x.c)), dnW = c.map(x => Math.min(x.o, x.c) - x.l)
    const ma1 = M.ema(cl, 34), ma2 = M.ema(cl, 55)
    const valid = c.map((x, i) => i > 0 && rng[i] > 0 && body[i] / rng[i] >= .6 && body[i] >= avgBody[i] * 1.3 && rng[i] > rng[i - 1] && body[i] > body[i - 1])
    const golden = c.map((x, i) => valid[i] && vol[i] > avgVol[i] * 1.5 && body[i] / rng[i] >= .6)
    // fractais 2-2 e quebra
    const fH = M.pivo(c, 2, 2, true), fL = M.pivo(c, 2, 2, false)
    let lastFH = null, lastFL = null, prevFH = null, prevFL = null, fhU = true, flU = true
    const brUp = [], brDn = [], lFH = [], pFH = [], lFL = [], pFL = []
    for (let i = 0; i < N; i++) { if (fH[i] != null) { prevFH = lastFH; lastFH = fH[i]; fhU = false } if (fL[i] != null) { prevFL = lastFL; lastFL = fL[i]; flU = false }
      const bu = !fhU && lastFH != null && c[i].c > lastFH, bd = !flU && lastFL != null && c[i].c < lastFL; if (bu) fhU = true; if (bd) flU = true
      brUp.push(bu); brDn.push(bd); lFH.push(lastFH); pFH.push(prevFH); lFL.push(lastFL); pFL.push(prevFL) }
    // níveis-chave (pivots 10 agrupados a 0,5 ATR200), tal como existem na vela i
    const kH = M.pivo(c, 10, 10, true), kL = M.pivo(c, 10, 10, false), chaves = []
    const keysAt = []; { const kp = [], kb = []
      for (let i = 0; i < N; i++) { const tol = (atrL[i] || atr[i]) * .5
        for (const px of [kH[i], kL[i]]) { if (px == null) continue; const f = kp.findIndex(p => Math.abs(p.px - px) <= tol)
          if (f >= 0) { kp[f].px = (kp[f].px * kp[f].n + px) / (kp[f].n + 1); kp[f].n++ } else { kp.push({ px, n: 1, bar: i - 10 }); if (kp.length > 120) kp.shift() } }
        keysAt.push(kp.map(p => ({ ...p }))) } }
    const nearKey = (i, px) => keysAt[i].some(p => Math.abs(px - p.px) <= atr[i] * .6)
    // volume breaks
    const st = M.supertrend(c, 3, 10), vb = c.map((x, i) => i > 0 && vol[i] > avgVol[i] * 1.3 && ((st[i] < 0 && st[i - 1] > 0) ? 1 : (st[i] > 0 && st[i - 1] < 0) ? -1 : 0))
    const vbB = vb.map(v => v === 1), vbS = vb.map(v => v === -1)
    const xUp = ma1.map((m, i) => i > 0 && m > ma2[i] && ma1[i - 1] <= ma2[i - 1]), xDn = ma1.map((m, i) => i > 0 && m < ma2[i] && ma1[i - 1] >= ma2[i - 1])
    const fvgUp = c.map((x, i) => i > 1 && x.l > c[i - 2].h), fvgDn = c.map((x, i) => i > 1 && x.h < c[i - 2].l)
    const lowMinus = (arr, i, n) => { let m = Infinity; for (let q = Math.max(0, i - n + 1); q <= i; q++) m = Math.min(m, c[q].l - arr[q]); return m }
    const highMinus = (arr, i, n) => { let m = -Infinity; for (let q = Math.max(0, i - n + 1); q <= i; q++) m = Math.max(m, c[q].h - arr[q]); return m }
    const ideias = [], conf = []
    for (let i = AQUEC - 60; i < N; i++) {
      const x = c[i]
      const b = { tIn1: lowMinus(lo1, i, 5) <= 0, tIn2: lowMinus(lo2, i, 5) <= 0, tIn3: lowMinus(lo3, i, 5) <= 0, key: nearKey(i, M.lowest(ls, i, 5)), cld: cloudUp[i], mom: momUp[i],
        maOrd: x.c > ma1[i] && x.c > ma2[i], maBnc: lowMinus(ma1, i, 3) <= 0 || lowMinus(ma2, i, 3) <= 0, maX: M.barssince(xUp, i) <= 10,
        eng: x.c > x.o && c[i - 1].c < c[i - 1].o && x.c >= c[i - 1].o && x.o <= c[i - 1].c, wick: Math.max(...[0, 1, 2].map(k => dnW[i - k] - body[i - k])) >= 0,
        vol: M.barssince(vbB, i) <= 3, fvg: M.barssince(fvgUp, i) <= 5, rsi: M.lowest(rsi, i, 8) <= 35, hl: pFL[i] != null && lFL[i] > pFL[i] }
      const s = { tIn1: highMinus(up1, i, 5) >= 0, tIn2: highMinus(up2, i, 5) >= 0, tIn3: highMinus(up3, i, 5) >= 0, key: nearKey(i, M.highest(hs, i, 5)), cld: !cloudUp[i], mom: !momUp[i],
        maOrd: x.c < ma1[i] && x.c < ma2[i], maBnc: highMinus(ma1, i, 3) >= 0 || highMinus(ma2, i, 3) >= 0, maX: M.barssince(xDn, i) <= 10,
        eng: x.c < x.o && c[i - 1].c > c[i - 1].o && x.c <= c[i - 1].o && x.o >= c[i - 1].c, wick: Math.max(...[0, 1, 2].map(k => upW[i - k] - body[i - k])) >= 0,
        vol: M.barssince(vbS, i) <= 3, fvg: M.barssince(fvgDn, i) <= 5, rsi: M.highest(rsi, i, 8) >= 65, lh: pFH[i] != null && lFH[i] < pFH[i] }
      const nB = Object.values(b).filter(Boolean).length, nS = Object.values(s).filter(Boolean).length
      conf[i] = { b, s, nB, nS }
      const vB = valid[i] && x.c > x.o, vS = valid[i] && x.c < x.o
      const scB = nB + (golden[i] && vB ? 1 : 0), scS = nS + (golden[i] && vS ? 1 : 0)
      if (vB && brUp[i] && nB >= 3 && b.tIn1 && scB >= 5) ideias.push({ i, dir: 1, score: scB, king: nB >= 10 && golden[i], conf: b })
      if (vS && brDn[i] && nS >= 3 && s.tIn1 && scS >= 5) ideias.push({ i, dir: -1, score: scS, king: nS >= 10 && golden[i], conf: s })
    }
    const estrelas = s => s >= 10 ? 3 : s >= 8 ? 2 : s >= 6 ? 1 : 0
    // gestão: Candle Close, Standard 1/2/3 R; seguimento até TP3/SL; a ideia seguinte substitui a anterior
    ideias.forEach((d, q) => { const x = c[d.i], e = x.c, w = d.dir > 0 ? x.l : x.h, sl = w - d.dir * atr[d.i], rk = Math.abs(e - sl)
      Object.assign(d, { stars: estrelas(d.score), entry: e, warn: w, sl, risk: rk, tp: [1, 2, 3].map(m => e + d.dir * rk * m), hits: [], slBar: null, fim: N - 1 })
      const prox = ideias[q + 1] ? ideias[q + 1].i : N
      for (let k = d.i + 1; k < prox; k++) { const v = c[k]
        if (d.dir > 0 ? v.l <= d.sl : v.h >= d.sl) { d.slBar = k; d.fim = k; break }
        for (let t = d.hits.length; t < 3; t++) if (d.dir > 0 ? v.h >= d.tp[t] : v.l <= d.tp[t]) d.hits.push(k)
        if (d.hits.length >= 3) { d.fim = k; break } d.fim = k } })
    const ini = AQUEC, alvo = ideias.find(d => d.i >= ini + 20)
    return { c, N, ini, B, proj, fast, slow, cloudUp, trend, momUp, golden, atr, atrL, keysAt, vb, avgVol, ideias, conf, lo1, up1, sig: alvo ? alvo.i : ini + 40, frac: cenario === 'tendencia' ? .4 : .55, simbolo: 'XAUUSD' }
  }

  // camadas: bandas, niveis, nuvem, cores (velas do trend tracker), volume (Volume Breaks), toque (realce do toque
  // na banda interior), sinal (fichas +N / ★ / 👑), plano (ENTRY/WARNING/SL/TP), setas (Trend Tracker em Track).
  function grafico(r, o, el) {
    const W = o.w || 1560, H = o.h || 780
    const wrap = el('div', 'carta3d cartao', null, { left: (o.left ?? (1920 - W) / 2) + 'px', top: (o.top || 200) + 'px', width: W + 'px', height: H + 'px', overflow: 'hidden', background: o.transparente ? 'transparent' : C.fundo })
    const cv = el('canvas'); cv.width = W; cv.height = H; wrap.append(cv); r.append(wrap)
    const g = cv.getContext('2d'), D = serie(o.cenario || 'compra', o.seed || 7), esc = Math.max(.62, Math.min(1, W / 1560))
    const CT = o.transparente ? { ...C, fundo: 'rgba(19,23,34,.45)' } : C
    function desenha(vis0, ate, zoom) {
      const vis = { ...(vis0 || {}) }, J = M.janela(D, ate, zoom), ult = J.ult
      const P = vis.bandas ? D.proj(ult) : []
      let hi = -Infinity, lo = Infinity; for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.c[i].h); lo = Math.min(lo, D.c[i].l) }
      if (vis.bandas) { for (let i = J.iniV; i <= ult - H2; i++) if (D.B.u2[i] != null) { hi = Math.max(hi, D.B.u2[i]); lo = Math.min(lo, D.B.l2[i]) } P.forEach(p => { hi = Math.max(hi, p.m + p.sd * M2); lo = Math.min(lo, p.m - p.sd * M2) }) }
      const ids = D.ideias.filter(d => d.i <= ult && d.i >= J.iniV), tr = ids[ids.length - 1]
      if (vis.plano && tr) { hi = Math.max(hi, ...tr.tp, tr.sl); lo = Math.min(lo, ...tr.tp, tr.sl) }
      const T = M.tela(g, W, H, esc, J, hi, lo, CT, 14), { X, Y, F } = T
      T.horas(D); T.clip()
      // níveis-chave: os 10 mais próximos do preço, espaçados ≥ 2 ATR200; zona com a cor do lado
      if (vis.niveis) { const k = D.keysAt[ult], pr = D.c[ult].c, aL = D.atrL[ult] || D.atr[ult], zh = aL * 10 / 20, pk = []
        ;[...k].sort((a, b) => Math.abs(a.px - pr) - Math.abs(b.px - pr)).forEach(p => { if (pk.length < 10 && !pk.some(q => Math.abs(q.px - p.px) < aL * 2)) pk.push(p) })
        g.globalAlpha = vis.niveis; pk.forEach(p => { const x0 = Math.max(0, X(Math.max(p.bar, J.iniV - 5))); g.fillStyle = rgba(p.px >= pr ? C.bear : C.bull, .1); g.fillRect(x0, Y(p.px + zh / 2), T.largura - x0, Y(p.px - zh / 2) - Y(p.px + zh / 2))
          g.strokeStyle = C.lvl; g.lineWidth = 1 * esc; g.setLineDash([6 * esc, 5 * esc]); g.beginPath(); g.moveTo(x0, Y(p.px)); g.lineTo(T.largura, Y(p.px)); g.stroke(); g.setLineDash([]) }); g.globalAlpha = 1 }
      if (vis.bandas) { const a = vis.bandas, fim = ult - H2
        T.faixa(D.B.u2, D.B.u3, rgba(C.bear, .25), a, J.iniV, fim); T.faixa(D.B.l2, D.B.l3, rgba(C.bull, .25), a, J.iniV, fim)
        ;[['u1', C.bear], ['u2', C.bear], ['u3', C.bear], ['l1', C.bull], ['l2', C.bull], ['l3', C.bull]].forEach(([k, cor]) => T.linha(D.B[k], cor, a, 1, J.iniV, fim)); T.linha(D.B.c, C.neutral, a, 1, J.iniV, fim)
        // projecção tracejada em 4 blocos, cada vez mais transparente
        for (let b = 0; b < 4; b++) { const pts = P.filter(p => p.bloco === b || p.bloco === b - 1 && P.find(z => z.bloco === b && z.x === p.x + 1)); if (pts.length < 2) continue
          const al = a * (1 - Math.min(.9, b * .2)); g.setLineDash([7 * esc, 6 * esc]); g.lineWidth = 1 * esc
          ;[[0, C.neutral], [M1, C.bear], [M2, C.bear], [M3, C.bear], [-M1, C.bull], [-M2, C.bull], [-M3, C.bull]].forEach(([k, cor]) => { g.globalAlpha = al; g.strokeStyle = cor; g.beginPath(); pts.forEach((p, q) => { const y = Y(p.m + p.sd * k); q ? g.lineTo(X(p.x), y) : g.moveTo(X(p.x), y) }); g.stroke() })
          g.setLineDash([]); g.globalAlpha = 1 } }
      if (vis.nuvem) { const a = vis.nuvem; for (let i = Math.max(J.iniV, 1); i <= ult; i++) { const cor = D.cloudUp[i] ? C.bull : C.bear
          g.globalAlpha = a; g.fillStyle = rgba(cor, .25); g.beginPath(); g.moveTo(X(i - 1), Y(D.fast[i - 1])); g.lineTo(X(i), Y(D.fast[i])); g.lineTo(X(i), Y(D.slow[i])); g.lineTo(X(i - 1), Y(D.slow[i - 1])); g.closePath(); g.fill()
          g.strokeStyle = cor; g.lineWidth = 2 * esc; g.beginPath(); g.moveTo(X(i - 1), Y(D.fast[i - 1])); g.lineTo(X(i), Y(D.fast[i])); g.stroke()
          g.strokeStyle = rgba(cor, .6); g.lineWidth = 1 * esc; g.beginPath(); g.moveTo(X(i - 1), Y(D.slow[i - 1])); g.lineTo(X(i), Y(D.slow[i])); g.stroke() } g.globalAlpha = 1 }
      for (let i = J.iniV; i <= ult; i++) { const v = D.c[i], base = v.c >= v.o ? '#089981' : '#F23645'
        let cor = base; if (vis.cores) cor = D.golden[i] ? C.gold : D.trend[i] === 1 ? C.bull : D.trend[i] === -1 ? C.bear : C.neutral
        if (vis.cores && vis.cores < 1) { g.globalAlpha = 1; T.vela(v, i, base); g.globalAlpha = vis.cores } T.vela(v, i, cor); g.globalAlpha = 1 }
      // toque na banda interior (o esticão que a ideia exige)
      // as ideias usam as bandas causais (sem deslocamento); com «toque» mostra-se a banda interior que conta
      if (vis.toque) { T.linha(D.lo1, C.bull, vis.toque * .9, 1.5, J.iniV, ult, true); T.linha(D.up1, C.bear, vis.toque * .9, 1.5, J.iniV, ult, true) }
      if (vis.toque) for (const d of ids) { const lim = d.dir > 0 ? D.lo1 : D.up1; for (let k = d.i; k > d.i - 5; k--) { const v = D.c[k]; if (d.dir > 0 ? v.l <= lim[k] : v.h >= lim[k]) { const y = Y(d.dir > 0 ? v.l : v.h), rr = (14 + 6 * Math.sin(ult / 2)) * esc
            g.globalAlpha = vis.toque; g.strokeStyle = '#E9C46A'; g.lineWidth = 2.5 * esc; g.beginPath(); g.arc(X(k), y, rr, 0, 7); g.stroke(); g.globalAlpha = 1; break } } }
      if (vis.volume) { g.globalAlpha = vis.volume; g.font = F(600, 15); g.fillStyle = C.volTxt; g.textAlign = 'center'
        let nb = 0, ns = 0; for (let i = ult; i >= J.iniV; i--) { const t = D.vb[i]; if (!t) continue; if (t === 1 && nb++ < 1) g.fillText(`Vol: ${((D.c[i].v / D.avgVol[i] - 1) * 100).toFixed(1)}%`, X(i), Y(D.c[i].l - D.atr[i] * .8) + 14 * esc)
          if (t === -1 && ns++ < 1) g.fillText(`Vol: ${((D.c[i].v / D.avgVol[i] - 1) * 100).toFixed(1)}%`, X(i), Y(D.c[i].h + D.atr[i] * .8)) } g.textAlign = 'left'; g.globalAlpha = 1 }
      if (vis.plano && tr) { const a = vis.plano, cD = tr.dir > 0 ? C.bull : C.bear, cO = tr.dir > 0 ? C.bear : C.bull, x1 = X(tr.i), x2 = X(Math.min(tr.fim, ult) + CAIXA)
        g.globalAlpha = a; g.fillStyle = rgba(cD, .35); g.fillRect(x1, Y(Math.max(tr.entry, tr.warn)), x2 - x1, Math.abs(Y(tr.warn) - Y(tr.entry)))
        const ln = (p, cor, w, ponteado) => { g.strokeStyle = cor; g.lineWidth = w * esc; if (ponteado) g.setLineDash([2 * esc, 4 * esc]); g.beginPath(); g.moveTo(x1, Y(p)); g.lineTo(x2, Y(p)); g.stroke(); g.setLineDash([]) }
        ln(tr.sl, cO, 2, true); ln(tr.warn, cO, 1); ln(tr.entry, cD, 2); tr.tp.forEach(p => ln(p, cD, 2, true))
        const dist = d => d.toFixed(1), slTxt = `SL: ${dist(tr.risk)} - ${M.fmt(tr.sl)}` + (tr.slBar != null && tr.slBar <= ult ? ' ✗' : '')
        T.etiqueta(slTxt, x2, Y(tr.sl), cO, '#fff', 12); T.etiqueta(`WARNING: ${M.fmt(tr.warn)}`, x2, Y(tr.warn), cO, '#fff', 12); T.etiqueta(`ENTRY: ${M.fmt(tr.entry)}`, x2, Y(tr.entry), cD, '#fff', 12)
        tr.tp.forEach((p, k) => T.etiqueta(`TP ${k + 1}: ${dist(Math.abs(p - tr.entry))} - ${M.fmt(p)}` + (tr.hits[k] != null && tr.hits[k] <= ult ? ' ✓' : ''), x2, Y(p), cD, '#fff', 12))
        g.globalAlpha = 1 }
      if (vis.setas) { g.globalAlpha = vis.setas; g.font = F(700, 17); g.textAlign = 'center'
        for (const d of ids) for (let k = d.i + 1; k <= Math.min(ult, d.i + 15); k++) { if (D.ideias.some(z => z.i > d.i && z.i <= k)) break; const a = d.dir > 0 ? D.momUp[k] : !D.momUp[k]; if (!a) continue
          g.fillStyle = d.dir > 0 ? C.bull : C.bear; g.fillText(d.dir > 0 ? '↑' : '↓', X(k), d.dir > 0 ? Y(D.c[k].l) + 20 * esc : Y(D.c[k].h) - 8 * esc) }
        g.textAlign = 'left'; g.globalAlpha = 1 }
      if (vis.sinal) { g.globalAlpha = vis.sinal; for (const d of ids) { const v = D.c[d.i], linhas = d.king ? ['👑'] : ['+' + d.score, ...(d.stars ? ['★'.repeat(d.stars)] : [])]
          T.balao(linhas, X(d.i), d.dir > 0 ? Y(v.l) + 4 * esc : Y(v.h) - 4 * esc, d.king ? C.gold : (d.dir > 0 ? C.bull : C.bear), d.king ? '#000' : '#fff', d.dir > 0, 16) } g.globalAlpha = 1 }
      g.restore()
      { const v = D.c[ult]; T.preco(v.c, vis.cores ? (D.golden[ult] ? '#B89A00' : D.trend[ult] === 1 ? C.bull : D.trend[ult] === -1 ? C.bear : '#5d6066') : (v.c >= v.o ? '#089981' : '#F23645')) }
      g.font = F(600, 18); g.fillStyle = C.marca; g.textAlign = 'right'; g.fillText('DEFY', T.largura - 12 * esc, T.base - 12 * esc); g.textAlign = 'left'
      T.rotulo(o.rotulo, vis.sinal || vis.plano || 0)
    }
    return { wrap, desenha, D }
  }

  G.MOTORES.defy = { grafico, serie, camadas3d: ['bandas', 'niveis', 'nuvem', 'sinal'], camadasLado: ['bandas', 'niveis', 'nuvem', 'cores'] }
})(typeof window !== 'undefined' ? window : globalThis)
