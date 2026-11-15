// MTM Premium Scanner — o gráfico do indicador, como aparece no TradingView, para os vídeos.
// Segue docs/pine/mtm-premium-scanner.pine: sessões UTC (Londres 07–11, NY 13–16, Ásia 00–06) com o fundo de cada uma,
// voto de 5 (abertura da sessão, 1 h, 4 h, EMA200, EMA9) em «Maioria», pausa de 2 velas, máx. 6 sinais por sessão,
// etiquetas BUY/SELL no fecho da vela e o desenho do último sinal: zona dourada de 5 $ a 4 $ contra o preço, SL 5 $ para
// lá da zona, TP1/TP2/TP3/TP4 a 5/10/15/20 $ da borda, saídas 50/25/25 % e SL na entrada depois do TP1.
// A camada «setas» marca a execução (ordem preenchida, alvos, saída na entrada, stop), que o indicador não desenha.
// Mercado sintético (ilustrativo), XAUUSD em 15 minutos.
;(function (G) {
  const M = G.MB
  const C = { fundo: '#0B0D12', grelha: 'rgba(42,46,57,.35)', eixo: '#787B86', bull: '#2F80ED', bear: '#E5484D', compra: '#4CAF50', venda: '#F23645',
    entry: '#D2A63C', tp: '#12B886', sl: '#D6401F', ldn: 'rgba(210,166,60,.08)', ny: 'rgba(233,196,106,.06)', asia: 'rgba(128,128,128,.06)' }
  const P = { lenCurto: 4, lenLongo: 16, pausa: 2, maxSess: 6, recuo: 4, largZ: 5, distSL: 5, tp: [5, 10, 15, 20], pct: [50, 25, 25], caixaW: 20 }
  const AQUEC = 240, INI_MIN = 5 * 60   // a parte visível começa às 05:00 UTC (antes de Londres)
  const SESS = [['LDN', 7 * 60, 11 * 60], ['NY', 13 * 60, 16 * 60], ['ASIA', 0, 6 * 60]]
  const sessao = t => { const m = ((t % 1440) + 1440) % 1440; const s = SESS.find(([, a, b]) => m >= a && m < b); return s ? s[0] : '' }

  const lento = (i) => Math.sin(i / 13) * .25 + Math.sin(i / 37) * .15
  const ROTEIROS = {
    compra:    [[AQUEC, lento], [8, .05], [8, .45], [3, -.55, .5], [4, .7], [6, -.6], [12, .2], [40, (i) => Math.sin(i / 6) * .4]],
    tendencia: [[AQUEC, lento], [8, .6], [4, -.2], [12, (i) => .45 + Math.sin(i / 2.5) * .6], [3, -.3], [16, .55], [40, (i) => .2 + Math.sin(i / 5) * .5]],
    venda:     [[AQUEC, lento], [8, -.05], [8, -.45], [3, .55, .5], [10, -.55], [12, -.1], [40, (i) => Math.sin(i / 6) * .4]],
    falha:     [[AQUEC, lento], [8, -.05], [8, -.4], [3, .5, .5], [3, -.2], [8, .7], [40, (i) => Math.sin(i / 6) * .4]],
  }
  const QUER = { compra: [1, 'tp1be'], tendencia: [1, 'tp3'], venda: [-1, 'tp'], falha: [-1, 'sl'] }

  function calcula(c) {
    const N = c.length, cl = c.map(x => x.c), e200 = M.ema(cl, 200), e9 = M.ema(cl, 9), sinais = [], sess = c.map(x => sessao(x.t))
    let abSess = null, nSess = 0, ultimo = -1000
    for (let i = 0; i < N; i++) {
      const s = sess[i]; if (s && (i === 0 || sess[i - 1] !== s)) { abSess = c[i].o; nSess = 0 }
      if (!s || abSess == null || i < P.lenLongo) continue
      const voto = (cl[i] > abSess ? 1 : -1) + (cl[i] > cl[i - P.lenCurto] ? 1 : -1) + (cl[i] > cl[i - P.lenLongo] ? 1 : -1) + (cl[i] > e200[i] ? 1 : -1) + (cl[i] > e9[i] ? 1 : -1)
      if (nSess < P.maxSess && i - ultimo >= P.pausa) { nSess++; ultimo = i
        const d = voto > 0 ? 1 : -1, meio = cl[i] - d * P.recuo, zPerto = meio + d * P.largZ / 2, zLonge = meio - d * P.largZ / 2
        sinais.push({ i, d, voto, sess: s, meio, zPerto, zLonge, sl: zLonge - d * P.distSL, tps: P.tp.map(x => zPerto + d * x) }) }
    }
    return { sinais, sess, e200, e9 }
  }

  // execução (não é do indicador): ordem limite no meio da zona durante as 20 velas do desenho; depois SL, TPs e SL na entrada após o TP1
  function executa(c, s) {
    const ev = []; let fill = -1
    for (let j = s.i + 1; j <= Math.min(c.length - 1, s.i + P.caixaW); j++) if (s.d > 0 ? c[j].l <= s.meio : c[j].h >= s.meio) { fill = j; break }
    if (fill < 0) return { ev, res: 'nofill' }
    ev.push({ j: fill, t: 'fill', p: s.meio }); let stop = s.sl, k = 0
    for (let j = fill; j < c.length; j++) { const v = c[j]
      if (j > fill || k === 0) { if (s.d > 0 ? v.l <= stop : v.h >= stop) { ev.push({ j, t: k ? 'be' : 'sl', p: stop }); return { ev, res: k ? (k === 1 ? 'tp1be' : 'tp' + k) : 'sl' } } }
      while (k < 4 && (s.d > 0 ? v.h >= s.tps[k] : v.l <= s.tps[k])) { ev.push({ j, t: 'tp' + (k + 1), p: s.tps[k] }); k++; if (k === 1) stop = s.meio }
      if (k === 4) return { ev, res: 'tp4' } }
    return { ev, res: k ? 'tp' + k : 'aberta' }
  }

  function serie(cenario = 'compra', seed = 7) {
    const R = ROTEIROS[cenario] ? cenario : 'compra', [dq, rq] = QUER[R]
    const ok = r => rq === 'tp' ? /^tp/.test(r) : rq === 'tp3' ? (r === 'tp3' || r === 'tp4') : r === rq
    let best = null
    for (let k = 0; k < 40 && !best; k++) {   // procura, de forma determinística, uma seed em que o sinal da sessão de Londres tem o desfecho do cenário
      const c = M.velas(ROTEIROS[R], seed + k * 101, 4050, 3, INI_MIN - AQUEC * 15, 15), K = calcula(c)
      const s = K.sinais.find(s => s.i >= AQUEC + 8 && s.sess === 'LDN' && s.d === dq && (e => ok(e.res) && e.ev[0].j - s.i <= 6)(executa(c, s)))
      if (s) best = { c, K, s }
      if (k === 39) { const s2 = K.sinais.find(s => s.i >= AQUEC + 8 && s.d === dq) || K.sinais[K.sinais.length - 1]; best = { c, K, s: s2 } }
    }
    const { c, K, s } = best
    return { c, N: c.length, ini: AQUEC, ...K, s0: s, exec: executa(c, s), sig: s.i, frac: cenario === 'tendencia' ? .45 : .62 }
  }

  // camadas: cores (fundo das sessões + velas), sinal (BUY/SELL), plano (zona, SL e TPs do último sinal), setas (execução)
  function grafico(r, o, el) {
    const W = o.w || 1560, H = o.h || 780
    const wrap = el('div', 'carta3d cartao', null, { left: (o.left ?? (1920 - W) / 2) + 'px', top: (o.top || 200) + 'px', width: W + 'px', height: H + 'px', overflow: 'hidden', background: o.transparente ? 'transparent' : C.fundo })
    const cv = el('canvas'); cv.width = W; cv.height = H; wrap.append(cv); r.append(wrap)
    const g = cv.getContext('2d'), D = serie(o.cenario || 'compra', o.seed || 7), esc = Math.max(.62, Math.min(1, W / 1560))
    const lang = G.LANG || 'pt'
    const en = lang === 'en', CT = o.transparente ? { ...C, fundo: 'rgba(11,13,18,.45)' } : C
    function desenha(vis0, ate, zoom) {
      const vis = { ...(vis0 || {}) }, J = M.janela(D, ate, zoom), ult = J.ult, sg = D.s0.i <= ult ? D.s0 : null
      let hi = -Infinity, lo = Infinity; for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.c[i].h); lo = Math.min(lo, D.c[i].l) }
      if (vis.plano && sg) { hi = Math.max(hi, sg.sl, ...sg.tps); lo = Math.min(lo, sg.sl, ...sg.tps) }
      if (vis.sinal) { const pd = (hi - lo) * .07; hi += pd; lo -= pd }
      const T = M.tela(g, W, H, esc, J, hi, lo, CT, 14), { X, Y, F } = T, bwc = T.largura / T.nb
      // fundo das sessões (bgcolor do Pine), só até à vela visível
      g.save(); g.beginPath(); g.rect(0, 0, T.largura, T.base); g.clip()
      for (let i = J.iniV; i <= ult; i++) { const s = D.sess[i]; if (!s) continue; g.fillStyle = s === 'LDN' ? C.ldn : s === 'NY' ? C.ny : C.asia; g.fillRect(X(i) - bwc / 2, 0, bwc + .5, T.base) }
      g.restore()
      T.horas(D); T.clip()
      for (let i = J.iniV; i <= ult; i++) { const v = D.c[i]; T.vela(v, i, v.c >= v.o ? C.bull : C.bear) }
      if (vis.sinal) { g.globalAlpha = vis.sinal
        D.sinais.filter(s => s.i >= J.iniV && s.i <= ult).forEach(s => { const v = D.c[s.i], up = s.d > 0
          T.balao([up ? 'BUY' : 'SELL'], X(s.i), up ? Y(v.l) + 4 * esc : Y(v.h) - 4 * esc, up ? C.compra : C.venda, '#fff', up, 10) })
        g.globalAlpha = 1 }
      if (vis.plano && sg) { const a = vis.plano; g.globalAlpha = a
        const x1 = X(sg.i), x2 = Math.min(X(sg.i + P.caixaW), T.largura - 360 * esc), tpUlt = sg.tps[3], zA = Math.max(sg.zPerto, sg.zLonge), zB = Math.min(sg.zPerto, sg.zLonge)
        const caixa = (p1, p2, cor, borda) => { g.fillStyle = cor; g.fillRect(x1, Y(Math.max(p1, p2)), x2 - x1, Math.abs(Y(p1) - Y(p2))); if (borda) { g.strokeStyle = borda; g.lineWidth = 1; g.strokeRect(x1, Y(Math.max(p1, p2)), x2 - x1, Math.abs(Y(p1) - Y(p2))) } }
        caixa(sg.meio, tpUlt, 'rgba(18,184,134,.12)'); caixa(sg.meio, sg.sl, 'rgba(214,64,31,.12)'); caixa(zA, zB, 'rgba(210,166,60,.20)', 'rgba(210,166,60,.6)')
        const f = x => M.fmt(x, 2), nomeD = sg.d > 0 ? (en ? 'BUY' : 'COMPRA') : (en ? 'SELL' : 'VENDA')
        const niveis = [[sg.meio, `${nomeD} · ${en ? 'Zone' : 'Zona'}: ${f(zB)} – ${f(zA)} · ${en ? 'Entry' : 'Entrada'}: ${f(sg.meio)}`, C.entry],
          [sg.tps[0], `TP1: ${f(sg.tps[0])} · ${P.pct[0]}% → ${en ? 'SL to entry' : 'SL na entrada'}`, C.tp], [sg.tps[1], `TP2: ${f(sg.tps[1])} · ${P.pct[1]}%`, C.tp],
          [sg.tps[2], `TP3: ${f(sg.tps[2])} · ${P.pct[2]}%`, C.tp], [sg.tps[3], `TP4: ${f(sg.tps[3])} · ${en ? 'let it run' : 'deixar correr'}`, C.tp], [sg.sl, `SL: ${f(sg.sl)}`, C.sl]]
        // etiquetas: no Pine sobrepõem-se quando os níveis estão perto; aqui afastam-se o mínimo para se lerem
        const lh = 24 * esc, ys = niveis.map(n => Y(n[0])), ord = ys.map((y, q) => q).sort((p, q) => ys[p] - ys[q]), yl = [...ys]
        for (let q = 1; q < ord.length; q++) if (yl[ord[q]] - yl[ord[q - 1]] < lh) yl[ord[q]] = yl[ord[q - 1]] + lh
        niveis.forEach(([p, txt, cor], q) => { const y = Y(p); g.strokeStyle = cor; g.lineWidth = 1.2 * esc; g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); T.etiqueta(txt, x2 + 4 * esc, yl[q], cor, '#fff', 13) })
        g.globalAlpha = 1 }
      if (vis.setas && sg) { g.globalAlpha = vis.setas
        D.exec.ev.filter(e => e.j <= ult).forEach(e => { const x = X(e.j), y = Y(e.p)
          if (e.t === 'fill') { g.strokeStyle = C.entry; g.lineWidth = 2.5 * esc; g.beginPath(); g.arc(x, y, 9 * esc, 0, 7); g.stroke(); T.etiqueta(en ? 'Filled' : 'Preenchida', x + 12 * esc, y + (sg.d > 0 ? 22 : -22) * esc, C.entry, '#111', 12); return }
          const okk = /^tp/.test(e.t), cor = okk ? C.tp : e.t === 'be' ? C.entry : C.sl
          g.fillStyle = cor; g.beginPath(); g.arc(x, y, 6 * esc, 0, 7); g.fill()
          const txt = okk ? `${e.t.toUpperCase()} ✓` : e.t === 'be' ? (en ? 'Exit at entry' : 'Saída na entrada') : 'SL ✗'
          const longe = e.j >= sg.i + P.caixaW - 3 ? 2.2 : 1   // perto das etiquetas do plano, sobe/desce mais
          T.etiqueta(txt, x + 9 * esc, y + (okk === (sg.d > 0) ? -20 : 20) * longe * esc, cor, '#fff', 12) })
        g.globalAlpha = 1 }
      g.restore()
      { const v = D.c[ult]; T.preco(v.c, v.c >= v.o ? C.bull : C.bear) }
      g.font = F(600, 15); g.fillStyle = C.eixo; g.fillText(`XAUUSD · 15 · MTM Premium Scanner  ${en ? 'Majority' : 'Maioria'} 2 6 4 5 5`, 14 * esc, T.topo + 26 * esc)
      T.rotulo(o.rotulo, vis.sinal || vis.plano || 0)
    }
    return { wrap, desenha, D }
  }

  G.MOTORES['premium-scanner'] = { grafico, serie, camadas3d: ['cores', 'plano', 'setas', 'sinal'], camadasLado: ['cores', 'plano'] }
})(typeof window !== 'undefined' ? window : globalThis)
