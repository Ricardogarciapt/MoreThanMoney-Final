// Sniper Pro — o gráfico do scanner, como aparece no TradingView, para os vídeos.
// Não há código Pine no repositório: segue o guia (public/educador/estrategias, sniper-pro-guia.pdf) e as capturas do
// scanner nele: candle de pontuação «+N» (+3 a +10, vermelho por cima / azul por baixo) com «Vol: N%», vela dourada,
// seta Sniper (super seta na dourada), stop tracejado vermelho e TP1/TP2 tracejados verdes com etiquetas de preço,
// zona de reteste sombreada, zonas-chave em números redondos (inteiros, meios e quartos), pivots R1–R5/S1–S5 do dia
// anterior na margem direita, fita grossa da média longa (vermelha/azul), média curta colorida, médias cinzenta e
// roxa, tabela de tendência das 4 horas (Bullish/Bearish · Trending/Consolidating/Pulling Back · Very Strong…Very Weak)
// e o Oscilador Sniper (Bearish/Bullish Reversal, Bearish/Bullish Retest, Trend Direction, D de divergência).
// Só mostra os dois últimos sinais, como o scanner. As regras de pontuação são ilustrativas. Mercado sintético.
;(function (G) {
  const M = G.MB
  const C = { fundo: '#0E1015', grelha: 'rgba(42,46,57,.45)', eixo: '#787B86', azul: '#2962FF', azulV: '#3D6BE8', verm: '#E8365A', vermE: '#C8102E', ouro: '#FFD600',
    cinza: '#8A8F98', roxo: '#B03CC8', volTxt: '#E6C24A', tp: '#2E9E5B', sl: '#E8365A', zonaR: 'rgba(200,40,60,.20)', zonaA: 'rgba(40,70,160,.22)' }
  const AQUEC = 300, PIP = .0001
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})` }

  // EURGBP em M15 (ATR ≈ 4 pips). O 5.º campo é o «choque» da vela de sinal.
  const lento = (i) => Math.sin(i / 13) * .25 + Math.sin(i / 37) * .15
  const ROTEIROS = {
    venda:     [[AQUEC, (i) => lento(i) - .07], [22, .34], [5, .05, .5], [1, 0, .1, 2.8, -2.4], [8, -.15], [50, -.3]],
    compra:    [[AQUEC, (i) => lento(i) + .07], [22, -.34], [5, -.05, .5], [1, 0, .1, 2.8, 2.4], [8, .15], [50, .3]],
    tendencia: [[AQUEC, (i) => lento(i) - .07], [20, .32], [5, .05, .5], [1, 0, .1, 2.8, -2.4], [70, -.32]],
    falha:     [[AQUEC, (i) => lento(i) - .05], [26, -.3], [5, -.05, .6], [1, .5, .1, 1, 0], [1, -.6, .2], [40, -.38]],
  }

  function serie(cenario = 'venda', seed = 7) {
    const c = M.velas(ROTEIROS[cenario] || ROTEIROS.venda, seed, .8392, .0004, 7 * 60 - AQUEC * 15, 15)
    const N = c.length, cl = c.map(x => x.c), a = M.atr(c, 14)
    const e9 = M.ema(cl, 9), e50 = M.ema(cl, 50), e100 = M.ema(cl, 100), e150 = M.ema(cl, 150), e200 = M.ema(cl, 200), s200 = M.sma(cl, 200)
    // Oscilador Sniper (ilustrativo): RSI 14 alisado, linha de tendência a 51, retestes 61/39, reversões 100/0
    const osc = M.ema(M.rsi(cl, 14), 3), oscS = M.ema(osc, 5)
    const vol = c.map(x => x.v), volMed = M.sma(vol, 20)
    const volPct = vol.map((v, i) => { const j0 = Math.max(0, i - 99); let n = 0, k = 0; for (let j = j0; j <= i; j++) { k++; if (vol[j] <= v) n++ } return n / k * 100 })
    const corpo = c.map(x => Math.abs(x.c - x.o)), corpoMed = M.sma(corpo, 20)
    const dourada = c.map((x, i) => i > 20 && corpo[i] > 2.1 * corpoMed[i] && vol[i] > 1.6 * volMed[i])
    // tendência das 4 horas: EMA 9/21 da série reamostrada (16 velas de 15 min)
    const h4 = i => { const v = []; for (let j = i % 16; j <= i; j += 16) v.push(c[Math.min(i, j + 15)].c); if (v.length < 22) return e50[i] > e200[i] ? 1 : -1; const f = M.ema(v, 9), s = M.ema(v, 21); return f[f.length - 1] > s[s.length - 1] ? 1 : -1 }
    // zona-chave: número redondo (quartos de 50 pips) a menos de 6 pips
    const zona = p => { const q = 50 * PIP / 2, r = Math.round(p / q) * q; return Math.abs(p - r) < 6 * PIP ? r : null }
    const sinais = []
    for (let i = 30; i < N; i++) {
      const v = c[i], cxDn = osc[i - 1] >= 61 && osc[i] < osc[i - 1] && oscS[i] > 51, cxUp = osc[i - 1] <= 39 && osc[i] > osc[i - 1] && oscS[i] < 49
      const dn = (v.c < v.o || dourada[i]) && (cxDn || (dourada[i] && v.c < v.o)), up = (v.c > v.o || dourada[i]) && (cxUp || (dourada[i] && v.c > v.o))
      if (!dn && !up) continue
      const d = dn ? -1 : 1
      const conds = [d * (v.c - v.o) > 0, d * (v.c - e9[i]) > 0, d * (e9[i] - e9[i - 1]) > 0, d * (v.c - e50[i]) > 0, volPct[i] > 70, dourada[i],
        zona(dn ? v.h : v.l) != null, h4(i) === d, d * (osc[i] - oscS[i]) > 0, (dn ? v.h - Math.max(v.o, v.c) : Math.min(v.o, v.c) - v.l) > .3 * corpo[i]]
      const score = Math.max(3, conds.filter(Boolean).length)
      const last = sinais[sinais.length - 1]; if (last && i - last.i < 8) { if (score > last.score) sinais.pop(); else continue }
      const entry = v.c, sl = dn ? v.h + 1.5 * PIP : v.l - 1.5 * PIP, R = Math.abs(entry - sl)
      sinais.push({ i, d, score, vol: volPct[i], dourada: dourada[i], entry, sl, tp1: entry + d * R * .9, tp2: entry + d * R * 2.1, ret: [v.o, v.c] })
    }
    const ini = AQUEC
    const quer = cenario === 'compra' ? 1 : cenario === 'falha' ? 1 : -1
    const cand = sinais.filter(s => s.i >= ini + 25 && s.d === quer)
    const s0 = cenario === 'falha' ? cand.sort((x, y) => x.score - y.score)[0] : cand.sort((x, y) => y.score - x.score || x.i - y.i)[0]
    // pivots clássicos do «dia anterior» (96 velas de 15 min)
    const piv = i => { const j1 = Math.max(0, i - (i % 96) - 1), j0 = Math.max(0, j1 - 95); let h = -Infinity, l = Infinity; for (let j = j0; j <= j1; j++) { h = Math.max(h, c[j].h); l = Math.min(l, c[j].l) }
      const P = (h + l + c[j1].c) / 3, r = h - l; return { P, R: [2 * P - l, P + r, h + 2 * (P - l), h + 3 * (P - l), h + 4 * (P - l)], S: [2 * P - h, P - r, l - 2 * (h - P), l - 3 * (h - P), l - 4 * (h - P)] } }
    return { c, N, ini, e9, e50, e100, e150, e200, s200, osc, oscS, volPct, dourada, sinais, h4, zona, piv, sig: s0 ? s0.i : ini + 40, frac: .62, simbolo: 'EURGBP', s0 }
  }

  // camadas: cores (velas azuis/vermelhas/douradas), medias, sinal (pontuação + seta), plano (stop, TP1/TP2, reteste),
  // niveis (zonas-chave + pivots), tabela (tendência das 4 horas), oscilador. Sinónimos: setas→sinal, estrutura→niveis.
  function grafico(r, o, el) {
    const W = o.w || 1560, H = o.h || 780
    const wrap = el('div', 'carta3d cartao', null, { left: (o.left ?? (1920 - W) / 2) + 'px', top: (o.top || 200) + 'px', width: W + 'px', height: H + 'px', overflow: 'hidden', background: o.transparente ? 'transparent' : C.fundo })
    const cv = el('canvas'); cv.width = W; cv.height = H; wrap.append(cv); r.append(wrap)
    const g = cv.getContext('2d'), D = serie(o.cenario || 'venda', o.seed || 7), esc = Math.max(.62, Math.min(1, W / 1560))
    const CT = o.transparente ? { ...C, fundo: 'rgba(14,16,21,.45)' } : C
    function desenha(vis0, ate, zoom) {
      const vis = { ...(vis0 || {}) }; if (vis.setas) vis.sinal = Math.max(vis.sinal || 0, vis.setas); if (vis.estrutura) vis.niveis = Math.max(vis.niveis || 0, vis.estrutura)
      if (vis.sinal && vis.oscilador == null) vis.oscilador = vis.sinal
      const J = M.janela(D, ate, zoom), ult = J.ult, comOsc = (vis.oscilador || 0) > 0, Hp = comOsc ? Math.round(H * .7) : H
      let hi = -Infinity, lo = Infinity; for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.c[i].h); lo = Math.min(lo, D.c[i].l) }
      const vistos = D.sinais.filter(s => s.i >= J.iniV && s.i <= ult).slice(-2), sg = vistos.find(s => s.i === D.sig) || vistos[vistos.length - 1]
      if (vis.plano && sg) { hi = Math.max(hi, sg.sl, sg.tp2, sg.tp1); lo = Math.min(lo, sg.sl, sg.tp2, sg.tp1) }
      if (vis.medias) for (let i = J.iniV; i <= ult; i++) { const m = D.e200[i]; if (m < hi + 30 * PIP && m > lo - 30 * PIP) { hi = Math.max(hi, m); lo = Math.min(lo, m) } }
      if (vis.sinal) { const pad = (hi - lo) * .16; hi += pad; lo -= pad }
      const T = M.tela(g, W, Hp, esc, J, hi, lo, CT, 26), { X, Y, F } = T, w = T.largura / T.nb
      if (comOsc) { g.fillStyle = CT.fundo; g.fillRect(0, Hp, W, H - Hp); g.strokeStyle = '#2A2E39'; g.beginPath(); g.moveTo(0, Hp + 1); g.lineTo(W, Hp + 1); g.stroke() }
      T.horas(D); T.clip()
      if (vis.niveis) { g.globalAlpha = vis.niveis; const q = 25 * PIP
        for (let p = Math.floor(T.lo / q) * q; p < T.hi; p += q) { const meio = Math.abs(p / (50 * PIP) - Math.round(p / (50 * PIP))) < 1e-6, alt = meio ? 9 * PIP : 5 * PIP
          g.fillStyle = p > D.c[ult].c ? C.zonaR : C.zonaA; g.fillRect(0, Y(p + alt / 2), T.largura, Y(p - alt / 2) - Y(p + alt / 2))
          g.strokeStyle = 'rgba(200,200,210,.35)'; g.setLineDash([6 * esc, 6 * esc]); g.lineWidth = 1; g.beginPath(); g.moveTo(0, Y(p)); g.lineTo(T.largura, Y(p)); g.stroke(); g.setLineDash([]) }
        g.globalAlpha = 1 }
      if (vis.plano && sg) { g.globalAlpha = vis.plano * .9; const x1 = X(sg.i), x2 = Math.min(T.largura, X(sg.i + 26))
        g.fillStyle = sg.d < 0 ? 'rgba(232,54,90,.22)' : 'rgba(41,98,255,.22)'; const [r1, r2] = sg.ret; g.fillRect(x1, Y(Math.max(r1, r2)), x2 - x1, Math.abs(Y(r1) - Y(r2))); g.globalAlpha = 1 }
      if (vis.medias) {
        // fita grossa da média longa: vermelha com o preço por baixo, azul por cima
        g.globalAlpha = vis.medias; g.lineWidth = 12 * esc; g.lineCap = 'butt'
        for (let i = J.iniV + 1; i <= ult; i++) { g.strokeStyle = D.c[i].c < D.e200[i] ? rgba(C.verm, .85) : rgba(C.azul, .85); g.beginPath(); g.moveTo(X(i - 1), Y(D.e200[i - 1])); g.lineTo(X(i), Y(D.e200[i])); g.stroke() }
        g.globalAlpha = 1
        T.linha(D.e150, '#4A6FD8', vis.medias * .7, 1.2); T.linha(D.e100, '#5B7FE0', vis.medias * .7, 1.2)
        T.linha(D.s200, C.cinza, vis.medias, 2.5); T.linha(D.e50, C.roxo, vis.medias, 2)
        g.globalAlpha = vis.medias; g.lineWidth = 2.6 * esc
        for (let i = J.iniV + 1; i <= ult; i++) { g.strokeStyle = D.e9[i] < D.e9[i - 1] ? C.verm : C.azul; g.beginPath(); g.moveTo(X(i - 1), Y(D.e9[i - 1])); g.lineTo(X(i), Y(D.e9[i])); g.stroke() }
        g.globalAlpha = 1 }
      for (let i = J.iniV; i <= ult; i++) { const v = D.c[i]; let cor = v.c >= v.o ? C.azulV : C.verm; if (vis.cores && D.dourada[i]) cor = C.ouro; else if (vis.cores && D.volPct[i] < 18) cor = '#7E838C'; T.vela(v, i, cor) }
      if (vis.sinal) { g.globalAlpha = vis.sinal
        vistos.forEach(s => { const v = D.c[s.i], x = X(s.i), up = s.d > 0, cor = up ? C.azul : C.verm
          // seta Sniper (super seta na dourada)
          const sz = (s.dourada ? 13 : 8) * esc, ya = up ? Y(v.l) + 10 * esc : Y(v.h) - 10 * esc
          g.fillStyle = cor; g.fillRect(x - sz * .22, up ? ya + sz * .9 : ya - sz * 2.2, sz * .44, sz * 1.3); g.beginPath()
          if (up) { g.moveTo(x, ya); g.lineTo(x - sz * .7, ya + sz); g.lineTo(x + sz * .7, ya + sz) } else { g.moveTo(x, ya); g.lineTo(x - sz * .7, ya - sz); g.lineTo(x + sz * .7, ya - sz) } g.fill()
          // candle de pontuação
          const yb = up ? Y(v.l) + 52 * esc : Y(v.h) - 52 * esc
          T.balao([`+${s.score}`], x, yb, cor, '#fff', up, 15)
          g.font = F(600, 15); g.fillStyle = C.volTxt; g.fillText(`Vol: ${s.vol.toFixed(1)}%`, x + 22 * esc, up ? yb + 30 * esc : yb - 6 * esc) })
        g.globalAlpha = 1 }
      if (vis.plano && sg) { g.globalAlpha = vis.plano; const x1 = X(sg.i), x2 = Math.min(T.largura - 110 * esc, X(sg.i + 30))
        let tp1 = false, tp2 = false, slx = false; for (let i = sg.i + 1; i <= ult; i++) { const v = D.c[i]; if (slx) break; if (sg.d < 0 ? v.l <= sg.tp1 : v.h >= sg.tp1) tp1 = true; if (sg.d < 0 ? v.l <= sg.tp2 : v.h >= sg.tp2) tp2 = true; if (sg.d < 0 ? v.h >= sg.sl : v.l <= sg.sl) slx = true }
        ;[[sg.sl, C.sl, slx ? ' ✗' : ''], [sg.tp1, C.tp, tp1 ? ' ✓' : ''], [sg.tp2, C.tp, tp2 ? ' ✓' : '']].forEach(([p, cor, m]) => { const y = Y(p); g.strokeStyle = cor; g.lineWidth = 1.6 * esc; g.setLineDash([2 * esc, 4 * esc]); g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); g.setLineDash([])
          g.font = F(600, 14, 'JetBrains Mono'); const t = M.fmt(p, 5) + m, tw = g.measureText(t).width + 16 * esc; g.fillStyle = cor; g.beginPath(); g.roundRect(x2 + 4 * esc, y - 12 * esc, tw, 24 * esc, 4 * esc); g.fill(); g.fillStyle = '#fff'; g.fillText(t, x2 + 12 * esc, y + 5 * esc) })
        g.globalAlpha = 1 }
      if (vis.niveis) { const P = D.piv(ult); g.globalAlpha = vis.niveis; g.font = F(600, 13); const x0 = T.largura - 120 * esc
        ;[...P.R.map((p, k) => [p, 'R' + (k + 1), '#E8667E']), ...P.S.map((p, k) => [p, 'S' + (k + 1), '#5B7FE0'])].forEach(([p, t, cor]) => { if (p > T.hi || p < T.lo) return; const y = Y(p); g.strokeStyle = cor; g.lineWidth = 1.4 * esc; g.beginPath(); g.moveTo(x0, y); g.lineTo(T.largura - 6 * esc, y); g.stroke(); g.fillStyle = cor; g.fillText(t, x0 - 26 * esc, y + 4 * esc) })
        g.globalAlpha = 1 }
      g.restore()
      { const v = D.c[ult]; T.preco(v.c, v.c >= v.o ? C.azulV : C.verm) }
      if (vis.plano && sg) [sg.sl, sg.tp1, sg.tp2].forEach((p, k) => { g.globalAlpha = vis.plano; T.preco(p, k ? C.tp : C.sl); g.globalAlpha = 1 })
      if (vis.tabela) { const d = D.h4(ult), fr = Math.abs(D.osc[ult] - 50), cw = 104 * esc, ch = 32 * esc, x0 = T.largura / 2 - cw * 2.5, y0 = 10 * esc
        const fase = fr > 14 ? 0 : fr > 6 ? 2 : 1, forca = fr > 18 ? 0 : fr > 12 ? 1 : fr > 6 ? 2 : fr > 3 ? 3 : 4, cor = d > 0 ? C.azul : C.vermE
        g.globalAlpha = vis.tabela; g.font = F(600, 15); g.textAlign = 'center'
        const cel = (cx, cy, wd, t, on) => { g.fillStyle = on ? cor : '#1C1F26'; g.fillRect(x0 + cx, y0 + cy, wd - 2, ch - 2); g.fillStyle = '#E6E8EC'; g.fillText(t, x0 + cx + wd / 2, y0 + cy + ch / 2 + 5 * esc) }
        cel(0, 0, cw * 5, d > 0 ? 'Bullish' : 'Bearish', true)
        ;['Trending', 'Consolidating', 'Pulling Back'].forEach((t, k) => cel(k * cw * 5 / 3, ch, cw * 5 / 3, t, k === fase))
        ;['Very Strong', 'Strong', 'Neutral', 'Weak', 'Very Weak'].forEach((t, k) => cel(k * cw, ch * 2, cw, t, k === forca))
        g.textAlign = 'left'; g.globalAlpha = 1 }
      if (comOsc) { const top = Hp + 12 * esc, bot = H - 30 * esc, Yo = v => top + (110 - v) / 130 * (bot - top), a = vis.oscilador
        g.save(); g.beginPath(); g.rect(0, Hp, T.largura, H - Hp); g.clip(); g.globalAlpha = a
        g.fillStyle = C.vermE; g.fillRect(0, Yo(100) - 9 * esc, X(ult), 18 * esc); g.fillStyle = C.azul; g.fillRect(0, Yo(0) - 9 * esc, X(ult), 18 * esc)
        g.fillStyle = 'rgba(232,54,90,.10)'; g.fillRect(0, Yo(65), X(ult), Yo(51) - Yo(65)); g.fillStyle = 'rgba(41,98,255,.10)'; g.fillRect(0, Yo(51), X(ult), Yo(35) - Yo(51))
        ;[[65, C.verm], [61, C.verm], [39, C.azul], [35, C.azul]].forEach(([v, cor]) => { g.strokeStyle = rgba(cor, .7); g.lineWidth = 1.2 * esc; g.beginPath(); g.moveTo(0, Yo(v)); g.lineTo(X(ult), Yo(v)); g.stroke() })
        for (let i = J.iniV; i <= ult; i += 2) { g.fillStyle = D.oscS[i] >= 51 ? C.verm : C.azul; g.beginPath(); g.arc(X(i), Yo(51), 1.8 * esc, 0, 7); g.fill() }
        g.lineWidth = 3 * esc; for (let i = J.iniV + 1; i <= ult; i++) { g.strokeStyle = D.osc[i] < D.osc[i - 1] ? C.verm : C.azulV; g.beginPath(); g.moveTo(X(i - 1), Yo(D.osc[i - 1])); g.lineTo(X(i), Yo(D.osc[i])); g.stroke() }
        vistos.forEach(s => { g.fillStyle = s.d < 0 ? C.vermE : C.azul; g.beginPath(); g.arc(X(s.i), Yo(D.osc[s.i]), 4.5 * esc, 0, 7); g.fill()
          // divergência em tempo real: novo extremo de preço sem novo extremo do oscilador
          const j = s.i - 12; if (j > 0 && (s.d < 0 ? D.c[s.i].h > D.c[j].h && D.osc[s.i] < D.osc[j] : D.c[s.i].l < D.c[j].l && D.osc[s.i] > D.osc[j])) { g.font = F(700, 14); g.fillStyle = s.d < 0 ? '#E040A0' : '#5B7FE0'; g.textAlign = 'center'; g.fillText('D', X(s.i), s.d < 0 ? Yo(108) : Yo(6)); g.textAlign = 'left' } })
        g.restore(); g.globalAlpha = a
        ;[['Bearish Reversal', 100, C.vermE], ['Bearish Retest', 63, C.verm], ['Trend Direction', 51, '#3A3F4A'], ['Bullish Retest', 37, C.azul], ['Bullish Reversal', 0, C.azul]].forEach(([t, v, cor]) => T.etiqueta(t, X(ult) + 14 * esc, Yo(v), cor, '#fff', 12))
        g.globalAlpha = 1 }
      g.font = F(600, 15); g.fillStyle = C.eixo; g.fillText(`${D.simbolo} · 15 · Sniper Pro`, 14 * esc, T.topo + 26 * esc)
      T.rotulo(o.rotulo, vis.sinal || vis.plano || 0)
    }
    return { wrap, desenha, D }
  }

  G.MOTORES['sniper-pro'] = { grafico, serie, camadas3d: ['medias', 'niveis', 'tabela', 'sinal'], camadasLado: ['cores', 'medias', 'tabela'] }
})(typeof window !== 'undefined' ? window : globalThis)
