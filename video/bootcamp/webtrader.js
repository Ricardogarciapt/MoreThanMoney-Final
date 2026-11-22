// Motor do bootcamp do WebTrader MTM (pedido do Ricardo, 22/11/2026).
// Não é um indicador: é a própria plataforma. Desenha, em HTML/canvas animado, o WebTrader como ele é
// (modo Simple e PRO, ticket, gestão automática, sinais, contas, histórico), com os rótulos reais da UI
// (components/funded/**, components/webtrader/**). Quando há captura real em capturas/webtrader/<img>,
// a cena mostra a captura com câmara 3D e realces; sem captura usa a réplica animada.
// O mercado é sintético (ilustrativo): nunca é histórico real nem resultado.
// Tipos de cena novos (MOTOR.tipos): ui, gestao, ticket, sinal, contas, simplepro, fluxo.
;(function (G) {
  const OURO = '#D2A63C', OURO2 = '#E9C46A', VERDE = '#3ecf8e', VERM = '#ff5a4f', AZUL = '#4c8dff', CINZA = '#8f887a'
  const rnd = seed => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }
  const L = () => (window.LANG || 'pt')
  const tx = (pt, en, es) => ({ pt, en: en ?? pt, es: es ?? en ?? pt })[L()]

  // ---------------------------------------------------------------- mercado sintético
  function velas(seed = 5, N = 120, base = 2650, tend = 0.25, vol = 2.2) {
    const r = rnd(seed), v = []; let p = base
    for (let i = 0; i < N; i++) {
      const o = p, d = (r() - 0.5 + tend * 0.25) * vol * 2.2
      const c = o + d, h = Math.max(o, c) + r() * vol, l = Math.min(o, c) - r() * vol
      v.push({ o, h, l, c }); p = c
    }
    return v
  }

  // desenha velas estilo WebTrader (fundo escuro, grelha discreta, eixo de preços à direita)
  function desenhaVelas(cv, v, ate, extra = {}) {
    const W = cv.width, H = cv.height, g = cv.getContext('2d'), n = Math.max(2, Math.floor(v.length * ate))
    g.fillStyle = '#0c0d10'; g.fillRect(0, 0, W, H)
    const vis = v.slice(0, n), lo = Math.min(...vis.map(x => x.l), ...(extra.niveis || []).map(x => x.p)) - 2
    const hi = Math.max(...vis.map(x => x.h), ...(extra.niveis || []).map(x => x.p)) + 2
    const AX = 92, y = p => 14 + (hi - p) / (hi - lo) * (H - 40), bw = (W - AX - 10) / v.length
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1
    for (let i = 0; i < 6; i++) { const yy = 14 + i * (H - 40) / 5; g.beginPath(); g.moveTo(0, yy); g.lineTo(W - AX, yy); g.stroke()
      g.fillStyle = '#6b6f78'; g.font = '15px JetBrains Mono'; g.fillText((hi - i * (hi - lo) / 5).toFixed(2), W - AX + 8, yy + 5) }
    vis.forEach((k, i) => { const x = 6 + i * bw, up = k.c >= k.o
      g.strokeStyle = g.fillStyle = up ? '#26a69a' : '#ef5350'
      g.beginPath(); g.moveTo(x + bw / 2, y(k.h)); g.lineTo(x + bw / 2, y(k.l)); g.stroke()
      g.fillRect(x + bw * 0.15, y(Math.max(k.o, k.c)), bw * 0.7, Math.max(1.5, Math.abs(y(k.o) - y(k.c)))) })
    const ult = vis[vis.length - 1]
    // linha do preço atual
    g.setLineDash([4, 4]); g.strokeStyle = OURO2; g.beginPath(); g.moveTo(0, y(ult.c)); g.lineTo(W - AX, y(ult.c)); g.stroke(); g.setLineDash([])
    g.fillStyle = OURO; g.fillRect(W - AX, y(ult.c) - 12, AX, 24); g.fillStyle = '#111'; g.font = '700 15px JetBrains Mono'; g.fillText(ult.c.toFixed(2), W - AX + 8, y(ult.c) + 5)
    // níveis (entrada, SL, TP, trailing…)
    for (const nv of extra.niveis || []) {
      if (nv.op === 0) continue
      g.globalAlpha = nv.op ?? 1; g.strokeStyle = nv.cor; g.lineWidth = 2; g.setLineDash(nv.tracejado ? [8, 6] : [])
      g.beginPath(); g.moveTo(0, y(nv.p)); g.lineTo(W - AX, y(nv.p)); g.stroke(); g.setLineDash([])
      g.fillStyle = nv.cor; const tw = g.measureText(nv.t).width + 22; g.font = '700 16px Inter'
      g.fillRect(W - AX - tw - 8, y(nv.p) - 13, tw, 26); g.fillStyle = '#0b0b0b'; g.fillText(nv.t, W - AX - tw + 3, y(nv.p) + 6); g.globalAlpha = 1
    }
    return { y, ult, n, bw, AX }
  }

  // ---------------------------------------------------------------- réplica da UI
  // Uma «janela» do WebTrader: barra de topo (conta, saldo, Simple/PRO), gráfico, ticket e painel de baixo.
  function janela(modo, o = {}) {
    const W = modo === 'simple' ? 520 : 1500, H = modo === 'simple' ? 980 : 820
    const w = el('div', 'abs', null, { width: W + 'px', height: H + 'px', borderRadius: modo === 'simple' ? '54px' : '18px', overflow: 'hidden',
      background: '#0a0b0e', border: modo === 'simple' ? '10px solid #1b1b1f' : '1px solid rgba(210,166,60,.35)', boxShadow: '0 40px 120px rgba(0,0,0,.6)', fontFamily: 'Inter' })
    const topo = el('div', null, null, { height: '64px', display: 'flex', alignItems: 'center', gap: '16px', padding: '0 20px', borderBottom: '1px solid #1d1f25', background: '#0e0f13' })
    topo.innerHTML = `<img src="../../public/logo-mtm-transparent.png" style="height:30px" onerror="this.remove()">
      <div data-z="conta" style="font:600 17px Inter;color:#ddd;padding:6px 12px;border:1px solid #2a2d35;border-radius:10px">${o.conta || '77xxxxxx'} ▾</div>
      <div style="flex:1"></div>
      <div data-z="saldo" class="mono" style="font-size:17px;color:${OURO2}">${o.saldo || '11 425,00 $'}</div>
      <div data-z="modo" style="display:flex;border:1px solid ${OURO}66;border-radius:10px;padding:3px;font:700 14px Inter">
        <span data-m="simple" style="padding:6px 12px;border-radius:7px">Simple</span><span data-m="pro" style="padding:6px 12px;border-radius:7px">PRO</span></div>`
    w.append(topo)
    const corpo = el('div', null, null, { position: 'absolute', left: 0, right: 0, top: '64px', bottom: 0 })
    w.append(corpo)
    const cv = el('canvas'), zonas = {}
    let ticket, baixo
    if (modo === 'simple') {
      cv.width = 500; cv.height = 560; Object.assign(cv.style, { position: 'absolute', left: 0, top: '56px', width: '100%', height: '560px' })
      const sec = el('div', null, ['Mercados', 'Gráfico', 'Negociações', 'Insights', 'Conta'].map(s => `<span data-z="sec-${s}" style="padding:8px 4px">${s}</span>`).join(''),
        { position: 'absolute', bottom: 0, left: 0, right: 0, height: '74px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', font: '600 15px Inter', color: '#9aa', borderTop: '1px solid #1d1f25', background: '#0e0f13' })
      const sim = el('div', null, `<div data-z="simbolo" style="font:700 22px Inter;color:#fff">XAUUSD <span style="font:500 15px Inter;color:#888">· M5</span></div>`, { position: 'absolute', left: '18px', top: '12px' })
      const bts = el('div', null, `<div data-z="vender" style="flex:1;background:#ef5350;border-radius:14px;padding:16px;text-align:center;font:800 20px Inter;color:#fff">VENDER</div>
        <div data-z="comprar" style="flex:1;background:#26a69a;border-radius:14px;padding:16px;text-align:center;font:800 20px Inter;color:#fff">COMPRAR</div>`,
        { position: 'absolute', left: '16px', right: '16px', top: '630px', display: 'flex', gap: '12px' })
      baixo = el('div', null, ['Posições', 'Ordens', 'Histórico', 'Mais'].map(s => `<span data-z="tab-${s}" style="padding:6px 10px">${s}</span>`).join(''),
        { position: 'absolute', left: '16px', right: '16px', top: '712px', display: 'flex', gap: '8px', font: '600 16px Inter', color: '#9aa', borderBottom: '1px solid #1d1f25' })
      const pos = el('div', null, null, { position: 'absolute', left: '16px', right: '16px', top: '760px', font: '500 16px Inter', color: '#ccc' })
      corpo.append(cv, sim, bts, baixo, pos, sec)
      ticket = folhaTicket(); ticket.style.cssText += ';position:absolute;left:0;right:0;bottom:0;border-radius:26px 26px 0 0;transform:translateY(105%)'
      corpo.append(ticket); zonas.pos = pos
    } else {
      cv.width = 1060; cv.height = 500; Object.assign(cv.style, { position: 'absolute', left: '230px', top: '0', width: '1060px', height: '500px' })
      const wl = el('div', null, `<div style="font:700 13px Inter;letter-spacing:.2em;color:${OURO};padding:14px 14px 8px">WATCHLIST</div>` +
        [['XAUUSD', '2 651,4'], ['EURUSD', '1,0842'], ['US30', '43 980'], ['BTCUSD', '96 410'], ['GBPUSD', '1,2712'], ['NAS100', '20 880']]
          .map(([s, p], i) => `<div data-z="${i ? 'wl' : 'simbolo'}" style="display:flex;justify-content:space-between;padding:10px 14px;font:600 15px Inter;color:${i ? '#bbb' : '#fff'};${i ? '' : 'background:#1a1c22'}"><span>${s}</span><span class="mono">${p}</span></div>`).join(''),
        { position: 'absolute', left: 0, top: 0, width: '230px', bottom: 0, borderRight: '1px solid #1d1f25', background: '#0d0e12' })
      ticket = folhaTicket(); Object.assign(ticket.style, { position: 'absolute', right: 0, top: 0, width: '210px', height: '500px', borderLeft: '1px solid #1d1f25', borderRadius: 0, padding: '14px', transform: 'none', fontSize: '13px' })
      ticket.classList.add('pro')
      baixo = el('div', null, ['Posições', 'Ordens', 'Histórico', 'Estatísticas', 'Diário', 'Alertas', 'Registo', 'A minha conta'].map(s => `<span data-z="tab-${s}" style="padding:8px 12px">${s}</span>`).join(''),
        { position: 'absolute', left: '230px', right: 0, top: '500px', height: '44px', display: 'flex', gap: '4px', alignItems: 'center', font: '600 15px Inter', color: '#9aa', borderTop: '1px solid #1d1f25', borderBottom: '1px solid #1d1f25', background: '#0e0f13', paddingLeft: '10px' })
      const pos = el('div', null, null, { position: 'absolute', left: '240px', right: '10px', top: '552px', font: '500 15px Inter', color: '#ccc' })
      corpo.append(wl, cv, ticket, baixo, pos); zonas.pos = pos
    }
    const V = velas(o.seed || 5, modo === 'simple' ? 70 : 140)
    const api = {
      w, cv, ticket, baixo, V,
      modo(m) { topo.querySelectorAll('[data-m]').forEach(s => { const on = s.dataset.m === m; s.style.background = on ? OURO : 'transparent'; s.style.color = on ? '#111' : OURO }) },
      zona(nome) { return w.querySelector(`[data-z="${nome}"]`) },
      tab(nome) { baixo.querySelectorAll('[data-z]').forEach(s => { const on = s.dataset.z === 'tab-' + nome; s.style.color = on ? OURO2 : '#9aa'; s.style.borderBottom = on ? `2px solid ${OURO}` : '2px solid transparent' }) },
      posicoes(linhas) { zonas.pos.innerHTML = linhas.map(l => `<div style="display:flex;gap:14px;align-items:center;padding:9px 0;border-bottom:1px solid #1a1c21">${l}</div>`).join('') },
    }
    api.modo(modo)
    return api
  }

  function folhaTicket() {
    const t = el('div', null, null, { background: '#111318', padding: '22px', color: '#ddd', font: '500 16px Inter', borderTop: '1px solid #2a2d35', boxShadow: '0 -20px 60px rgba(0,0,0,.6)' })
    t.innerHTML = `<div style="display:flex;gap:6px;margin-bottom:12px">${['Mercado', 'Limit', 'Stop'].map((s, i) => `<span data-t="tipo-${s}" style="flex:1;text-align:center;padding:7px 0;border-radius:8px;border:1px solid #2a2d35;${i ? '' : `background:${OURO};color:#111;font-weight:700`}">${s}</span>`).join('')}</div>
      <div data-t="vol" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #22252c"><span>Volume</span><b class="mono">0,10</b></div>
      <div data-t="risco" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #22252c"><span>Risco %</span><b class="mono">1,0 %</b></div>
      <div data-t="sl" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #22252c;color:${VERM}"><span>Stop loss</span><b class="mono">— pips</b></div>
      <div data-t="tp" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #22252c;color:${VERDE}"><span>Take profit</span><b class="mono">— pips</b></div>
      <div data-t="rr" style="display:flex;justify-content:space-between;padding:8px 0"><span>R:R</span><b class="mono">—</b></div>
      <div data-t="enviar" style="margin-top:10px;background:#26a69a;border-radius:12px;padding:13px;text-align:center;font:800 17px Inter;color:#fff">Comprar</div>`
    return t
  }

  // realce: aro dourado a pulsar à volta de um elemento + etiqueta
  function realce(r) {
    const aro = el('div', 'abs', null, { border: `3px solid ${OURO2}`, borderRadius: '14px', boxShadow: `0 0 0 9999px rgba(0,0,0,.35), 0 0 40px ${OURO}`, pointerEvents: 'none', zIndex: 8, opacity: 0, transition: 'none' })
    const et = el('div', 'abs', '', { background: OURO, color: '#111', font: '700 24px Inter', padding: '10px 18px', borderRadius: '12px', zIndex: 9, opacity: 0, whiteSpace: 'nowrap' })
    r.append(aro, et)
    return (alvo, texto, k) => {
      if (!alvo) { aro.style.opacity = 0; et.style.opacity = 0; return }
      const a = alvo.getBoundingClientRect(), p = r.getBoundingClientRect()
      const pulso = 1 + Math.sin(k * 5) * 0.03
      Object.assign(aro.style, { left: a.left - p.left - 10 + 'px', top: a.top - p.top - 10 + 'px', width: a.width + 20 + 'px', height: a.height + 20 + 'px', opacity: out(k / 0.5), transform: `scale(${pulso})` })
      if (texto) { et.textContent = texto; Object.assign(et.style, { left: Math.min(1500, a.left - p.left) + 'px', top: Math.max(120, a.top - p.top - 64) + 'px', opacity: out((k - 0.2) / 0.5) }) } else et.style.opacity = 0
    }
  }

  function titulo(r, s, x = 120, y = 96) {
    const t = el('div', 'abs', `<div class="kicker">${s.kicker || ''}</div><div style="font:700 44px Inter;margin-top:8px;max-width:1500px">${s.titulo || ''}</div>`, { left: x + 'px', top: y + 'px', zIndex: 10 })
    r.append(t); return k => entra(t, k / 0.8)
  }

  // captura real (quando existe): câmara 3D com zoom para o ponto de foco [x,y] em fracções
  function captura(r, s) {
    const box = el('div', 'abs', null, { left: '160px', top: '210px', width: '1600px', height: '780px', overflow: 'hidden', borderRadius: '18px', border: `1px solid ${OURO}55`, boxShadow: '0 40px 120px rgba(0,0,0,.6)', background: '#0a0b0e' })
    const img = el('img', null, null, { width: '100%', height: '100%', objectFit: 'contain', transformOrigin: '50% 50%' })
    img.src = `capturas/webtrader/${s.img}`
    box.append(img); r.append(box)
    return { box, img }
  }

  const TIPOS = {
    // O WebTrader a trabalhar, em Simple ou PRO, com um realce no que a fala explica.
    // s.modo: simple|pro · s.foco: [{zona, texto, de}] (de = segundos desde o início da cena) · s.tab · s.img (captura real)
    ui(r, s) {
      const tt = titulo(r, s)
      if (s.img) {
        const C = captura(r, s), [fx, fy] = s.focoImg || [0.5, 0.5], z = s.zoom || 1.35
        return (k, d) => { tt(k); const kk = ease(prog(k, 1, Math.max(2, d - 1)))
          C.box.style.opacity = out(k / 0.8); C.box.style.transform = `perspective(2200px) rotateX(${lerp(12, 0, out(k / 2.5))}deg) rotateY(${lerp(-10, 0, out(k / 2.5))}deg)`
          C.img.style.transformOrigin = `${fx * 100}% ${fy * 100}%`; C.img.style.transform = `scale(${lerp(1, z, kk)})` }
      }
      const J = janela(s.modo || 'pro', s), simple = (s.modo || 'pro') === 'simple'
      Object.assign(J.w.style, simple ? { left: '700px', top: '120px' } : { left: '210px', top: '220px' })
      r.append(J.w)
      const rl = realce(r), focos = s.foco || [], niveis = s.niveis || null
      if (s.posicoes) J.posicoes(s.posicoes)
      J.tab(s.tab || 'Posições')
      if (s.tipoOrdem) J.ticket.querySelectorAll('[data-t^=tipo]').forEach(e => { const on = e.dataset.t === 'tipo-' + s.tipoOrdem; e.style.background = on ? OURO : 'transparent'; e.style.color = on ? '#111' : '#ddd' })
      if (s.ticketValores) for (const [z, v] of Object.entries(s.ticketValores)) { const e = J.ticket.querySelector(`[data-t="${z}"] b`); if (e) e.textContent = v }
      return (k, d) => {
        tt(k)
        const ate = lerp(0.55, 1, ease(Math.min(1, k / Math.max(3, d))))
        const ult = J.V[Math.floor(J.V.length * ate) - 1]
        desenhaVelas(J.cv, J.V, ate, { niveis: niveis ? niveis.map(n => ({ ...n, p: ult.c + n.d })) : [] })
        J.w.style.opacity = out(k / 0.8)
        const rx = lerp(simple ? 8 : 16, simple ? 0 : 4, out(k / 2.5)), ry = lerp(simple ? -18 : -14, simple ? -6 : -2, out(k / 2.5))
        J.w.style.transform = `perspective(2400px) rotateX(${rx}deg) rotateY(${ry + Math.sin(k / 5) * 1.2}deg) scale(${simple ? 1 : lerp(.9, .97, out(k / 3))})`
        if (simple && s.folha) J.ticket.style.transform = `translateY(${(1 - out((k - (s.folha || 1)) / 0.7)) * 105}%)`
        if (s.alterna) J.modo(Math.floor(k / 1.6) % 2 ? 'simple' : 'pro')
        let f = null; for (const x of focos) if (k >= (x.de || 0)) f = x
        rl(f ? J.zona(f.zona) || J.ticket.querySelector(`[data-t="${f.zona}"]`) : null, f && f.texto, f ? k - (f.de || 0) : 0)
      }
    },

    // Trailing stop e break-even automático em câmara lenta: entrada, gatilho do BE, ativação e o SL a seguir o preço.
    gestao(r, s) {
      const tt = titulo(r, s), W = 1500, H = 640
      const box = el('div', 'cartao abs', null, { left: '210px', top: '230px', width: W + 'px', height: H + 'px', overflow: 'hidden' })
      const cv = el('canvas'); cv.width = W; cv.height = H; cv.style.width = '100%'; cv.style.height = '100%'; box.append(cv); r.append(box)
      const est = el('div', 'abs', '', { left: '240px', top: '890px', font: '700 30px Inter', color: OURO2, zIndex: 5 }); r.append(est)
      const be = s.be ?? 15, off = s.offset ?? 1, ativ = s.ativacao ?? 20, dist = s.distancia ?? 15, pip = 0.1
      // trajeto: sobe até +60 pips com recuos, depois recua e apanha o trailing
      const r0 = rnd(s.seed || 9), N = 110, V = []; let p = 2650
      const alvo = i => i < 70 ? 2650 + (i / 70) * 6.2 + Math.sin(i / 4) * 0.6 : 2656.2 - (i - 70) * 0.11
      for (let i = 0; i < N; i++) { const o = p, c = alvo(i) + (r0() - 0.5) * 0.8; V.push({ o, c, h: Math.max(o, c) + r0() * 0.5, l: Math.min(o, c) - r0() * 0.5 }); p = c }
      const entrada = 2650, slIni = entrada - 25 * pip
      // SL ao longo do tempo segundo as regras do motor (lib/mtmfunded/simulado/gestao-auto.ts)
      const slEm = n => { let sl = slIni, maxp = -1e9, saiu = -1
        for (let i = 0; i < n; i++) { const k = V[i]; maxp = Math.max(maxp, k.h); const ganho = (maxp - entrada) / pip
          if (s.comBE !== false && ganho >= be) sl = Math.max(sl, entrada + off * pip)
          if (s.comTrailing !== false && ganho >= ativ) sl = Math.max(sl, maxp - dist * pip)
          if (k.l <= sl && i > 2) { saiu = i; break } }
        return { sl, saiu, ganho: (maxp - entrada) / pip } }
      return (k, d) => {
        tt(k); box.style.opacity = out(k / 0.8); box.style.transform = `perspective(2200px) rotateX(${lerp(14, 2, out(k / 3))}deg)`
        const n = Math.max(3, Math.floor(N * Math.min(1, prog(k, 0.8, Math.max(2, d - 1)))))
        const G = slEm(n), fim = G.saiu >= 0 ? G.saiu + 1 : n
        const niveis = [{ p: entrada, cor: OURO2, t: tx('Entrada', 'Entry', 'Entrada') },
          { p: G.sl, cor: G.sl > entrada ? VERDE : VERM, t: G.sl > entrada + off * pip + 1e-9 ? `Trailing SL` : G.sl > entrada ? tx('SL no break-even', 'SL at break-even', 'SL en break-even') : 'SL' }]
        if (s.comBE !== false && G.ganho < be) niveis.push({ p: entrada + be * pip, cor: AZUL, t: tx(`Gatilho BE +${be}`, `BE trigger +${be}`, `Gatillo BE +${be}`), tracejado: true, op: .9 })
        if (s.comTrailing !== false && G.ganho < ativ) niveis.push({ p: entrada + ativ * pip, cor: OURO, t: tx(`Trailing arranca a +${ativ}`, `Trailing starts at +${ativ}`, `Trailing empieza a +${ativ}`), tracejado: true, op: .9 })
        desenhaVelas(cv, V.slice(0, fim).concat(Array(N - fim).fill(null)).filter(Boolean).length ? V : V, fim / N, { niveis })
        est.textContent = G.saiu >= 0 ? tx(`Saída no trailing: +${((G.sl - entrada) / pip).toFixed(0)} pips protegidos`, `Exit on trailing: +${((G.sl - entrada) / pip).toFixed(0)} pips protected`, `Salida en trailing: +${((G.sl - entrada) / pip).toFixed(0)} pips protegidos`)
          : G.sl > entrada + off * pip + 1e-9 ? tx('Trailing a seguir o preço', 'Trailing following price', 'Trailing siguiendo el precio')
          : G.sl > entrada ? tx('Break-even aplicado', 'Break-even applied', 'Break-even aplicado')
          : tx('Break-even armado — o motor move o SL ao atingir o gatilho', 'Break-even armed — the engine moves the SL at the trigger', 'Break-even armado — el motor mueve el SL al llegar al gatillo')
        entra(est, (k - 1) / 0.6, 10)
      }
    },

    // O ticket em grande: tipo de ordem, risco %, SL/TP em pips e o lote calculado pelo risco.
    ticket(r, s) {
      const tt = titulo(r, s)
      const t = folhaTicket(); Object.assign(t.style, { position: 'absolute', left: '1060px', top: '220px', width: '640px', borderRadius: '24px', border: `1px solid ${OURO}55`, fontSize: '26px', padding: '34px' })
      t.querySelectorAll('div').forEach(d => { if (d.style.padding === '8px 0px') d.style.padding = '16px 0' }); r.append(t)
      const passos = s.passos || []
      const lista = el('div', 'abs', null, { left: '140px', top: '250px', width: '820px' })
      const its = passos.map((p, i) => { const e = el('div', 'item', `<b class="n">${String(i + 1).padStart(2, '0')}</b><span>${p.texto}</span>`); lista.append(e); return e }); r.append(lista)
      const rl = realce(r)
      return (k, d, f) => {
        tt(k); t.style.opacity = out(k / 0.8); t.style.transform = `perspective(1800px) rotateY(${lerp(-24, -6, out(k / 2))}deg)`
        const span = Math.max(1, (f || d) - 1.5); let atual = null
        passos.forEach((p, i) => { const kk = k - 1 - i * span / passos.length; entra(its[i], kk / 0.6, 20); its[i].style.opacity = kk > 0 ? (kk < span / passos.length ? 1 : .45) : 0
          if (kk > 0) { atual = { p, kk }; for (const [z, v] of Object.entries(p.valores || {})) { const e = t.querySelector(`[data-t="${z}"] b`); if (e) e.textContent = v }
            if (p.tipo) t.querySelectorAll('[data-t^=tipo]').forEach(e => { const on = e.dataset.t === 'tipo-' + p.tipo; e.style.background = on ? OURO : 'transparent'; e.style.color = on ? '#111' : '#ddd' }) } })
        rl(atual ? t.querySelector(`[data-t="${atual.p.zona}"]`) : null, null, atual ? atual.kk : 0)
      }
    },

    // Um sinal chega (scanner ou Ideia MTM), abre o modal com o plano e a pessoa confirma: a posição nasce.
    sinal(r, s) {
      const tt = titulo(r, s)
      const not = el('div', 'cartao abs', `<div class="kicker" style="font-size:16px">${s.origem || tx('Sinal do scanner', 'Scanner signal', 'Señal del scanner')}</div><div style="font:800 34px Inter;margin-top:8px">XAUUSD · ${tx('Compra', 'Buy', 'Compra')}</div>`, { left: '1240px', top: '150px', width: '520px', padding: '24px 28px', background: '#121419' })
      const modal = el('div', 'cartao abs', null, { left: '560px', top: '260px', width: '800px', padding: '36px 40px', background: '#101216' })
      const linhas = s.plano || [[tx('Entrada', 'Entry', 'Entrada'), '2 650,0', 'entrada'], ['SL', '2 647,5 · 25 pips', 'sl'], ['TP1', '2 653,0 · 30 pips', 'tp'], ['TP2', '2 656,0 · 60 pips', 'tp']]
      const cores = { tp: VERDE, entrada: OURO2, sl: VERM }
      modal.innerHTML = `<div class="kicker">${s.origem || tx('Sinal do scanner', 'Scanner signal', 'Señal del scanner')}</div><div style="font:800 46px Inter;margin:10px 0 18px">XAUUSD · ${tx('Compra', 'Buy', 'Compra')}</div>` +
        linhas.map(([a, b, c]) => `<div class="plano-l" style="border-color:${cores[c]};color:${cores[c]};background:${cores[c]}14;font-size:28px;padding:12px 24px;margin:8px 0"><span>${a}</span><span class="mono">${b}</span></div>`).join('') +
        `<div style="display:flex;gap:14px;margin-top:18px;font:600 22px Inter;color:#bbb"><span>${tx('Risco/recompensa', 'Risk/reward', 'Riesgo/beneficio')} <b class="mono" style="color:#fff">1:2</b></span><span>·</span><span>${tx('Margem', 'Margin', 'Margen')} <b class="mono" style="color:#fff">265 $</b></span></div>
        <div data-b style="margin-top:22px;background:#26a69a;border-radius:14px;padding:18px;text-align:center;font:800 26px Inter;color:#fff">${tx('Confirmar compra', 'Confirm buy', 'Confirmar compra')}</div>`
      const pos = el('div', 'cartao abs', `<span class="mono" style="color:${VERDE}">BUY 0,10 XAUUSD</span><span style="color:#999">${tx('posição aberta · SL e TP colocados', 'position open · SL and TP placed', 'posición abierta · SL y TP colocados')}</span>`, { left: '560px', top: '900px', width: '800px', padding: '20px 30px', display: 'flex', justifyContent: 'space-between', font: '600 24px Inter', background: '#0f1a15' })
      r.append(not, modal, pos)
      return (k, d) => {
        tt(k); const t1 = d * 0.18, t2 = d * 0.75
        not.style.opacity = out(k / 0.5) * (1 - out((k - t1) / 0.6)); not.style.transform = `translateX(${(1 - out(k / 0.6)) * 300}px)`
        modal.style.opacity = out((k - t1) / 0.6); modal.style.transform = `perspective(1800px) rotateX(${(1 - out((k - t1) / 0.8)) * 30}deg) scale(${lerp(.9, 1, out((k - t1) / 0.8))})`
        const b = modal.querySelector('[data-b]'); const prima = k > t2 && k < t2 + 0.35; b.style.transform = `scale(${prima ? .95 : 1})`; b.style.boxShadow = k > t2 ? `0 0 40px ${VERDE}` : 'none'
        pos.style.opacity = out((k - t2 - 0.3) / 0.6); pos.style.transform = `translateY(${(1 - out((k - t2 - 0.3) / 0.6)) * 40}px)`
      }
    },

    // Contas: o WebTrader no centro, as três portas à volta (MTM Funded, TradeLocker, MT5/MT4) e o formulário da escolhida.
    contas(r, s) {
      const tt = titulo(r, s)
      const centro = el('div', 'abs', `<img src="../../public/logo-mtm-transparent.png" style="height:80px" onerror="this.remove()"><div class="anton" style="font-size:52px;margin-top:10px">WebTrader</div>`, { left: '760px', top: '430px', width: '400px', height: '240px', textAlign: 'center', paddingTop: '30px', borderRadius: '28px', border: `2px solid ${OURO}`, background: 'rgba(210,166,60,.08)', boxShadow: `0 0 80px ${OURO}44` })
      const portas = [
        { id: 'funded', t: 'MTM Funded', d: tx('Login 77xxxxxx · desafios e torneios', 'Login 77xxxxxx · challenges and tournaments', 'Login 77xxxxxx · desafíos y torneos'), campos: ['Login', 'Password (master)'] },
        { id: 'tradelocker', t: 'TradeLocker', d: tx('Email, password e servidor da corretora', 'Email, password and broker server', 'Email, contraseña y servidor del bróker'), campos: ['Email', 'Password', tx('Servidor (nome da corretora na TradeLocker)', 'Server (broker name on TradeLocker)', 'Servidor (nombre del bróker en TradeLocker)')] },
        { id: 'mt5', t: 'MT5 / MT4', d: tx('Login, password master e servidor', 'Login, master password and server', 'Login, contraseña master y servidor'), campos: [tx('Versão do MetaTrader', 'MetaTrader version', 'Versión de MetaTrader'), 'Login', 'Password (master)', tx('Servidor · ex.: PUPrime-Live', 'Server · e.g. PUPrime-Live', 'Servidor · ej.: PUPrime-Live')] },
      ]
      const pos = [[160, 300], [160, 640], [1360, 470]]
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', 1920); svg.setAttribute('height', 1080); svg.style.cssText = 'position:absolute;left:0;top:0'
      const cs = portas.map((p, i) => { const e = el('div', 'cartao abs', `<div class="anton" style="font-size:44px;color:${OURO}">${p.t}</div><div style="font:500 24px/1.35 Inter;color:#cfc6b5;margin-top:10px">${p.d}</div>`, { left: pos[i][0] + 'px', top: pos[i][1] + 'px', width: '400px', padding: '28px 30px' })
        const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'); const x1 = pos[i][0] + (i < 2 ? 400 : 0), y1 = pos[i][1] + 80
        ln.setAttribute('x1', x1); ln.setAttribute('y1', y1); ln.setAttribute('x2', i < 2 ? 760 : 1160); ln.setAttribute('y2', 550); ln.setAttribute('stroke', OURO); ln.setAttribute('stroke-width', 3); ln.setAttribute('stroke-dasharray', '10 8'); svg.append(ln)
        return { e, ln, p } })
      r.append(svg, centro, ...cs.map(c => c.e))
      const foco = cs.find(c => c.p.id === s.foco)
      let form = null
      if (foco) { form = el('div', 'cartao abs', `<div class="kicker">${tx('Entrar só com credenciais de conta', 'Sign in with account credentials only', 'Entrar solo con credenciales de cuenta')} · ${foco.p.t}</div>` + foco.p.campos.map(c => `<div style="margin-top:16px;padding:16px 20px;border:1px solid #2a2d35;border-radius:12px;font:500 24px Inter;color:#9aa;background:#0d0f13">${c}</div>`).join('') + `<div style="margin-top:20px;background:${OURO};color:#111;border-radius:12px;padding:16px;text-align:center;font:800 24px Inter">${tx('Entrar', 'Sign in', 'Entrar')}</div>`, { left: '660px', top: '250px', width: '600px', padding: '30px 34px', background: '#101216', zIndex: 6 }); r.append(form) }
      return (k, d) => {
        tt(k); centro.style.opacity = out(k / 0.8); centro.style.transform = `perspective(1600px) rotateY(${Math.sin(k / 3) * 8}deg) translateZ(${Math.sin(k / 2) * 10}px)`
        cs.forEach((c, i) => { const kk = (k - 0.6 - i * 0.5) / 0.7; c.e.style.opacity = out(kk) * (foco && foco !== c ? lerp(1, .35, out((k - d * .35) / .6)) : 1); c.e.style.transform = `perspective(1600px) rotateY(${(1 - out(kk)) * (i < 2 ? 50 : -50)}deg)`
          c.ln.style.opacity = out(kk); c.ln.setAttribute('stroke-dashoffset', -k * 30) })
        if (form) { const kk = (k - d * .35) / .8; form.style.opacity = out(kk); form.style.transform = `perspective(1800px) rotateX(${(1 - out(kk)) * 40}deg) translateY(${(1 - out(kk)) * 60}px)`; centro.style.opacity = out(k / .8) * (1 - out(kk) * .85) }
      }
    },

    // Simple no telemóvel e PRO no computador, lado a lado, a rodar em 3D.
    simplepro(r, s) {
      const tt = titulo(r, s)
      const A = janela('simple', s), B = janela('pro', s)
      Object.assign(A.w.style, { left: '230px', top: '300px', transformOrigin: '50% 50%', zoom: .7 }); Object.assign(B.w.style, { left: '820px', top: '400px', zoom: .7 })
      r.append(B.w, A.w); A.tab('Posições'); B.tab('Posições')
      const etA = el('div', 'abs', 'Simple', { left: '330px', top: '995px', font: '400 54px Anton', color: OURO }), etB = el('div', 'abs', 'PRO', { left: '1330px', top: '995px', font: '400 54px Anton', color: OURO })
      r.append(etA, etB)
      return (k, d) => { tt(k); const a = Math.min(1, k / Math.max(3, d))
        desenhaVelas(A.cv, A.V, lerp(.5, 1, a)); desenhaVelas(B.cv, B.V, lerp(.5, 1, a))
        A.w.style.opacity = out(k / .8); B.w.style.opacity = out((k - .4) / .8)
        A.w.style.transform = `perspective(2400px) rotateY(${lerp(30, 12, out(k / 3)) + Math.sin(k / 4) * 3}deg)`
        B.w.style.transform = `perspective(2600px) rotateY(${lerp(-30, -12, out(k / 3)) - Math.sin(k / 4) * 3}deg)`
        entra(etA, (k - 1) / .6); entra(etB, (k - 1.3) / .6) }
    },

    // Diagrama do caminho de uma ordem: sinal → ticket → motor MTM → conta (ou outra sequência em s.passos).
    fluxo(r, s) {
      const tt = titulo(r, s), ps = s.passos || [], n = ps.length, w = Math.min(330, (1640 - (n - 1) * 40) / n)
      const x0 = (1920 - (n * w + (n - 1) * 40)) / 2
      const cs = ps.map((p, i) => { const e = el('div', 'cartao abs', `<div class="mono" style="font-size:22px;color:${OURO}">${String(i + 1).padStart(2, '0')}</div><div class="anton" style="font-size:40px;margin-top:8px">${p.t}</div><div style="font:500 22px/1.4 Inter;color:#cfc6b5;margin-top:12px">${p.d || ''}</div>`, { left: x0 + i * (w + 40) + 'px', top: '420px', width: w + 'px', minHeight: '330px', padding: '30px 26px' }); r.append(e); return e })
      const bola = el('div', 'abs', null, { width: '26px', height: '26px', borderRadius: '50%', background: OURO2, boxShadow: `0 0 30px ${OURO}`, top: '395px' }); r.append(bola)
      return (k, d, f) => { tt(k); const span = Math.max(1, (f || d) - 1.5)
        cs.forEach((e, i) => { const kk = (k - .8 - i * span / n) / .7; e.style.opacity = out(kk); e.style.transform = `perspective(1600px) rotateX(${(1 - out(kk)) * 50}deg) translateZ(${(1 - out(kk)) * -150}px)`; e.style.borderColor = kk > 0 && kk < span / n / .7 ? OURO : 'rgba(210,166,60,.25)' })
        const pr = clamp((k - .8) / span); bola.style.left = x0 + pr * (n * w + (n - 1) * 40 - 26) + 'px'; bola.style.opacity = k > .8 && pr < 1 ? 1 : 0 }
    },
  }

  // painel lateral das cenas genéricas (pontos, checklist, capítulo): o gráfico do WebTrader com uma posição e SL/TP
  function grafico(r, o, elx) {
    const w = (o.w || 800), h = (o.h || 600)
    const wrap = elx('div', 'abs', null, { left: (o.left ?? 1040) + 'px', top: (o.top ?? 250) + 'px', width: w + 'px', height: h + 'px', borderRadius: '22px', overflow: 'hidden', border: '1px solid rgba(210,166,60,.35)', background: '#0c0d10' })
    const cv = elx('canvas'); cv.width = w; cv.height = h; cv.style.width = '100%'; cv.style.height = '100%'; wrap.append(cv); r.append(wrap)
    const V = velas(o.seed || 5, 90)
    const desenha = (vis, ate) => { const n = Math.max(3, Math.floor(V.length * ate)), e = V[Math.floor(V.length * .55)].c
      desenhaVelas(cv, V, ate, { niveis: n > V.length * .55 ? [{ p: e, cor: OURO2, t: 'BUY 0,10' }, { p: e - 2.5, cor: VERM, t: 'SL' }, { p: e + 5, cor: VERDE, t: 'TP' }] : [] }) }
    return { wrap, desenha }
  }

  G.MOTORES = G.MOTORES || {}
  G.MOTORES.webtrader = { grafico, tipos: TIPOS, camadas3d: [], camadasLado: [] }
})(window)
