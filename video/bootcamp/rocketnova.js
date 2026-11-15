// RocketNova by MTM — o gráfico do indicador, como aparece no TradingView, para os vídeos.
// Segue docs/pine/rocketnova.pine (v6): EMA 20 vermelha / 50 azul / 238 laranja (grossa); velas verdes com a
// 20 acima da 50, laranja com a 20 abaixo, amarelas na Rocket Candle (corpo ≥ 1,2 ATR a fechar no extremo);
// estrelas ✦ (pivot Depth 34 / Backstep 8 / Deviation 1,3 ATR) verdes nos mínimos e vermelhas nos máximos;
// etiqueta Buy / Sell no cruzamento confirmado dentro do Trade Clock (08:00–21:00) com estrela de lançamento
// nas últimas 40 velas; caixa Entry / TP1–TP4 / SL (SL automático 100 pips; TP 30/50/100/150 % do SL);
// painéis Volatility Pulse (ATR 14 / média 100) e Trade Clock (Good / Low Volume / Market Closed); gestão:
// depois do TP1 o stop passa para a entrada, um sinal contrário fecha a trade. Marca «RocketNova by MTM».
// Mercado sintético (ilustrativo), US30 em M5.
;(function (G) {
  const M = G.MB
  const C = {
    fundo: '#131722', grelha: 'rgba(42,46,57,.55)', eixo: '#787B86',
    emaF: '#E05A4F', emaS: '#2962FF', emaL: '#E8923D',
    bull: '#5CB85C', bear: '#E8923D', rkt: '#F2E23B', starBr: '#E05A4F', starBl: '#7DD87D',
    entry: '#D2A63C', tp: '#12B886', sl: '#D6401F', cinza: '#9AA0A6', painelFundo: '#E9ECF1', painelTxt: '#1F2A44', marca: '#D2A63C',
  }
  const FAST = 20, SLOW = 50, LONG = 238, DEPTH = 34, BACK = 8, DEV = 1.3, LOOK = 40, RKT = 1.2, BOX_W = 20, AQUEC = 320
  const SL_PTS = 100, MULT = [.3, .5, 1, 1.5] // US30: 100 pips = 10000 pontos × 0,01

  // deriva por troço, em ATR por vela (US30 em M5, ATR ≈ 25 pontos); o 5.º campo é o choque de uma Rocket Candle
  const ROTEIROS = {
    compra:    [[AQUEC, .05], [50, -.32], [20, .03], [1, 0, .1, 2.2, 1.9], [9, .55], [80, .38]],
    venda:     [[AQUEC, -.05], [50, .32], [20, -.03], [1, 0, .1, 2.2, -1.9], [9, -.55], [80, -.38]],
    tendencia: [[AQUEC, -.03], [26, -.28], [1, 0, .1, 2, 1.8], [8, .5], [46, .42], [12, -.6], [24, .02], [50, .3]],
    // falha: um troço agitado e depois um lateral apertado — o Volatility Pulse cai para LOW e as médias cruzam-se a cada poucas velas
    falha:     [[AQUEC - 70, .03, 1], [80, (i) => Math.sin(i / 7) * 1.3, 1.8], [150, (i) => Math.sin(i / 7) * .3, .25]],
  }

  function serie(cenario = 'compra', seed = 7) {
    const c = M.velas(ROTEIROS[cenario] || ROTEIROS.compra, seed, 44000, 25, 9 * 60 - AQUEC * 5)
    const N = c.length, cl = c.map(x => x.c)
    const eF = M.ema(cl, FAST), eS = M.ema(cl, SLOW), eL = M.ema(cl, LONG), atr = M.atr(c, 14)
    const atrAvg = M.sma(atr, 100), pulse = atr.map((a, i) => atrAvg[i] > 0 ? a / atrAvg[i] : 1)
    const vol = c.map(x => x.v), volAvg = M.sma(vol, 20), lowVol = vol.map((v, i) => v < volAvg[i] * .5)
    const inSess = c.map(x => { const m = ((x.t % 1440) + 1440) % 1440; return m >= 480 && m < 1260 })
    const up = eF.map((f, i) => f > eS[i])
    const crossUp = up.map((u, i) => i > 0 && u && !up[i - 1]), crossDn = up.map((u, i) => i > 0 && !u && up[i - 1])
    // Rocket Candle: corpo ≥ 1,2 ATR a fechar no extremo (sombra do lado do fecho ≤ 30 % do range)
    const rktUp = c.map((x, i) => x.c > x.o && x.c - x.o >= RKT * atr[i] && x.h - x.l > 0 && (x.h - x.c) <= (x.h - x.l) * .3)
    const rktDn = c.map((x, i) => x.c < x.o && x.o - x.c >= RKT * atr[i] && x.h - x.l > 0 && (x.c - x.l) <= (x.h - x.l) * .3)
    // estrelas: pivots Depth/Backstep, com Deviation face à estrela contrária anterior
    const ph = M.pivo(c, DEPTH, BACK, true), pl = M.pivo(c, DEPTH, BACK, false)
    const estrelas = [], bearStar = new Array(N).fill(false), bullStar = new Array(N).fill(false)
    let lastH = null, lastL = null
    for (let i = 0; i < N; i++) {
      const br = ph[i] != null && (lastL == null || ph[i] - lastL >= DEV * atr[i]), bl = pl[i] != null && (lastH == null || lastH - pl[i] >= DEV * atr[i])
      if (br) { lastH = ph[i]; bearStar[i] = true; estrelas.push({ conf: i, bar: i - BACK, alto: true, nivel: ph[i] }) }
      if (bl) { lastL = pl[i]; bullStar[i] = true; estrelas.push({ conf: i, bar: i - BACK, alto: false, nivel: pl[i] }) }
    }
    const trades = []
    for (let i = 1; i < N; i++) if (crossUp[i] || crossDn[i]) {
      const d = crossUp[i] ? 1 : -1, e = c[i].c
      const sinceStar = M.barssince(d > 0 ? bullStar : bearStar, i), starOk = sinceStar <= LOOK
      trades.push({ i, dir: d, entry: e, sl: e - d * SL_PTS, tp: MULT.map(m => e + d * SL_PTS * m), inSess: inSess[i], starOk, sinceStar, sinal: inSess[i] && starOk })
    }
    const ini = AQUEC, alvo = cenario === 'tendencia' ? ini + 20 : cenario === 'falha' ? ini + 30 : ini + 60
    const t0 = trades.find(t => t.i >= alvo && t.sinal) || trades.filter(t => t.i >= ini).pop()
    return { c, N, ini, eF, eS, eL, atr, pulse, lowVol, inSess, up, crossUp, crossDn, rktUp, rktDn, estrelas, bearStar, bullStar, trades,
      sig: t0 ? t0.i : ini + 90, frac: cenario === 'tendencia' ? .3 : cenario === 'falha' ? .5 : .62, simbolo: 'US30' }
  }

  // gestão da trade como no Pine: TPs por ordem, depois do TP1 o stop passa para a entrada (be), SL/BE fecha,
  // um sinal contrário fecha (exit). Devolve o stop vivo por vela e os eventos.
  function gestao(D, t) {
    const d = t.dir, stop = [], hits = [null, null, null, null]; let s = t.sl, out = null, fim = null
    stop[t.i] = s
    for (let j = t.i + 1; j < D.N; j++) { const v = D.c[j]
      const outro = D.trades.find(x => x.i === j && x.sinal && x.dir !== d)
      if (outro) { out = 'exit'; fim = j; stop[j] = s; break }
      if (d > 0 ? v.l <= s : v.h >= s) { out = hits[0] != null ? 'be' : 'sl'; fim = j; stop[j] = s; break }
      for (let k = 0; k < 4; k++) if (hits[k] == null && (d > 0 ? v.h >= t.tp[k] : v.l <= t.tp[k])) { hits[k] = j; if (k === 0) s = t.entry }
      stop[j] = s
      if (hits[3] != null) { out = 'tp4'; fim = j; break } }
    return { stop, hits, out, fim }
  }

  // camadas aceites: medias, cores (velas da tendência + Rocket Candle), estrelas, sinal (etiquetas Buy/Sell), plano
  // (caixa Entry/TP/SL), gestao (stop na entrada, alvos tocados, fecho), painel (Volatility Pulse + Trade Clock).
  // Sinónimos do motor genérico: bandas→medias, estrutura/niveis→estrelas, setas→sinal.
  function grafico(r, o, el) {
    const W = o.w || 1560, H = o.h || 780, en = G.LANG === 'en'
    const wrap = el('div', 'carta3d cartao', null, { left: (o.left ?? (1920 - W) / 2) + 'px', top: (o.top || 200) + 'px', width: W + 'px', height: H + 'px', overflow: 'hidden', background: o.transparente ? 'transparent' : C.fundo })
    const cv = el('canvas'); cv.width = W; cv.height = H; wrap.append(cv); r.append(wrap)
    const g = cv.getContext('2d'), D = serie(o.cenario || 'compra', o.seed || 7), esc = Math.max(.62, Math.min(1, W / 1560))
    const CT = o.transparente ? { ...C, fundo: 'rgba(19,23,34,.45)' } : C
    function desenha(vis0, ate, zoom) {
      const vis = { ...(vis0 || {}) }
      if (vis.bandas) vis.medias = Math.max(vis.medias || 0, vis.bandas); if (vis.estrutura) vis.estrelas = Math.max(vis.estrelas || 0, vis.estrutura); if (vis.niveis) vis.estrelas = Math.max(vis.estrelas || 0, vis.niveis); if (vis.setas) vis.sinal = Math.max(vis.sinal || 0, vis.setas)
      const J = M.janela(D, ate, zoom), ult = J.ult
      let hi = -Infinity, lo = Infinity; for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.c[i].h); lo = Math.min(lo, D.c[i].l) }
      const tr = [...D.trades].reverse().find(t => t.i <= ult && t.i >= J.iniV && t.sinal)
      if ((vis.plano || vis.gestao) && tr) { hi = Math.max(hi, tr.entry, tr.sl, ...tr.tp); lo = Math.min(lo, tr.entry, tr.sl, ...tr.tp) }
      if (vis.medias) for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.eL[i]); lo = Math.min(lo, D.eL[i]) }
      const T = M.tela(g, W, H, esc, J, hi, lo + (lo - hi) * .05, CT, BOX_W * .9), { X, Y, F } = T
      T.horas(D); T.clip()
      if (vis.medias) { T.linha(D.eF, C.emaF, vis.medias, 2); T.linha(D.eS, C.emaS, vis.medias, 2); T.linha(D.eL, C.emaL, vis.medias, 3) }
      for (let i = J.iniV; i <= ult; i++) { const v = D.c[i]
        const cor = vis.cores ? ((D.rktUp[i] || D.rktDn[i]) ? C.rkt : D.up[i] ? C.bull : C.bear) : (v.c >= v.o ? '#089981' : '#F23645')
        T.vela(v, i, cor) }
      if (vis.cores) { // chamada discreta da Rocket Candle mais recente visível
        for (let i = ult; i >= J.iniV; i--) if (D.rktUp[i] || D.rktDn[i]) { g.globalAlpha = vis.cores; g.font = F(700, 13); g.fillStyle = C.rkt; g.textAlign = 'center'
          g.fillText('Rocket Candle', X(i), D.rktUp[i] ? Y(D.c[i].l) + 46 * esc : Y(D.c[i].h) - 36 * esc); g.textAlign = 'left'; g.globalAlpha = 1; break } }
      if (vis.estrelas) { g.globalAlpha = vis.estrelas; g.textAlign = 'center'; g.font = F(700, 20)
        D.estrelas.forEach(e => { if (e.conf > ult || e.bar < J.iniV) return; const v = D.c[e.bar]
          g.fillStyle = e.alto ? C.starBr : C.starBl; g.fillText('✦', X(e.bar), e.alto ? Y(v.h) - 10 * esc : Y(v.l) + 22 * esc) })
        g.textAlign = 'left'; g.globalAlpha = 1 }
      if (vis.sinal) { g.globalAlpha = vis.sinal
        D.trades.forEach(t => { if (t.i < J.iniV || t.i > ult || !t.sinal) return; const v = D.c[t.i]
          if (t.dir > 0) T.balao(['Buy'], X(t.i), Y(v.l) + 6 * esc, C.bull, '#fff', true, 15); else T.balao(['Sell'], X(t.i), Y(v.h) - 6 * esc, C.bear, '#fff', false, 15) })
        g.globalAlpha = 1 }
      if (vis.plano && tr) { g.globalAlpha = vis.plano; const x1 = X(tr.i), x2 = X(tr.i + BOX_W)
        g.fillStyle = 'rgba(18,184,134,.15)'; g.fillRect(x1, Y(Math.max(tr.entry, tr.tp[3])), x2 - x1, Math.abs(Y(tr.tp[3]) - Y(tr.entry)))
        g.fillStyle = 'rgba(214,64,31,.15)'; g.fillRect(x1, Y(Math.max(tr.entry, tr.sl)), x2 - x1, Math.abs(Y(tr.sl) - Y(tr.entry)))
        ;[['Entry', tr.entry, C.entry], ['TP1', tr.tp[0], C.tp], ['TP2', tr.tp[1], C.tp], ['TP3', tr.tp[2], C.tp], ['TP4', tr.tp[3], C.tp], ['SL', tr.sl, C.sl]].forEach(([t, p, cor]) => {
          const y = Y(p); g.strokeStyle = cor; g.lineWidth = 1.5 * esc; g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); T.etiqueta(`${t}: ${M.fmt(p)}`, x2 + 2, y, cor, '#fff', 14) })
        g.globalAlpha = 1 }
      // gestão: detalhe completo na última trade à vista; nas anteriores só o stop vivo, os alvos tocados e o fecho
      if (vis.gestao) for (const tr of D.trades.filter(t => t.sinal && t.i >= J.iniV && t.i <= ult)) { const G2 = gestao(D, tr), d = tr.dir, detalhe = tr === [...D.trades].reverse().find(t => t.i <= ult && t.i >= J.iniV && t.sinal); g.globalAlpha = vis.gestao; const fim = Math.min(ult, G2.fim ?? ult)
        g.lineWidth = 2.5 * esc; g.setLineDash([7 * esc, 5 * esc])
        for (let j = tr.i + 1; j <= fim; j++) { const a = G2.stop[j - 1] ?? G2.stop[j], b = G2.stop[j]; g.strokeStyle = G2.hits[0] != null && j > G2.hits[0] ? C.entry : C.sl
          g.beginPath(); g.moveTo(X(j - 1), Y(a)); g.lineTo(X(j - 1) + (X(j) - X(j - 1)) * .5, Y(a)); g.lineTo(X(j - 1) + (X(j) - X(j - 1)) * .5, Y(b)); g.lineTo(X(j), Y(b)); g.stroke() }
        g.setLineDash([])
        const ponto = (j, p, cor) => { g.fillStyle = cor; g.beginPath(); g.arc(X(j), Y(p), 5.5 * esc, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5 * esc; g.stroke() }
        G2.hits.forEach((j, k) => { if (j == null || j > ult) return; ponto(j, tr.tp[k], C.tp)
          if (k >= 1 && detalhe) { g.font = F(700, 13); g.fillStyle = C.tp; g.textAlign = 'center'; g.fillText(`TP${k + 1} ✓`, X(j), Y(tr.tp[k]) - d * 14 * esc + (d < 0 ? 10 * esc : 0)); g.textAlign = 'left' } })
        if (detalhe && G2.hits[0] != null && G2.hits[0] <= ult) { const v = D.c[G2.hits[0]]; T.balao(en ? ['TP1 ✓', 'SL → entry'] : ['TP1 ✓', 'SL → entrada'], X(G2.hits[0]), d > 0 ? Y(v.h) - 8 * esc : Y(v.l) + 8 * esc, C.entry, '#fff', d < 0, 14) }
        if (G2.fim != null && G2.fim <= ult && G2.out !== 'tp4') { const v = D.c[G2.fim], p = G2.out === 'exit' ? v.c : G2.stop[G2.fim]
          const txt = G2.out === 'exit' ? (en ? ['Exit', 'opposite signal'] : ['Exit', 'sinal contrário']) : G2.out === 'be' ? (en ? ['BE', 'stop at entry'] : ['BE', 'stop na entrada']) : ['SL']
          ponto(G2.fim, p, G2.out === 'sl' ? C.sl : C.entry); T.balao(detalhe ? txt : [txt[0]], X(G2.fim), d > 0 ? Y(v.h) - 8 * esc : Y(v.l) + 8 * esc, G2.out === 'sl' ? C.sl : C.entry, '#fff', d < 0, 14) }
        g.globalAlpha = 1 }
      g.restore()
      { const v = D.c[ult]; T.preco(v.c, vis.cores ? (D.up[ult] ? C.bull : C.bear) : (v.c >= v.o ? '#089981' : '#F23645')) }
      if (vis.painel) { g.globalAlpha = vis.painel; g.font = F(600, 13); g.textAlign = 'center'
        const p = D.pulse[ult], pTxt = p >= 1.3 ? 'HIGH' : p <= .7 ? 'LOW' : 'NORMAL', pCor = p >= 1.3 ? C.bear : p <= .7 ? C.cinza : C.bull
        const pw = 150 * esc, phh = 24 * esc, px = T.largura - pw - 10 * esc, py = H / 2 - phh
        g.fillStyle = C.painelFundo; g.fillRect(px, py, pw, phh); g.fillStyle = C.painelTxt; g.fillText('Volatility Pulse', px + pw / 2, py + phh / 2 + 4 * esc)
        g.fillStyle = pCor; g.fillRect(px, py + phh, pw, phh); g.fillStyle = '#fff'; g.fillText(`${pTxt} · ${p.toFixed(2)}x`, px + pw / 2, py + phh + phh / 2 + 4 * esc)
        const sess = D.inSess[ult], low = D.lowVol[ult], cTxt = !sess ? 'Market Closed' : low ? 'Low Volume' : 'Good Volume', cCor = !sess ? C.cinza : low ? C.starBr : C.bull
        g.font = F(600, 14); const cw = g.measureText(cTxt).width + 24 * esc
        g.fillStyle = cCor; g.fillRect(T.largura - cw - 10 * esc, 8 * esc, cw, 26 * esc); g.fillStyle = '#fff'; g.fillText(cTxt, T.largura - cw / 2 - 10 * esc, 26 * esc)
        g.textAlign = 'left'; g.globalAlpha = 1 }
      g.font = F(600, 18); g.fillStyle = C.marca; g.textAlign = 'right'; g.fillText('RocketNova by MTM', T.largura - 12 * esc, T.base - 12 * esc); g.textAlign = 'left'
      T.rotulo(o.rotulo, vis.sinal || vis.plano || 0)
    }
    return { wrap, desenha, D }
  }

  G.MOTORES.rocketnova = { grafico, serie, gestao, camadas3d: ['medias', 'cores', 'estrelas', 'sinal'], camadasLado: ['medias', 'cores', 'estrelas', 'painel'] }
})(typeof window !== 'undefined' ? window : globalThis)
