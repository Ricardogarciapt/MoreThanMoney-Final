// Aurum Flow — o gráfico do indicador, como aparece no TradingView, para os vídeos.
// Segue docs/pine/mtm-aurum-flow-orb-v2.pine (ORB v2.1, modo Perp): caixas de abertura das sessões (Pre London 06–07,
// London 07–08, NYFX 12:30–13:30, GMT+1) trancadas no fim da janela e estendidas 60 velas, com a etiqueta
// «sessão · Range · High · Low»; DEMA 15/50/238, EMA200 do 4h (regime), rompimento no fecho com RSI ≥ 55 (≤ 45 na venda),
// tecto da vela 2,5 ATR, ATR% 0,05–5, piso de custo (stop ≥ 9 × 0,11 %), SL na aresta oposta + 0,25 ATR (cap 3,5 %),
// alvos 3/6/10/16 R e o painel AURUM ORB. A camada «setas» marca a execução (TP1 → stop na entrada, alvos, stop),
// que o indicador não desenha. A caixa «a formar-se» (tracejada) também é só do vídeo: o Pine desenha-a no fecho da janela.
// Mercado sintético (ilustrativo), BTCUSDT.P em 15 minutos.
;(function (G) {
  const M = G.MB
  const C = { fundo: '#0B0D12', grelha: 'rgba(42,46,57,.35)', eixo: '#787B86', bull: '#2F9E8F', bear: '#C0262D', d15: '#2962FF', d50: '#4CAF50', d238: '#FFCE2B', htf: '#FF9800',
    compra: '#4CAF50', venda: '#F23645', entry: '#2962FF', sl: '#F23645', tp: '#4CAF50' }
  const SESS = [['PRE LONDON', 600, 700, '#FF9800'], ['LONDON', 700, 800, '#9C27B0'], ['NYFX', 1230, 1330, '#2962FF']]
  const P = { rsiLevel: 55, maxBarAtr: 2.5, minAtrPct: .05, maxAtrPct: 5, feeMin: .055 * 2 * 9, slBufAtr: .25, slMaxPct: 3.5, rr: [3, 6, 10, 16], extend: 60, valid: 360, conta: 1000, risco: 1, maxLev: 25 }
  const AQUEC = 340
  const INI = { tendencia: 90 }   // minuto (GMT+1) da primeira vela visível; na tendência a caixa de Londres forma-se no ecrã
  const hhmm4 = t => { const m = ((t % 1440) + 1440) % 1440; return Math.floor(m / 60) * 100 + m % 60 }

  const lento = (i) => Math.sin(i / 17) * .2 + Math.sin(i / 41) * .12
  const caixa = (i) => Math.sin(i * 1.7) * 1.1
  // até às 06:00 sossegado, Pre London e London a oscilar (as caixas), rompimento às 08:30 e o resto conforme o cenário
  const base = (ini, d) => [[AQUEC, (i) => lento(i) + .04 * d], [(360 - ini) / 15, .02 * d, .6], [4, caixa, .8], [4, caixa, .8], [2, .25 * d], [1, 1.4 * d]]
  const ROTEIROS = {
    compra:    ini => [...base(ini, 1), [10, .5], [5, -.25], [24, .55], [40, (i) => Math.sin(i / 6) * .35]],
    tendencia: ini => [...base(ini, 1), [8, .35], [4, -.1], [30, -.55], [40, (i) => -.15 + Math.sin(i / 6) * .35]],
    venda:     ini => [...base(ini, -1), [10, -.5], [5, .25], [24, -.55], [40, (i) => Math.sin(i / 6) * .35]],
    falha:     ini => [...base(ini, 1), [2, .15], [3, -.5], [8, -.55], [40, (i) => Math.sin(i / 6) * .35]],
  }
  const QUER = { compra: [1, 'tp'], tendencia: [1, 'qualquer'], venda: [-1, 'tp'], falha: [1, 'sl'] }

  function calcula(c) {
    const N = c.length, cl = c.map(x => x.c), a = M.atr(c, 14), rsi = M.rsi(cl, 14)
    const dema = n => { const e1 = M.ema(cl, n), e2 = M.ema(e1, n); return e1.map((x, i) => 2 * x - e2[i]) }
    const d15 = dema(15), d50 = dema(50), d238 = dema(238)
    // EMA200 do 4h: fecho de cada bloco de 16 velas, EMA 200 nesses fechos, mantida em degrau (request.security sem lookahead)
    // (a EMA200 do 4h leva meses a formar-se: começa 0,5 % abaixo/acima do preço no início da parte visível, do lado da tendência que vem de trás, para não ficar presa no início sintético)
    const htf = new Array(N), k4 = 2 / 201; let e = 0; for (let i = AQUEC - 100; i < AQUEC; i++) e += cl[i] / 100
    e = cl[AQUEC - 1] * (cl[AQUEC - 1] >= e ? 1 - .005 : 1 + .005)   // perto do preço, do lado da tendência que vem de trás
    for (let i = 0; i < N; i++) { if (i >= AQUEC && (c[i].t + 15) % 240 === 0) e = e + k4 * (cl[i] - e); htf[i] = e }
    const r = SESS.map(() => ({ hi: null, lo: null, b0: null, lock: false, lockBar: null, was: false, fL: false, fS: false })), caixas = [], sinais = []
    for (let i = 1; i < N; i++) {
      const cur = hhmm4(c[i].t), atrPct = a[i] / cl[i] * 100, volOk = atrPct >= P.minAtrPct && atrPct <= P.maxAtrPct, barOk = (c[i].h - c[i].l) / a[i] <= P.maxBarAtr
      const preB = cl[i] > htf[i] && rsi[i] >= P.rsiLevel && volOk && barOk, preS = cl[i] < htf[i] && rsi[i] <= 100 - P.rsiLevel && volOk && barOk
      const buf = a[i] * P.slBufAtr, cap = cl[i] * P.slMaxPct / 100, dist = d => Math.min(d, cap), feeOk = d => d / cl[i] * 100 >= P.feeMin
      SESS.forEach(([nm, A, B, cor], q) => { const s = r[q], inW = cur >= A && cur < B
        if (inW && !s.was) Object.assign(s, { hi: c[i].h, lo: c[i].l, b0: i, lock: false, fL: false, fS: false, cx: { nm, cor, b0: i, ini: i } })
        else if (inW) { s.hi = Math.max(s.hi, c[i].h); s.lo = Math.min(s.lo, c[i].l) }
        if (s.cx && inW) { s.cx.hiF = s.cx.hiF || []; s.cx.hiF[i] = [s.hi, s.lo] }
        if (s.was && !inW && !s.lock) { s.lock = true; s.lockBar = i; Object.assign(s.cx, { hi: s.hi, lo: s.lo, lockBar: i, fim: i + P.extend }); caixas.push(s.cx) }
        if (s.lock && i - s.lockBar <= P.valid) {
          if (!s.fL && cl[i] > s.hi && cl[i - 1] <= s.hi && preB && feeOk(dist(cl[i] - s.lo + buf))) { s.fL = true; sinais.push({ i, d: 1, sess: nm, d0: dist(cl[i] - s.lo + buf), cx: s.cx }) }
          if (!s.fS && cl[i] < s.lo && cl[i - 1] >= s.lo && preS && feeOk(dist(s.hi - cl[i] + buf))) { s.fS = true; sinais.push({ i, d: -1, sess: nm, d0: dist(s.hi - cl[i] + buf), cx: s.cx }) } }
        s.was = inW })
    }
    sinais.forEach(s => { const en = cl[s.i]; Object.assign(s, { entry: en, sl: en - s.d * s.d0, tps: P.rr.map(x => en + s.d * s.d0 * x), slPct: s.d0 / en * 100 }) })
    return { a, rsi, d15, d50, d238, htf, caixas, sinais }
  }

  // execução (não é do indicador): entrada no fecho, stop, alvos em R e stop na entrada aos 3 R
  function executa(c, s) {
    const ev = []; let stop = s.sl, k = 0
    for (let j = s.i + 1; j < c.length; j++) { const v = c[j]
      if (s.d > 0 ? v.l <= stop : v.h >= stop) { ev.push({ j, t: k ? 'be' : 'sl', p: stop }); return { ev, res: k ? 'tp' + k : 'sl' } }
      while (k < 4 && (s.d > 0 ? v.h >= s.tps[k] : v.l <= s.tps[k])) { ev.push({ j, t: 'tp' + (k + 1), p: s.tps[k] }); k++; if (k === 1) stop = s.entry }
      if (k === 4) return { ev, res: 'tp4' } }
    return { ev, res: k ? 'tp' + k : 'aberta' }
  }

  function serie(cenario = 'compra', seed = 7) {
    const R = ROTEIROS[cenario] ? cenario : 'compra', [dq, rq] = QUER[R]
    const ok = r => rq === 'qualquer' || (rq === 'tp' ? /^tp/.test(r) : r === rq)
    let best = null
    for (let k = 0; k < 60 && !best; k++) {   // procura, de forma determinística, uma seed em que o rompimento de Londres tem o desfecho do cenário
      const ini = INI[R] ?? 240, c = M.velas(ROTEIROS[R](ini), seed + k * 97, 100000, 340, ini - AQUEC * 15, 15), K = calcula(c)
      const s = K.sinais.find(s => s.i >= AQUEC && s.sess === 'LONDON' && s.d === dq && ok(executa(c, s).res))
      if (s || k === 59) best = { c, K, s: s || K.sinais.find(s => s.i >= AQUEC) || K.sinais[K.sinais.length - 1] }
    }
    const { c, K, s } = best
    return { c, N: c.length, ini: AQUEC, ...K, s0: s, exec: s ? executa(c, s) : { ev: [] }, sig: s ? s.i : AQUEC + 30, frac: R === 'tendencia' && s ? Math.min(.9, (s.i - AQUEC) / 60) : .55 }
  }

  // camadas: cores (velas, DEMA, EMA200 4h e caixas das sessões), sinal (B/S), plano (linhas do último sinal + painel), setas (execução)
  function grafico(r, o, el) {
    const W = o.w || 1560, H = o.h || 780
    const wrap = el('div', 'carta3d cartao', null, { left: (o.left ?? (1920 - W) / 2) + 'px', top: (o.top || 200) + 'px', width: W + 'px', height: H + 'px', overflow: 'hidden', background: o.transparente ? 'transparent' : C.fundo })
    const cv = el('canvas'); cv.width = W; cv.height = H; wrap.append(cv); r.append(wrap)
    const g = cv.getContext('2d'), D = serie(o.cenario || 'compra', o.seed || 7), esc = Math.max(.62, Math.min(1, W / 1560))
    const en = (G.LANG || 'pt') === 'en', CT = o.transparente ? { ...C, fundo: 'rgba(11,13,18,.45)' } : C, f1 = x => M.fmt(x, 1)
    function desenha(vis0, ate, zoom) {
      const vis = { ...(vis0 || {}) }, J = M.janela(D, ate, zoom), ult = J.ult, sg = D.s0 && D.s0.i <= ult ? D.s0 : null
      let hi = -Infinity, lo = Infinity; for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.c[i].h); lo = Math.min(lo, D.c[i].l) }
      if (vis.cores) for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.htf[i]); lo = Math.min(lo, D.htf[i]) }
      if (vis.plano && sg) { const tv = sg.tps[D.exec.ev.some(e => e.t === 'tp1' && e.j <= ult) ? 1 : 0]; hi = Math.max(hi, sg.sl, tv); lo = Math.min(lo, sg.sl, tv) }   // os alvos seguintes ficam fora do ecrã até o preço lá chegar perto
      if (vis.cores) hi += (hi - lo) * .1
      const T = M.tela(g, W, H, esc, J, hi, lo, CT, 14), { X, Y, F } = T
      T.horas(D); T.clip()
      if (vis.cores) { const a = vis.cores
        D.caixas.forEach(cx => { if (cx.lockBar > ult || cx.b0 < J.iniV) return; const x1 = X(cx.b0) - T.bw / 2, x2 = X(Math.min(cx.fim, ult + 14))
          g.globalAlpha = a; g.fillStyle = cx.cor + '1A'; g.fillRect(x1, Y(cx.hi), x2 - x1, Y(cx.lo) - Y(cx.hi)); g.strokeStyle = cx.cor; g.lineWidth = 1; g.strokeRect(x1, Y(cx.hi), x2 - x1, Y(cx.lo) - Y(cx.hi)) })
        // caixa a formar-se (só no vídeo): contorno tracejado durante a janela
        D.caixas.concat([]).forEach(cx => { if (!(cx.ini <= ult && cx.lockBar > ult)) return; const fx = cx.hiF[Math.min(ult, cx.lockBar - 1)]; if (!fx) return
          g.globalAlpha = a; g.setLineDash([6 * esc, 5 * esc]); g.strokeStyle = cx.cor; g.lineWidth = 1.5 * esc; const x1 = X(cx.b0) - T.bw / 2, x2 = X(ult) + T.bw / 2; g.strokeRect(x1, Y(fx[0]), x2 - x1, Y(fx[1]) - Y(fx[0])); g.setLineDash([]) })
        T.linha(D.d238, C.d238, a, 2); T.linha(D.d50, C.d50, a, 1.2); T.linha(D.d15, C.d15, a, 1.2); T.linha(D.htf, C.htf, a, 2.4)
        g.globalAlpha = 1 }
      for (let i = J.iniV; i <= ult; i++) { const v = D.c[i]; T.vela(v, i, v.c >= v.o ? C.bull : C.bear) }
      if (vis.cores) { g.globalAlpha = vis.cores   // etiquetas das caixas (label.style_label_down no canto de cima)
        let xa = -1e9, sobe = 0
        D.caixas.forEach(cx => { if (cx.lockBar > ult || cx.b0 < J.iniV) return; const pts = Math.round((cx.hi - cx.lo) / .1), x = X(cx.b0)
          sobe = x - xa < 110 * esc ? sobe + 80 * esc : 0; xa = x   // no Pine as etiquetas de caixas seguidas tapam-se; aqui sobem para se lerem
          T.balao([cx.nm, `Range: ${pts}`, `High: ${f1(cx.hi)}`, `Low: ${f1(cx.lo)}`], x, Y(cx.hi) - 2 - sobe, cx.cor + 'CC', '#fff', false, 11) })
        g.globalAlpha = 1 }
      if (vis.sinal) { g.globalAlpha = vis.sinal
        D.sinais.filter(s => s.i >= J.iniV && s.i <= ult).forEach(s => { const v = D.c[s.i], up = s.d > 0; T.balao([up ? 'B' : 'S'], X(s.i), up ? Y(v.l) + 4 * esc : Y(v.h) - 4 * esc, up ? C.compra : C.venda, '#fff', up, 13) })
        g.globalAlpha = 1 }
      if (vis.plano && sg) { g.globalAlpha = vis.plano
        const x1 = X(sg.i), x2 = Math.min(X(ult + 6), T.largura - 680 * esc) /* as etiquetas acabam antes do painel */, risco = P.conta * P.risco / 100
        const notional = risco / (sg.slPct / 100), lev = Math.min(Math.max(1, notional / P.conta), P.maxLev), tam = `${M.fmt(lev, 1)}x · $${Math.round(notional)}`
        const niveis = [[sg.entry, `Entry: ${f1(sg.entry)} | ${en ? 'risk' : 'risco'} ${M.fmt(P.risco, 1)}% | ${tam}`, C.entry, 2], [sg.sl, `SL: ${f1(sg.sl)} | -$${Math.round(risco)}`, C.sl, 1],
          ...sg.tps.map((p, q) => [p, `TP${q + 1}: ${f1(p)} (${M.fmt(P.rr[q], 1)}R) | +$${Math.round(risco * P.rr[q])}`, C.tp, 1])]
        niveis.forEach(([p, txt, cor, w]) => { const y = Y(p); if (y < -20 || y > T.base + 20) return; g.strokeStyle = cor; g.lineWidth = w * esc; g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke(); T.etiqueta(txt, x2 + 2, y, cor, '#fff', 13) })
        g.globalAlpha = 1 }
      if (vis.setas && sg) { g.globalAlpha = vis.setas
        D.exec.ev.filter(e => e.j <= ult).forEach(e => { const x = X(e.j), y = Y(e.p), okk = /^tp/.test(e.t), cor = okk ? C.tp : e.t === 'be' ? '#D2A63C' : C.sl
          g.fillStyle = cor; g.beginPath(); g.arc(x, y, 6 * esc, 0, 7); g.fill()
          const txt = e.t === 'tp1' ? (en ? 'TP1 ✓ · stop to entry' : 'TP1 ✓ · stop na entrada') : okk ? `${e.t.toUpperCase()} ✓` : e.t === 'be' ? (en ? 'Exit at entry' : 'Saída na entrada') : 'SL ✗'
          T.etiqueta(txt, x + 9 * esc, y + (okk === (sg.d > 0) ? -20 : 20) * esc, cor, '#fff', 12) })
        g.globalAlpha = 1 }
      g.restore()
      { const v = D.c[ult]; T.preco(v.c, v.c >= v.o ? C.bull : C.bear) }
      if (vis.plano && sg) { const a = vis.plano, risco = P.conta * P.risco / 100, notional = risco / (sg.slPct / 100), lev = Math.min(Math.max(1, notional / P.conta), P.maxLev), atrPct = D.a[sg.i] / sg.entry * 100
        const linhas = [[`AURUM ORB · ${sg.d > 0 ? 'BUY' : 'SELL'}`, 'BTCUSDT.P', true], [en ? 'Source' : 'Fonte', `ORB ${sg.sess}`, '#FFEB3B'], ['ATR%', `${M.fmt(atrPct, 2)}%`, '#00E676'],
          ['SL dist.', `${M.fmt(sg.slPct, 2)}%`], [en ? 'Risk' : 'Risco', `$${Math.round(risco)}`], ['Notional', `$${Math.round(notional)}`], [en ? 'Useful lev.' : 'Alav. útil', `${M.fmt(lev, 1)}x`, '#FFEB3B', false, true]]
        const cw = [150 * esc, 130 * esc], lh = 24 * esc, x0 = T.largura - cw[0] - cw[1] - 10 * esc, y0 = T.base - lh * linhas.length - 10 * esc
        g.globalAlpha = a; g.font = F(600, 13)
        linhas.forEach(([k, v, cor, cab, ama], q) => { const y = y0 + q * lh; g.fillStyle = cab ? '#2962FF' : 'rgba(0,0,0,.85)'; g.fillRect(x0, y, cw[0] + cw[1], lh); g.strokeStyle = '#555'; g.strokeRect(x0, y, cw[0], lh); g.strokeRect(x0 + cw[0], y, cw[1], lh)
          g.fillStyle = ama ? '#FFEB3B' : '#fff'; g.fillText(k, x0 + 8 * esc, y + lh * .68); g.fillStyle = cor && !cab ? cor : '#fff'; g.fillText(v, x0 + cw[0] + 8 * esc, y + lh * .68) })
        g.globalAlpha = 1 }
      g.font = F(600, 15); g.fillStyle = C.eixo; g.fillText('BTCUSDT.P · 15 · MoreThanMoney - Aurum Flow · ORB v2.1', 14 * esc, T.topo + 26 * esc)
      T.rotulo(o.rotulo, vis.sinal || vis.plano || 0)
    }
    return { wrap, desenha, D }
  }

  G.MOTORES['aurum-flow'] = { grafico, serie, camadas3d: ['cores', 'plano', 'setas', 'sinal'], camadasLado: ['cores'] }
})(typeof window !== 'undefined' ? window : globalThis)
