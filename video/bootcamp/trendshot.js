// TrendShot by MTM — o gráfico do indicador, como aparece no TradingView, para os vídeos.
// Segue o Pine «Trendshot by MTM» (v6): EMA 20 vermelha / 50 azul / 238 laranja (grossa), histograma até à
// maior das duas médias (azul/vermelho), velas azuis com a 20 acima da 50, triângulos no cruzamento só
// dentro do Trade Clock (08:00–21:00), POC das últimas 50 velas (linha laranja fina para a direita),
// R1/S1 por pivots com ATR, estrelas pequenas (amarelas) / médias (azuis) / grandes (vermelha no topo,
// verde no fundo), caixa Entry / TP1–TP4 / SL (SL automático 100 pips; TP 30/50/100/150 % do SL),
// tabela de tendência M1…D + POC, «Low Volume» e a marca «Trendshot by MTM». Mercado sintético.
;(function (G) {
  const M = G.MB
  const C = {
    fundo: '#131722', grelha: 'rgba(42,46,57,.55)', eixo: '#787B86',
    up: '#2962FF', dn: '#FF5252', ema238: '#FF9800', poc: '#FF9800',
    velaUp: '#089981', velaDn: '#F23645', entry: '#8B5CF6', tp: '#12B886', sl: '#D6401F',
    verde: '#4CAF50', vermelho: '#FF5252', estrelaP: '#FFEB3B', estrelaM: '#2962FF', estrelaGH: '#FF5252', estrelaGL: '#00E676',
    tabelaFundo: '#363A45', tabelaTexto: '#FFEB3B', marca: '#8B5CF6',
  }
  const FAST = 20, SLOW = 50, LONG = 238, HL = 25, SRR = 5, BOX_W = 20, AQUEC = 320
  const SL_PTS = 100, MULT = [.3, .5, 1, 1.5] // US30: 10000 pontos × 0,01

  // deriva por troço, em ATR por vela (US30 em M5, ATR ≈ 25 pontos)
  const ROTEIROS = {
    compra:    [[AQUEC, .05], [50, -.32], [26, .03], [8, .6], [80, .4]],
    venda:     [[AQUEC, -.05], [50, .32], [26, -.03], [8, -.6], [80, -.4]],
    tendencia: [[AQUEC, -.03], [26, -.28], [8, .5], [46, .42], [12, -.6], [24, .02], [50, .3]],
    falha:     [[AQUEC, .03], [60, (i) => Math.sin(i / 3.2) * .55], [40, (i) => Math.sin(i / 3) * .45, .5, .5], [40, (i) => Math.sin(i / 3.4) * .4, .45, .22]],
  }

  function serie(cenario = 'compra', seed = 7) {
    const c = M.velas(ROTEIROS[cenario] || ROTEIROS.compra, seed, 44000, 25, 9 * 60 - AQUEC * 5)
    const N = c.length, cl = c.map(x => x.c)
    const eF = M.ema(cl, FAST), eS = M.ema(cl, SLOW), eL = M.ema(cl, LONG), atr = M.atr(c, 14)
    const inTrade = c.map(x => { const m = ((x.t % 1440) + 1440) % 1440; return m >= 480 && m < 1260 })
    const up = eF.map((f, i) => f > eS[i])
    const crossUp = up.map((u, i) => i > 0 && u && !up[i - 1]), crossDn = up.map((u, i) => i > 0 && !u && up[i - 1])
    // R1 / S1 (f_sr: pivot 25/5, movimento ≥ 1 ATR, zona ≤ 2,5 ATR, reset 25)
    const ph = M.pivo(c, HL, SRR, true), pl = M.pivo(c, HL, SRR, false), hs = c.map(x => x.h), ls = c.map(x => x.l)
    const R1 = [], S1 = []; let r = null, s = null, ra = 0, sa = 0
    for (let i = 0; i < N; i++) { const j = i - SRR, hiR = M.highest(hs, i, HL + SRR + 1), loR = M.lowest(ls, i, HL + SRR + 1)
      const zH = j >= 0 ? c[j].h - Math.max(c[j].o, c[j].c) : 0, zL = j >= 0 ? Math.min(c[j].o, c[j].c) - c[j].l : 0
      if (ph[i] != null && ph[i] - loR >= atr[i] && zH <= 2.5 * atr[i]) { r = ph[i]; ra = 0 } else if (++ra > HL) r = null
      if (pl[i] != null && hiR - pl[i] >= atr[i] && zL <= 2.5 * atr[i]) { s = pl[i]; sa = 0 } else if (++sa > HL) s = null
      R1.push(r); S1.push(s) }
    // estrelas: confirmadas k velas depois do pivot
    const P = k => [M.pivo(c, k, k, true), M.pivo(c, k, k, false)], [sH, sL] = P(3), [mH, mL] = P(10), [gH, gL] = P(HL)
    const estrelas = []
    for (let i = 0; i < N; i++) { const amp = M.highest(hs, i, 2 * HL + 1) - M.lowest(ls, i, 2 * HL + 1), grande = amp >= atr[i]
      const bH = gH[i] != null && grande, bL = gL[i] != null && grande
      if (bH) estrelas.push({ conf: i, bar: i - HL, alto: true, tipo: 'G' }); if (bL) estrelas.push({ conf: i, bar: i - HL, alto: false, tipo: 'G' })
      if (mH[i] != null && !bH) estrelas.push({ conf: i, bar: i - 10, alto: true, tipo: 'M' }); if (mL[i] != null && !bL) estrelas.push({ conf: i, bar: i - 10, alto: false, tipo: 'M' })
      if (sH[i] != null && !bH && mH[i] == null) estrelas.push({ conf: i, bar: i - 3, alto: true, tipo: 'P' }); if (sL[i] != null && !bL && mL[i] == null) estrelas.push({ conf: i, bar: i - 3, alto: false, tipo: 'P' }) }
    const trades = []
    for (let i = 0; i < N; i++) if (crossUp[i] || crossDn[i]) { const dir = crossUp[i] ? 1 : -1, e = c[i].c
      trades.push({ i, dir, entry: e, sl: e - dir * SL_PTS, tp: MULT.map(m => e + dir * SL_PTS * m), sinal: inTrade[i] }) }
    const ini = AQUEC, alvo = cenario === 'tendencia' ? ini + 30 : ini + 60
    const t0 = trades.find(t => t.i >= alvo && t.sinal) || trades.filter(t => t.i >= ini).pop()
    return { c, N, ini, eF, eS, eL, atr, up, crossUp, crossDn, inTrade, R1, S1, estrelas, trades, sig: t0 ? t0.i : ini + 90, frac: cenario === 'tendencia' ? .3 : .62, simbolo: 'US30' }
  }

  // POC: perfil de volume das últimas n velas até «fim» (inclusive)
  function poc(D, fim, n = 50, bins = 100) { const j0 = Math.max(0, fim - n + 1); let hi = -Infinity, lo = Infinity
    for (let i = j0; i <= fim; i++) { hi = Math.max(hi, D.c[i].h); lo = Math.min(lo, D.c[i].l) }
    const st = (hi - lo) / bins; if (!(st > 0)) return null; const v = new Array(bins).fill(0)
    for (let i = j0; i <= fim; i++) { const b0 = Math.max(0, Math.min(bins - 1, Math.floor((D.c[i].l - lo) / st))), b1 = Math.max(0, Math.min(bins - 1, Math.floor((D.c[i].h - lo) / st))); for (let k = b0; k <= b1; k++) v[k] += D.c[i].v / (b1 - b0 + 1) }
    let m = 0; v.forEach((x, k) => { if (x > v[m]) m = k }); return { nivel: lo + (m + .5) * st, desde: j0 } }
  // tendência noutro timeframe: EMAs 20/50 da série reamostrada (k velas de 5 min por vela)
  function tendTF(D, fim, k) { if (k < 1) { const f = M.ema(D.c.slice(0, fim + 1).map(x => x.c), 4), s = M.ema(D.c.slice(0, fim + 1).map(x => x.c), 10); return f[fim] > s[fim] }
    const cl = []; for (let i = fim % k; i <= fim; i += k) cl.push(D.c[Math.min(fim, i + k - 1)].c)
    if (cl.length < 30) return D.eL[fim] < D.c[fim].c
    const f = M.ema(cl, FAST), s = M.ema(cl, SLOW); return f[f.length - 1] > s[s.length - 1] }

  // gestão da posição aberta (vídeo): parcial no TP1 com stop na entrada, parcial no TP2 com stop no TP1,
  // depois trailing pela EMA 20 do indicador até uma vela fechar do outro lado; TP3/TP4 marcados se tocados.
  function gestao(D, t) { const d = t.dir, stop = [], hits = [null, null, null, null]; let s = t.sl, out = null
    for (let j = t.i; j < D.N; j++) { const v = D.c[j]
      if (j > t.i) { if (d > 0 ? v.l <= s : v.h >= s) { out = j; stop[j] = s; break }
        t.tp.forEach((p, k) => { if (hits[k] == null && (d > 0 ? v.h >= p : v.l <= p)) hits[k] = j })
        if (hits[1] != null && j > hits[1] && (d > 0 ? v.c < D.eF[j] : v.c > D.eF[j])) { out = j; stop[j] = s; break } }
      if (hits[0] != null) s = d > 0 ? Math.max(s, t.entry) : Math.min(s, t.entry)
      if (hits[1] != null) s = d > 0 ? Math.max(s, t.tp[0], j > hits[1] ? D.eF[j] : -Infinity) : Math.min(s, t.tp[0], j > hits[1] ? D.eF[j] : Infinity)
      stop[j] = s }
    return { stop, hits, tp1: hits[0], tp2: hits[1], out } }

  // camadas aceites: medias, cores (histograma + velas azuis), estrutura (R1/S1), poc, estrelas, sinal (triângulos),
  // plano (caixa Entry/TP/SL), gestao (posição aberta: parciais, stop na entrada, trailing), tabela. Sinónimos do motor genérico: niveis→estrutura, setas→sinal, bandas→medias.
  function grafico(r, o, el) {
    const W = o.w || 1560, H = o.h || 780
    const wrap = el('div', 'carta3d cartao', null, { left: (o.left ?? (1920 - W) / 2) + 'px', top: (o.top || 200) + 'px', width: W + 'px', height: H + 'px', overflow: 'hidden', background: o.transparente ? 'transparent' : C.fundo })
    const cv = el('canvas'); cv.width = W; cv.height = H; wrap.append(cv); r.append(wrap)
    const g = cv.getContext('2d'), D = serie(o.cenario || 'compra', o.seed || 7), esc = Math.max(.62, Math.min(1, W / 1560))
    const CT = o.transparente ? { ...C, fundo: 'rgba(19,23,34,.45)' } : C
    function desenha(vis0, ate, zoom) {
      const vis = { ...(vis0 || {}) }; if (vis.niveis) vis.estrutura = Math.max(vis.estrutura || 0, vis.niveis); if (vis.setas) vis.sinal = Math.max(vis.sinal || 0, vis.setas); if (vis.bandas) vis.medias = Math.max(vis.medias || 0, vis.bandas)
      const J = M.janela(D, ate, zoom), ult = J.ult
      let hi = -Infinity, lo = Infinity; for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.c[i].h); lo = Math.min(lo, D.c[i].l) }
      const tr = [...D.trades].reverse().find(t => t.i <= ult && t.i >= J.iniV && t.sinal)
      if (vis.plano && tr) { hi = Math.max(hi, tr.entry, tr.sl, ...tr.tp); lo = Math.min(lo, tr.entry, tr.sl, ...tr.tp) }
      if (vis.medias) for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.eL[i]); lo = Math.min(lo, D.eL[i]) }
      const T = M.tela(g, W, H, esc, J, hi, lo + (lo - hi) * .05, CT, BOX_W * .9), { X, Y, F } = T
      T.horas(D); T.clip()
      if (vis.cores) { g.globalAlpha = vis.cores; const w = T.largura / T.nb; for (let i = J.iniV; i <= ult; i++) { const top = Math.max(D.eF[i], D.eS[i]); g.fillStyle = D.up[i] ? 'rgba(41,98,255,.15)' : 'rgba(255,82,82,.15)'; g.fillRect(X(i) - w / 2, Y(top), w, T.base - Y(top)) } g.globalAlpha = 1 }
      if (vis.estrutura) { g.globalAlpha = vis.estrutura; g.lineWidth = 1.5 * esc
        const seg = (arr, corF) => { for (let i = Math.max(J.iniV, 1); i <= ult; i++) { const a = arr[i - 1], b = arr[i]; if (a == null || b == null || a !== b) continue; g.strokeStyle = corF(i, b); g.beginPath(); g.moveTo(X(i - 1), Y(a)); g.lineTo(X(i), Y(b)); g.stroke() } }
        seg(D.R1, (i, v) => D.c[i].c < v ? C.vermelho : C.verde); seg(D.S1, (i, v) => D.c[i].c > v ? C.verde : C.vermelho); g.globalAlpha = 1 }
      if (vis.medias) { T.linha(D.eF, C.dn, vis.medias, 2); T.linha(D.eS, C.up, vis.medias, 2); T.linha(D.eL, C.ema238, vis.medias, 3) }
      if (vis.poc) { const P = poc(D, ult); if (P) { g.globalAlpha = vis.poc; g.strokeStyle = C.poc; g.lineWidth = 1.5 * esc; g.beginPath(); g.moveTo(X(Math.max(J.iniV, P.desde)), Y(P.nivel)); g.lineTo(T.largura, Y(P.nivel)); g.stroke(); g.globalAlpha = 1 } }
      for (let i = J.iniV; i <= ult; i++) { const v = D.c[i]; T.vela(v, i, vis.cores && D.up[i] ? C.up : (v.c >= v.o ? C.velaUp : C.velaDn)) }
      if (vis.estrelas) { g.globalAlpha = vis.estrelas; g.textAlign = 'center'
        D.estrelas.forEach(e => { if (e.conf > ult || e.bar < J.iniV) return; const v = D.c[e.bar], gap = 16 * esc, y = e.alto ? Y(v.h) - gap : Y(v.l) + gap
          if (e.tipo === 'P') { g.fillStyle = C.estrelaP; g.beginPath(); g.arc(X(e.bar), y, 3.2 * esc, 0, 7); g.fill() }
          else { g.fillStyle = e.tipo === 'M' ? C.estrelaM : (e.alto ? C.estrelaGH : C.estrelaGL); g.font = F(700, e.tipo === 'G' ? 26 : 19); g.fillText('✸', X(e.bar), y + 8 * esc) } })
        g.textAlign = 'left'; g.globalAlpha = 1 }
      if (vis.sinal) { g.globalAlpha = vis.sinal
        for (let i = J.iniV; i <= ult; i++) { if (!(D.crossUp[i] || D.crossDn[i]) || !D.inTrade[i]) continue; const x = X(i), y = Y(D.c[i].h) - 30 * esc, s = 9 * esc
          g.fillStyle = D.crossUp[i] ? C.up : C.dn; g.beginPath(); if (D.crossUp[i]) { g.moveTo(x, y - s); g.lineTo(x - s, y + s * .8); g.lineTo(x + s, y + s * .8) } else { g.moveTo(x, y + s); g.lineTo(x - s, y - s * .8); g.lineTo(x + s, y - s * .8) } g.fill() }
        g.globalAlpha = 1 }
      if (vis.plano && tr) { g.globalAlpha = vis.plano; const x1 = X(tr.i), x2 = X(tr.i + BOX_W)
        g.fillStyle = 'rgba(18,184,134,.15)'; g.fillRect(x1, Y(Math.max(tr.entry, tr.tp[3])), x2 - x1, Math.abs(Y(tr.tp[3]) - Y(tr.entry)))
        g.fillStyle = 'rgba(214,64,31,.15)'; g.fillRect(x1, Y(Math.max(tr.entry, tr.sl)), x2 - x1, Math.abs(Y(tr.sl) - Y(tr.entry)))
        ;[['Entry', tr.entry, C.entry], ['TP1', tr.tp[0], C.tp], ['TP2', tr.tp[1], C.tp], ['TP3', tr.tp[2], C.tp], ['TP4', tr.tp[3], C.tp], ['SL', tr.sl, C.sl]].forEach(([t, p, cor]) => {
          const y = Y(p); g.strokeStyle = cor; g.lineWidth = 1.5 * esc; g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); T.etiqueta(`${t}: ${M.fmt(p)}`, x2 + 2, y, cor, '#fff', 14) })
        g.globalAlpha = 1 }
      if (vis.gestao && tr) { const G2 = gestao(D, tr), en = G.LANG === 'en', d = tr.dir
        g.globalAlpha = vis.gestao; const fim = Math.min(ult, G2.out ?? ult)
        // stop vivo: SL → entrada (TP1) → TP1 (TP2) → trailing pela EMA 20
        g.lineWidth = 2.5 * esc; g.setLineDash([7 * esc, 5 * esc])
        for (let j = tr.i + 1; j <= fim; j++) { const a = G2.stop[j - 1] ?? G2.stop[j], b = G2.stop[j]; g.strokeStyle = j <= G2.tp1 ? C.sl : j <= G2.tp2 ? C.entry : '#E9C46A'
          g.beginPath(); g.moveTo(X(j - 1), Y(a)); g.lineTo(X(j - 1) + (X(j) - X(j - 1)) * .5, Y(a)); g.lineTo(X(j - 1) + (X(j) - X(j - 1)) * .5, Y(b)); g.lineTo(X(j), Y(b)); g.stroke() }
        g.setLineDash([])
        const ponto = (j, p, cor) => { g.fillStyle = cor; g.beginPath(); g.arc(X(j), Y(p), 5.5 * esc, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5 * esc; g.stroke() }
        G2.hits.forEach((j, k) => { if (j == null || j > ult) return; ponto(j, tr.tp[k], C.tp)
          if (k >= 2) { g.font = F(700, 13); g.fillStyle = C.tp; g.textAlign = 'center'; g.fillText(`TP${k + 1} ✓`, X(j), Y(tr.tp[k]) - d * 14 * esc + (d < 0 ? 10 * esc : 0)); g.textAlign = 'left' } })
        const b1 = en ? ['TP1 · partial', 'SL → entry'] : ['TP1 · parcial', 'SL → entrada'], b2 = en ? ['TP2 · partial', 'SL → TP1'] : ['TP2 · parcial', 'SL → TP1']
        if (G2.tp1 != null && G2.tp1 <= ult) { const v = D.c[G2.tp1]; T.balao(b1, X(G2.tp1), d > 0 ? Y(v.l) + 8 * esc : Y(v.h) - 8 * esc, C.entry, '#fff', d > 0, 14) }
        if (G2.tp2 != null && G2.tp2 <= ult) { const v = D.c[G2.tp2]; T.balao(b2, X(G2.tp2), d > 0 ? Y(v.h) - 8 * esc : Y(v.l) + 8 * esc, C.tp, '#fff', d < 0, 14) }
        if (G2.tp2 != null && G2.tp2 + 24 <= fim) { const j = G2.tp2 + 24; T.etiqueta('Trailing · EMA 20', X(j) + 4, Y(G2.stop[j]) + d * 22 * esc, '#E9C46A', '#131722', 13) }
        if (G2.out != null && G2.out <= ult) { const v = D.c[G2.out]; ponto(G2.out, v.c, '#E9C46A')
          T.balao(en ? ['Rest closed', d > 0 ? 'close below EMA 20' : 'close above EMA 20'] : ['Fecho do resto', d > 0 ? 'vela fecha abaixo da EMA 20' : 'vela fecha acima da EMA 20'], X(G2.out), d > 0 ? Y(v.l) + 8 * esc : Y(v.h) - 8 * esc, '#E9C46A', '#131722', d > 0, 14) }
        g.globalAlpha = 1 }
      g.restore()
      { const v = D.c[ult]; T.preco(v.c, vis.cores && D.up[ult] ? C.up : (v.c >= v.o ? C.velaUp : C.velaDn)) }
      if (vis.tabela) { const tfs = [['M1', .2], ['M5', 1], ['M15', 3], ['M30', 6], ['H4', 48], ['D', 288]]
        const pocs = [['M15', 3], ['M30', 6], ['H1', 12]].map(([t, k]) => { const P = poc(D, ult, Math.min(ult, 50 * k), 40); return [t, P ? D.c[ult].c >= P.nivel : null] })
        const cw = 66 * esc, ch = 24 * esc, x0 = T.largura / 2 - cw * 3.5, y0 = 8 * esc
        g.globalAlpha = vis.tabela; g.font = F(600, 13); g.textAlign = 'center'
        const cel = (cx, cy, txt, bg, cor) => { g.fillStyle = bg; g.fillRect(x0 + cx * cw, y0 + cy * ch, cw - 2, ch - 2); g.fillStyle = cor; g.fillText(txt, x0 + cx * cw + cw / 2, y0 + cy * ch + ch / 2 + 4 * esc) }
        cel(0, 0, 'Trend', C.tabelaFundo, C.tabelaTexto); cel(0, 1, D.simbolo, C.tabelaFundo, C.tabelaTexto)
        tfs.forEach(([t, k], q) => { const u = tendTF(D, ult, k); cel(q + 1, 0, t, C.tabelaFundo, C.tabelaTexto); cel(q + 1, 1, u ? 'Up' : 'Down', u ? C.up : C.dn, '#fff') })
        cel(0, 2, 'POC', C.tabelaFundo, C.tabelaTexto); cel(0, 3, 'Price', C.tabelaFundo, C.tabelaTexto)
        pocs.forEach(([t, a], q) => { cel(q + 1, 2, t, C.tabelaFundo, C.tabelaTexto); cel(q + 1, 3, a == null ? 'n/a' : a ? 'Above' : 'Below', a == null ? C.tabelaFundo : a ? C.up : C.dn, '#fff') })
        g.textAlign = 'left'; g.globalAlpha = 1 }
      { let m = 0; for (let i = ult - 19; i <= ult; i++) m += D.c[Math.max(0, i)].v; m /= 20
        if (D.c[ult].v < m * .5) { g.font = F(600, 14); const t = 'Low Volume', tw = g.measureText(t).width + 18 * esc; g.fillStyle = '#FF5252'; g.fillRect(T.largura - tw - 8 * esc, 8 * esc, tw, 24 * esc); g.fillStyle = '#fff'; g.fillText(t, T.largura - tw + 1 * esc, 25 * esc) } }
      g.font = F(600, 18); g.fillStyle = C.marca; g.textAlign = 'right'; g.fillText('Trendshot by MTM', T.largura - 12 * esc, T.base - 12 * esc); g.textAlign = 'left'
      T.rotulo(o.rotulo, vis.sinal || vis.plano || 0)
    }
    return { wrap, desenha, D }
  }

  G.MOTORES.trendshot = { grafico, serie, poc, gestao, camadas3d: ['medias', 'cores', 'estrutura', 'sinal'], camadasLado: ['medias', 'cores', 'estrutura', 'poc', 'estrelas', 'tabela'] }
})(typeof window !== 'undefined' ? window : globalThis)
