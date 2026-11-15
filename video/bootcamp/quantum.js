// Quantum — o gráfico do indicador, como aparece no TradingView, para os vídeos.
// Não há código Pine no repositório: segue o guia (quantum-guia.pdf) e as capturas do indicador nele. Linha primária
// (Primary Trend Line) grossa azul/vermelha, MacroTrend fina, MicroTrend e fita da cor da fase, bandas de volatilidade
// cinzentas por cima e por baixo do preço, velas azuis/vermelhas, seta grande de fase (MacroPhase), pequenas setas
// (MicroArrows), triângulos de recuo (MicroPullback), pontos MicroWave, painel MasterStrength (SCORE + M1…W1) e o
// oscilador Quantum com a zona vermelha de venda (em cima) e a azul de compra (em baixo). O indicador não dá stop
// nem alvo: o plano é a regra MTM do guia (stop para lá do último extremo do recuo, alvo ≥ 2R).
// As fórmulas são ilustrativas (o código não é público). Mercado sintético.
;(function (G) {
  const M = G.MB
  const C = { fundo: '#0B0D12', grelha: 'rgba(42,46,57,.35)', eixo: '#787B86', azul: '#1E5BB8', azulC: '#3B7DDD', verm: '#A8262C', vermC: '#E0474C',
    banda: 'rgba(128,128,136,.20)', oscZonaV: 'rgba(150,20,20,.55)', oscZonaA: 'rgba(30,80,150,.55)', tp: '#2E9E5B', sl: '#E0474C' }
  const AQUEC = 300
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})` }

  // NZDCAD em M15 (ATR ≈ 5 pips)
  const lento = (i) => Math.sin(i / 15) * .3 + Math.sin(i / 43) * .18
  const recuos = (d) => (i) => d * (.3 + Math.sin(i / 4.2) * .55)
  const ROTEIROS = {
    compra:    [[AQUEC, lento], [14, -.25], [105, recuos(1)], [20, .05]],
    venda:     [[AQUEC, lento], [14, .25], [105, recuos(-1)], [20, -.05]],
    tendencia: [[AQUEC, lento], [14, -.25], [125, recuos(1)]],
    falha:     [[AQUEC, lento], [14, -.25], [26, recuos(1)], [100, (i) => Math.sin(i / 3) * .35, .45]],
  }

  function serie(cenario = 'compra', seed = 7) {
    const c = M.velas(ROTEIROS[cenario] || ROTEIROS.compra, seed, .8160, .0005, 7 * 60 - AQUEC * 15, 15)
    const N = c.length, cl = c.map(x => x.c), a = M.atr(c, 14)
    const prim = M.ema(cl, 100), micro = M.ema(cl, 8), m21 = M.ema(cl, 21), mid = M.ema(cl, 20)
    // MacroTrend: regressão linear das últimas 160 velas, desenhada como linha fina
    const macro = cl.map((_, i) => { const n = Math.min(160, i + 1), j0 = i - n + 1; let sx = 0, sy = 0, sxy = 0, sxx = 0; for (let k = 0; k < n; k++) { const y = cl[j0 + k]; sx += k; sy += y; sxy += k * y; sxx += k * k } const b = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0; return (sy - b * sx) / n + b * (n - 1) })
    const bUp = [mid.map((m, i) => m + 1.4 * a[i]), mid.map((m, i) => m + 2.6 * a[i])], bDn = [mid.map((m, i) => m - 1.4 * a[i]), mid.map((m, i) => m - 2.6 * a[i])]
    // fase (MacroPhase): EMA 21 vs EMA 55, com confirmação de 2 velas
    const e55 = M.ema(cl, 55), fase = []; let f = 1
    for (let i = 0; i < N; i++) { if (i > 2 && m21[i] > e55[i] && m21[i - 1] > e55[i - 1] && cl[i] > prim[i]) f = 1; else if (i > 2 && m21[i] < e55[i] && m21[i - 1] < e55[i - 1] && cl[i] < prim[i]) f = -1; fase.push(f) }
    // oscilador Quantum: estocástico rápido (5) — vermelho > 80 (venda), azul < 20 (compra)
    const osc = c.map((_, i) => { const j0 = Math.max(0, i - 4); let h = -Infinity, l = Infinity; for (let j = j0; j <= i; j++) { h = Math.max(h, c[j].h); l = Math.min(l, c[j].l) } return h > l ? (c[i].c - l) / (h - l) * 100 : 50 })
    const triang = [], ponto = []
    for (let i = 0; i < N; i++) {
      const d = fase[i], v = c[i], corOk = d > 0 ? v.c > v.o : v.c < v.o
      // MicroPullback: o recuo tocou na fita (EMA 21) e a vela fecha de volta na direção
      const toque = i > 0 && (d > 0 ? Math.min(c[i - 1].l, v.l) <= m21[i] + .2 * a[i] : Math.max(c[i - 1].h, v.h) >= m21[i] - .2 * a[i])
      triang.push(i > 3 && corOk && toque && d * (v.c - m21[i]) > 0 && d * (cl[i] - prim[i]) > 0)
      // MicroWave: o oscilador sai da zona da direção
      ponto.push(i > 1 && corOk && (d > 0 ? osc[i - 1] < 25 && osc[i] >= 25 : osc[i - 1] > 75 && osc[i] <= 75))
    }
    // pontuação MasterStrength por timeframe (k velas de 15 min; M1/M5 aproximados pela série curta)
    const tfs = [['M1', .07], ['M5', .33], ['M15', 1], ['M30', 2], ['H1', 4], ['H4', 16], ['D1', 96], ['W1', 480]]
    const dirTF = (i, k) => { if (k < 1) { const s = cl.slice(Math.max(0, i - 12), i + 1); return s[s.length - 1] >= s[Math.max(0, s.length - 1 - Math.round(4 * k + 1))] ? 1 : -1 }
      const v = []; for (let j = i % k; j <= i; j += k) v.push(cl[Math.min(i, j + k - 1)]); if (v.length < 6) return (i > 100 ? cl[i] - cl[i - 100] : 1) >= 0 ? 1 : -1
      const e1 = M.ema(v, 5), e2 = M.ema(v, 13); return e1[e1.length - 1] > e2[e2.length - 1] ? 1 : -1 }
    const painel = i => { const setas = tfs.map(([t, k]) => [t, dirTF(i, k)]), soma = setas.reduce((s, [, d], q) => s + d * (q < 2 ? .5 : 1), 0)
      const forca = Math.tanh((cl[i] - prim[i]) / (3 * a[i])), k = Math.sqrt(Math.min(1, Math.abs(m21[i] - m21[Math.max(0, i - 20)]) / (6 * a[i])) ** 2)   // sem direção → perto de 50
      return { setas, score: Math.round(50 + (soma * 1.6 + forca * 6) * k) } }
    const sinais = []
    for (let i = 30; i < N; i++) if ((triang[i] || ponto[i])) { const d = fase[i]; let ext = c[i][d > 0 ? 'l' : 'h']; for (let j = i - 1; j >= i - 8; j--) ext = d > 0 ? Math.min(ext, c[j].l) : Math.max(ext, c[j].h)
      const sl = ext - d * .3 * a[i], R = Math.abs(c[i].c - sl); sinais.push({ i, d, entry: c[i].c, sl, tp: c[i].c + d * 2 * R, forte: triang[i] && ponto[i], naBanda: d > 0 ? c[i].l <= bDn[0][i] : c[i].h >= bUp[0][i] }) }
    const ini = AQUEC, quer = cenario === 'venda' ? -1 : 1
    const fim = s => { for (let i = s.i + 1; i < N; i++) { const v = c[i]; if (s.d > 0 ? v.l <= s.sl : v.h >= s.sl) return -1; if (s.d > 0 ? v.h >= s.tp : v.l <= s.tp) return 1 } return 0 }
    let s0
    if (cenario === 'falha') { const cc = sinais.filter(s => s.i >= ini + 55 && s.i <= ini + 105); s0 = cc.find(s => fim(s) < 0) || cc[0] }   // um sinal dentro da consolidação, que falha
    else { const cand = sinais.filter(s => s.i >= ini + 40 && s.i <= ini + 100 && s.d === quer && s.d === fase[s.i]), bom = cand.filter(s => fim(s) > 0)
      s0 = bom.find(s => s.forte) || bom.find(s => triang[s.i]) || bom[0] || cand[0] }
    return { c, N, ini, prim, micro, m21, macro, bUp, bDn, fase, osc, triang, ponto, painel, sinais, sig: s0 ? s0.i : ini + 70, frac: cenario === 'tendencia' ? .35 : cenario === 'falha' ? .36 : .62, simbolo: 'NZDCAD', s0 }
  }

  // camadas: cores (velas da fase), medias (linha primária, MacroTrend, MicroTrend + fita, bandas de volatilidade),
  // setas (MacroPhase, MicroArrows, MicroPullback, MicroWave), sinal (realça a entrada), plano (regra MTM),
  // painel (MasterStrength), oscilador. Sinónimos: bandas→medias, niveis→medias.
  function grafico(r, o, el) {
    const W = o.w || 1560, H = o.h || 780
    const wrap = el('div', 'carta3d cartao', null, { left: (o.left ?? (1920 - W) / 2) + 'px', top: (o.top || 200) + 'px', width: W + 'px', height: H + 'px', overflow: 'hidden', background: o.transparente ? 'transparent' : C.fundo })
    const cv = el('canvas'); cv.width = W; cv.height = H; wrap.append(cv); r.append(wrap)
    const g = cv.getContext('2d'), D = serie(o.cenario || 'compra', o.seed || 7), esc = Math.max(.62, Math.min(1, W / 1560))
    const CT = o.transparente ? { ...C, fundo: 'rgba(11,13,18,.45)' } : C
    function desenha(vis0, ate, zoom) {
      const vis = { ...(vis0 || {}) }; if (vis.bandas) vis.medias = Math.max(vis.medias || 0, vis.bandas); if (vis.niveis) vis.medias = Math.max(vis.medias || 0, vis.niveis)
      if (vis.setas && vis.oscilador == null) vis.oscilador = vis.setas; if (vis.medias && vis.painel == null) vis.painel = vis.medias
      const J = M.janela(D, ate, zoom), ult = J.ult, comOsc = (vis.oscilador || 0) > 0, Hp = comOsc ? Math.round(H * .74) : H
      let hi = -Infinity, lo = Infinity; for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.c[i].h); lo = Math.min(lo, D.c[i].l) }
      if (vis.medias) for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.bUp[1][i]); lo = Math.min(lo, D.bDn[1][i], D.prim[i]) }
      const sg = D.sinais.find(s => s.i === D.sig && s.i <= ult && s.i >= J.iniV)
      if (vis.plano && sg) { hi = Math.max(hi, sg.sl, sg.tp); lo = Math.min(lo, sg.sl, sg.tp) }
      const T = M.tela(g, W, Hp, esc, J, hi, lo, CT, 14), { X, Y, F } = T
      if (comOsc) { g.fillStyle = CT.fundo; g.fillRect(0, Hp, W, H - Hp); g.strokeStyle = '#2A2E39'; g.beginPath(); g.moveTo(0, Hp + 1); g.lineTo(W, Hp + 1); g.stroke() }
      T.horas(D); T.clip()
      if (vis.medias) { const a = vis.medias
        T.faixa(D.bUp[1], D.bUp[0], C.banda, a); T.faixa(D.bDn[0], D.bDn[1], C.banda, a)
        // MacroTrend (fina) e linha primária (grossa), da cor do lado do preço
        // MacroTrend: recta de regressão das últimas 160 velas até à vela visível, prolongada (como no gráfico do guia)
        { const n = Math.min(160, ult + 1), j0 = ult - n + 1; let sx = 0, sy = 0, sxy = 0, sxx = 0; for (let k = 0; k < n; k++) { const y = D.c[j0 + k].c; sx += k; sy += y; sxy += k * y; sxx += k * k }
          const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a0 = (sy - b * sx) / n, yAt = i => a0 + b * (i - j0)
          g.globalAlpha = a; g.strokeStyle = b >= 0 ? C.azulC : C.vermC; g.lineWidth = 1.4 * esc; g.beginPath(); g.moveTo(X(J.iniV), Y(yAt(J.iniV))); g.lineTo(X(ult), Y(yAt(ult))); g.stroke() }
        g.globalAlpha = a; for (const [arr, lw] of [[D.prim, 5]]) { g.lineWidth = lw * esc; for (let i = J.iniV + 1; i <= ult; i++) { g.strokeStyle = D.c[i].c >= arr[i] ? C.azulC : C.vermC; g.beginPath(); g.moveTo(X(i - 1), Y(arr[i - 1])); g.lineTo(X(i), Y(arr[i])); g.stroke() } }
        g.globalAlpha = 1
        // fita MicroTrend (EMA 8 ↔ 21) da cor da fase
        for (let i = J.iniV + 1; i <= ult; i++) { g.globalAlpha = a * .5; g.fillStyle = D.fase[i] > 0 ? C.azul : C.verm; g.beginPath(); g.moveTo(X(i - 1), Y(D.micro[i - 1])); g.lineTo(X(i), Y(D.micro[i])); g.lineTo(X(i), Y(D.m21[i])); g.lineTo(X(i - 1), Y(D.m21[i - 1])); g.closePath(); g.fill() }
        g.globalAlpha = 1 }
      for (let i = J.iniV; i <= ult; i++) { const v = D.c[i]; T.vela(v, i, vis.cores ? (D.fase[i] > 0 ? C.azul : C.verm) : (v.c >= v.o ? C.azulC : C.vermC)) }
      if (vis.setas) { const a = vis.setas; g.globalAlpha = a
        for (let i = Math.max(J.iniV, 1); i <= ult; i++) { const v = D.c[i], x = X(i), d = D.fase[i]
          // MicroArrows: seta pequena só nas velas que vão no sentido da fase
          const up = v.c >= v.o; if ((d > 0) === up) { g.fillStyle = up ? C.azulC : C.vermC; g.font = F(600, 11); g.textAlign = 'center'; g.fillText(up ? '↑' : '↓', x, up ? Y(v.l) + 14 * esc : Y(v.h) - 6 * esc) }
          if (D.fase[i] !== D.fase[i - 1]) { const s = 16 * esc, y = d > 0 ? Y(v.l) + 30 * esc : Y(v.h) - 30 * esc; g.fillStyle = d > 0 ? C.azulC : C.vermC; g.beginPath(); if (d > 0) { g.moveTo(x, y - s); g.lineTo(x - s, y + s * .7); g.lineTo(x + s, y + s * .7) } else { g.moveTo(x, y + s); g.lineTo(x - s, y - s * .7); g.lineTo(x + s, y - s * .7) } g.fill() }
          if (D.triang[i]) { const s = 7 * esc, y = d > 0 ? Y(v.l) + 26 * esc : Y(v.h) - 26 * esc; g.fillStyle = d > 0 ? '#6FA8FF' : '#FF7A7F'; g.beginPath(); if (d > 0) { g.moveTo(x, y - s); g.lineTo(x - s, y + s); g.lineTo(x + s, y + s) } else { g.moveTo(x, y + s); g.lineTo(x - s, y - s); g.lineTo(x + s, y - s) } g.fill() }
          if (D.ponto[i]) { g.fillStyle = d > 0 ? C.azulC : C.vermC; g.beginPath(); g.arc(x, d > 0 ? Y(v.l) + 40 * esc : Y(v.h) - 40 * esc, 4 * esc, 0, 7); g.fill() } }
        g.textAlign = 'left'; g.globalAlpha = 1 }
      if (vis.sinal && sg) { g.globalAlpha = vis.sinal; const v = D.c[sg.i], x = X(sg.i), cor = sg.d > 0 ? C.azulC : C.vermC
        g.strokeStyle = cor; g.lineWidth = 2.5 * esc; g.beginPath(); g.arc(x, sg.d > 0 ? Y(v.l) + 30 * esc : Y(v.h) - 30 * esc, 22 * esc, 0, 7); g.stroke()
        T.etiqueta(sg.forte ? 'MicroPullback + MicroWave' : (D.triang[sg.i] ? 'MicroPullback' : 'MicroWave'), x + 26 * esc, sg.d > 0 ? Y(v.l) + 30 * esc : Y(v.h) - 30 * esc, cor, '#fff', 13); g.globalAlpha = 1 }
      if (vis.plano && sg) { g.globalAlpha = vis.plano; const x1 = X(sg.i), x2 = Math.min(T.largura - 200 * esc, X(sg.i + 24))
        let ok = false, sx = false; for (let i = sg.i + 1; i <= ult; i++) { const v = D.c[i]; if (sg.d > 0 ? v.l <= sg.sl : v.h >= sg.sl) { sx = true; break } if (sg.d > 0 ? v.h >= sg.tp : v.l <= sg.tp) { ok = true; break } }
        g.fillStyle = 'rgba(46,158,91,.14)'; g.fillRect(x1, Y(Math.max(sg.entry, sg.tp)), x2 - x1, Math.abs(Y(sg.tp) - Y(sg.entry))); g.fillStyle = 'rgba(224,71,76,.14)'; g.fillRect(x1, Y(Math.max(sg.entry, sg.sl)), x2 - x1, Math.abs(Y(sg.sl) - Y(sg.entry)))
        // etiquetas empilhadas para não se taparem (a entrada e o stop ficam perto)
        const gap = 26 * esc, yE = Y(sg.entry), ySl = Y(sg.sl), yTp = Y(sg.tp), lab = { e: yE, s: ySl, t: yTp }
        if (Math.abs(ySl - yE) < gap) lab.s = yE + Math.sign(ySl - yE || 1) * gap
        if (Math.abs(yTp - yE) < gap) lab.t = yE + Math.sign(yTp - yE || -1) * gap
        ;[['Entry', sg.entry, '#8A8F98', '', lab.e], ['Stop', sg.sl, C.sl, sx ? ' ✗' : '', lab.s], ['Target 2R', sg.tp, C.tp, ok ? ' ✓' : '', lab.t]].forEach(([t, p, cor, m, yl]) => { const y = Y(p); g.strokeStyle = cor; g.lineWidth = 1.5 * esc; g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); T.etiqueta(`${t}: ${M.fmt(p, 5)}${m}`, x2 + 2, yl, cor, '#fff', 13) })
        g.globalAlpha = 1 }
      g.restore()
      { const v = D.c[ult]; T.preco(v.c, vis.cores ? (D.fase[ult] > 0 ? C.azul : C.verm) : (v.c >= v.o ? C.azulC : C.vermC)) }
      if (vis.painel) { const P = D.painel(ult), cw = 50 * esc, ch = 26 * esc, x0 = T.largura - cw * 9.6 - 8 * esc, y0 = 8 * esc
        const corS = P.score > 50 ? '#1E5BB8' : P.score < 45 ? '#A8262C' : '#6B6F78'
        g.globalAlpha = vis.painel; g.fillStyle = '#1E4C96'; g.fillRect(x0, y0, cw * 9.6, ch); g.fillStyle = '#15171C'; g.fillRect(x0, y0 + ch, cw * 9.6, ch * 1.3)
        g.fillStyle = corS; g.fillRect(x0, y0 + ch, cw * 1.6, ch * 1.3); g.font = F(600, 13); g.textAlign = 'center'; g.fillStyle = '#E6E8EC'; g.fillText('SCORE', x0 + cw * .8, y0 + ch * .68)
        g.font = F(700, 20); g.fillText(String(P.score), x0 + cw * .8, y0 + ch * 1.95)
        P.setas.forEach(([t, d], q) => { const cx = x0 + cw * (2.1 + q); g.font = F(600, 13); g.fillStyle = '#E6E8EC'; g.fillText(t, cx, y0 + ch * .68); g.font = F(700, 17); g.fillStyle = d > 0 ? C.azulC : C.vermC; g.fillText(d > 0 ? '↑' : '↓', cx, y0 + ch * 1.95) })
        g.textAlign = 'left'; g.globalAlpha = 1 }
      if (comOsc) { const top = Hp + 10 * esc, bot = H - 26 * esc, Yo = v => top + (100 - v) / 100 * (bot - top), a = vis.oscilador
        g.save(); g.beginPath(); g.rect(0, Hp, T.largura, H - Hp); g.clip(); g.globalAlpha = a
        g.fillStyle = C.oscZonaV; g.fillRect(0, Yo(100), X(ult), Yo(80) - Yo(100)); g.fillStyle = C.oscZonaA; g.fillRect(0, Yo(20), X(ult), Yo(0) - Yo(20))
        g.strokeStyle = '#D0D3D9'; g.lineWidth = 1.3 * esc; g.beginPath(); for (let i = J.iniV; i <= ult; i++) { const y = Yo(D.osc[i]); i === J.iniV ? g.moveTo(X(i), y) : g.lineTo(X(i), y) } g.stroke()
        g.restore(); g.globalAlpha = 1 }
      g.font = F(600, 15); g.fillStyle = C.eixo; g.fillText(`${D.simbolo} · 15 · Quantum`, 14 * esc, T.topo + 26 * esc)
      T.rotulo(o.rotulo, vis.sinal || vis.plano || 0)
    }
    return { wrap, desenha, D }
  }

  G.MOTORES.quantum = { grafico, serie, camadas3d: ['medias', 'setas', 'painel', 'sinal'], camadasLado: ['cores', 'medias', 'painel'] }
})(typeof window !== 'undefined' ? window : globalThis)
