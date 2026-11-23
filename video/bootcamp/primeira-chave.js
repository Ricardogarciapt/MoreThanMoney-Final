// Motor do curso «A Primeira Chave · Programa Completo» do Ruben Pereira (pedido do Ricardo, 22/11/2026).
// Não é um indicador: é um curso de cripto. O gráfico lateral é um mercado SINTÉTICO de cripto
// (velas, médias, pontos de DCA às sextas, plano de um sinal) — sempre ilustrativo, nunca histórico real.
// Tipos de cena novos (MOTOR.tipos): ruben, etiquetas, pergunta, missao, termos.
// O guião vem de tools/ebooks/curso-para-video.mjs (lê os guiões em markdown do curso).
;(function () {
  const OURO = '#D2A63C', OURO2 = '#E9C46A', VERDE = '#3ecf8e', VERM = '#ff5a4f', CINZA = '#8f887a'
  const rnd = seed => { let s = (seed * 2654435761) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }
  const L = () => (window.LANG || 'pt')
  const tx = o => o[L()] ?? o.en ?? o.pt
  const FOTO = '../../public/educadores/ruben/retrato.jpg'

  function velas(seed, N, cen) {
    const r = rnd(seed), v = []; let p = 100
    const tend = cen === 'venda' ? -0.35 : cen === 'compra' ? 0.35 : 0.08
    for (let i = 0; i < N; i++) {
      const choque = r() < 0.06 ? (r() - 0.6) * 9 : 0
      const o = p, c = o * (1 + ((r() - 0.5) * 2.6 + tend + choque) / 100)
      v.push({ o, c, h: Math.max(o, c) * (1 + r() * 0.012), l: Math.min(o, c) * (1 - r() * 0.012) }); p = c
    }
    return v
  }
  const media = (v, n) => v.map((_, i) => { const a = v.slice(Math.max(0, i - n + 1), i + 1); return a.reduce((s, x) => s + x.c, 0) / a.length })

  // ---------------------------------------------------------------- gráfico lateral (contrato do cenas.html)
  function grafico(r, o, el) {
    const W = o.w || 1500, H = o.h || 760
    const wrap = el('div', 'card abs', null, { left: (o.left ?? 210) + 'px', top: (o.top ?? 210) + 'px', width: W + 'px', height: H + 'px', overflow: 'hidden', background: o.transparente ? 'transparent' : '#0a0a0c' })
    const cv = el('canvas'); cv.width = W; cv.height = H; cv.style.width = '100%'; cv.style.height = '100%'
    const tag = el('div', null, tx({ pt: 'Mercado ilustrativo', en: 'Illustrative market', es: 'Mercado ilustrativo', fr: 'Marché illustratif' }),
      { position: 'absolute', right: '16px', bottom: '12px', font: "600 15px 'JetBrains Mono'", color: CINZA })
    wrap.append(cv, tag); r.append(wrap)
    const cen = o.cenario || 'tendencia', v = velas(o.seed || 7, 110, cen), m1 = media(v, 9), m2 = media(v, 30)
    const g = cv.getContext('2d')
    function desenha(vis, ate) {
      const n = Math.max(3, Math.floor(v.length * Math.min(1, ate)))
      g.clearRect(0, 0, W, H); if (!o.transparente) { g.fillStyle = '#0a0a0c'; g.fillRect(0, 0, W, H) }
      const vs = v.slice(0, n), lo = Math.min(...v.map(x => x.l)) * 0.985, hi = Math.max(...v.map(x => x.h)) * 1.015
      const AX = 70, y = p => 20 + (hi - p) / (hi - lo) * (H - 60), bw = (W - AX - 20) / v.length
      g.strokeStyle = 'rgba(210,166,60,.07)'; g.lineWidth = 1
      for (let i = 0; i < 6; i++) { const yy = 20 + i * (H - 60) / 5; g.beginPath(); g.moveTo(0, yy); g.lineTo(W - AX, yy); g.stroke() }
      vs.forEach((k, i) => { const x = 10 + i * bw, up = k.c >= k.o
        g.strokeStyle = g.fillStyle = up ? '#2F9E8F' : '#C0262D'
        g.beginPath(); g.moveTo(x + bw / 2, y(k.h)); g.lineTo(x + bw / 2, y(k.l)); g.stroke()
        g.fillRect(x + bw * 0.18, y(Math.max(k.o, k.c)), bw * 0.64, Math.max(2, Math.abs(y(k.o) - y(k.c)))) })
      const linha = (arr, cor, w) => { g.strokeStyle = cor; g.lineWidth = w; g.beginPath(); arr.slice(0, n).forEach((p, i) => { const x = 10 + i * bw + bw / 2; i ? g.lineTo(x, y(p)) : g.moveTo(x, y(p)) }); g.stroke() }
      if (vis.medias !== 0) { linha(m2, 'rgba(233,196,106,.55)', 3); linha(m1, 'rgba(210,166,60,.9)', 2.5) }
      // DCA: um ponto dourado a cada 5 velas («sextas»), maior nas quedas fortes
      if (vis.dca !== 0) for (let i = 4; i < n; i += 5) {
        const k = v[i], q = (k.c - v[i - 1].c) / v[i - 1].c, raio = q <= -0.03 ? 15 : q <= -0.015 ? 11 : q > 0.01 ? 5 : 8
        g.fillStyle = 'rgba(233,196,106,.9)'; g.beginPath(); g.arc(10 + i * bw + bw / 2, y(k.l) + 26, raio, 0, 7); g.fill()
      }
      // plano de um sinal (entrada, stop, 3 alvos) — só quando pedido
      if (vis.plano) { const i = Math.floor(n * 0.82), e = v[i].c, risco = e * 0.012 * (cen === 'venda' ? -1 : 1)
        const niveis = [[tx({ pt: 'Stop', en: 'Stop', es: 'Stop', fr: 'Stop' }), e - risco, VERM], [tx({ pt: 'Entrada', en: 'Entry', es: 'Entrada', fr: 'Entrée' }), e, OURO2], ['1:1,5', e + risco * 1.5, VERDE], ['1:3', e + risco * 3, VERDE], ['1:6', e + risco * 6, VERDE]]
        g.globalAlpha = vis.plano; niveis.forEach(([nm, p, cor]) => { const yy = y(p); if (yy < 0 || yy > H) return
          g.strokeStyle = cor; g.setLineDash([10, 8]); g.lineWidth = 2; g.beginPath(); g.moveTo(10 + i * bw, yy); g.lineTo(W - AX, yy); g.stroke(); g.setLineDash([])
          g.fillStyle = cor; g.font = "700 20px 'JetBrains Mono'"; g.fillText(nm, W - AX - 120, yy - 8) }); g.globalAlpha = 1 }
      const ult = vs[vs.length - 1]; g.fillStyle = OURO; g.beginPath(); g.arc(10 + (n - 1) * bw + bw / 2, y(ult.c), 7, 0, 7); g.fill()
    }
    return { wrap, desenha }
  }

  // ---------------------------------------------------------------- tipos de cena
  const tipos = {
    // Ruben (foto real) + frase da cena: abre módulos e dá rosto às aulas
    ruben(r, s) {
      const f = document.createElement('div'); f.className = 'card abs'
      Object.assign(f.style, { left: '1180px', top: '170px', width: '560px', height: '700px', overflow: 'hidden', background: `#111 url(${FOTO}) center/cover` })
      const grad = document.createElement('div'); Object.assign(grad.style, { position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(11,10,8,.85), transparent 45%)' })
      const nome = document.createElement('div'); nome.innerHTML = `<div class="kicker">Ruben Pereira</div><div style="font:500 24px Inter;color:#ddd5c4;margin-top:6px">${tx({ pt: 'Educador cripto · MoreThanMoney', en: 'Crypto educator · MoreThanMoney', es: 'Educador cripto · MoreThanMoney', fr: 'Éducateur crypto · MoreThanMoney' })}</div>`
      Object.assign(nome.style, { position: 'absolute', left: '28px', bottom: '26px' }); f.append(grad, nome)
      const b = document.createElement('div'); b.className = 'abs'; Object.assign(b.style, { left: '150px', top: '250px', width: '900px' })
      b.innerHTML = `<div class="kicker">${s.kicker || ''}</div><div class="serif" style="font-size:76px;line-height:1.15;margin-top:24px">${s.texto || s.titulo || ''}</div>${s.aviso ? `<div class="chip" style="margin-top:40px;display:inline-block">${s.aviso}</div>` : ''}`
      r.append(f, b)
      return k => { f.style.opacity = Math.min(1, k / 0.9); f.style.transform = `perspective(1600px) rotateY(${-14 + Math.min(1, k / 2) * 8 + Math.sin(k / 5) * 2}deg) scale(${1 + k * 0.004})`
        b.style.opacity = Math.min(1, (k - 0.3) / 0.9); b.style.transform = `translateY(${Math.max(0, 1 - k / 1.2) * 30}px)` }
    },
    // as quatro etiquetas do DCA Inteligente, com o tamanho do reforço a crescer/encolher
    etiquetas(r, s) {
      const dados = s.linhas || [
        [tx({ pt: 'Forte Compra', en: 'Strong Buy', es: 'Compra Fuerte', fr: 'Achat Fort' }), '≤ −8 %', '2×', 1],
        [tx({ pt: 'Compra', en: 'Buy', es: 'Compra', fr: 'Achat' }), '−8 % → −4 %', '1,5×', 0.75],
        [tx({ pt: 'Aguardar', en: 'Wait', es: 'Esperar', fr: 'Attendre' }), '−4 % → +1,5 %', '50 %', 0.25],
        [tx({ pt: 'Não Reforçar', en: 'Do Not Add', es: 'No Reforzar', fr: 'Ne Pas Renforcer' }), '> +1,5 %', '0', 0.04]]
      const b = document.createElement('div'); b.className = 'abs'; Object.assign(b.style, { left: '160px', top: '140px', width: '1600px' })
      b.innerHTML = `<div class="kicker">${s.kicker || 'DCA Inteligente MTM'}</div><div class="h2" style="margin:14px 0 40px">${s.titulo || ''}</div>`
      const ls = dados.map(([nm, faixa, mult, w]) => { const e = document.createElement('div')
        Object.assign(e.style, { display: 'grid', gridTemplateColumns: '360px 300px 1fr 120px', alignItems: 'center', gap: '30px', padding: '22px 0', borderBottom: '1px solid rgba(210,166,60,.18)' })
        e.innerHTML = `<span class="anton" style="font-size:46px;color:var(--ouro2)">${nm}</span><span class="mono" style="font-size:32px;color:#ddd5c4">${faixa}</span><span style="height:26px;border-radius:13px;background:rgba(210,166,60,.12);overflow:hidden"><i style="display:block;height:100%;width:0;background:linear-gradient(90deg,${OURO},${OURO2})"></i></span><span class="anton" style="font-size:46px;text-align:right">${mult}</span>`
        e.dataset.w = w; b.append(e); return e })
      const nota = document.createElement('div'); nota.className = 'sub'; nota.style.marginTop = '34px'
      nota.textContent = tx({ pt: 'Teto mensal fixo · o resto vai para o pote · exemplo ilustrativo', en: 'Fixed monthly cap · the rest goes to the reserve pot · illustrative example', es: 'Tope mensual fijo · el resto va al bote de reserva · ejemplo ilustrativo', fr: 'Plafond mensuel fixe · le reste va dans la réserve · exemple illustratif' })
      b.append(nota); r.append(b)
      return (k, d) => { entra(b.children[0], k / 0.8); entra(b.children[1], (k - 0.2) / 0.8); const span = Math.max(1, d - 2)
        ls.forEach((e, i) => { const kk = (k - 1 - i * span / ls.length) / 0.8; e.style.opacity = out(kk); e.querySelector('i').style.width = (ease(clamp(kk)) * e.dataset.w * 100) + '%' })
        nota.style.opacity = out((k - d + 2) / 0.8) }
    },
    // pergunta de verificação: a pergunta entra, a resposta revela-se a meio
    pergunta(r, s) {
      const b = document.createElement('div'); b.className = 'abs'; Object.assign(b.style, { left: '220px', right: '220px', top: '240px', textAlign: 'center' })
      b.innerHTML = `<div class="kicker">${tx({ pt: 'Pergunta de verificação', en: 'Check question', es: 'Pregunta de control', fr: 'Question de contrôle' })}</div><div style="font:700 62px/1.25 Inter;margin-top:30px">${s.titulo || ''}</div><div class="cartao" style="margin:56px auto 0;max-width:1200px;font:500 40px/1.4 Inter;color:var(--ouro2);text-align:left">${s.texto || ''}</div>`
      r.append(b); const resp = b.children[2]
      return (k, d) => { entra(b.children[0], k / 0.8); entra(b.children[1], (k - 0.2) / 0.9); const kk = (k - d * 0.45) / 0.8
        resp.style.opacity = out(kk); resp.style.transform = `perspective(1400px) rotateX(${(1 - out(kk)) * 40}deg)` }
    },
    // missão do módulo: caixas que se vão marcando
    missao(r, s) {
      const b = document.createElement('div'); b.className = 'abs'; Object.assign(b.style, { left: '160px', top: '150px', width: '1600px' })
      b.innerHTML = `<div class="kicker">${tx({ pt: 'Missão', en: 'Mission', es: 'Misión', fr: 'Mission' })}</div><div class="h2" style="margin:14px 0 34px">${s.titulo || ''}</div>`
      const its = (s.itens || []).map(t => { const e = document.createElement('div'); e.className = 'item'; e.style.fontSize = '36px'; e.innerHTML = `<span class="check"></span><span>${t}</span>`; b.append(e); return e })
      r.append(b)
      return (k, d) => { entra(b.children[0], k / 0.8); entra(b.children[1], (k - 0.2) / 0.8); const span = Math.max(1, d - 1.5)
        its.forEach((e, i) => { const kk = k - 1 - i * span / its.length; entra(e, kk / 0.6, 30); const c = e.firstChild, on = kk > 0.8; c.style.background = on ? 'var(--ouro)' : 'transparent'; c.textContent = on ? '✓' : '' }) }
    },
    // termos-chave da aula como chips 3D, com o gráfico ilustrativo por trás
    termos(r, s) {
      const G = grafico(r, { cenario: 'tendencia', seed: s.seed || 3, w: 1920, h: 1080, top: 0, left: 0, transparente: true }, el)
      G.wrap.style.opacity = 0.18; G.wrap.style.border = 'none'; G.wrap.style.boxShadow = 'none'
      const b = document.createElement('div'); b.className = 'abs'; Object.assign(b.style, { left: 0, right: 0, top: '300px', textAlign: 'center' })
      b.innerHTML = `<div class="kicker">${s.kicker || ''}</div><div class="h2" style="margin:16px 0 50px">${s.titulo || ''}</div><div id="ch" style="display:flex;flex-wrap:wrap;gap:22px;justify-content:center;padding:0 200px"></div>`
      r.append(b); const ch = b.querySelector('#ch'); const cs = (s.itens || []).map(t => { const c = document.createElement('span'); c.className = 'chip'; c.style.fontSize = '34px'; c.textContent = t; ch.append(c); return c })
      return (k, d) => { G.desenha({}, Math.min(1, 0.3 + k / Math.max(1, d)), 0); entra(b.children[0], k / 0.8); entra(b.children[1], (k - 0.2) / 0.8)
        const span = Math.max(1, d - 2); cs.forEach((c, i) => { const kk = (k - 1 - i * span / cs.length) / 0.5; c.style.opacity = out(kk); c.style.transform = `translateZ(0) scale(${0.6 + 0.4 * out(kk)}) rotateX(${(1 - out(kk)) * 50}deg)` }) }
    },
  }

  // ---------------------------------------------------------------- cenas com animação por tema (23/11)
  // Quando a cena traz s.tema, o painel lateral deixa de ser o gráfico genérico e passa a ser a animação
  // do tema da secção (primeira-chave-temas.js). Sem tema, ficam os tipos originais do cenas.html.
  const ORIG = Object.assign({}, typeof TIPOS !== 'undefined' ? TIPOS : {})
  const PT = () => window.PC_TEMAS
  const LADO = { x: 1000, y: 200, w: 820, h: 640 }
  function painelLado(r, s, rect = LADO) {
    const P = PT().painel(r, s.tema, { ...rect, fase: s.fase || 0 }, el, grafico); P.wrap.style.zIndex = 2
    return (k, peso) => { P.u(k); P.wrap.style.opacity = out(k / 0.8); P.wrap.style.transform = `perspective(1800px) rotateY(${-12 + Math.sin(k / 4) * 5}deg) rotateX(${3 + Math.sin(k / 6) * 2}deg) translateZ(${Math.sin(k / 5) * 20}px) scale(${lerp(0.9, 1, out(k / 1.2))})` }
  }
  function painelFundo(r, s, op = 0.28) {
    const P = PT().painel(r, s.tema, { x: 160, y: 60, w: 1600, h: 960, fundo: true }, el, grafico)
    return k => { P.u(k); P.wrap.style.opacity = op * out(k / 1); P.wrap.style.transform = `scale(${1.02 + k * 0.004})` }
  }
  Object.assign(tipos, {
    // abre cada secção: número grande, «secção 2 de 4», título e a animação do tema em grande
    secao(r, s) {
      const sl = painelLado(r, s, { x: 900, y: 170, w: 920, h: 700 })
      const b = el('div', 'abs', null, { left: '130px', top: '230px', width: '760px', transformStyle: 'preserve-3d' })
      b.innerHTML = `<div class="anton" style="font-size:300px;line-height:.85;color:transparent;-webkit-text-stroke:3px var(--ouro)">${s.numero || ''}</div><div class="kicker" style="margin-top:26px">${s.kicker || ''}</div><div class="h2" style="margin-top:14px;font-size:84px">${s.titulo || ''}</div>`
      r.append(b)
      return (k, d, f, peso) => { sl(k, peso); b.style.opacity = out(k / 0.9); b.style.transform = `rotateY(${(1 - out(k / 1.4)) * -32}deg) translateX(${(1 - out(k / 1.4)) * -140}px)`
        b.firstChild.style.transform = `translateZ(${Math.sin(k / 2) * 30}px)` }
    },
    pontos(r, s) {
      if (!s.tema || !PT()) return ORIG.pontos(r, s)
      const sl = painelLado(r, s); const b = el('div', 'abs', null, { left: '110px', top: '170px', width: '840px' })
      b.innerHTML = `<div class="kicker">${s.kicker || ''}</div><div class="h2" style="margin:18px 0 30px">${s.titulo || ''}</div>`
      const its = (s.itens || []).map((t, i) => { const e = el('div', 'item', `<b class="n">${String(i + 1).padStart(2, '0')}</b><span>${t}</span>`); b.append(e); return e })
      r.append(b); return (k, d, f, peso) => { entra(b.firstChild, k / 0.8); entra(b.children[1], (k - 0.2) / 0.8); const span = Math.max(1, (f || d) - 1.5); its.forEach((e, i) => entra(e, (k - 1 - i * span / its.length) / 0.7, 30)); sl(k, peso) }
    },
    checklist(r, s) {
      if (!s.tema || !PT()) return ORIG.checklist(r, s)
      const sl = painelLado(r, s); const b = el('div', 'abs', null, { left: '110px', top: '170px', width: '840px' })
      b.innerHTML = `<div class="kicker">${s.kicker || ''}</div><div class="h2" style="margin:18px 0 26px">${s.titulo || ''}</div>`
      const its = (s.itens || []).map(t => { const e = el('div', 'item', `<span class="check"></span><span>${t}</span>`, { fontSize: '34px', padding: '16px 0' }); b.append(e); return e })
      r.append(b); return (k, d, f, peso) => { sl(k, peso); entra(b.firstChild, k / 0.8); entra(b.children[1], (k - 0.2) / 0.8); const span = Math.max(1, (f || d) - 1.5)
        its.forEach((e, i) => { const kk = k - 1 - i * span / its.length; entra(e, kk / 0.6, 20); const c = e.firstChild, on = kk > 0.5; c.style.background = on ? 'var(--ouro)' : 'transparent'; c.textContent = on ? '✓' : '' }) }
    },
    // o tema em ecrã quase inteiro, com o título por cima: as cenas «visuais» da secção
    visual(r, s) {
      const P = PT().painel(r, s.tema, { x: 360, y: 250, w: 1200, h: 760, fase: s.fase || 0 }, el, grafico)
      const b = el('div', 'abs', null, { left: '0', right: '0', top: '120px', textAlign: 'center' })
      b.innerHTML = `<div class="kicker">${s.kicker || ''}</div><div style="font:700 50px/1.2 Inter;margin:14px auto 0;max-width:1500px">${s.titulo || ''}</div>`
      r.append(b)
      return k => { P.u(k); P.wrap.style.opacity = out(k / 0.8); P.wrap.style.transform = `perspective(2000px) rotateX(${lerp(18, 4, out(k / 2)) + Math.sin(k / 5) * 2}deg) rotateY(${Math.sin(k / 6) * 6}deg) scale(${lerp(0.88, 1, out(k / 2))})`; entra(b, k / 0.8) }
    },
    frase(r, s) {
      if (!s.tema || !PT()) return ORIG.frase(r, s)
      const bg = painelFundo(r, s, 0.22); const u = ORIG.frase(r, s); return (k, d, f, peso) => { bg(k); u(k, d, f, peso) }
    },
    abertura(r, s) {
      if (!s.tema || !PT()) return ORIG.abertura(r, s)
      const bg = painelFundo(r, s, 0.3); const u = ORIG.abertura(r, s); return (k, d, f, peso) => { bg(k); u(k, d, f, peso) }
    },
  })

  window.MOTORES = window.MOTORES || {}
  window.MOTORES['primeira-chave'] = { grafico, tipos, camadasLado: ['medias', 'dca'] }
})()
