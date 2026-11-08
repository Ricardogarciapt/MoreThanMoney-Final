// Golden Zone — o gráfico do scanner, como aparece no TradingView, para os vídeos.
// Fiel ao Pine da casa (docs/pine/golden-zone.pine, 08/11/2026): níveis psicológicos de 5 em 5 $ (linhas cinzentas);
// quando uma vela atravessa um nível a favor da tendência e fecha para lá da zona de ação, aparece o visto amarelo
// sobre a vela e a caixa amarela de 1 $ centrada no nível (compra em 4070: caixa 4069,50–4070,50, zona de ação
// 4070,50). Ainda não há plano. No FECHO DA VELA SEGUINTE surgem as linhas, com o preço escrito, a começar na vela
// do visto: Invalidação (−1,5 $ = 150 pontos, vermelha), Zona de ação (cinzenta), Saída 1 (+1,5 $) e Saída 2 (+3 $), a verde.
// A caixa e as linhas vão da vela do visto até à vela do fecho da ideia e ficam até ao visto seguinte.
// A bandeira branca aparece quando o preço toca a Saída 1 (ou a invalidação). Saída 2 ou invalidação fecham o plano.
// A entrada é do trader (ordem limite na zona, quando o preço recua); se o preço for à Saída 2 sem recuar, não houve
// trade (bandeira sem entrada). Cada visto novo apaga o anterior.
// Camadas extra só do vídeo: medias (EMA 50/200 da 1.ª confirmação), niveis (suporte/resistência do passado,
// a roxo), ordem (ordem limite a meio da zona + stop para lá da mecha mais extrema). Mercado sintético.
;(function (G) {
  const M = G.MB
  const C = { fundo: '#131722', grelha: 'rgba(42,46,57,.55)', eixo: '#787B86', velaUp: '#089981', velaDn: '#F23645',
    visto: '#F5D90A', caixa: 'rgba(245,217,10,.16)', caixaBorda: 'rgba(245,217,10,.75)', saida: '#4CAF50', zona: '#9598A1', inval: '#F23645',
    ema50: '#2962FF', ema200: '#FF9800', sr: 'rgba(156,39,176,.22)', srBorda: 'rgba(186,104,200,.8)', ordem: '#E9C46A', marca: '#D2A63C' }
  const AQUEC = 300, STEP = 5, HALF = 0.5, RISCO = 1.5, CX_W = 6

  // XAUUSD em M5 (ATR ≈ 1,6 $). O impulso (choque) é a vela do sinal; o resto decide o desfecho.
  const ROTEIROS = {
    compra:   [[AQUEC, .05], [40, 0, 1.1], [12, .02], [1, 0, .3, 1.6, 2.7], [5, -.38], [34, .26]],
    venda:    [[AQUEC, -.05], [40, 0, 1.1], [12, -.02], [1, 0, .3, 1.6, -2.7], [5, .38], [34, -.26]],
    falha:    [[AQUEC, .05], [40, 0, 1.1], [12, .02], [1, 0, .3, 1.6, 2.7], [26, .34], [16, -.05]],
    stop:     [[AQUEC, .05], [40, 0, 1.1], [12, .02], [1, 0, .3, 1.6, 2.7], [4, -.42], [10, -.3], [20, .2]],
  }
  const QUER = { compra: ['compra', 's2'], venda: ['venda', 's2'], falha: ['compra', 'sem'], stop: ['compra', 'sl'] }
  const meio = x => Math.round(x * 2) / 2
  const e50c = c => M.ema(c.map(x => x.c), 50), e200c = c => M.ema(c.map(x => x.c), 200)

  function calcula(c) {
    const N = c.length, e50 = e50c(c), e200 = e200c(c), sinais = []
    let ativo = null
    for (let i = 20; i < N; i++) {
      const v = c[i], prev = c[i - 1].c, up = e50[i] > e200[i]
      if (ativo && i > ativo.fim) ativo = null
      if (ativo) continue
      // a vela atravessa a zona inteira do nível psicológico e fecha para lá da zona de ação, a favor da tendência
      const lb = Math.floor(v.c / STEP) * STEP, la = Math.ceil(v.c / STEP) * STEP
      const compra = up && v.c > lb + HALF && prev < lb - HALF, venda = !up && v.c < la - HALF && prev > la + HALF
      if (!compra && !venda) continue
      const d = compra ? 1 : -1, nivel = compra ? lb : la, zona = meio(nivel + d * HALF)
      const s = { i, d, nivel, zona, ponta: zona - d * 2 * HALF, inval: zona - d * RISCO, s1: zona + d * RISCO, s2: zona + 2 * d * RISCO }
      // o plano aparece no fecho da vela seguinte (plano = i+1); o recuo à zona (fill) é a entrada do trader;
      // depois: Saída 1 → bandeira; Saída 2 ou invalidação fecham. Saída 2 sem recuo = sem trade.
      let fill = null, fim = null, res = 'aberto', s1Bar = null
      const plano = i + 1
      for (let j = plano; j < Math.min(N, i + 1 + 120); j++) { const x = c[j]
        if (fill == null && (d > 0 ? x.l <= zona : x.h >= zona)) fill = j
        if (s1Bar == null && (d > 0 ? x.h >= s.s1 : x.l <= s.s1)) s1Bar = j
        if (d > 0 ? x.h >= s.s2 : x.l <= s.s2) { fim = j; res = fill == null ? 'sem' : 's2'; break }
        if (d > 0 ? x.l <= s.inval : x.h >= s.inval) { fim = j; res = 'sl'; break } }
      Object.assign(s, { plano, fill, fim: fim ?? N, res, s1Bar, bandeira: s1Bar ?? (res === 'sl' ? fim : null) })
      sinais.push(s); ativo = s
    }
    return sinais
  }

  function serie(cenario = 'compra', seed = 7) {
    const [dir, res] = QUER[cenario] || QUER.compra
    let melhor = null
    for (let k = 0; k < 150; k++) {
      const c = M.velas(ROTEIROS[cenario] || ROTEIROS.compra, seed + k * 97, 3290, 1.6, 8 * 60 - AQUEC * 5)
      const sinais = calcula(c), alvo = AQUEC + 52
      const s0 = sinais.find(s => s.i >= alvo - 3 && s.i <= alvo + 3)
      if (!s0) continue
      const D = { c, sinais, s0 }
      const e50 = M.ema(c.map(x => x.c), 50), e200 = M.ema(c.map(x => x.c), 200), tend = cenario === 'compra' || cenario === 'venda' ? (e50[s0.i] > e200[s0.i]) === (s0.d > 0) : true
      const lado = M.pivo(c, 5, 5, s0.d < 0), comSR = cenario !== 'compra' || lado.some((p, i) => p != null && i < s0.i - 6 && i > s0.i - 160 && Math.abs(p - s0.zona) <= 1.2)
      if ((s0.d > 0) === (dir === 'compra') && s0.res === res && tend && comSR && !sinais.some(s => s.i > s0.i && s.i <= s0.fim + 6)) { melhor = D; break }
      melhor = melhor || D
    }
    const c = melhor.c, N = c.length, cl = c.map(x => x.c), s0 = melhor.s0
    const e50 = M.ema(cl, 50), e200 = M.ema(cl, 200)
    // suporte/resistência do passado junto da zona (pivot 5/5 nas últimas 160 velas)
    const piv = M.pivo(c, 5, 5, s0.d < 0), lado = s0.d > 0 ? M.pivo(c, 5, 5, false) : piv
    let sr = null
    for (let i = s0.i - 6; i > Math.max(0, s0.i - 160); i--) { const p = lado[i]; if (p != null && Math.abs(p - s0.zona) <= 1.2) { sr = { bar: i - 5, nivel: p }; break } }
    return { c, N, ini: AQUEC, sinais: melhor.sinais, e50, e200, sr, sig: s0.i, frac: .62, simbolo: 'XAUUSD' }
  }

  // camadas: sinal (visto + caixa + níveis psicológicos), plano (Saídas / Zona / Invalidação + bandeira), medias (EMA 50/200),
  // niveis (S/R do passado), ordem (ordem limite a meio da zona + stop na mecha). Sinónimos: setas→sinal, bandas→medias.
  function grafico(r, o, el) {
    const W = o.w || 1560, H = o.h || 780
    const wrap = el('div', 'carta3d cartao', null, { left: (o.left ?? (1920 - W) / 2) + 'px', top: (o.top || 200) + 'px', width: W + 'px', height: H + 'px', overflow: 'hidden', background: o.transparente ? 'transparent' : C.fundo })
    const cv = el('canvas'); cv.width = W; cv.height = H; wrap.append(cv); r.append(wrap)
    const g = cv.getContext('2d'), D = serie(o.cenario || 'compra', o.seed || 7), esc = Math.max(.62, Math.min(1, W / 1560))
    const CT = o.transparente ? { ...C, fundo: 'rgba(19,23,34,.45)' } : C
    const en = (G.LANG || 'pt') === 'en'
    const TXT = en ? { s2: 'Exit 2', s1: 'Exit 1', zona: 'Zone of action', inval: 'Invalidation zone', ordem: 'Limit order · middle of the zone', stop: 'Stop beyond the most extreme wick', fill: 'Filled', sr: 'Past support', rs: 'Past resistance' }
      : { s2: 'Saída 2', s1: 'Saída 1', zona: 'Zona de ação', inval: 'Invalidação', ordem: 'Ordem limite · meio da zona', stop: 'Stop para lá da mecha mais extrema', fill: 'Preenchida', sr: 'Suporte do passado', rs: 'Resistência do passado' }
    function desenha(vis0, ate, zoom) {
      const vis = { ...(vis0 || {}) }; if (vis.setas) vis.sinal = Math.max(vis.sinal || 0, vis.setas); if (vis.bandas) vis.medias = Math.max(vis.medias || 0, vis.bandas)
      if (vis.ordem) vis.plano = Math.max(vis.plano || 0, vis.ordem)
      const J = M.janela(D, ate, zoom), ult = J.ult
      // cada sinal novo apaga o anterior: só o último até «ult»
      const s = [...D.sinais].reverse().find(x => x.i <= ult && x.i >= J.iniV)
      const temPlano = s && ult >= s.plano
      let hi = -Infinity, lo = Infinity; for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.c[i].h); lo = Math.min(lo, D.c[i].l) }
      if ((vis.plano || vis.sinal) && s) [s.nivel + HALF, s.nivel - HALF, ...(temPlano && vis.plano ? [s.inval, s.s2] : [])].forEach(x => { hi = Math.max(hi, x); lo = Math.min(lo, x) })
      const T = M.tela(g, W, H, esc, J, hi + .6, lo - .6, CT, 26), { X, Y, F } = T
      T.horas(D); T.clip()
      // níveis psicológicos de 5 em 5 $ (sempre que a camada do sinal ou do plano está ligada)
      if (vis.sinal || vis.plano) { g.globalAlpha = Math.max(vis.sinal || 0, vis.plano || 0) * .7; g.strokeStyle = C.zona; g.lineWidth = 1 * esc
        for (let p = Math.ceil((lo - .6) / STEP) * STEP; p <= hi + .6; p += STEP) { g.beginPath(); g.moveTo(0, Y(p)); g.lineTo(T.largura, Y(p)); g.stroke() }
        g.globalAlpha = 1 }
      if (vis.niveis && D.sr && s && s.i === D.sig && D.sr.bar >= J.iniV - 40) { g.globalAlpha = vis.niveis; const x0 = Math.max(0, X(D.sr.bar)), x1 = X(s.i + CX_W), y0 = Y(D.sr.nivel + .6), y1 = Y(D.sr.nivel - .6)
        g.fillStyle = C.sr; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = C.srBorda; g.lineWidth = 1.2 * esc; g.strokeRect(x0, y0, x1 - x0, y1 - y0)
        g.font = F(600, 13); g.fillStyle = C.srBorda; g.fillText(s.d > 0 ? TXT.sr : TXT.rs, x0 + 8 * esc, y0 - 6 * esc); g.globalAlpha = 1 }
      if (vis.medias) { T.linha(D.e50, C.ema50, vis.medias, 2); T.linha(D.e200, C.ema200, vis.medias, 2.5) }
      for (let i = J.iniV; i <= ult; i++) { const v = D.c[i]; T.vela(v, i, v.c >= v.o ? C.velaUp : C.velaDn) }
      if (s && vis.sinal) { g.globalAlpha = vis.sinal; const v = D.c[s.i]
        const x0 = X(s.i) - T.bw, x1 = X(Math.min(ult, s.fim)) + T.bw, y0 = Y(s.nivel + HALF), y1 = Y(s.nivel - HALF)
        g.fillStyle = C.caixa; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = C.caixaBorda; g.lineWidth = 1.2 * esc; g.strokeRect(x0, y0, x1 - x0, y1 - y0)
        g.font = F(800, 30); g.fillStyle = C.visto; g.textAlign = 'center'; g.fillText('✓', X(s.i), s.d > 0 ? Y(v.h + RISCO) : Y(v.l - RISCO) + 24 * esc); g.textAlign = 'left'; g.globalAlpha = 1 }
      if (temPlano && vis.plano) { g.globalAlpha = vis.plano; const x0 = X(s.i), xr = s.fim <= ult ? X(s.fim) + T.bw : T.largura - 8 * esc
        ;[[TXT.s2, s.s2, C.saida], [TXT.s1, s.s1, C.saida], [TXT.zona, s.zona, C.zona], [TXT.inval, s.inval, C.inval]].forEach(([t, p, cor]) => {
          const y = Y(p); g.strokeStyle = cor; g.lineWidth = 1.3 * esc; g.beginPath(); g.moveTo(x0, y); g.lineTo(xr, y); g.stroke()
          g.font = F(600, 14); g.fillStyle = cor; g.textAlign = 'right'; g.fillText(`${t}: ${p.toFixed(3)}`, Math.max(x0 + 230 * esc, xr - 150 * esc), y - 6 * esc); g.textAlign = 'left' })
        // bandeira branca: o preço tocou a Saída 1 (ou a invalidação)
        if (s.bandeira != null && s.bandeira <= ult) { const v = D.c[s.bandeira], x = X(s.bandeira), y = (s.d > 0 ? Y(v.h) - 40 * esc : Y(v.l) + 12 * esc)
          g.strokeStyle = '#fff'; g.lineWidth = 2 * esc; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 28 * esc); g.stroke()
          g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18 * esc, y + 3 * esc); g.lineTo(x + 15 * esc, y + 8 * esc); g.lineTo(x + 18 * esc, y + 13 * esc); g.lineTo(x, y + 13 * esc); g.closePath(); g.fill() }
        g.globalAlpha = 1 }
      if (temPlano && vis.ordem) { g.globalAlpha = vis.ordem; const m = s.nivel, x0 = X(s.i + 1), x1 = X(s.i + CX_W + 10)
        g.strokeStyle = C.ordem; g.lineWidth = 2.2 * esc; g.setLineDash([8 * esc, 5 * esc]); g.beginPath(); g.moveTo(x0, Y(m)); g.lineTo(x1, Y(m)); g.stroke(); g.setLineDash([])
        T.etiqueta(TXT.ordem, x1 + 2, Y(m), C.ordem, '#131722', 13)
        // stop para lá da mecha mais extrema das velas anteriores (8 velas até ao sinal)
        let ex = s.d > 0 ? Infinity : -Infinity; for (let i = s.i - 4; i <= s.i + 1; i++) ex = s.d > 0 ? Math.min(ex, D.c[i].l) : Math.max(ex, D.c[i].h)
        const st = Math.min(s.inval, ex) * (s.d > 0 ? 1 : 0) + Math.max(s.inval, ex) * (s.d > 0 ? 0 : 1) - s.d * .3
        g.strokeStyle = C.inval; g.setLineDash([4 * esc, 4 * esc]); g.beginPath(); g.moveTo(X(s.i - 4), Y(st)); g.lineTo(x1, Y(st)); g.stroke(); g.setLineDash([])
        T.etiqueta(TXT.stop, x1 + 2, Y(st), C.inval, '#fff', 13)
        if (s.fill != null && s.fill <= ult) { g.fillStyle = C.ordem; g.beginPath(); g.arc(X(s.fill), Y(m), 6 * esc, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5 * esc; g.stroke()
          g.font = F(700, 13); g.fillStyle = C.ordem; g.textAlign = 'center'; g.fillText(TXT.fill, X(s.fill), Y(m) + s.d * 24 * esc); g.textAlign = 'left' }
        g.globalAlpha = 1 }
      g.restore()
      { const v = D.c[ult]; T.preco(v.c, v.c >= v.o ? C.velaUp : C.velaDn) }
      g.font = F(600, 16); g.fillStyle = C.eixo; g.fillText(`${D.simbolo} · 5 · Golden Zone by MTM`, 14 * esc, T.topo + 72 * esc)
      T.rotulo(o.rotulo, vis.sinal || vis.plano || 0)
    }
    return { wrap, desenha, D }
  }

  G.MOTORES['golden-zone'] = { grafico, serie, calcula, camadas3d: ['medias', 'sinal'], camadasLado: ['medias', 'niveis'] }
})(typeof window !== 'undefined' ? window : globalThis)
