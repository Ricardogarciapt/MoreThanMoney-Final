// Golden Zone — o gráfico do scanner, como aparece no TradingView, para os vídeos.
// Não há Pine: segue o guia golden-zone-guia.pdf e as capturas do scanner (vídeos golden-zone-video-1/2/3).
// O que o scanner desenha: visto amarelo na vela do sinal (por cima numa compra, por baixo numa venda) com a caixa
// amarela da zona de ação; no fecho da vela seguinte surgem as linhas Saída 2 / Saída 1 (verde), Zona de ação
// (cinzenta) e Invalidação (vermelha), com o preço escrito na linha; os níveis são de 0,5 em 0,5 $ e ficam a
// 1,5 $ uns dos outros (invalidação −1,5 · zona · Saída 1 +1,5 · Saída 2 +3). Quando o trade acaba (Saída 2, stop,
// ou o preço chega à Saída 2 sem voltar à zona) aparece a bandeira branca. Cada sinal novo apaga o anterior.
// Camadas extra só do vídeo: medias (EMA 50/200 da 1.ª confirmação), niveis (suporte/resistência do passado,
// a roxo), ordem (ordem limite a meio da zona + stop para lá da mecha mais extrema). Mercado sintético.
;(function (G) {
  const M = G.MB
  const C = { fundo: '#131722', grelha: 'rgba(42,46,57,.55)', eixo: '#787B86', velaUp: '#089981', velaDn: '#F23645',
    visto: '#F5D90A', caixa: 'rgba(245,217,10,.16)', caixaBorda: 'rgba(245,217,10,.75)', saida: '#4CAF50', zona: '#9598A1', inval: '#F23645',
    ema50: '#2962FF', ema200: '#FF9800', sr: 'rgba(156,39,176,.22)', srBorda: 'rgba(186,104,200,.8)', ordem: '#E9C46A', marca: '#D2A63C' }
  const AQUEC = 300, PASSO = 1.5, CX_W = 6, ESPERA = 24

  // XAUUSD em M5 (ATR ≈ 1,6 $). O impulso (choque) é a vela do sinal; o resto decide o desfecho.
  const ROTEIROS = {
    compra:   [[AQUEC, .05], [40, 0, 1.1], [12, .02], [1, 0, .3, 1.6, 2.7], [5, -.38], [34, .26]],
    venda:    [[AQUEC, -.05], [40, 0, 1.1], [12, -.02], [1, 0, .3, 1.6, -2.7], [5, .38], [34, -.26]],
    falha:    [[AQUEC, .05], [40, 0, 1.1], [12, .02], [1, 0, .3, 1.6, 2.7], [26, .34], [16, -.05]],
    stop:     [[AQUEC, .05], [40, 0, 1.1], [12, .02], [1, 0, .3, 1.6, 2.7], [4, -.42], [10, -.3], [20, .2]],
  }
  const QUER = { compra: ['compra', 's2'], venda: ['venda', 's2'], falha: ['compra', 'sem'], stop: ['compra', 'sl'] }
  const meio = x => Math.round(x * 2) / 2

  function calcula(c) {
    const N = c.length, a = M.atr(c, 14), hs = c.map(x => x.h), ls = c.map(x => x.l), sinais = []
    let ativo = null
    for (let i = 20; i < N; i++) {
      const v = c[i], corpo = Math.abs(v.c - v.o)
      if (ativo && i > ativo.fim) ativo = null
      if (ativo) continue
      const compra = v.c > v.o && corpo >= 1.2 * a[i] && v.c > M.highest(hs, i - 1, 12), venda = v.c < v.o && corpo >= 1.2 * a[i] && v.c < M.lowest(ls, i - 1, 12)
      if (!compra && !venda) continue
      const d = compra ? 1 : -1, zona = meio(v.c - d * PASSO), s = { i, d, zona, inval: zona - d * PASSO, s1: zona + d * PASSO, s2: zona + 2 * d * PASSO }
      // execução: a ordem limite está na zona a partir do fecho da vela seguinte
      let fill = null, fim = null, res = 'aberto'
      for (let j = i + 2; j < Math.min(N, i + 2 + 120); j++) { const x = c[j]
        if (fill == null) {
          if (d > 0 ? x.l <= zona : x.h >= zona) { fill = j; if (d > 0 ? x.l <= s.inval : x.h >= s.inval) { fim = j; res = 'sl'; break } continue }
          if (d > 0 ? x.h >= s.s2 : x.l <= s.s2) { fim = j; res = 'sem'; break }
          if (j > i + 1 + ESPERA) { fim = j; res = 'expirou'; break }
        } else {
          if (d > 0 ? x.l <= s.inval : x.h >= s.inval) { fim = j; res = 'sl'; break }
          if (d > 0 ? x.h >= s.s2 : x.l <= s.s2) { fim = j; res = 's2'; break }
        } }
      Object.assign(s, { fill, fim: fim ?? N, res, s1Bar: null })
      if (fill != null) for (let j = fill; j <= Math.min(N - 1, s.fim); j++) if (d > 0 ? c[j].h >= s.s1 : c[j].l <= s.s1) { s.s1Bar = j; break }
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

  // camadas: sinal (visto + caixa), plano (Saídas / Zona / Invalidação + bandeira), medias (EMA 50/200),
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
      const temPlano = s && ult >= s.i + 1
      let hi = -Infinity, lo = Infinity; for (let i = J.iniV; i <= ult; i++) { hi = Math.max(hi, D.c[i].h); lo = Math.min(lo, D.c[i].l) }
      if ((vis.plano || vis.sinal) && s) [s.zona + .5, s.zona - .6, ...(temPlano && vis.plano ? [s.inval, s.s2] : [])].forEach(x => { hi = Math.max(hi, x); lo = Math.min(lo, x) })
      const T = M.tela(g, W, H, esc, J, hi + .6, lo - .6, CT, 26), { X, Y, F } = T
      T.horas(D); T.clip()
      if (vis.niveis && D.sr && s && s.i === D.sig && D.sr.bar >= J.iniV - 40) { g.globalAlpha = vis.niveis; const x0 = Math.max(0, X(D.sr.bar)), x1 = X(s.i + CX_W), y0 = Y(D.sr.nivel + .6), y1 = Y(D.sr.nivel - .6)
        g.fillStyle = C.sr; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = C.srBorda; g.lineWidth = 1.2 * esc; g.strokeRect(x0, y0, x1 - x0, y1 - y0)
        g.font = F(600, 13); g.fillStyle = C.srBorda; g.fillText(s.d > 0 ? TXT.sr : TXT.rs, x0 + 8 * esc, y0 - 6 * esc); g.globalAlpha = 1 }
      if (vis.medias) { T.linha(D.e50, C.ema50, vis.medias, 2); T.linha(D.e200, C.ema200, vis.medias, 2.5) }
      for (let i = J.iniV; i <= ult; i++) { const v = D.c[i]; T.vela(v, i, v.c >= v.o ? C.velaUp : C.velaDn) }
      if (s && vis.sinal) { g.globalAlpha = vis.sinal; const v = D.c[s.i]
        const x0 = X(s.i) - T.bw, x1 = X(s.i + CX_W), y0 = Y(s.zona + .5), y1 = Y(s.zona - .6)
        g.fillStyle = C.caixa; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = C.caixaBorda; g.lineWidth = 1.2 * esc; g.strokeRect(x0, y0, x1 - x0, y1 - y0)
        g.font = F(800, 30); g.fillStyle = C.visto; g.textAlign = 'center'; g.fillText('✓', X(s.i), s.d > 0 ? Y(v.h) - 16 * esc : Y(v.l) + 40 * esc); g.textAlign = 'left'; g.globalAlpha = 1 }
      if (temPlano && vis.plano) { g.globalAlpha = vis.plano; const x0 = X(s.i + 1), xr = T.largura - 8 * esc
        ;[[TXT.s2, s.s2, C.saida], [TXT.s1, s.s1, C.saida], [TXT.zona, s.zona, C.zona], [TXT.inval, s.inval, C.inval]].forEach(([t, p, cor]) => {
          const y = Y(p); g.strokeStyle = cor; g.lineWidth = 1.3 * esc; g.beginPath(); g.moveTo(x0, y); g.lineTo(xr, y); g.stroke()
          g.font = F(600, 14); g.fillStyle = cor; g.textAlign = 'right'; g.fillText(`${t}: ${p.toFixed(3)}`, xr - 150 * esc, y - 6 * esc); g.textAlign = 'left' })
        // bandeira branca: o trade acabou (ganhou, perdeu, ou foi à Saída 2 sem voltar à zona)
        if (s.fim <= ult && s.res !== 'aberto') { const v = D.c[s.i], x = X(s.i) + 26 * esc, y = (s.d > 0 ? Y(v.h) - 52 * esc : Y(v.l) + 20 * esc)
          g.strokeStyle = '#fff'; g.lineWidth = 2 * esc; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 28 * esc); g.stroke()
          g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18 * esc, y + 3 * esc); g.lineTo(x + 15 * esc, y + 8 * esc); g.lineTo(x + 18 * esc, y + 13 * esc); g.lineTo(x, y + 13 * esc); g.closePath(); g.fill() }
        g.globalAlpha = 1 }
      if (temPlano && vis.ordem) { g.globalAlpha = vis.ordem; const m = s.zona - .05, x0 = X(s.i + 1), x1 = X(s.i + CX_W + 10)
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
      g.font = F(600, 16); g.fillStyle = C.eixo; g.fillText(`${D.simbolo} · 5 · Golden Zone`, 14 * esc, T.topo + 72 * esc)
      T.rotulo(o.rotulo, vis.sinal || vis.plano || 0)
    }
    return { wrap, desenha, D }
  }

  G.MOTORES['golden-zone'] = { grafico, serie, calcula, camadas3d: ['medias', 'sinal'], camadasLado: ['medias', 'niveis'] }
})(typeof window !== 'undefined' ? window : globalThis)
