// MTM Gold Killer — o gráfico do indicador, como aparece no TradingView, para os vídeos.
// Segue docs/pine/mtm-goldkiller-alertas.pine (v5) com os inputs publicados «HLCC4 -4 80 0 3 10 Disabled 75»:
// SuperTrend próprio sobre HLCC4 (×3, ATR 10) que NÃO é desenhado (só decide as viragens); em cada viragem
// a perna que acabou entra nas listas de alvo/drawdown em % da entrada; os níveis são entrada × (1 + percentil)
// com percentis 50/75/90/100 × 0,8 (show −4, scale 80). Gain a verde e Drawdown a vermelho (plot.style_steplinebr,
// transparências 70/60/50/40), Center Line cinzenta = entrada, fills 98 % até à Center Line, BUY/SELL
// (labelup/labeldown, tiny) e o mapa dos alertas: Entry = centro, SL = Drawdown 50th, TP1/2/3 = Gain 50/75/100th.
// Camada extra «motor»: o SuperTrend interno tracejado, só para explicar de onde vem a viragem. Mercado sintético.
;(function (G) {
  const M = G.MB
  const C = { fundo: '#131722', grelha: 'rgba(42,46,57,.55)', eixo: '#787B86', verde: '#4CAF50', vermelho: '#FF5252', cinza: '#787B86', velaUp: '#089981', velaDn: '#F23645', marca: '#D2A63C' }
  const MULT = 3, ATRN = 10, SCALE = .8, AQUEC = 320, CAIXA = 20
  const PERC = [100, 90, 75, 50], TRANSP = { 100: 70, 90: 60, 75: 50, 50: 40 }
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})` }

  // XAUUSD em M15 (ATR ≈ 6 $). O aquecimento é «picado» como o ouro real, para o SuperTrend virar várias vezes
  // e as pernas darem níveis na ordem dos alertas reais (SL ≈ TP1 ≈ 0,35 %, TP2 ≈ 0,6 %, TP3 ≈ 1–1,5 %).
  const onda = (i) => Math.sin(i / 7) * .28 + Math.sin(i / 41) * .2 + Math.sin(i / 2.3) * .7
  const ROTEIROS = {
    compra:    [[AQUEC, onda, 2.3], [36, -.42], [10, .05], [60, .36], [30, .05]],
    venda:     [[AQUEC, (i) => -onda(i), 2.3], [36, .42], [10, -.05], [60, -.36], [30, -.05]],
    tendencia: [[AQUEC, onda, 2.3], [30, -.4], [10, .05], [44, .32], [10, -.2], [40, .3], [16, .02]],
    lateral:   [[AQUEC, onda, 2.3], [30, -.4], [10, .05], [110, (i) => Math.sin(i / 5) * .75, 1.6]],
    falha:     [[AQUEC, onda, 2.3], [36, -.42], [10, .05], [14, .3], [44, -.45], [20, 0]],
  }

  function serie(cenario = 'compra', seed = 7) {
    const c = M.velas(ROTEIROS[cenario] || ROTEIROS.compra, seed, 4050, 6, 7 * 60 - AQUEC * 15, 15)
    const N = c.length, src = c.map(x => (x.h + x.l + 2 * x.c) / 4), a = M.atr(c, ATRN)
    // supertrend(src, factor, atr) do Pine: direção true = baixa (linha = banda de cima)
    const st = [], baixa = []; let lowA = NaN, upA = NaN, stA = NaN
    for (let i = 0; i < N; i++) {
      const hl2 = (c[i].h + c[i].l) / 2, hl2A = i ? (c[i - 1].h + c[i - 1].l) / 2 : NaN, pl = isNaN(lowA) ? 0 : lowA, pu = isNaN(upA) ? 0 : upA
      let up = src[i] + MULT * a[i], lo = src[i] - MULT * a[i]
      lo = lo > pl || hl2A < pl ? lo : pl; up = up < pu || hl2A > pu ? up : pu
      const dir = i < ATRN ? true : stA === pu ? !(hl2 > up) : hl2 < lo
      const v = dir ? up : lo; st.push(v); baixa.push(dir); lowA = lo; upA = up; stA = v
    }
    // target_percent: pernas acabadas em % da entrada; níveis = entrada × (1 + percentil × 0,8)
    const pct = (x, e) => (x - e) / e, perc = (arr, p) => { if (!arr.length) return NaN; const o = arr.slice().sort((x, y) => x - y), pos = Math.max(0, Math.min(100, p)) / 100 * (o.length - 1), l = Math.floor(pos), h = Math.ceil(pos); return o[l] + (o[h] - o[l]) * (pos - l) }
    const bullT = [], bullD = [], bearT = [], bearD = []; let maxH = -Infinity, minL = Infinity, entry = c[0].c
    const ganho = {}, perda = {}; PERC.forEach(p => { ganho[p] = new Array(N).fill(null); perda[p] = new Array(N).fill(null) })
    const entrada = [], sinais = []
    for (let i = 0; i < N; i++) {
      const v = c[i], mudou = i > 0 && baixa[i] !== baixa[i - 1], alta = mudou && !baixa[i], queda = mudou && baixa[i]
      maxH = Math.max(maxH, v.h); minL = Math.min(minL, v.l)
      if (alta) { bearT.unshift(pct(minL, entry)); bearD.unshift(pct(maxH, entry)); maxH = -Infinity; minL = Infinity; entry = v.c }
      if (queda) { const t = pct(maxH, entry), d = pct(minL, entry); if (!bullT.includes(t)) bullT.unshift(t); if (!bullD.includes(d)) bullD.unshift(d); maxH = -Infinity; minL = Infinity; entry = v.c }
      PERC.forEach(p => { const rk = p * SCALE
        const g = baixa[i] ? perc(bearT, 100 - rk) : perc(bullT, rk), d = baixa[i] ? perc(bearD, rk) : perc(bullD, 100 - rk)
        ganho[p][i] = isNaN(g) ? null : entry * (1 + g); perda[p][i] = isNaN(d) ? null : entry * (1 + d) })
      entrada.push(entry)
      if (mudou) sinais.push({ i, compra: alta, entry, sl: perda[50][i], tp: [ganho[50][i], ganho[75][i], ganho[100][i]] })
    }
    const ini = AQUEC, quer = cenario === 'venda' ? false : true
    const s0 = sinais.find(s => s.i >= ini + 20 && s.compra === quer && s.tp.every(x => x != null)) || sinais.filter(s => s.i >= ini).pop()
    return { c, N, ini, st, baixa, ganho, perda, entrada, sinais, sig: s0 ? s0.i : ini + 60, frac: cenario === 'tendencia' ? .3 : .62, simbolo: 'XAUUSD' }
  }

  // camadas: centro (Center Line), niveis (Gain/Drawdown + fills), sinal (BUY/SELL), plano (mapa dos alertas),
  // motor (SuperTrend interno, tracejado). Sinónimos do guião genérico: cores→centro, setas→sinal.
  function grafico(r, o, el) {
    const W = o.w || 1560, H = o.h || 780
    const wrap = el('div', 'carta3d cartao', null, { left: (o.left ?? (1920 - W) / 2) + 'px', top: (o.top || 200) + 'px', width: W + 'px', height: H + 'px', overflow: 'hidden', background: o.transparente ? 'transparent' : C.fundo })
    const cv = el('canvas'); cv.width = W; cv.height = H; wrap.append(cv); r.append(wrap)
    const g = cv.getContext('2d'), D = serie(o.cenario || 'compra', o.seed || 7), esc = Math.max(.62, Math.min(1, W / 1560))
    const CT = o.transparente ? { ...C, fundo: 'rgba(19,23,34,.45)' } : C
    let lang = 'pt'; try { lang = (typeof dados !== 'undefined' && dados.lang) || 'pt' } catch (e) {}
    function desenha(vis0, ate, zoom) {
      const vis = { ...(vis0 || {}) }; if (vis.cores) vis.centro = Math.max(vis.centro || 0, vis.cores); if (vis.setas) vis.sinal = Math.max(vis.sinal || 0, vis.setas)
      const J = M.janela(D, ate, zoom), ult = J.ult
      let hi = -Infinity, lo = Infinity; for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.c[i].h); lo = Math.min(lo, D.c[i].l) }
      if (vis.niveis) for (let i = J.iniV; i <= ult; i++) PERC.forEach(p => { const a = D.ganho[p][i], b = D.perda[p][i]; if (a != null) { hi = Math.max(hi, a); lo = Math.min(lo, a) } if (b != null) { hi = Math.max(hi, b); lo = Math.min(lo, b) } })
      const sg = D.sinais.find(s => s.i === D.sig && s.i <= ult && s.i >= J.iniV) || [...D.sinais].reverse().find(s => s.i <= ult && s.i >= J.iniV)
      if (vis.plano && sg) [sg.entry, sg.sl, ...sg.tp].forEach(x => { if (x != null) { hi = Math.max(hi, x); lo = Math.min(lo, x) } })
      const T = M.tela(g, W, H, esc, J, hi, lo, CT, CAIXA * .9), { X, Y, F } = T, w = T.largura / T.nb
      T.horas(D); T.clip()
      // plot.style_steplinebr: degrau por vela, salto vertical quando o valor muda
      const degrau = (arr, cor, a, lw = 2) => { if (!a) return; g.globalAlpha = a; g.strokeStyle = cor; g.lineWidth = lw * esc; g.beginPath(); let on = false
        for (let i = J.iniV; i <= ult; i++) { const v = arr[i]; if (v == null) { on = false; continue } const y = Y(v), x0 = X(i) - w / 2, x1 = X(i) + w / 2; on ? g.lineTo(x0, y) : g.moveTo(x0, y); g.lineTo(x1, y); on = true }
        g.stroke(); g.globalAlpha = 1 }
      const enche = (arr, cor, a) => { if (!a) return; g.globalAlpha = a; g.fillStyle = cor; for (let i = J.iniV; i <= ult; i++) { const v = arr[i], e = D.entrada[i]; if (v == null) continue; g.fillRect(X(i) - w / 2, Math.min(Y(v), Y(e)), w + .5, Math.abs(Y(v) - Y(e))) } g.globalAlpha = 1 }
      if (vis.niveis) {
        // fill(nível, center_line, 98 %): os quatro empilham-se e escurecem perto do centro (um pouco mais forte para ler em vídeo)
        PERC.forEach(p => { enche(D.ganho[p], C.verde, .045 * vis.niveis); enche(D.perda[p], C.vermelho, .045 * vis.niveis) })
        PERC.forEach(p => { const al = 1 - TRANSP[p] / 100; degrau(D.ganho[p], rgba(C.verde, al), vis.niveis); degrau(D.perda[p], rgba(C.vermelho, al), vis.niveis) })
      }
      if (vis.motor) { g.globalAlpha = vis.motor; g.lineWidth = 2 * esc; g.setLineDash([6 * esc, 5 * esc])
        for (let i = Math.max(J.iniV + 1, 1); i <= ult; i++) { if (D.baixa[i] !== D.baixa[i - 1]) continue; g.strokeStyle = D.baixa[i] ? C.vermelho : C.verde; g.beginPath(); g.moveTo(X(i - 1), Y(D.st[i - 1])); g.lineTo(X(i), Y(D.st[i])); g.stroke() }
        g.setLineDash([]); g.globalAlpha = 1 }
      if (vis.centro) T.linha(D.entrada, C.cinza, vis.centro, 1.5)
      for (let i = J.iniV; i <= ult; i++) { const v = D.c[i]; T.vela(v, i, v.c >= v.o ? C.velaUp : C.velaDn) }
      if (vis.sinal) { g.globalAlpha = vis.sinal
        D.sinais.forEach(s => { if (s.i < J.iniV || s.i > ult) return; const v = D.c[s.i]
          s.compra ? T.balao(['BUY'], X(s.i), Y(v.l) + 6 * esc, C.verde, '#fff', true, 12) : T.balao(['SELL'], X(s.i), Y(v.h) - 6 * esc, C.vermelho, '#fff', false, 12) })
        g.globalAlpha = 1 }
      if (vis.plano && sg) { g.globalAlpha = vis.plano; const x1 = X(sg.i), x2 = Math.min(X(sg.i + CAIXA), T.largura - 250 * esc)
        let fimSL = false; const tpOk = [false, false, false]
        for (let i = sg.i + 1; i <= ult; i++) { const v = D.c[i]; if (!fimSL) sg.tp.forEach((t, k) => { if (sg.compra ? v.h >= t : v.l <= t) tpOk[k] = true }); if (sg.compra ? v.l <= sg.sl : v.h >= sg.sl) fimSL = true }
        const L = [['Entry', sg.entry, C.cinza, ''], ['SL · Drawdown 50th', sg.sl, C.vermelho, fimSL ? ' ✗' : ''], ['TP1 · Gain 50th', sg.tp[0], C.verde, tpOk[0] ? ' ✓' : ''], ['TP2 · Gain 75th', sg.tp[1], C.verde, tpOk[1] ? ' ✓' : ''], ['TP3 · Gain 100th', sg.tp[2], C.verde, tpOk[2] ? ' ✓' : '']]
        L.forEach(([t, p, cor, m]) => { if (p == null) return; const y = Y(p); g.strokeStyle = cor; g.lineWidth = 1.5 * esc; g.setLineDash([5 * esc, 4 * esc]); g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); g.setLineDash([]); T.etiqueta(`${t}: ${M.fmt(p)}${m}`, x2 + 2, y, cor, '#fff', 13) })
        g.globalAlpha = 1 }
      g.restore()
      // valores na escala de preços, como o TradingView mostra para cada plot
      if (vis.niveis) PERC.forEach(p => { const a = D.ganho[p][ult], b = D.perda[p][ult]; g.globalAlpha = vis.niveis; if (a != null) T.preco(a, rgba(C.verde, .85)); if (b != null) T.preco(b, rgba(C.vermelho, .85)); g.globalAlpha = 1 })
      if (vis.centro) { g.globalAlpha = vis.centro; T.preco(D.entrada[ult], C.cinza); g.globalAlpha = 1 }
      { const v = D.c[ult]; T.preco(v.c, v.c >= v.o ? C.velaUp : C.velaDn) }
      if (vis.motor) { g.globalAlpha = vis.motor; g.font = F(600, 15); g.fillStyle = 'rgba(19,23,34,.85)'; const t = lang === 'en' ? 'Internal SuperTrend (not drawn by the indicator)' : 'SuperTrend interno (o indicador não o desenha)', tw = g.measureText(t).width + 20 * esc
        g.fillRect(14 * esc, T.base - 44 * esc, tw, 30 * esc); g.fillStyle = '#E9C46A'; g.fillText(t, 24 * esc, T.base - 24 * esc); g.globalAlpha = 1 }
      g.font = F(600, 16); g.fillStyle = C.eixo; g.fillText(`${D.simbolo} · 15 · MTM Gold Killer - Alertas  HLCC4 -4 80 0 3 10 Disabled 75`, 14 * esc, T.topo + 40 * esc)
      T.rotulo(o.rotulo, vis.sinal || vis.plano || 0)
    }
    return { wrap, desenha, D }
  }

  G.MOTORES.goldkiller = { grafico, serie, camadas3d: ['centro', 'niveis', 'motor', 'sinal'], camadasLado: ['centro', 'niveis'] }
})(typeof window !== 'undefined' ? window : globalThis)
