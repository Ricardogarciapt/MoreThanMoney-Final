// Animações por tema do curso «A Primeira Chave» (pedido do Ricardo, 23/11/2026: «mais arrojado,
// animações por tema da aula e da secção que está a ser explicada»).
// Cada tema desenha num espaço lógico de 800×600 e anima com k (segundos desde o início da cena).
// Números que aparecem aqui são SEMPRE exemplos ilustrativos (tag no canto), nunca dados reais.
// Usado por primeira-chave.js (window.PC_TEMAS). O render.mjs só junta o <motor>.js, por isso o
// primeira-chave.js inclui este ficheiro com um <script> síncrono (ver fim do primeira-chave.js).
;(function () {
  const OURO = '#D2A63C', OURO2 = '#E9C46A', VERDE = '#3ecf8e', VERM = '#ff5a4f', CINZA = '#8f887a', TINTA = '#f3ede1', FRIO = '#9fb4c8'
  const L = () => (window.LANG || 'pt')
  const tx = o => o[L()] ?? o.en ?? o.pt
  const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x))
  const eo = x => 1 - Math.pow(1 - cl(x), 3)
  const eio = x => { x = cl(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
  const lp = (a, b, t) => a + (b - a) * t
  const ILU = () => tx({ pt: 'exemplo ilustrativo', en: 'illustrative example', es: 'ejemplo ilustrativo', fr: 'exemple illustratif' })

  function T(g, s, x, y, px, cor = TINTA, al = 'center', peso = 700, fam = 'Inter') {
    g.font = `${peso} ${px}px ${fam === 'mono' ? "'JetBrains Mono'" : fam === 'anton' ? 'Anton' : 'Inter'}`
    g.fillStyle = cor; g.textAlign = al; g.textBaseline = 'middle'; g.fillText(s, x, y)
  }
  function RR(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r) }
  function caixa(g, x, y, w, h, r = 18, cor = 'rgba(210,166,60,.45)', fundo = 'rgba(255,255,255,.04)') { RR(g, x, y, w, h, r); g.fillStyle = fundo; g.fill(); g.strokeStyle = cor; g.lineWidth = 2; g.stroke() }
  function moeda(g, x, y, r, lab = '€', a = 1, rot = 0) {
    g.save(); g.globalAlpha *= a; g.translate(x, y); g.scale(Math.max(0.08, Math.abs(Math.cos(rot))), 1)
    const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r); gr.addColorStop(0, '#fbe7a6'); gr.addColorStop(0.55, OURO2); gr.addColorStop(1, '#8a6a1e')
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.strokeStyle = 'rgba(80,60,10,.7)'; g.lineWidth = r * 0.08; g.beginPath(); g.arc(0, 0, r * 0.8, 0, 7); g.stroke()
    T(g, lab, 0, r * 0.04, r * 0.9, '#3b2a06', 'center', 800); g.restore()
  }
  function brilho(g, x, y, r, a = 0.35) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(233,196,106,${a})`); gr.addColorStop(1, 'rgba(233,196,106,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2) }
  function seta(g, x1, y1, x2, y2, cor = OURO2, w = 5) {
    g.strokeStyle = g.fillStyle = cor; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke()
    const a = Math.atan2(y2 - y1, x2 - x1); g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - 18 * Math.cos(a - 0.45), y2 - 18 * Math.sin(a - 0.45)); g.lineTo(x2 - 18 * Math.cos(a + 0.45), y2 - 18 * Math.sin(a + 0.45)); g.fill()
  }
  function check(g, x, y, s, cor = VERDE, p = 1) { g.strokeStyle = cor; g.lineWidth = s * 0.16; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - s * 0.4, y); g.lineTo(x - s * 0.4 + s * 0.3 * cl(p * 2), y + s * 0.3 * cl(p * 2)); if (p > 0.5) g.lineTo(x - s * 0.1 + s * 0.55 * cl((p - 0.5) * 2), y + s * 0.3 - s * 0.6 * cl((p - 0.5) * 2)); g.stroke(); g.lineCap = 'butt' }
  function cruz(g, x, y, s, cor = VERM) { g.strokeStyle = cor; g.lineWidth = s * 0.16; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - s / 2, y - s / 2); g.lineTo(x + s / 2, y + s / 2); g.moveTo(x + s / 2, y - s / 2); g.lineTo(x - s / 2, y + s / 2); g.stroke(); g.lineCap = 'butt' }
  function tag(g) { T(g, ILU(), 784, 584, 15, CINZA, 'right', 600, 'mono') }
  function serie(seed, n, tend = 0.2, vol = 2.2) { let s = seed >>> 0; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); const v = []; let p = 100; for (let i = 0; i < n; i++) { p *= 1 + ((r() - 0.5) * vol + tend) / 100; v.push(p) } return v }
  function linhaSerie(g, v, x, y, w, h, ate, cor = OURO2, lw = 4) { const lo = Math.min(...v), hi = Math.max(...v), n = Math.max(2, Math.floor(v.length * ate)); g.strokeStyle = cor; g.lineWidth = lw; g.beginPath(); for (let i = 0; i < n; i++) { const xx = x + i / (v.length - 1) * w, yy = y + h - (v[i] - lo) / (hi - lo) * h; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy) } g.stroke(); return { lo, hi, n } }
  const ciclo = (k, c) => (k % c) / c

  const TEMAS = {
    // 1.1 troca: peixe ↔ pão, e depois aparece a moeda no meio
    troca(g, k) {
      const p = ciclo(k, 8), sw = eio(cl(p / 0.4))
      const peixe = (x, y) => { g.fillStyle = FRIO; g.beginPath(); g.ellipse(x, y, 70, 34, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(x + 60, y); g.lineTo(x + 110, y - 34); g.lineTo(x + 110, y + 34); g.fill(); g.fillStyle = '#0b0a08'; g.beginPath(); g.arc(x - 40, y - 8, 7, 0, 7); g.fill() }
      const pao = (x, y) => { g.fillStyle = '#c98a3c'; RR(g, x - 80, y - 40, 160, 80, 40); g.fill(); g.strokeStyle = '#7a4f1c'; g.lineWidth = 5; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * 40 - 12, y - 24); g.lineTo(x + i * 40 + 12, y + 24); g.stroke() } }
      peixe(lp(170, 600, sw), 240 - Math.sin(sw * Math.PI) * 90); pao(lp(620, 190, sw), 240 + Math.sin(sw * Math.PI) * 90)
      const m = eo((p - 0.5) / 0.2); if (m > 0) { brilho(g, 400, 430, 170 * m); moeda(g, 400, 430, 70 * m, '€', 1, k * 2) }
      T(g, tx({ pt: 'troca', en: 'barter', es: 'trueque', fr: 'troc' }), 400, 90, 34, CINZA, 'center', 700, 'mono')
      if (m > 0.5) T(g, tx({ pt: 'dinheiro = confiança', en: 'money = trust', es: 'dinero = confianza', fr: 'argent = confiance' }), 400, 545, 34, OURO2, 'center', 800)
    },
    // 1.2 inflação: a chávena fica igual, o preço sobe e o poder de compra encolhe
    inflacao(g, k) {
      const p = cl(k / 9), anos = Math.round(lp(2000, 2025, p)), preco = lp(0.5, 0.9, eio(p))
      g.fillStyle = '#e8dcc6'; RR(g, 150, 200, 200, 180, 30); g.fill(); g.strokeStyle = '#e8dcc6'; g.lineWidth = 18; g.beginPath(); g.arc(360, 290, 42, -1.2, 1.2); g.stroke()
      g.fillStyle = '#4a2c16'; RR(g, 165, 212, 170, 34, 14); g.fill()
      for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(243,237,225,${0.35 + 0.25 * Math.sin(k * 2 + i)})`; g.lineWidth = 5; g.beginPath(); const x = 200 + i * 50; g.moveTo(x, 180); g.bezierCurveTo(x - 20, 150, x + 20, 130, x, 100 - Math.sin(k * 3 + i) * 10); g.stroke() }
      T(g, String(anos), 600, 150, 70, CINZA, 'center', 400, 'anton')
      T(g, preco.toFixed(2).replace('.', L() === 'en' ? '.' : ',') + ' €', 600, 260, 96, OURO2, 'center', 400, 'anton')
      T(g, tx({ pt: 'o que 10 € compram', en: 'what €10 buys', es: 'lo que compran 10 €', fr: 'ce que 10 € achètent' }), 400, 450, 26, TINTA, 'center', 600)
      caixa(g, 120, 480, 560, 40, 20); const w = 556 * (0.5 / preco); g.fillStyle = OURO; RR(g, 122, 482, w, 36, 18); g.fill(); tag(g)
    },
    // 1.3 2008: colunas de bancos a cair e o ₿ a nascer
    nascimento(g, k) {
      const p = cl(k / 6)
      for (let i = 0; i < 5; i++) { const x = 110 + i * 70, q = eo((p - 0.1 - i * 0.07) / 0.3), ang = q * (0.9 + i * 0.1)
        g.save(); g.translate(x, 470); g.rotate(ang); g.fillStyle = `rgba(143,136,122,${1 - q * 0.5})`; g.fillRect(-18, -230, 36, 230); g.fillRect(-28, -250, 56, 22); g.restore() }
      g.fillStyle = 'rgba(143,136,122,.9)'; g.beginPath(); g.moveTo(80, 200); g.lineTo(260, 130); g.lineTo(440, 200); g.fill()
      T(g, '2008', 260, 520, 46, VERM, 'center', 400, 'anton')
      const b = eo((p - 0.5) / 0.35), y = lp(460, 300, b); if (b > 0) { brilho(g, 600, y, 220 * b, 0.45); g.fillStyle = OURO2; g.beginPath(); g.arc(600, y, 110 * b, 0, 7); g.fill(); T(g, '₿', 600, y + 4, 140 * b, '#3b2a06', 'center', 800); T(g, '2009', 600, 520, 46, OURO2, 'center', 400, 'anton') }
    },
    // 1.4 blockchain: blocos a encadear, cada um com o «hash» do anterior
    blockchain(g, k) {
      const n = 5, p = k / 1.1
      for (let i = 0; i < n; i++) { const a = eo(p - i), x = 70 + i * 140, y = 250 + Math.sin(k + i) * 8
        if (a <= 0) continue; g.globalAlpha = a
        if (i) { g.strokeStyle = OURO; g.lineWidth = 6; g.setLineDash([10, 8]); g.lineDashOffset = -k * 30; g.beginPath(); g.moveTo(x - 40, y + 60); g.lineTo(x, y + 60); g.stroke(); g.setLineDash([]) }
        g.fillStyle = 'rgba(210,166,60,.16)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20, y - 20); g.lineTo(x + 120, y - 20); g.lineTo(x + 100, y); g.fill()
        g.fillStyle = 'rgba(210,166,60,.28)'; g.beginPath(); g.moveTo(x + 100, y); g.lineTo(x + 120, y - 20); g.lineTo(x + 120, y + 100); g.lineTo(x + 100, y + 120); g.fill()
        caixa(g, x, y, 100, 120, 6, OURO, 'rgba(20,18,12,.95)')
        T(g, '#' + (812 + i), x + 50, y + 28, 22, OURO2, 'center', 700, 'mono')
        T(g, ['a3f9', '7c01', 'e5b2', '0d4e', '9a6c'][i], x + 50, y + 66, 18, CINZA, 'center', 600, 'mono')
        T(g, i ? '← ' + ['', 'a3f9', '7c01', 'e5b2', '0d4e'][i] : 'gen', x + 50, y + 96, 15, CINZA, 'center', 600, 'mono'); g.globalAlpha = 1 }
      T(g, tx({ pt: 'cada bloco aponta para o anterior', en: 'each block points to the one before', es: 'cada bloque apunta al anterior', fr: 'chaque bloc pointe vers le précédent' }), 400, 470, 28, TINTA, 'center', 600)
    },
    // 2.1 oferta: curva da oferta a aproximar-se dos 21 milhões
    oferta(g, k) {
      const p = eo(k / 8), X = x => 80 + x * 640, Y = s => 470 - s / 21 * 370
      g.strokeStyle = 'rgba(210,166,60,.6)'; g.setLineDash([12, 10]); g.lineWidth = 3; g.beginPath(); g.moveTo(80, Y(21)); g.lineTo(720, Y(21)); g.stroke(); g.setLineDash([])
      T(g, '21 000 000', 720, Y(21) - 26, 30, OURO2, 'right', 700, 'mono')
      g.fillStyle = 'rgba(210,166,60,.18)'; g.strokeStyle = OURO2; g.lineWidth = 5; g.beginPath(); g.moveTo(X(0), Y(0))
      for (let i = 0; i <= 100 * p; i++) { const t = i / 100; g.lineTo(X(t), Y(21 * (1 - Math.pow(0.5, t * 5)))) } g.stroke(); g.lineTo(X(p), Y(0)); g.closePath(); g.fill()
      for (let h = 1; h <= 4; h++) if (p > h / 5) { g.fillStyle = OURO; g.beginPath(); g.arc(X(h / 5), Y(21 * (1 - Math.pow(0.5, h))), 9, 0, 7); g.fill(); T(g, 'halving', X(h / 5), Y(21 * (1 - Math.pow(0.5, h))) + 30, 16, CINZA, 'center', 600, 'mono') }
      g.strokeStyle = CINZA; g.lineWidth = 2; g.beginPath(); g.moveTo(80, 470); g.lineTo(720, 470); g.stroke()
    },
    // 2.2 Ethereum: rede de nós a executar uma regra «se → então»
    rede(g, k) {
      const nos = Array.from({ length: 9 }, (_, i) => [400 + Math.cos(i / 9 * 6.283) * 250, 290 + Math.sin(i / 9 * 6.283) * 190])
      nos.forEach(([x, y], i) => nos.forEach(([x2, y2], j) => { if (j > i && (j - i) % 3 === 1) { g.strokeStyle = 'rgba(210,166,60,.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke() } }))
      const pulso = ciclo(k, 3); nos.forEach(([x, y], i) => { const on = Math.abs(i / 9 - pulso) < 0.08; g.fillStyle = on ? OURO2 : 'rgba(210,166,60,.5)'; g.beginPath(); g.arc(x, y, on ? 18 : 12, 0, 7); g.fill(); if (on) brilho(g, x, y, 60) })
      caixa(g, 250, 230, 300, 120, 18, OURO2, 'rgba(15,13,9,.95)')
      T(g, tx({ pt: 'SE', en: 'IF', es: 'SI', fr: 'SI' }) + ' A → B', 400, 268, 36, OURO2, 'center', 800, 'mono')
      T(g, tx({ pt: 'ENTÃO executa', en: 'THEN execute', es: 'ENTONCES ejecuta', fr: 'ALORS exécute' }), 400, 312, 24, TINTA, 'center', 600, 'mono')
    },
    // 2.3 stablecoins: balança 1 ↔ 1, com a reserva do emissor por baixo
    stable(g, k) {
      const inc = Math.sin(k * 1.4) * 0.06
      g.strokeStyle = CINZA; g.lineWidth = 8; g.beginPath(); g.moveTo(400, 420); g.lineTo(400, 160); g.stroke()
      g.save(); g.translate(400, 170); g.rotate(inc); g.strokeStyle = OURO; g.lineWidth = 8; g.beginPath(); g.moveTo(-250, 0); g.lineTo(250, 0); g.stroke()
      ;[[-250, '1 $'], [250, '1 USDC']].forEach(([x, lab]) => { g.strokeStyle = CINZA; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 70, 120); g.moveTo(x, 0); g.lineTo(x + 70, 120); g.stroke(); g.save(); g.translate(x, 140); g.rotate(-inc); moeda(g, 0, 0, 52, lab === '1 $' ? '$' : '₮'); T(g, lab, 0, 84, 26, OURO2, 'center', 700, 'mono'); g.restore() })
      g.restore()
      caixa(g, 230, 450, 340, 90, 14, 'rgba(255,90,79,.5)')
      T(g, tx({ pt: 'reserva do emissor', en: "issuer's reserve", es: 'reserva del emisor', fr: "réserve de l'émetteur" }), 400, 480, 24, TINTA, 'center', 700)
      T(g, tx({ pt: 'é aqui que mora o risco', en: 'this is where the risk lives', es: 'aquí vive el riesgo', fr: 'le risque est ici' }), 400, 515, 20, VERM, 'center', 600)
    },
    // 2.4 altcoins: muitas bolhas, a maioria rebenta
    altcoins(g, k) {
      for (let i = 0; i < 26; i++) { const sx = (i * 97) % 700 + 50, sy = (i * 151) % 420 + 70, r0 = 14 + (i * 37) % 40, vida = ciclo(k + i * 0.7, 7), morre = i % 4 !== 0
        const r = morre ? r0 * eo(vida / 0.3) * (1 - eo((vida - 0.6) / 0.15)) : r0 * eo(vida / 0.3)
        if (r <= 1) continue; const y = sy - vida * 40
        if (morre && vida > 0.6) { g.strokeStyle = `rgba(255,90,79,${1 - (vida - 0.6) / 0.4})`; g.lineWidth = 3; g.beginPath(); g.arc(sx, y, r0 * (1 + (vida - 0.6) * 3), 0, 7); g.stroke() }
        else if (!morre) { moeda(g, sx, y, r, '', 1) } else { g.fillStyle = 'rgba(143,136,122,.35)'; g.beginPath(); g.arc(sx, y, r, 0, 7); g.fill() } }
      T(g, tx({ pt: '7 perguntas antes de comprar', en: '7 questions before buying', es: '7 preguntas antes de comprar', fr: '7 questions avant d’acheter' }), 400, 560, 30, OURO2, 'center', 800)
    },
    // 3.1 KYC: cartão de identificação com o feixe de verificação
    kyc(g, k) {
      caixa(g, 170, 150, 460, 290, 24, OURO, 'rgba(25,22,16,.95)')
      g.fillStyle = 'rgba(143,136,122,.5)'; g.beginPath(); g.arc(270, 270, 60, 0, 7); g.fill(); g.beginPath(); g.ellipse(270, 380, 85, 45, 0, Math.PI, 0); g.fill()
      for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(243,237,225,.25)'; RR(g, 370, 210 + i * 45, 220 - i * 30, 18, 9); g.fill() }
      const p = ciclo(k, 4), y = 150 + eio(cl(p / 0.6)) * 290; g.fillStyle = 'rgba(62,207,142,.25)'; g.fillRect(170, y - 4, 460, 8); brilho(g, 400, y, 120, 0.2)
      if (p > 0.65) { g.fillStyle = 'rgba(62,207,142,.15)'; g.beginPath(); g.arc(600, 150, 52, 0, 7); g.fill(); check(g, 606, 150, 60, VERDE, cl((p - 0.65) / 0.15)) }
      T(g, tx({ pt: 'plataforma autorizada · KYC', en: 'authorised platform · KYC', es: 'plataforma autorizada · KYC', fr: 'plateforme autorisée · KYC' }), 400, 510, 30, OURO2, 'center', 800)
    },
    // 3.2 custo real: talão com preço, spread, comissão e rede
    custos(g, k) {
      caixa(g, 230, 70, 340, 470, 10, 'rgba(243,237,225,.4)', 'rgba(243,237,225,.06)')
      const ls = [[tx({ pt: 'Compra', en: 'Purchase', es: 'Compra', fr: 'Achat' }), '100,00 €'], ['Spread', '+0,80 €'], [tx({ pt: 'Comissão', en: 'Fee', es: 'Comisión', fr: 'Commission' }), '+1,00 €'], [tx({ pt: 'Rede', en: 'Network', es: 'Red', fr: 'Réseau' }), '+0,50 €']]
      ls.forEach(([a, b], i) => { const q = eo((k - 0.6 - i * 0.9) / 0.6); g.globalAlpha = q; T(g, a, 260, 140 + i * 70, 28, TINTA, 'left', 600); T(g, b, 540, 140 + i * 70, 28, i ? VERM : TINTA, 'right', 700, 'mono'); g.globalAlpha = 1 })
      const q = eo((k - 4.6) / 0.6); g.globalAlpha = q; g.strokeStyle = 'rgba(243,237,225,.4)'; g.setLineDash([8, 8]); g.beginPath(); g.moveTo(260, 420); g.lineTo(540, 420); g.stroke(); g.setLineDash([])
      T(g, 'Total', 260, 470, 34, OURO2, 'left', 800); T(g, '102,30 €', 540, 470, 34, OURO2, 'right', 800, 'mono'); g.globalAlpha = 1; tag(g)
    },
    // 3.3 ordens: livro de ofertas, ordem ao mercado vs ordem limite
    ordens(g, k) {
      const mid = 300; for (let i = 0; i < 5; i++) { const w1 = 60 + ((i * 53) % 150), w2 = 60 + ((i * 71) % 150)
        g.fillStyle = 'rgba(255,90,79,.25)'; g.fillRect(400, mid - 40 - i * 44, w1, 36); T(g, (100.5 + i * 0.5).toFixed(1), 380, mid - 22 - i * 44, 22, VERM, 'right', 700, 'mono')
        g.fillStyle = 'rgba(62,207,142,.25)'; g.fillRect(400, mid + 8 + i * 44, w2, 36); T(g, (100 - i * 0.5).toFixed(1), 380, mid + 26 + i * 44, 22, VERDE, 'right', 700, 'mono') }
      const p = ciclo(k, 6), m = eio(cl(p / 0.35))
      seta(g, 120, mid - 22 + 60 * (1 - m), lp(150, 395, m), mid - 22, OURO2, 6); T(g, tx({ pt: 'mercado', en: 'market', es: 'mercado', fr: 'marché' }), 110, mid + 70, 24, OURO2, 'left', 800)
      g.strokeStyle = FRIO; g.setLineDash([10, 8]); g.lineWidth = 3; g.beginPath(); g.moveTo(400, mid + 26 + 3 * 44); g.lineTo(720, mid + 26 + 3 * 44); g.stroke(); g.setLineDash([])
      T(g, tx({ pt: 'limite: espera pelo teu preço', en: 'limit: waits for your price', es: 'límite: espera tu precio', fr: 'limite : attend ton prix' }), 720, mid + 3 * 44 + 62, 22, FRIO, 'right', 700); tag(g)
    },
    // 3.4 primeiro euro: a moeda cai e entra na carteira
    moeda(g, k) {
      const p = ciclo(k, 4), q = eio(cl(p / 0.5)), y = lp(60, 330, q) - Math.abs(Math.sin(cl((p - 0.5) / 0.2) * Math.PI)) * 30 * (p > 0.5 && p < 0.7 ? 1 : 0)
      caixa(g, 230, 330, 340, 200, 26, OURO, 'rgba(30,26,18,.95)'); g.fillStyle = 'rgba(210,166,60,.25)'; RR(g, 480, 400, 90, 60, 14); g.fill()
      if (p < 0.6) moeda(g, 400, y, 56, '€', 1, k * 5); else { brilho(g, 400, 420, 160 * (1 - (p - 0.6) / 0.4), 0.5); T(g, '+1 €', 400, 420, 60, OURO2, 'center', 400, 'anton') }
      T(g, tx({ pt: 'começa pequeno', en: 'start small', es: 'empieza pequeño', fr: 'commence petit' }), 400, 570, 30, TINTA, 'center', 700)
    },
    // 4.1 carteiras quentes e frias
    quentefrio(g, k) {
      caixa(g, 110, 140, 200, 340, 34, OURO, 'rgba(25,22,16,.95)'); g.fillStyle = 'rgba(210,166,60,.25)'; RR(g, 130, 175, 160, 250, 12); g.fill()
      for (let i = 0; i < 3; i++) { const a = ciclo(k * 1.3 + i * 0.33, 1); g.strokeStyle = `rgba(233,196,106,${1 - a})`; g.lineWidth = 5; g.beginPath(); g.arc(210, 130, 30 + a * 70, -2.4, -0.7); g.stroke() }
      T(g, tx({ pt: 'quente · online', en: 'hot · online', es: 'caliente · online', fr: 'chaud · en ligne' }), 210, 530, 28, OURO2, 'center', 800)
      g.save(); g.translate(570, 310); g.rotate(Math.sin(k) * 0.05); caixa(g, -120, -70, 240, 140, 26, FRIO, 'rgba(25,28,32,.95)'); g.fillStyle = 'rgba(159,180,200,.3)'; RR(g, -95, -40, 120, 80, 10); g.fill()
      g.strokeStyle = FRIO; g.lineWidth = 4; for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI; g.beginPath(); g.moveTo(70 - Math.cos(a) * 26, Math.sin(a) * 26); g.lineTo(70 + Math.cos(a) * 26, -Math.sin(a) * 26); g.stroke() } g.restore()
      T(g, tx({ pt: 'fria · offline', en: 'cold · offline', es: 'fría · offline', fr: 'froid · hors ligne' }), 570, 530, 28, FRIO, 'center', 800)
    },
    // 4.2 seed phrase: 12 caixas a revelar-se, sempre mascaradas
    seed(g, k) {
      for (let i = 0; i < 12; i++) { const c = i % 3, r = Math.floor(i / 3), x = 130 + c * 190, y = 110 + r * 95, q = eo((k - 0.3 - i * 0.25) / 0.4)
        g.globalAlpha = q; caixa(g, x, y, 170, 72, 14, OURO, 'rgba(25,22,16,.95)'); T(g, String(i + 1).padStart(2, '0'), x + 26, y + 36, 20, CINZA, 'center', 700, 'mono'); T(g, '• • • • •', x + 104, y + 38, 22, OURO2, 'center', 800); g.globalAlpha = 1 }
      T(g, tx({ pt: 'papel ou metal · nunca em fotografia', en: 'paper or metal · never in a photo', es: 'papel o metal · nunca en foto', fr: 'papier ou métal · jamais en photo' }), 400, 530, 28, TINTA, 'center', 700)
    },
    // 4.3 not your keys: a chave entra e roda no cadeado
    chave(g, k) {
      const p = ciclo(k, 5), ent = eio(cl(p / 0.4)), rod = eio(cl((p - 0.45) / 0.2)), ab = eo((p - 0.7) / 0.15)
      g.strokeStyle = OURO; g.lineWidth = 22; g.beginPath(); g.arc(560, 230 - ab * 40, 70, Math.PI, 0); g.stroke()
      caixa(g, 460, 230, 200, 190, 24, OURO, 'rgba(40,32,16,.98)'); g.fillStyle = '#0b0a08'; g.beginPath(); g.arc(560, 310, 18, 0, 7); g.fill(); g.fillRect(552, 310, 16, 50)
      g.save(); g.translate(lp(120, 470, ent), 330); g.rotate(rod * Math.PI / 2); g.scale(1, Math.max(0.15, Math.cos(rod * Math.PI / 2) ** 2 + 0.15))
      g.strokeStyle = OURO2; g.lineWidth = 14; g.beginPath(); g.arc(-110, 0, 40, 0, 7); g.stroke(); g.fillStyle = OURO2; g.fillRect(-70, -8, 120, 16); g.fillRect(20, 8, 12, 22); g.fillRect(40, 8, 10, 30); g.restore()
      T(g, 'not your keys, not your coins', 400, 520, 30, OURO2, 'center', 800, 'mono')
    },
    // 4.4 plano de guarda: cópias em três lugares
    copias(g, k) {
      g.strokeStyle = 'rgba(210,166,60,.15)'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(60, 90 + i * 60); g.bezierCurveTo(300, 60 + i * 60 + Math.sin(i) * 30, 500, 120 + i * 60, 740, 90 + i * 60); g.stroke() }
      const pins = [[200, 260], [430, 180], [600, 360]]
      pins.forEach(([x, y], i) => { const q = eo((k - 0.4 - i * 0.8) / 0.5), b = Math.sin(k * 2 + i) * 6; g.globalAlpha = q; g.fillStyle = OURO2; g.beginPath(); g.arc(x, y - 40 + b, 30, Math.PI, 0); g.lineTo(x, y + b); g.closePath(); g.fill(); g.fillStyle = '#0b0a08'; g.beginPath(); g.arc(x, y - 42 + b, 11, 0, 7); g.fill()
        T(g, tx({ pt: 'cópia ', en: 'copy ', es: 'copia ', fr: 'copie ' }) + (i + 1), x, y + 34, 22, TINTA, 'center', 700); g.globalAlpha = 1 })
      if (k > 3) { g.strokeStyle = 'rgba(233,196,106,.5)'; g.setLineDash([8, 8]); g.lineDashOffset = -k * 20; g.lineWidth = 3; g.beginPath(); pins.forEach(([x, y], i) => i ? g.lineTo(x, y - 40) : g.moveTo(x, y - 40)); g.closePath(); g.stroke(); g.setLineDash([]) }
      T(g, tx({ pt: 'fogo, água, roubo: uma cópia sobrevive', en: 'fire, water, theft: one copy survives', es: 'fuego, agua, robo: una copia sobrevive', fr: 'feu, eau, vol : une copie survit' }), 400, 540, 28, OURO2, 'center', 800)
    },
    // 5.1 falsos suportes: mensagens a chegar e o escudo a bloquear
    burla(g, k) {
      const msgs = [tx({ pt: '«Suporte: envia a tua seed»', en: '"Support: send your seed"', es: '«Soporte: envía tu seed»', fr: '« Support : envoie ta seed »' }), tx({ pt: '«Conta bloqueada, clica aqui»', en: '"Account locked, click here"', es: '«Cuenta bloqueada, pulsa aquí»', fr: '« Compte bloqué, clique ici »' }), tx({ pt: '«Verifica a carteira agora»', en: '"Verify your wallet now"', es: '«Verifica la cartera ya»', fr: '« Vérifie ton portefeuille »' })]
      msgs.forEach((m, i) => { const q = eo((k - 0.4 - i * 1.4) / 0.5), x = lp(820, 80, q); g.globalAlpha = cl(q * 1.4); caixa(g, x, 110 + i * 120, 400, 82, 20, 'rgba(255,90,79,.6)', 'rgba(60,20,18,.85)'); T(g, m, x + 24, 151 + i * 120, 22, TINTA, 'left', 600)
        if (k > 1 + i * 1.4) cruz(g, x + 440, 151 + i * 120, 36); g.globalAlpha = 1 })
      g.save(); g.translate(640, 300); const s = 1 + Math.sin(k * 3) * 0.03; g.scale(s, s); g.fillStyle = 'rgba(210,166,60,.2)'; g.strokeStyle = OURO2; g.lineWidth = 6
      g.beginPath(); g.moveTo(0, -120); g.lineTo(100, -80); g.quadraticCurveTo(100, 60, 0, 130); g.quadraticCurveTo(-100, 60, -100, -80); g.closePath(); g.fill(); g.stroke(); check(g, 6, 4, 90, OURO2, 1); g.restore()
      T(g, tx({ pt: 'ninguém legítimo pede a tua chave', en: 'no legit service asks for your key', es: 'nadie legítimo pide tu clave', fr: 'personne de légitime ne demande ta clé' }), 400, 545, 28, OURO2, 'center', 800)
    },
    // 5.2 pirâmides: a base cresce até não haver mais gente, e cai
    piramide(g, k) {
      const p = ciclo(k, 9), niv = Math.min(6, Math.floor(p / 0.1) + 1), cai = eo((p - 0.72) / 0.12)
      for (let l = 0; l < niv; l++) for (let i = 0; i <= l; i++) { const x = 400 + (i - l / 2) * 64, y = 90 + l * 66 + cai * (l + 1) * 60 * (i % 2 ? 1 : 1.3)
        g.globalAlpha = 1 - cai * 0.8; g.fillStyle = l < 2 ? OURO2 : 'rgba(143,136,122,.8)'; g.beginPath(); g.arc(x, y, 20, 0, 7); g.fill(); g.globalAlpha = 1 }
      T(g, tx({ pt: '«dobra o teu dinheiro»', en: '"double your money"', es: '«duplica tu dinero»', fr: '« double ton argent »' }), 400, 530, 34, cai > 0.3 ? VERM : TINTA, 'center', 800)
    },
    // 5.3 phishing e aprovações: anzol a puxar um link falso
    anzol(g, k) {
      const p = ciclo(k, 6), y = lp(40, 250, eio(cl(p / 0.4))) - eo((p - 0.7) / 0.2) * 220
      g.strokeStyle = CINZA; g.lineWidth = 3; g.beginPath(); g.moveTo(400, 0); g.lineTo(400, y); g.stroke()
      g.strokeStyle = OURO2; g.lineWidth = 8; g.beginPath(); g.moveTo(400, y); g.lineTo(400, y + 60); g.arc(370, y + 60, 30, 0, Math.PI * 0.95); g.stroke()
      caixa(g, 190, y + 110, 420, 70, 35, 'rgba(255,90,79,.7)', 'rgba(60,20,18,.9)'); T(g, 'metamask-app0rov3.io', 400, y + 145, 26, TINTA, 'center', 700, 'mono')
      T(g, tx({ pt: 'lê o endereço · revoga aprovações', en: 'read the address · revoke approvals', es: 'lee la dirección · revoca aprobaciones', fr: 'lis l’adresse · révoque les approbations' }), 400, 540, 28, OURO2, 'center', 800)
    },
    // 5.4 a checklist dos 10 pontos
    lista10(g, k) {
      for (let i = 0; i < 10; i++) { const c = i % 2, r = Math.floor(i / 2), x = 150 + c * 280, y = 90 + r * 88, q = cl((k - 0.4 - i * 0.45) / 0.4)
        caixa(g, x, y, 60, 60, 14, OURO, q > 0.5 ? 'rgba(210,166,60,.9)' : 'rgba(25,22,16,.95)'); if (q > 0.5) check(g, x + 32, y + 30, 44, '#111', cl((q - 0.5) * 2))
        T(g, String(i + 1).padStart(2, '0'), x + 90, y + 30, 32, q > 0.5 ? OURO2 : CINZA, 'left', 400, 'anton') }
      T(g, tx({ pt: '10 pontos antes de enviar um cêntimo', en: '10 checks before sending a cent', es: '10 puntos antes de enviar un céntimo', fr: '10 points avant d’envoyer un centime' }), 400, 560, 28, OURO2, 'center', 800)
    },
    // 6.2 halving: relógio da emissão, a recompensa a cair para metade
    halving(g, k) {
      const rec = ['50', '25', '12,5', '6,25', '3,125'], i = Math.floor(k / 2.2) % rec.length, a = (k % 2.2) / 2.2
      for (let s = 0; s < 4; s++) { g.strokeStyle = s <= i - 1 ? OURO : 'rgba(210,166,60,.2)'; g.lineWidth = 34; g.beginPath(); g.arc(400, 270, 190, -Math.PI / 2 + s * Math.PI / 2 + 0.04, -Math.PI / 2 + (s + 1) * Math.PI / 2 - 0.04); g.stroke() }
      g.strokeStyle = OURO2; g.lineWidth = 8; g.beginPath(); g.moveTo(400, 270); const ang = -Math.PI / 2 + (i + a) * Math.PI / 2; g.lineTo(400 + Math.cos(ang) * 150, 270 + Math.sin(ang) * 150); g.stroke()
      T(g, rec[i] + ' ₿', 400, 270 + 20 * (1 - eo(a / 0.3)), 76, OURO2, 'center', 400, 'anton')
      T(g, tx({ pt: 'recompensa por bloco · ~4 anos', en: 'block reward · ~4 years', es: 'recompensa por bloque · ~4 años', fr: 'récompense par bloc · ~4 ans' }), 400, 530, 28, TINTA, 'center', 700)
    },
    // 6.3 ciclos: onda com as fases, a bola a percorrê-la
    ciclos(g, k) {
      const Y = x => 300 - Math.sin((x - 80) / 640 * Math.PI * 2 - 0.6) * 150
      g.strokeStyle = 'rgba(210,166,60,.4)'; g.lineWidth = 5; g.beginPath(); for (let x = 80; x <= 720; x += 4) x === 80 ? g.moveTo(x, Y(x)) : g.lineTo(x, Y(x)); g.stroke()
      const fases = [[tx({ pt: 'acumulação', en: 'accumulation', es: 'acumulación', fr: 'accumulation' }), 140], [tx({ pt: 'subida', en: 'markup', es: 'subida', fr: 'hausse' }), 280], [tx({ pt: 'euforia', en: 'euphoria', es: 'euforia', fr: 'euphorie' }), 420], [tx({ pt: 'queda', en: 'decline', es: 'caída', fr: 'baisse' }), 600]]
      fases.forEach(([nm, x]) => T(g, nm, x, Y(x) + (Y(x) < 300 ? -44 : 44), 22, CINZA, 'center', 700, 'mono'))
      const bx = 80 + ciclo(k, 8) * 640; brilho(g, bx, Y(bx), 70); g.fillStyle = OURO2; g.beginPath(); g.arc(bx, Y(bx), 16, 0, 7); g.fill()
      T(g, tx({ pt: 'ler sem adivinhar', en: 'read without guessing', es: 'leer sin adivinar', fr: 'lire sans deviner' }), 400, 540, 30, OURO2, 'center', 800)
    },
    // 6.4 o teu plano: calendário de sextas com o reforço marcado
    sextas(g, k) {
      const dias = tx({ pt: ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'], en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'] })
      dias.forEach((d, i) => T(g, d, 160 + i * 80, 90, 24, i === 4 ? OURO2 : CINZA, 'center', 800, 'mono'))
      for (let s = 0; s < 4; s++) for (let i = 0; i < 7; i++) { const x = 125 + i * 80, y = 120 + s * 90, sexta = i === 4, q = sexta ? eo((k - 0.5 - s * 0.9) / 0.4) : 0
        caixa(g, x, y, 70, 76, 12, sexta ? OURO : 'rgba(210,166,60,.18)', sexta && q > 0 ? `rgba(210,166,60,${0.85 * q})` : 'rgba(255,255,255,.03)'); if (sexta && q > 0) moeda(g, x + 35, y + 38, 22 * q, '€') }
      T(g, tx({ pt: 'todas as sextas · valor fixo', en: 'every Friday · fixed amount', es: 'todos los viernes · importe fijo', fr: 'chaque vendredi · montant fixe' }), 400, 540, 30, OURO2, 'center', 800)
    },
    // 7.1 / 9.4 etiquetas do DCA Inteligente em barras que respiram com a variação do dia
    etiq(g, k) {
      const v = Math.sin(k * 0.7) * 9, nomes = [tx({ pt: 'Forte Compra', en: 'Strong Buy', es: 'Compra Fuerte', fr: 'Achat Fort' }), tx({ pt: 'Compra', en: 'Buy', es: 'Compra', fr: 'Achat' }), tx({ pt: 'Aguardar', en: 'Wait', es: 'Esperar', fr: 'Attendre' }), tx({ pt: 'Não Reforçar', en: 'Do Not Add', es: 'No Reforzar', fr: 'Ne Pas Renforcer' })]
      const at = v <= -8 ? 0 : v <= -4 ? 1 : v <= 1.5 ? 2 : 3, mult = [2, 1.5, 0.5, 0]
      T(g, (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', L() === 'en' ? '.' : ',') + ' %', 400, 90, 64, v < 0 ? VERM : VERDE, 'center', 400, 'anton')
      nomes.forEach((nm, i) => { const y = 170 + i * 88, on = i === at; caixa(g, 110, y, 580, 70, 16, on ? OURO2 : 'rgba(210,166,60,.2)', on ? 'rgba(210,166,60,.18)' : 'rgba(255,255,255,.02)')
        T(g, nm, 140, y + 35, 28, on ? OURO2 : CINZA, 'left', 800); g.fillStyle = on ? OURO : 'rgba(210,166,60,.25)'; RR(g, 470, y + 22, 180 * mult[i] / 2, 26, 13); g.fill() })
      tag(g)
    },
    // 7.2 / 8.4 a app no telemóvel (sem inventar ecrãs: cartões genéricos)
    telemovel(g, k) {
      g.save(); g.translate(400, 300); g.rotate(Math.sin(k * 0.6) * 0.06); caixa(g, -150, -270, 300, 540, 44, OURO, '#0f0e0b'); g.fillStyle = '#000'; RR(g, -40, -258, 80, 18, 9); g.fill()
      T(g, 'MTM System', 0, -205, 26, OURO2, 'center', 800)
      const cs = [tx({ pt: 'Portefólios', en: 'Portfolios', es: 'Portafolios', fr: 'Portefeuilles' }), tx({ pt: 'Análise DCA', en: 'DCA Analysis', es: 'Análisis DCA', fr: 'Analyse DCA' }), tx({ pt: 'Alertas DCA', en: 'DCA alerts', es: 'Alertas DCA', fr: 'Alertes DCA' })]
      cs.forEach((c, i) => { const q = eo((k - 0.4 - i * 0.6) / 0.5); g.globalAlpha = q; caixa(g, -120, -160 + i * 130 + (1 - q) * 40, 240, 110, 18, 'rgba(210,166,60,.4)', 'rgba(210,166,60,.08)'); T(g, c, 0, -105 + i * 130 + (1 - q) * 40, 24, TINTA, 'center', 700); g.globalAlpha = 1 })
      g.restore()
    },
    // 7.3 / 8.1 / 8.2 portefólio: anel com núcleo e satélites
    portefolio(g, k) {
      const fat = [[0.5, OURO2, 'BTC'], [0.25, OURO, 'ETH'], [0.15, FRIO, tx({ pt: 'estáveis', en: 'stables', es: 'estables', fr: 'stables' })], [0.1, CINZA, tx({ pt: 'satélites', en: 'satellites', es: 'satélites', fr: 'satellites' })]]
      let a0 = -Math.PI / 2; const tot = eo(k / 2.5)
      fat.forEach(([f, cor, nm], i) => { const a1 = a0 + f * Math.PI * 2 * tot, mid = (a0 + a1) / 2, ex = i === Math.floor(k / 2.5) % 4 ? 14 : 0
        g.strokeStyle = cor; g.lineWidth = 70; g.beginPath(); g.arc(320 + Math.cos(mid) * ex, 290 + Math.sin(mid) * ex, 170, a0 + 0.02, a1 - 0.02); g.stroke()
        if (tot > 0.95) { T(g, nm, 560, 180 + i * 64, 24, cor, 'left', 800); T(g, Math.round(f * 100) + ' %', 790, 180 + i * 64, 24, TINTA, 'right', 700, 'mono') } a0 = a1 })
      T(g, tx({ pt: 'núcleo', en: 'core', es: 'núcleo', fr: 'noyau' }), 320, 290, 34, TINTA, 'center', 400, 'anton'); tag(g)
    },
    // 7.4 / 9.1 Momentum: histograma por baixo de uma linha de preço
    momentum(g, k) {
      const v = serie(5, 60, 0.15), ate = cl(0.3 + k / 8), { n } = linhaSerie(g, v, 80, 80, 640, 240, ate)
      for (let i = 1; i < n; i++) { const m = (v[i] - v[Math.max(0, i - 5)]) / v[i] * 100, h = m * 20; g.fillStyle = m >= 0 ? 'rgba(62,207,142,.8)' : 'rgba(255,90,79,.8)'; g.fillRect(80 + i / 59 * 640 - 4, 440 - Math.max(0, h), 8, Math.abs(h)) }
      g.strokeStyle = 'rgba(143,136,122,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(80, 440); g.lineTo(720, 440); g.stroke()
      T(g, 'Momentum', 80, 370, 24, CINZA, 'left', 700, 'mono'); T(g, tx({ pt: 'escolhe o tamanho, não o dia', en: 'choose the size, not the day', es: 'elige el tamaño, no el día', fr: 'choisis la taille, pas le jour' }), 400, 545, 28, OURO2, 'center', 800); tag(g)
    },
    // 7.5 / 9.2 DEFY: o preço estica para longe da média e a faixa acende
    defy(g, k) {
      const v = serie(9, 70, 0.35, 2.8), ate = cl(0.25 + k / 8), lo = Math.min(...v), hi = Math.max(...v), Y = p => 80 + (hi - p) / (hi - lo) * 330, n = Math.max(2, Math.floor(v.length * ate))
      const med = v.map((_, i) => { const a = v.slice(Math.max(0, i - 15), i + 1); return a.reduce((s, x) => s + x, 0) / a.length })
      g.fillStyle = 'rgba(210,166,60,.12)'; g.beginPath(); med.slice(0, n).forEach((m, i) => { const x = 80 + i / 69 * 640; i ? g.lineTo(x, Y(m * 1.06)) : g.moveTo(x, Y(m * 1.06)) }); for (let i = n - 1; i >= 0; i--) g.lineTo(80 + i / 69 * 640, Y(med[i] * 0.94)); g.fill()
      linhaSerie(g, v, 80, 80, 640, 330, ate, OURO2, 4)
      const i = n - 1, est = v[i] / med[i] - 1; if (est > 0.06) { const x = 80 + i / 69 * 640; brilho(g, x, Y(v[i]), 90, 0.5); T(g, tx({ pt: 'esticado', en: 'stretched', es: 'estirado', fr: 'étiré' }), x - 10, Y(v[i]) - 40, 24, VERM, 'right', 800) }
      T(g, 'DEFY', 80, 470, 26, CINZA, 'left', 700, 'mono'); T(g, tx({ pt: 'segunda opinião', en: 'second opinion', es: 'segunda opinión', fr: 'second avis' }), 400, 545, 28, OURO2, 'center', 800); tag(g)
    },
    // 7.6 / 14.4 ritual: anel de 15 minutos e três passos
    ritual(g, k) {
      const min = s => tx({ pt: s + ' min', en: s + ' min', es: s + ' min', fr: s + ' min' })
      const p = cl(k / 10); g.strokeStyle = 'rgba(210,166,60,.18)'; g.lineWidth = 26; g.beginPath(); g.arc(230, 280, 150, 0, 7); g.stroke()
      g.strokeStyle = OURO2; g.beginPath(); g.arc(230, 280, 150, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.stroke(); T(g, min(Math.round(15 * p)), 230, 280, 60, TINTA, 'center', 400, 'anton')
      const ps = [tx({ pt: 'ler a etiqueta', en: 'read the label', es: 'leer la etiqueta', fr: 'lire l’étiquette' }), tx({ pt: 'reforçar', en: 'top up', es: 'reforzar', fr: 'renforcer' }), tx({ pt: 'registar', en: 'log it', es: 'registrar', fr: 'noter' })]
      ps.forEach((t, i) => { const q = cl((p - 0.15 - i * 0.28) / 0.1); caixa(g, 430, 170 + i * 90, 52, 52, 12, OURO, q > 0.5 ? OURO : 'transparent'); if (q > 0.5) check(g, 457, 196 + i * 90, 38, '#111', 1); T(g, t, 500, 196 + i * 90, 28, q > 0.5 ? TINTA : CINZA, 'left', 700) })
      T(g, tx({ pt: 'sexta-feira', en: 'Friday', es: 'viernes', fr: 'vendredi' }), 230, 480, 26, CINZA, 'center', 700, 'mono')
    },
    // 8.3 reequilíbrio: barras voltam ao alvo, o excedente cai no pote
    rebalance(g, k) {
      const p = eio(cl((k - 1) / 3)), alvo = [0.5, 0.3, 0.2], agora = [0.62, 0.24, 0.14]
      alvo.forEach((a, i) => { const x = 140 + i * 160, h = lp(agora[i], a, p) * 600; g.strokeStyle = 'rgba(233,196,106,.6)'; g.setLineDash([8, 6]); g.lineWidth = 3; g.beginPath(); g.moveTo(x - 10, 470 - a * 600); g.lineTo(x + 110, 470 - a * 600); g.stroke(); g.setLineDash([])
        g.fillStyle = [OURO2, OURO, FRIO][i]; RR(g, x, 470 - h, 100, h, 10); g.fill(); T(g, ['BTC', 'ETH', tx({ pt: 'estáveis', en: 'stables', es: 'estables', fr: 'stables' })][i], x + 50, 500, 22, TINTA, 'center', 700) })
      g.strokeStyle = OURO; g.lineWidth = 5; g.beginPath(); g.moveTo(610, 330); g.lineTo(620, 470); g.lineTo(720, 470); g.lineTo(730, 330); g.stroke(); g.fillStyle = 'rgba(210,166,60,.5)'; g.fillRect(622, 470 - p * 80, 96, p * 80)
      T(g, tx({ pt: 'pote', en: 'pot', es: 'bote', fr: 'réserve' }), 670, 300, 24, OURO2, 'center', 800); tag(g)
    },
    // 9.3 sentimento: medidor de medo ↔ euforia
    sentimento(g, k) {
      const v = (Math.sin(k * 0.8) + 1) / 2, ang = Math.PI + v * Math.PI
      for (let i = 0; i < 20; i++) { const a = Math.PI + i / 20 * Math.PI, c = i < 7 ? VERM : i > 13 ? VERDE : OURO; g.strokeStyle = c; g.globalAlpha = 0.35 + (Math.abs(i / 19 - v) < 0.08 ? 0.65 : 0); g.lineWidth = 40; g.beginPath(); g.arc(400, 380, 240, a + 0.01, a + Math.PI / 20 - 0.01); g.stroke() }
      g.globalAlpha = 1; g.strokeStyle = TINTA; g.lineWidth = 8; g.beginPath(); g.moveTo(400, 380); g.lineTo(400 + Math.cos(ang) * 200, 380 + Math.sin(ang) * 200); g.stroke(); g.fillStyle = TINTA; g.beginPath(); g.arc(400, 380, 18, 0, 7); g.fill()
      T(g, tx({ pt: 'medo', en: 'fear', es: 'miedo', fr: 'peur' }), 160, 430, 30, VERM, 'center', 800); T(g, tx({ pt: 'euforia', en: 'euphoria', es: 'euforia', fr: 'euphorie' }), 640, 430, 30, VERDE, 'center', 800)
      T(g, tx({ pt: 'medo = reforço maior · euforia = travar', en: 'fear = bigger top-up · euphoria = slow down', es: 'miedo = refuerzo mayor · euforia = frenar', fr: 'peur = renfort plus grand · euphorie = freiner' }), 400, 530, 24, OURO2, 'center', 700)
    },
    // 10.1 / 12.4 realizar por degraus
    escada(g, k) {
      const passos = ['1:1,5', '1:3', '1:6']; for (let i = 0; i < 3; i++) { const q = eo((k - 0.5 - i * 1.1) / 0.6), x = 120 + i * 200, y = 430 - i * 110
        g.globalAlpha = q; g.fillStyle = 'rgba(210,166,60,.25)'; g.fillRect(x, y, 200, 470 - y + 40); g.fillStyle = OURO; g.fillRect(x, y, 200, 10); T(g, passos[i], x + 100, y + 50, 34, OURO2, 'center', 800, 'mono')
        T(g, tx({ pt: 'parcial ', en: 'partial ', es: 'parcial ', fr: 'partielle ' }) + (i + 1), x + 100, y + 96, 20, TINTA, 'center', 600); g.globalAlpha = 1 }
      const i = Math.min(2, Math.floor(k / 1.4) % 4); if (i < 3) { brilho(g, 220 + i * 200, 430 - i * 110 - 20, 60); g.fillStyle = OURO2; g.beginPath(); g.arc(220 + i * 200, 430 - i * 110 - 22, 14, 0, 7); g.fill() }
      T(g, tx({ pt: 'regras escritas antes', en: 'rules written in advance', es: 'reglas escritas antes', fr: 'règles écrites avant' }), 400, 560, 28, OURO2, 'center', 800); tag(g)
    },
    // 10.2 crash: a linha cai, o plano escrito vai-se cumprindo
    crash(g, k) {
      const v = serie(21, 60, 0.3).map((x, i) => i > 32 ? x * (1 - Math.min(0.45, (i - 32) * 0.03)) : x); linhaSerie(g, v, 60, 70, 380, 300, cl(0.4 + k / 6), VERM, 4)
      caixa(g, 470, 90, 280, 330, 18, OURO, 'rgba(25,22,16,.95)'); T(g, tx({ pt: 'plano', en: 'plan', es: 'plan', fr: 'plan' }), 610, 125, 26, OURO2, 'center', 800)
      ;[tx({ pt: 'não vender em pânico', en: 'no panic selling', es: 'no vender en pánico', fr: 'pas de vente panique' }), tx({ pt: 'usar o pote', en: 'use the pot', es: 'usar el bote', fr: 'utiliser la réserve' }), tx({ pt: 'manter o DCA', en: 'keep the DCA', es: 'mantener el DCA', fr: 'garder le DCA' })].forEach((t, i) => { const q = cl((k - 2 - i * 1) / 0.5); caixa(g, 490, 170 + i * 80, 40, 40, 10, OURO, q > 0.5 ? OURO : 'transparent'); if (q > 0.5) check(g, 510, 190 + i * 80, 30, '#111', 1); T(g, t, 545, 190 + i * 80, 20, TINTA, 'left', 600) })
      T(g, tx({ pt: 'decidido com a cabeça fria', en: 'decided with a cool head', es: 'decidido con la cabeza fría', fr: 'décidé à tête reposée' }), 400, 520, 28, OURO2, 'center', 800); tag(g)
    },
    // 10.3 segurança avançada: cofre com o disco a rodar
    cofre(g, k) {
      caixa(g, 200, 90, 400, 400, 30, OURO, 'rgba(35,30,20,.98)'); g.strokeStyle = 'rgba(210,166,60,.35)'; g.lineWidth = 4; RR(g, 225, 115, 350, 350, 20); g.stroke()
      g.save(); g.translate(400, 290); g.rotate(Math.sin(k * 1.2) * 2.5); g.strokeStyle = OURO2; g.lineWidth = 10; g.beginPath(); g.arc(0, 0, 90, 0, 7); g.stroke()
      for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; g.lineWidth = i % 6 ? 2 : 5; g.beginPath(); g.moveTo(Math.cos(a) * 70, Math.sin(a) * 70); g.lineTo(Math.cos(a) * 82, Math.sin(a) * 82); g.stroke() } g.fillStyle = OURO2; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill(); g.restore()
      g.fillStyle = OURO; RR(g, 560, 250, 22, 80, 8); g.fill()
      T(g, tx({ pt: 'metal · lugares diferentes · passphrase', en: 'metal · separate places · passphrase', es: 'metal · lugares distintos · passphrase', fr: 'métal · lieux séparés · passphrase' }), 400, 545, 26, OURO2, 'center', 800)
    },
    // 10.4 herança: o envelope selado e quem o vai abrir
    heranca(g, k) {
      const q = eo(k / 1.5); caixa(g, 250, 160, 300, 200, 10, OURO, 'rgba(233,220,190,.95)'); g.strokeStyle = '#8a6a1e'; g.lineWidth = 4; g.beginPath(); g.moveTo(250, 160); g.lineTo(400, 270); g.lineTo(550, 160); g.stroke()
      g.fillStyle = VERM; g.beginPath(); g.arc(400, 270, 30 * q, 0, 7); g.fill(); T(g, 'MTM', 400, 272, 16 * q, '#fff', 'center', 800)
      ;[[200, 470], [400, 490], [600, 470]].forEach(([x, y], i) => { const a = eo((k - 1 - i * 0.6) / 0.5); g.globalAlpha = a; g.fillStyle = 'rgba(243,237,225,.8)'; g.beginPath(); g.arc(x, y - 30, 22, 0, 7); g.fill(); g.beginPath(); g.ellipse(x, y + 18, 34, 22, 0, Math.PI, 0); g.fill()
        g.strokeStyle = 'rgba(233,196,106,.5)'; g.setLineDash([6, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo(400, 360); g.lineTo(x, y - 60); g.stroke(); g.setLineDash([]); g.globalAlpha = 1 })
      T(g, tx({ pt: 'instruções, não a seed', en: 'instructions, not the seed', es: 'instrucciones, no la seed', fr: 'des instructions, pas la seed' }), 400, 100, 28, OURO2, 'center', 800)
    },
    // 11.1 perpétuos: long/short e o relógio do funding
    perpetuo(g, k) {
      const p = ciclo(k, 4); seta(g, 180, 420, 180, 160 - Math.sin(k * 2) * 10, VERDE, 12); T(g, 'LONG', 180, 470, 40, VERDE, 'center', 400, 'anton')
      seta(g, 620, 160, 620, 420 + Math.sin(k * 2) * 10, VERM, 12); T(g, 'SHORT', 620, 470, 40, VERM, 'center', 400, 'anton')
      g.strokeStyle = 'rgba(210,166,60,.25)'; g.lineWidth = 14; g.beginPath(); g.arc(400, 290, 90, 0, 7); g.stroke(); g.strokeStyle = OURO2; g.beginPath(); g.arc(400, 290, 90, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.stroke()
      T(g, 'funding', 400, 280, 26, OURO2, 'center', 800, 'mono'); T(g, '8 h', 400, 314, 24, CINZA, 'center', 700, 'mono')
      if (p > 0.92) { brilho(g, 400, 290, 140, 0.4); seta(g, 260, 240, 540, 240, OURO2, 4) }
    },
    // 11.2 margem isolada vs cruzada
    margem(g, k) {
      const a = eo(k / 1.2); g.globalAlpha = a
      T(g, tx({ pt: 'isolada', en: 'isolated', es: 'aislado', fr: 'isolée' }), 220, 110, 32, OURO2, 'center', 800)
      ;[0, 1, 2].forEach(i => { caixa(g, 100 + i * 85, 150, 70, 260, 12, OURO); const h = 120 + i * 40 + Math.sin(k + i) * 20; g.fillStyle = i === 2 && Math.sin(k) > 0.6 ? VERM : OURO; RR(g, 104 + i * 85, 406 - h, 62, h, 8); g.fill() })
      T(g, tx({ pt: 'cruzada', en: 'cross', es: 'cruzado', fr: 'croisée' }), 580, 110, 32, OURO2, 'center', 800); caixa(g, 450, 150, 260, 260, 12, OURO)
      const h = 200 + Math.sin(k * 0.8) * 50; g.fillStyle = Math.sin(k * 0.8) < -0.7 ? VERM : OURO; RR(g, 454, 406 - h, 252, h, 8); g.fill()
      T(g, tx({ pt: 'uma perda fica na caixa dela', en: 'a loss stays in its own box', es: 'una pérdida se queda en su caja', fr: 'une perte reste dans sa case' }), 220, 460, 18, TINTA, 'center', 600)
      T(g, tx({ pt: 'uma perda come tudo', en: 'a loss eats everything', es: 'una pérdida se come todo', fr: 'une perte mange tout' }), 580, 460, 18, VERM, 'center', 600); g.globalAlpha = 1
    },
    // 11.3 liquidação: o preço aproxima-se da linha vermelha
    liquidacao(g, k) {
      const liq = 400, v = serie(33, 80, -0.25, 2.4), ate = cl(0.2 + k / 9), lo = Math.min(...v) * 0.97, hi = Math.max(...v), Y = p => 90 + (hi - p) / (hi - lo) * 340, n = Math.max(2, Math.floor(v.length * ate))
      g.fillStyle = 'rgba(255,90,79,.12)'; g.fillRect(60, liq, 680, 530 - liq); g.strokeStyle = VERM; g.lineWidth = 4; g.setLineDash([14, 8]); g.beginPath(); g.moveTo(60, liq); g.lineTo(740, liq); g.stroke(); g.setLineDash([])
      T(g, tx({ pt: 'liquidação', en: 'liquidation', es: 'liquidación', fr: 'liquidation' }), 740, liq + 30, 24, VERM, 'right', 800)
      g.strokeStyle = OURO2; g.lineWidth = 4; g.beginPath(); for (let i = 0; i < n; i++) { const x = 60 + i / 79 * 680; i ? g.lineTo(x, Y(v[i])) : g.moveTo(x, Y(v[i])) } g.stroke()
      const y = Y(v[n - 1]), dist = Math.max(0, liq - y); g.strokeStyle = 'rgba(243,237,225,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(60 + (n - 1) / 79 * 680, y); g.lineTo(60 + (n - 1) / 79 * 680, liq); g.stroke()
      if (dist < 60) brilho(g, 60 + (n - 1) / 79 * 680, liq, 120, 0.5); tag(g)
    },
    // 11.4 custos: a pilha de moedas vai sendo comida por pingos de taxa
    taxas(g, k) {
      const n = Math.max(3, 12 - Math.floor(k / 0.9)); for (let i = 0; i < n; i++) { const y = 470 - i * 26; g.fillStyle = '#8a6a1e'; g.beginPath(); g.ellipse(400, y + 8, 90, 26, 0, 0, 7); g.fill(); g.fillRect(310, y - 4, 180, 12); g.fillStyle = i === n - 1 ? OURO2 : OURO; g.beginPath(); g.ellipse(400, y - 4, 90, 26, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(80,60,10,.6)'; g.lineWidth = 3; g.stroke() }
      for (let i = 0; i < 4; i++) { const p = ciclo(k + i * 0.4, 1.6), y = lp(470 - n * 26, 560, p); g.fillStyle = `rgba(255,90,79,${1 - p})`; g.beginPath(); g.arc(560 + i * 30, y, 9, 0, 7); g.fill() }
      ;['funding', 'spread', tx({ pt: 'comissões', en: 'fees', es: 'comisiones', fr: 'frais' })].forEach((t, i) => T(g, t, 130, 200 + i * 70, 28, VERM, 'left', 800, 'mono'))
      T(g, tx({ pt: 'o custo real come o resultado', en: 'real cost eats the result', es: 'el coste real se come el resultado', fr: 'le coût réel mange le résultat' }), 400, 565, 26, OURO2, 'center', 800)
    },
    // 11.5 alavanca: o multiplicador muda, o risco certo não
    alavanca(g, k) {
      const m = [1, 3, 10][Math.floor(k / 2.5) % 3], ang = -0.08 * (m === 1 ? 0 : m === 3 ? 1 : 2.5)
      g.fillStyle = OURO; g.beginPath(); g.moveTo(400, 360); g.lineTo(350, 440); g.lineTo(450, 440); g.fill()
      g.save(); g.translate(400, 350); g.rotate(ang); g.fillStyle = OURO2; RR(g, -300, -10, 600, 20, 10); g.fill(); moeda(g, -260, -50, 38, '€'); g.restore()
      T(g, m + '×', 400, 140, 110, OURO2, 'center', 400, 'anton')
      caixa(g, 200, 480, 400, 50, 25); g.fillStyle = OURO; RR(g, 204, 484, 392 * 0.25, 42, 21); g.fill()
      T(g, tx({ pt: 'risco por operação: igual', en: 'risk per trade: unchanged', es: 'riesgo por operación: igual', fr: 'risque par trade : inchangé' }), 400, 570, 24, TINTA, 'center', 700)
    },
    // 12.5 / 13.4 semáforo: regras de paragem
    semaforo(g, k) {
      caixa(g, 310, 70, 180, 440, 40, OURO, '#141210'); const on = Math.floor(k / 2) % 3
      ;[VERM, OURO2, VERDE].forEach((c, i) => { g.fillStyle = c; g.globalAlpha = i === on ? 1 : 0.18; g.beginPath(); g.arc(400, 150 + i * 140, 55, 0, 7); g.fill(); if (i === on) brilho(g, 400, 150 + i * 140, 140, 0.4); g.globalAlpha = 1 })
      const ls = [tx({ pt: 'sem sinal: não entro', en: 'no signal: no trade', es: 'sin señal: no entro', fr: 'pas de signal : je n’entre pas' }), tx({ pt: 'limite diário: paro', en: 'daily limit: I stop', es: 'límite diario: paro', fr: 'limite du jour : j’arrête' }), tx({ pt: 'plano cumprido: sigo', en: 'plan followed: carry on', es: 'plan cumplido: sigo', fr: 'plan suivi : je continue' })]
      T(g, ls[on], 400, 560, 28, [VERM, OURO2, VERDE][on], 'center', 800)
    },
    // 13.1 risco de 1 %: a fatia de uma tarte
    risco1(g, k) {
      g.fillStyle = 'rgba(210,166,60,.2)'; g.beginPath(); g.arc(300, 290, 190, 0, 7); g.fill()
      const sep = eo((k - 1) / 0.8) * 50; g.fillStyle = OURO2; g.beginPath(); g.moveTo(300 + sep, 290 - sep * 0.2); g.arc(300 + sep, 290 - sep * 0.2, 190, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.01 * 4); g.closePath(); g.fill(); brilho(g, 330 + sep, 120, 80)
      T(g, '1 %', 600, 210, 110, OURO2, 'center', 400, 'anton'); T(g, '1 000 € → 10 €', 600, 330, 36, TINTA, 'center', 700, 'mono')
      T(g, tx({ pt: 'máximo em risco por operação', en: 'max at risk per trade', es: 'máximo en riesgo por operación', fr: 'max en risque par trade' }), 600, 390, 22, CINZA, 'center', 600); tag(g)
    },
    // 13.2 tamanho de posição: a fórmula a resolver-se
    tamanho(g, k) {
      const r = eo(k / 1), d = eo((k - 1.2) / 1), s = eo((k - 2.6) / 1)
      g.globalAlpha = r; caixa(g, 80, 160, 190, 130, 18); T(g, '10 €', 175, 210, 44, OURO2, 'center', 400, 'anton'); T(g, tx({ pt: 'risco', en: 'risk', es: 'riesgo', fr: 'risque' }), 175, 262, 20, CINZA, 'center', 700)
      g.globalAlpha = d; T(g, '÷', 310, 225, 60, TINTA, 'center', 800); caixa(g, 350, 160, 190, 130, 18); T(g, '2 %', 445, 210, 44, OURO2, 'center', 400, 'anton'); T(g, tx({ pt: 'até ao stop', en: 'to the stop', es: 'hasta el stop', fr: 'jusqu’au stop' }), 445, 262, 20, CINZA, 'center', 700)
      g.globalAlpha = s; T(g, '=', 580, 225, 60, TINTA, 'center', 800); brilho(g, 660, 225, 140 * s); T(g, '500 €', 680, 225, 56, OURO2, 'center', 400, 'anton')
      T(g, tx({ pt: 'tamanho da posição', en: 'position size', es: 'tamaño de la posición', fr: 'taille de position' }), 680, 280, 20, CINZA, 'center', 700); g.globalAlpha = 1
      T(g, tx({ pt: 'o stop decide o tamanho, não a vontade', en: 'the stop sets the size, not the mood', es: 'el stop decide el tamaño, no las ganas', fr: 'le stop décide la taille, pas l’envie' }), 400, 450, 28, TINTA, 'center', 700); tag(g)
    },
    // 13.3 painel da conta: três medidores
    painel(g, k) {
      const ms = [[tx({ pt: 'alavancagem útil', en: 'useful leverage', es: 'apalancamiento útil', fr: 'levier utile' }), 0.35, '3,5×'], ['notional', 0.6, '3 500 €'], [tx({ pt: 'custo fees', en: 'fee cost', es: 'coste fees', fr: 'coût des frais' }), 0.15, '2,1 €']]
      ms.forEach(([nm, v, lab], i) => { const x = 150 + i * 250, q = eo((k - i * 0.5) / 1.2) * v; g.strokeStyle = 'rgba(210,166,60,.2)'; g.lineWidth = 22; g.beginPath(); g.arc(x, 280, 90, Math.PI * 0.75, Math.PI * 2.25); g.stroke()
        g.strokeStyle = OURO2; g.beginPath(); g.arc(x, 280, 90, Math.PI * 0.75, Math.PI * 0.75 + q * Math.PI * 1.5); g.stroke(); T(g, lab, x, 280, 30, TINTA, 'center', 400, 'anton'); T(g, nm, x, 400, 20, CINZA, 'center', 700) })
      T(g, tx({ pt: 'risco % por operação, à vista', en: 'risk % per trade, in sight', es: 'riesgo % por operación, a la vista', fr: 'risque % par trade, sous les yeux' }), 400, 520, 28, OURO2, 'center', 800); tag(g)
    },
    // 14.2 MTM Auto: mestre → contas com limites
    copia(g, k) {
      caixa(g, 310, 80, 180, 90, 18, OURO2, 'rgba(210,166,60,.2)'); T(g, tx({ pt: 'estratégia', en: 'strategy', es: 'estrategia', fr: 'stratégie' }), 400, 125, 26, OURO2, 'center', 800)
      ;[160, 400, 640].forEach((x, i) => { g.strokeStyle = 'rgba(233,196,106,.5)'; g.lineWidth = 3; g.setLineDash([10, 8]); g.lineDashOffset = -k * 30; g.beginPath(); g.moveTo(400, 170); g.lineTo(x, 330); g.stroke(); g.setLineDash([])
        const p = ciclo(k + i * 0.3, 2); g.fillStyle = OURO2; g.beginPath(); g.arc(lp(400, x, p), lp(170, 330, p), 8, 0, 7); g.fill()
        caixa(g, x - 90, 330, 180, 110, 18); T(g, tx({ pt: 'conta ', en: 'account ', es: 'cuenta ', fr: 'compte ' }) + (i + 1), x, 368, 22, TINTA, 'center', 700); T(g, tx({ pt: 'limite ', en: 'limit ', es: 'límite ', fr: 'limite ' }) + ['1 %', '0,5 %', '1 %'][i], x, 405, 18, CINZA, 'center', 700, 'mono') })
      T(g, tx({ pt: 'copiar com regras e limites', en: 'copy with rules and limits', es: 'copiar con reglas y límites', fr: 'copier avec règles et limites' }), 400, 520, 28, OURO2, 'center', 800)
    },
    // 14.3 diário de trading: as páginas enchem-se
    diario(g, k) {
      g.save(); g.translate(400, 300); g.rotate(-0.04); caixa(g, -280, -220, 560, 440, 14, OURO, 'rgba(240,232,215,.96)'); g.fillStyle = 'rgba(210,166,60,.7)'; g.fillRect(-4, -220, 8, 440)
      const cols = [tx({ pt: 'par', en: 'pair', es: 'par', fr: 'paire' }), tx({ pt: 'porquê', en: 'why', es: 'por qué', fr: 'pourquoi' }), 'R', tx({ pt: 'emoção', en: 'emotion', es: 'emoción', fr: 'émotion' })]
      cols.forEach((c, i) => T(g, c, -250 + i * 135 + (i > 1 ? 30 : 0), -180, 18, '#6b5320', 'left', 800, 'mono'))
      for (let r = 0; r < 7; r++) { const q = cl((k - 0.5 - r * 0.6) / 0.5); g.strokeStyle = 'rgba(107,83,32,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-260, -150 + r * 50); g.lineTo(260, -150 + r * 50); g.stroke()
        if (q > 0) { g.fillStyle = 'rgba(60,45,20,.7)'; for (let i = 0; i < 4; i++) g.fillRect(-250 + i * 135 + (i > 1 ? 30 : 0), -132 + r * 50, (40 + ((r * 7 + i * 13) % 50)) * q, 8) } }
      g.restore()
    },
    // 14.5 psicologia: um batimento que acalma
    pulso(g, k) {
      const calma = cl(k / 8); g.strokeStyle = OURO2; g.lineWidth = 5; g.beginPath()
      for (let x = 40; x <= 760; x += 3) { const t = (x / 760 * 6 + k * 1.2) % 1, amp = lp(170, 50, calma) * (t > 0.45 && t < 0.55 ? Math.sin((t - 0.45) / 0.1 * Math.PI * 2) : 0) + Math.sin(x * 0.05 + k * 4) * lp(12, 2, calma); x === 40 ? g.moveTo(x, 270 - amp) : g.lineTo(x, 270 - amp) } g.stroke()
      T(g, Math.round(lp(118, 64, calma)) + ' bpm', 400, 440, 56, calma > 0.7 ? VERDE : VERM, 'center', 400, 'anton')
      T(g, tx({ pt: 'regras primeiro, emoção depois', en: 'rules first, emotion after', es: 'reglas primero, emoción después', fr: 'les règles d’abord, l’émotion après' }), 400, 530, 28, OURO2, 'center', 800)
    },
    // 15.1 impostos: o calendário dos 365 dias
    calendario(g, k) {
      const d = Math.min(365, Math.floor(k / 7 * 365))
      for (let i = 0; i < 365; i++) { const c = i % 26, r = Math.floor(i / 26), x = 88 + c * 24, y = 70 + r * 26; g.fillStyle = i < d ? (i >= 364 ? OURO2 : 'rgba(210,166,60,.55)') : 'rgba(210,166,60,.1)'; RR(g, x, y, 19, 20, 4); g.fill() }
      T(g, String(d), 400, 470, 76, d >= 365 ? OURO2 : TINTA, 'center', 400, 'anton'); T(g, tx({ pt: 'dias de detenção', en: 'days held', es: 'días de tenencia', fr: 'jours de détention' }), 400, 520, 24, CINZA, 'center', 700)
      if (d >= 365) T(g, tx({ pt: 'regra em Portugal · confirma com um contabilista', en: 'Portuguese rule · check with an accountant', es: 'regla en Portugal · confirma con un asesor', fr: 'règle au Portugal · vérifie avec un comptable' }), 400, 565, 20, OURO2, 'center', 700)
    },
    // 15.2 plano de 90 dias: três barras 30/60/90
    plano90(g, k) {
      ;[[tx({ pt: 'dias 1–30', en: 'days 1–30', es: 'días 1–30', fr: 'jours 1–30' }), tx({ pt: 'segurança e primeiro DCA', en: 'security and first DCA', es: 'seguridad y primer DCA', fr: 'sécurité et premier DCA' })], [tx({ pt: 'dias 31–60', en: 'days 31–60', es: 'días 31–60', fr: 'jours 31–60' }), tx({ pt: 'portefólio e ritual', en: 'portfolio and ritual', es: 'portafolio y ritual', fr: 'portefeuille et rituel' })], [tx({ pt: 'dias 61–90', en: 'days 61–90', es: 'días 61–90', fr: 'jours 61–90' }), tx({ pt: 'conta simulada e diário', en: 'simulated account and journal', es: 'cuenta simulada y diario', fr: 'compte simulé et journal' })]].forEach(([a, b], i) => {
        const q = eo((k - 0.4 - i * 1.3) / 1.1); caixa(g, 90, 110 + i * 140, 620, 100, 20); g.fillStyle = 'rgba(210,166,60,.35)'; RR(g, 92, 112 + i * 140, 616 * q, 96, 18); g.fill()
        T(g, a, 120, 145 + i * 140, 26, OURO2, 'left', 800, 'mono'); T(g, b, 120, 182 + i * 140, 24, TINTA, 'left', 600) })
    },
    // 15.3 revisão: 15 pontos que se ligam numa chave
    revisao(g, k) {
      const pts = [[200, 300], [240, 230], [310, 200], [380, 230], [410, 300], [380, 370], [310, 400], [240, 370], [470, 300], [530, 300], [590, 300], [650, 300], [590, 340], [650, 350], [700, 300]]
      const n = Math.min(15, Math.floor(k / 0.4)); g.strokeStyle = OURO2; g.lineWidth = 5; g.beginPath(); pts.slice(0, n).forEach(([x, y], i) => i ? (i === 8 ? (g.moveTo(410, 300), g.lineTo(x, y)) : i === 12 ? (g.moveTo(590, 300), g.lineTo(x, y)) : i === 13 ? (g.moveTo(650, 300), g.lineTo(x, y)) : i === 14 ? (g.moveTo(650, 300), g.lineTo(x, y)) : g.lineTo(x, y)) : g.moveTo(x, y)); if (n >= 8) g.lineTo(200, 300); g.stroke()
      pts.forEach(([x, y], i) => { g.fillStyle = i < n ? OURO2 : 'rgba(210,166,60,.2)'; g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill(); if (i < n) T(g, String(i + 1), x, y - 28, 16, CINZA, 'center', 700, 'mono') })
      if (n >= 15) brilho(g, 400, 300, 300, 0.25)
      T(g, tx({ pt: '15 módulos, uma chave', en: '15 modules, one key', es: '15 módulos, una llave', fr: '15 modules, une clé' }), 400, 520, 30, OURO2, 'center', 800)
    },
    // 15.4 certificado: o cartão com o selo a rodar
    certificado(g, k) {
      g.save(); g.translate(400, 290); g.rotate(Math.sin(k * 0.5) * 0.03); caixa(g, -300, -200, 600, 400, 14, OURO, 'rgba(20,18,14,.98)'); g.strokeStyle = 'rgba(210,166,60,.4)'; g.lineWidth = 2; RR(g, -280, -180, 560, 360, 8); g.stroke()
      T(g, tx({ pt: 'Certificado', en: 'Certificate', es: 'Certificado', fr: 'Certificat' }), 0, -120, 40, OURO2, 'center', 400, 'anton'); T(g, tx({ pt: 'A Primeira Chave', en: 'The First Key', es: 'La Primera Llave', fr: 'La Première Clé' }), 0, -70, 26, TINTA, 'center', 600)
      g.fillStyle = 'rgba(243,237,225,.2)'; RR(g, -180, -10, 360, 14, 7); g.fill(); RR(g, -120, 30, 240, 10, 5); g.fill()
      g.save(); g.translate(190, 120); g.rotate(k * 0.6); for (let i = 0; i < 16; i++) { g.rotate(Math.PI / 8); g.fillStyle = OURO; g.fillRect(-6, 38, 12, 16) } g.fillStyle = OURO2; g.beginPath(); g.arc(0, 0, 44, 0, 7); g.fill(); g.restore()
      g.fillStyle = '#fff'; g.fillRect(-250, 90, 60, 60); g.fillStyle = '#111'; for (let i = 0; i < 25; i++) if ((i * 7) % 3) g.fillRect(-246 + (i % 5) * 11, 94 + Math.floor(i / 5) * 11, 9, 9)
      g.restore()
      T(g, tx({ pt: '≥ 15 valores · validável por QR', en: '≥ 75 % · verifiable by QR', es: '≥ 15 sobre 20 · verificable por QR', fr: '≥ 15/20 · vérifiable par QR' }), 400, 545, 26, OURO2, 'center', 800)
    },
  }

  // mercado: o gráfico do próprio motor; os temas abaixo usam-no (velas, médias, DCA, plano)
  const MERCADO = { dca: { camadas: ['dca'] }, tendencia: { camadas: [] }, dema: { camadas: [] }, sinal: { camadas: ['plano'] }, alvos: { camadas: ['plano'] }, terminal: { camadas: ['plano'] } }

  // Painel animado de um tema: canvas com transformação para o espaço 800×600.
  function painel(r, tema, rect, el, grafico) {
    if (MERCADO[tema] || !TEMAS[tema]) {
      const G = grafico(r, { cenario: tema === 'dca' ? 'tendencia' : 'compra', seed: 7 + (rect.seed || 0), w: rect.w, h: rect.h, top: rect.y, left: rect.x }, el)
      const cam = (MERCADO[tema] || MERCADO.dca).camadas
      return { wrap: G.wrap, u: (k) => { const kk = (k % 14) / 14, vis = { medias: 1, dca: cam.includes('dca') ? 1 : 0, plano: cam.includes('plano') ? eo((kk - 0.6) / 0.15) : 0 }; G.desenha(vis, 0.35 + 0.65 * eio(Math.min(1, kk / 0.85))) } }
    }
    const wrap = el('div', 'card abs', null, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px', overflow: 'hidden', borderRadius: '26px', background: rect.fundo ? 'transparent' : 'radial-gradient(120% 90% at 50% 0%, rgba(210,166,60,.10), rgba(10,9,7,.96) 60%)', border: rect.fundo ? 'none' : '1px solid rgba(210,166,60,.35)', boxShadow: rect.fundo ? 'none' : '0 40px 100px rgba(0,0,0,.55)' })
    const cv = el('canvas'); cv.width = rect.w * 1.5; cv.height = rect.h * 1.5; cv.style.width = '100%'; cv.style.height = '100%'; wrap.append(cv); r.append(wrap)
    const g = cv.getContext('2d'), s = Math.min(cv.width / 800, cv.height / 600), ox = (cv.width - 800 * s) / 2, oy = (cv.height - 600 * s) / 2
    return { wrap, u: k => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(s, 0, 0, s, ox, oy); TEMAS[tema](g, k + (rect.fase || 0)) } }
  }

  window.PC_TEMAS = { TEMAS, painel, lista: Object.keys(TEMAS).concat(Object.keys(MERCADO)) }
})()
