// Gráficos dos e-books: SVG desenhado aqui, animado por CSS na versão interativa
// (classes .cresce / .traca / .surge) e estático no PDF. Cores vêm das variáveis do tema.
// Regra da casa: só matemática verdadeira; o que é exemplo diz «ilustrativo».

const W = 640, H = 360
const f = (n, d = 0) => n.toLocaleString('pt-PT', { minimumFractionDigits: d, maximumFractionDigits: d })

function fig(id, titulo, svg, nota) {
  return `<figure class="grafico" data-g="${id}"><figcaption class="g-titulo">${titulo}</figcaption>` +
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${titulo.replace(/"/g, '')}">${svg}</svg>` +
    (nota ? `<p class="g-nota">${nota}</p>` : '') + `</figure>`
}

// ── primitivas ────────────────────────────────────────────────────────────────
function barras(dados, { max, unidade = '', dec = 0, destaque = -1, rotuloTopo } = {}) {
  const m = max ?? Math.max(...dados.map((d) => d.v)) * 1.12
  const x0 = 56, x1 = W - 20, y0 = 40, y1 = H - 56
  const bw = (x1 - x0) / dados.length
  let s = ''
  for (let k = 0; k <= 4; k++) {
    const y = y1 - ((y1 - y0) * k) / 4
    s += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" class="g-grelha"/><text x="${x0 - 8}" y="${y + 4}" class="g-eixo" text-anchor="end">${f((m * k) / 4, dec && m < 10 ? 1 : 0)}${unidade}</text>`
  }
  dados.forEach((d, j) => {
    const h = ((y1 - y0) * d.v) / m
    const x = x0 + j * bw + bw * 0.16
    const w = bw * 0.68
    const cls = j === destaque || d.destaque ? 'g-barra g-barra-forte' : 'g-barra'
    s += `<rect class="${cls} cresce" style="--d:${(j * 0.09).toFixed(2)}s" x="${x}" y="${y1 - h}" width="${w}" height="${h}" rx="5"/>`
    s += `<text class="g-valor surge" style="--d:${(0.4 + j * 0.09).toFixed(2)}s" x="${x + w / 2}" y="${y1 - h - 8}" text-anchor="middle">${rotuloTopo ? rotuloTopo(d) : f(d.v, dec) + unidade}</text>`
    s += `<text class="g-eixo" x="${x + w / 2}" y="${y1 + 20}" text-anchor="middle">${d.r}</text>`
    if (d.r2) s += `<text class="g-eixo g-eixo-2" x="${x + w / 2}" y="${y1 + 36}" text-anchor="middle">${d.r2}</text>`
  })
  return s
}

function linhas(series, { max, min = 0, rotX = [], unidade = '', legenda = true, dec = 0 } = {}) {
  const x0 = 64, x1 = W - 24, y0 = 30, y1 = H - 60
  const n = Math.max(...series.map((s) => s.v.length))
  const m = max ?? Math.max(...series.flatMap((s) => s.v)) * 1.08
  const X = (j) => x0 + ((x1 - x0) * j) / (n - 1)
  const Y = (v) => y1 - ((y1 - y0) * (v - min)) / (m - min)
  let s = ''
  for (let k = 0; k <= 4; k++) {
    const v = min + ((m - min) * k) / 4
    s += `<line x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}" class="g-grelha"/><text x="${x0 - 8}" y="${Y(v) + 4}" class="g-eixo" text-anchor="end">${f(v, dec)}${unidade}</text>`
  }
  rotX.forEach((r, j) => { if (r !== '') s += `<text class="g-eixo" x="${X(j)}" y="${y1 + 20}" text-anchor="middle">${r}</text>` })
  series.forEach((se, k) => {
    const d = se.v.map((v, j) => `${j ? 'L' : 'M'}${X(j).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
    if (se.area) s += `<path class="g-area g-c${k} surge" style="--d:.6s" d="${d} L${X(se.v.length - 1)},${y1} L${X(0)},${y1} Z"/>`
    s += `<path class="g-linha g-c${k} traca" pathLength="1" style="--d:${(k * 0.25).toFixed(2)}s" d="${d}"${se.tracejado ? ' stroke-dasharray="6 6"' : ''}/>`
    const ult = se.v[se.v.length - 1]
    if (se.fim !== false) s += `<circle class="g-ponto g-c${k} surge" style="--d:${(1.2 + k * 0.25).toFixed(2)}s" cx="${X(se.v.length - 1)}" cy="${Y(ult)}" r="5"/><text class="g-valor surge g-tc${k}" style="--d:${(1.3 + k * 0.25).toFixed(2)}s" x="${X(se.v.length - 1) - 8}" y="${Y(ult) - 10}" text-anchor="end">${se.fimTxt ?? f(ult, dec) + unidade}</text>`
  })
  if (legenda) {
    let lx = x0
    series.forEach((se, k) => {
      s += `<rect x="${lx}" y="${H - 22}" width="14" height="4" rx="2" class="g-leg g-c${k}"/><text class="g-eixo" x="${lx + 20}" y="${H - 16}">${se.nome}</text>`
      lx += 30 + se.nome.length * 7.2
    })
  }
  return s
}

function donut(segs, centro, sub) {
  const cx = 200, cy = 180, r = 120, rr = 74
  const tot = segs.reduce((a, b) => a + b.v, 0)
  let a0 = -Math.PI / 2
  let s = ''
  segs.forEach((g, j) => {
    const a1 = a0 + (2 * Math.PI * g.v) / tot
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (a, R) => `${(cx + R * Math.cos(a)).toFixed(2)},${(cy + R * Math.sin(a)).toFixed(2)}`
    s += `<path class="g-fatia g-f${j} surge" style="--d:${(j * 0.12).toFixed(2)}s" d="M${p(a0, r)} A${r},${r} 0 ${large} 1 ${p(a1, r)} L${p(a1, rr)} A${rr},${rr} 0 ${large} 0 ${p(a0, rr)} Z"/>`
    a0 = a1
  })
  s += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="g-grande">${centro}</text><text x="${cx} " y="${cy + 22}" text-anchor="middle" class="g-eixo">${sub}</text>`
  segs.forEach((g, j) => {
    const y = 70 + j * 44
    s += `<rect x="370" y="${y - 14}" width="18" height="18" rx="4" class="g-fatia g-f${j}"/><text x="398" y="${y}" class="g-rot">${g.r}</text><text x="398" y="${y + 18}" class="g-eixo">${f(g.v)} h · ${f((100 * g.v) / tot)}%</text>`
  })
  return s
}

function passos(itens, { circular = false } = {}) {
  const n = itens.length
  const x0 = 60, x1 = W - 60, cy = 160
  let s = ''
  itens.forEach((it, j) => {
    const x = n === 1 ? W / 2 : x0 + ((x1 - x0) * j) / (n - 1)
    if (j < n - 1) {
      const xn = x0 + ((x1 - x0) * (j + 1)) / (n - 1)
      s += `<line class="g-seta traca" pathLength="1" style="--d:${(0.2 + j * 0.2).toFixed(2)}s" x1="${x + 34}" y1="${cy}" x2="${xn - 40}" y2="${cy}" marker-end="url(#seta)"/>`
    }
    s += `<g class="surge" style="--d:${(j * 0.2).toFixed(2)}s"><circle class="g-no${j === n - 1 ? ' g-no-forte' : ''}" cx="${x}" cy="${cy}" r="32"/><text x="${x}" y="${cy + 7}" text-anchor="middle" class="g-num">${it.n ?? j + 1}</text>`
    const ls = it.r.split('\n')
    ls.forEach((t, k) => { s += `<text x="${x}" y="${cy + 62 + k * 18}" text-anchor="middle" class="g-rot">${t}</text>` })
    if (it.s) it.s.split('\n').forEach((t, k) => { s += `<text x="${x}" y="${cy + 64 + ls.length * 18 + k * 16}" text-anchor="middle" class="g-eixo">${t}</text>` })
    s += `</g>`
  })
  if (circular) s += `<path class="g-seta g-seta-volta traca" pathLength="1" style="--d:1.2s" d="M${x1},${cy - 40} C${x1},40 ${x0},40 ${x0},${cy - 40}" marker-end="url(#seta)"/>`
  return `<defs><marker id="seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="g-ponta"/></marker></defs>` + s
}

function grelha(linhasG, colunas, celulas, { titulosLinhas = true } = {}) {
  const x0 = 150, y0 = 52, cw = (W - x0 - 16) / colunas.length, ch = (H - y0 - 16) / linhasG.length
  let s = ''
  colunas.forEach((c, j) => { s += `<text x="${x0 + cw * j + cw / 2}" y="34" text-anchor="middle" class="g-rot">${c}</text>` })
  linhasG.forEach((l, i) => {
    if (titulosLinhas) l.split('\n').forEach((t, k, a) => { s += `<text x="${x0 - 12}" y="${y0 + ch * i + ch / 2 + 5 - (a.length - 1) * 8 + k * 16}" text-anchor="end" class="g-rot">${t}</text>` })
    colunas.forEach((_, j) => {
      const c = celulas[i][j]
      const nivel = typeof c === 'number' ? c : c.n
      const txt = typeof c === 'number' ? '' : c.t
      s += `<rect class="g-cel g-cel-${nivel} surge" style="--d:${((i + j) * 0.08).toFixed(2)}s" x="${x0 + cw * j + 4}" y="${y0 + ch * i + 4}" width="${cw - 8}" height="${ch - 8}" rx="10"/>`
      if (txt) txt.split('\n').forEach((t, k, a) => { s += `<text class="g-cel-txt surge" style="--d:${(0.3 + (i + j) * 0.08).toFixed(2)}s" x="${x0 + cw * j + cw / 2}" y="${y0 + ch * i + ch / 2 + 5 - (a.length - 1) * 8 + k * 16}" text-anchor="middle">${t}</text>` })
      else s += `<g class="surge" style="--d:${(0.3 + (i + j) * 0.08).toFixed(2)}s">${'<circle class="g-pinta" r="6" cy="' + (y0 + ch * i + ch / 2) + '" cx="X"/>'.repeat(nivel).split('X').map((p, k, arr) => k < arr.length - 1 ? p + (x0 + cw * j + cw / 2 + (k - (nivel - 1) / 2) * 18) : p).join('')}</g>`
    })
  })
  return s
}

function timeline(blocos, total, unidade) {
  const x0 = 40, x1 = W - 40, y = 150
  let s = `<line x1="${x0}" x2="${x1}" y1="${y + 50}" y2="${y + 50}" class="g-grelha"/>`
  let acc = 0
  blocos.forEach((b, j) => {
    const xa = x0 + ((x1 - x0) * acc) / total
    const xb = x0 + ((x1 - x0) * (acc + b.v)) / total
    s += `<rect class="g-bloco g-f${j % 6} cresce-x" style="--d:${(j * 0.15).toFixed(2)}s" x="${xa + 2}" y="${y}" width="${xb - xa - 4}" height="40" rx="8"/>`
    s += `<text class="g-eixo" x="${xa}" y="${y + 70}" text-anchor="middle">${b.ini ?? f(acc) + unidade}</text>`
    const meio = (xa + xb) / 2
    const up = j % 2 === 0
    b.r.split('\n').forEach((t, k) => { s += `<text class="g-rot surge" style="--d:${(0.3 + j * 0.15).toFixed(2)}s" x="${meio}" y="${up ? y - 40 + k * 17 : y + 100 + k * 17}" text-anchor="middle">${t}</text>` })
    s += `<line class="g-grelha" x1="${meio}" x2="${meio}" y1="${up ? y - 8 : y + 48}" y2="${up ? y - 20 : y + 84}"/>`
    acc += b.v
  })
  s += `<text class="g-eixo" x="${x1}" y="${y + 70}" text-anchor="middle">${f(total)}${unidade}</text>`
  return s
}

function funil(niveis) {
  let s = ''
  const n = niveis.length, topo = 560, base = 160, y0 = 30, h = (H - 50) / n
  niveis.forEach((nv, j) => {
    const wa = topo - ((topo - base) * j) / n, wb = topo - ((topo - base) * (j + 1)) / n
    const y = y0 + j * h
    s += `<path class="g-fatia g-f${j} surge" style="--d:${(j * 0.15).toFixed(2)}s" d="M${W / 2 - wa / 2},${y} L${W / 2 + wa / 2},${y} L${W / 2 + wb / 2},${y + h - 6} L${W / 2 - wb / 2},${y + h - 6} Z"/>`
    s += `<text class="g-rot-claro surge" style="--d:${(0.2 + j * 0.15).toFixed(2)}s" x="${W / 2}" y="${y + h / 2 + 2}" text-anchor="middle">${nv.r}</text>`
    if (nv.s) s += `<text class="g-eixo-claro surge" style="--d:${(0.2 + j * 0.15).toFixed(2)}s" x="${W / 2}" y="${y + h / 2 + 18}" text-anchor="middle">${nv.s}</text>`
  })
  return s
}

function camadas(cs) {
  let s = ''
  const cx = 200, cy = 180
  cs.forEach((c, j) => {
    const r = 160 - j * 30
    s += `<circle class="g-fatia g-f${j} surge" style="--d:${(j * 0.15).toFixed(2)}s" cx="${cx}" cy="${cy}" r="${r}"/>`
  })
  s += `<text x="${cx}" y="${cy + 6}" text-anchor="middle" class="g-grande-claro">●</text>`
  cs.forEach((c, j) => {
    const y = 50 + j * 56
    s += `<g class="surge" style="--d:${(0.3 + j * 0.15).toFixed(2)}s"><rect x="390" y="${y - 14}" width="18" height="18" rx="9" class="g-fatia g-f${j}"/><text x="418" y="${y}" class="g-rot">${c.r}</text><text x="418" y="${y + 18}" class="g-eixo">${c.s}</text></g>`
  })
  return s
}

// pseudo-aleatório determinístico (para exemplos ilustrativos reproduzíveis)
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32) }

// ── catálogo ──────────────────────────────────────────────────────────────────
const G = {
  // RICARDO
  'rotina-dia': () => fig('rotina-dia', 'O padrão mínimo diário: quatro blocos que não se negociam',
    timeline([{ r: 'Acordar à\nmesma hora', v: 30, ini: '06:30' }, { r: 'Movimento\n20 min', v: 30, ini: '07:00' }, { r: 'Bloco de foco\n(o mais difícil primeiro)', v: 60, ini: '07:30' }, { r: 'Revisão e\nplano de amanhã', v: 15, ini: '08:30' }], 135, ' min'),
    'Exemplo de horário. O que conta é a ordem e a repetição, não a hora exata.'),
  'horas-semana': () => fig('horas-semana', 'As 168 horas da tua semana',
    donut([{ r: 'Sono (7 h × 7)', v: 49 }, { r: 'Trabalho (8 h × 5)', v: 40 }, { r: 'Transportes (3 h × 5)', v: 15 }, { r: 'Tudo o resto', v: 64 }], '168 h', 'por semana'),
    '104 horas ocupadas antes de começares a viver. As 64 que sobram têm de chegar para refeições, casa, família, cuidados e descanso.'),
  'fundo-emergencia': () => fig('fundo-emergencia', 'Quanto tempo demora um fundo de 3 meses (3.600 €)',
    barras([100, 200, 300, 400].map((p) => ({ r: `${p} €/mês`, v: 3600 / p })), { unidade: ' meses', max: 40 }),
    'Exemplo ilustrativo com despesas de 1.200 €/mês. Faz a tua conta com os teus números.'),
  'juros-compostos': () => {
    const r = 0.05 / 12, v0 = [], v5 = [], rot = []
    for (let a = 0; a <= 20; a++) { const n = a * 12; v0.push(100 * n); v5.push(n ? (100 * ((1 + r) ** n - 1)) / r : 0); rot.push(a % 5 === 0 ? `${a} anos` : '') }
    return fig('juros-compostos', '100 € por mês durante 20 anos',
      linhas([{ nome: 'Debaixo do colchão (0%)', v: v0 }, { nome: 'Taxa hipotética de 5%/ano', v: v5, area: true }], { rotX: rot, unidade: ' €' }),
      `Hipotético, não é previsão nem promessa: 24.000 € depositados; a 5%/ano capitalizados mensalmente seriam ≈${f(v5[20])} €. Taxas reais variam e podem ser negativas.`)
  },
  'recuperacao-perdas': () => fig('recuperacao-perdas', 'Quanto tens de ganhar para recuperar uma perda',
    barras([10, 20, 30, 50, 70].map((p) => ({ r: `−${p}%`, r2: 'de perda', v: (100 * p) / (100 - p), destaque: p >= 50 })), { unidade: '%', dec: 1, max: 260, rotuloTopo: (d) => '+' + f(d.v, 1) + '%' }),
    'Matemática simples: depois de perder metade, precisas de duplicar o que sobra só para voltar ao início.'),
  'regressao-tendencia': () => {
    const rnd = rng(7), v = [], rl = [], up = [], dn = [], rot = []
    let p = 100
    for (let j = 0; j < 60; j++) {
      const base = 100 + j * 0.55
      p = p + (base - p) * 0.18 + (rnd() - 0.5) * 4.2
      v.push(p); rl.push(base); up.push(base + 5); dn.push(base - 5); rot.push('')
    }
    return fig('regressao-tendencia', 'O «elástico»: o preço afasta-se da linha média e tende a voltar',
      linhas([{ nome: 'Preço', v, fim: false }, { nome: 'Linha de regressão', v: rl, fim: false }, { nome: 'Bandas', v: up, tracejado: true, fim: false }, { nome: '', v: dn, tracejado: true, fim: false }], { rotX: rot, min: 90, max: 140, legenda: true }),
      'Gráfico ilustrativo, não é um ativo real. «Tende a voltar» não é «volta sempre».')
  },
  'winrate-rr': () => fig('winrate-rr', 'Taxa de acerto mínima para não perder dinheiro',
    barras([[1, 1], [1, 1.5], [1, 2], [1, 3], [1, 4]].map(([a, b]) => ({ r: `${a}:${String(b).replace('.', ',')}`, r2: 'risco:retorno', v: (100 * a) / (a + b) })), { unidade: '%', dec: 1, max: 60 }),
    'Antes de custos (spread e comissões). Com risco:retorno de 1:2, acertar 1 em cada 3 já cobre as perdas.'),
  'risco-sequencias': () => {
    const rs = [1, 2, 5, 10]
    const ser = rs.map((r) => ({ nome: `${r}% por operação`, v: Array.from({ length: 11 }, (_, n) => 1000 * (1 - r / 100) ** n) }))
    return fig('risco-sequencias', 'Uma conta de 1.000 € depois de 10 perdas seguidas',
      linhas(ser, { rotX: Array.from({ length: 11 }, (_, n) => String(n)), unidade: ' €', max: 1000, min: 300 }),
      '1% → ≈904 € · 2% → ≈817 € · 5% → ≈599 € · 10% → ≈349 €. O tamanho do risco decide se sobrevives à má fase.')
  },
  'sequencia-perdas': () => {
    // 100 lançamentos 50/50 determinísticos; escolhemos uma semente que mostra uma sequência longa.
    let seed = 3, seq, melhor
    for (; seed < 500; seed++) {
      const r = rng(seed); seq = Array.from({ length: 100 }, () => r() < 0.5)
      let run = 0, mx = 0, fimMx = 0
      seq.forEach((g, j) => { run = g ? 0 : run + 1; if (run > mx) { mx = run; fimMx = j } })
      if (mx === 6) { melhor = [fimMx - mx + 1, fimMx]; break }
    }
    let s = ''
    seq.forEach((g, j) => {
      const x = 52 + (j % 20) * 27.5, y = 50 + Math.floor(j / 20) * 52
      const dentro = j >= melhor[0] && j <= melhor[1]
      s += `<circle class="${g ? 'g-ganho' : 'g-perda'}${dentro ? ' g-realce' : ''} surge" style="--d:${(j * 0.012).toFixed(3)}s" cx="${x}" cy="${y}" r="10"/>`
    })
    s += `<text x="${W / 2}" y="${H - 20}" text-anchor="middle" class="g-rot">● ganho  ○ perda — a sequência realçada tem 6 perdas seguidas</text>`
    return fig('sequencia-perdas', '100 operações com 50% de acerto: as séries de perdas aparecem', s,
      'Simulação ilustrativa (moeda ao ar). Em 100 lançamentos 50/50, a probabilidade de aparecer pelo menos uma série de 5 ou mais perdas é ≈81%.')
  },
  'rotina-15min': () => fig('rotina-15min', 'Os 15 minutos do operador',
    timeline([{ r: 'Contexto\ne calendário', v: 3 }, { r: 'Leitura com\no scanner', v: 5 }, { r: 'Checklist\ne plano', v: 4 }, { r: 'Diário', v: 3 }], 15, ' min')),

  // RUBEN
  'blockchain-caderno': () => fig('blockchain-caderno', 'O caderno que ninguém apaga: cada página prende a anterior',
    passos([{ r: 'Bloco 1', s: 'transações\n+ impressão #A1', n: '#1' }, { r: 'Bloco 2', s: 'refere #A1\n+ impressão #B7', n: '#2' }, { r: 'Bloco 3', s: 'refere #B7\n+ impressão #C4', n: '#3' }, { r: 'Bloco 4', s: 'refere #C4\n…', n: '#4' }]),
    'Mudar uma página antiga muda a sua «impressão digital» (hash) e parte a corrente toda — e milhares de cópias do caderno denunciam a fraude.'),
  'halving': () => fig('halving', 'Halving: a recompensa por bloco de Bitcoin cai para metade a cada ~4 anos',
    barras([[2009, 50], [2012, 25], [2016, 12.5], [2020, 6.25], [2024, 3.125]].map(([a, v]) => ({ r: String(a), v })), { unidade: ' BTC', dec: 3, max: 56, rotuloTopo: (d) => f(d.v, d.v % 1 ? (d.v * 100 % 100 ? 3 : 1) : 0) }),
    'Limite máximo: 21 milhões de BTC. A oferta nova abranda por regra do código, não por decisão de alguém.'),
  'tipos-carteira': () => fig('tipos-carteira', 'Onde vive a tua chave',
    grelha(['Quente\n(ligada à internet)', 'Fria\n(desligada)'], ['Custódia de terceiros', 'Tu tens a chave'], [[{ n: 1, t: 'Conta numa exchange\nprático, mas a chave\nnão é tua' }, { n: 2, t: 'App de carteira\nno telemóvel' }], [{ n: 2, t: 'Raro para\niniciantes' }, { n: 3, t: 'Carteira física\n+ seed em papel/metal' }]]),
    'Quanto mais escuro, mais controlo (e mais responsabilidade). Para valores que não usas, a carteira fria é a regra.'),
  'camadas-seguranca': () => fig('camadas-seguranca', 'Cinco camadas de proteção',
    camadas([{ r: 'E-mail só para cripto', s: 'não é o do dia a dia' }, { r: 'Palavra-passe única', s: 'gestor de palavras-passe' }, { r: '2FA por app', s: 'nunca por SMS' }, { r: 'Carteira fria', s: 'para o que guardas' }, { r: 'Seed offline', s: 'papel ou metal, nunca foto' }])),
  'dca': () => {
    const precos = [100, 80, 60, 70, 90, 110]
    const un = precos.map((p) => 100 / p)
    const acc = []; let tu = 0, ti = 0
    precos.forEach((p, j) => { tu += un[j]; ti += 100; acc.push(ti / tu) })
    return fig('dca', 'DCA: 100 € por mês, seis meses (exemplo ilustrativo)',
      linhas([{ nome: 'Preço do ativo', v: precos, fimTxt: '110 €' }, { nome: 'Preço médio pago com DCA', v: acc, fimTxt: `${f(acc[5], 2)} €` }, { nome: 'Entrada única no mês 1', v: precos.map(() => 100), tracejado: true, fimTxt: '100 €' }], { rotX: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'], unidade: ' €', min: 40, max: 120, dec: 0 }),
      `Preços inventados. Com 600 € em DCA comprarias ≈${f(tu, 2)} unidades (preço médio ≈${f(acc[5], 2)} €); de uma vez, a 100 €, 6 unidades. Se o preço só subisse, a entrada única teria sido melhor: o DCA não ganha sempre, reduz o risco de entrar no pior momento.`)
  },
  'alavancagem': () => fig('alavancagem', 'Quanto o preço tem de andar contra ti para seres liquidado',
    barras([2, 5, 10, 20, 50, 100].map((x) => ({ r: `${x}×`, v: 100 / x, destaque: x >= 20 })), { unidade: '%', max: 56, dec: 0, rotuloTopo: (d) => '−' + f(d.v, d.v < 10 && d.v % 1 ? 1 : 0) + '%' }),
    'Aproximação sem taxas nem margem de manutenção (na prática, a liquidação chega antes). Em cripto, movimentos de 5–10% num dia não são raros.'),

  // MARIA
  'mapa-cliente': () => fig('mapa-cliente', 'Mapa do cliente: o que pensa, sente, diz e faz',
    grelha(['Por dentro', 'Por fora'], ['Cabeça', 'Coração'], [[{ n: 2, t: 'PENSA\n«não tenho jeito\npara aparecer»' }, { n: 3, t: 'SENTE\nvontade de ter\nalgo seu' }], [{ n: 1, t: 'DIZ\n«não tenho tempo»' }, { n: 2, t: 'FAZ\nguarda posts e\nnão começa' }]], {}),
    'Preenche o teu mapa com frases reais que leste em comentários e mensagens.'),
  'escada-valor': () => {
    const deg = [{ r: 'Conteúdo grátis', s: 'reels, carrosséis' }, { r: 'Isco digital', s: 'checklist, guia' }, { r: 'Produto de entrada', s: 'e-book, template' }, { r: 'Produto principal', s: 'curso, programa' }, { r: 'Acompanhamento', s: 'mentoria, comunidade' }]
    let s = ''
    deg.forEach((d, j) => {
      const x = 40 + j * 116, h = 50 + j * 50, y = H - 40 - h
      s += `<rect class="g-barra${j === 2 ? ' g-barra-forte' : ''} cresce" style="--d:${(j * 0.12).toFixed(2)}s" x="${x}" y="${y}" width="104" height="${h}" rx="8"/>`
      s += `<text class="g-rot surge" style="--d:${(0.3 + j * 0.12).toFixed(2)}s" x="${x + 52}" y="${y - 24}" text-anchor="middle">${d.r}</text><text class="g-eixo surge" style="--d:${(0.3 + j * 0.12).toFixed(2)}s" x="${x + 52}" y="${y - 8}" text-anchor="middle">${d.s}</text>`
    })
    return fig('escada-valor', 'A escada de valor: cada degrau prepara o seguinte', s, 'O primeiro produto pago deve ser pequeno, rápido de consumir e resolver um problema concreto.')
  },
  'fluxo-conteudo': () => fig('fluxo-conteudo', 'O fluxo de conteúdo com IA (tu decides, a IA acelera)',
    passos([{ r: 'Ideia', s: 'dores reais\ndo cliente' }, { r: 'Roteiro', s: 'IA ajuda,\ntu revês' }, { r: 'Design', s: 'mãos, texto,\nmarca' }, { r: 'Publicação', s: 'hora certa' }, { r: 'Análise', s: 'guardados,\npartilhas, DMs' }], { circular: true })),
  'matriz-formatos': () => fig('matriz-formatos', 'Que formato serve que objetivo',
    grelha(['Reel de mãos\n(processo)', 'Voz-off +\nb-roll', 'Carrossel\neducativo', 'Stories\ncom caixa', 'Texto no ecrã\n(POV)'], ['Alcance', 'Confiança', 'Venda'], [[3, 2, 1], [2, 3, 1], [2, 3, 2], [1, 2, 3], [3, 1, 1]]),
    '●●● forte · ●● médio · ● fraco. Uma semana equilibrada mistura os três objetivos.'),
  'funil-dm': () => fig('funil-dm', 'A conversa por mensagem, passo a passo',
    funil([{ r: 'Viu o conteúdo', s: 'gancho + valor' }, { r: 'Reagiu ou respondeu', s: 'pergunta aberta' }, { r: 'Conversa', s: 'ouvir antes de oferecer' }, { r: 'Interesse', s: 'oferta certa, sem pressão' }, { r: 'Decisão', s: 'link + acompanhamento' }])),
  'semana-tipo': () => {
    const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
    const plano = [[2, 1, 1, 0], [1, 1, 2, 0], [2, 1, 1, 0], [1, 1, 2, 0], [1, 1, 1, 1], [0, 1, 0, 3], [0, 0, 0, 4]]
    const nomes = ['Criar', 'Publicar', 'Conversar/vender', 'Descansar']
    let s = ''
    const x0 = 70, y0 = 30, bh = 36
    dias.forEach((d, i) => {
      let x = x0
      s += `<text class="g-rot" x="${x0 - 12}" y="${y0 + i * 42 + 24}" text-anchor="end">${d}</text>`
      plano[i].forEach((h, k) => { if (h) { const w = h * 120; s += `<rect class="g-bloco g-f${k} cresce-x" style="--d:${(i * 0.08 + k * 0.05).toFixed(2)}s" x="${x}" y="${y0 + i * 42}" width="${w - 4}" height="${bh}" rx="7"/>`; x += w } })
    })
    nomes.forEach((n, k) => { s += `<rect x="${x0 + k * 130}" y="${H - 26}" width="14" height="14" rx="4" class="g-fatia g-f${k}"/><text class="g-eixo" x="${x0 + k * 130 + 20}" y="${H - 14}">${n}</text>` })
    return fig('semana-tipo', 'Uma semana-tipo de quem vende sem aparecer', s, 'Cada bloco ≈ 1 hora. Exemplo para quem começa em part-time: ajusta à tua vida.')
  },
  // MÉTODO FRIO
  'sessoes-forex': () => {
    const ss = [['Sydney', 22, 31], ['Tóquio', 24, 33], ['Londres', 8, 17], ['Nova Iorque', 13, 22]]
    const x0 = 120, x1 = W - 24, y0 = 40, X = (h) => x0 + ((x1 - x0) * (h % 24 === 0 && h ? 24 : h)) / 24
    let s = ''
    for (let h = 0; h <= 24; h += 4) s += `<line x1="${X(h)}" x2="${X(h)}" y1="${y0 - 6}" y2="${H - 70}" class="g-grelha"/><text class="g-eixo" x="${X(h)}" y="${H - 52}" text-anchor="middle">${String(h).padStart(2, '0')}h</text>`
    s += `<rect class="g-barra g-barra-forte surge" style="--d:1s;opacity:.18" x="${X(13)}" y="${y0 - 6}" width="${X(17) - X(13)}" height="${H - 70 - y0 + 6}"/>`
    ss.forEach(([n, a, b], i) => {
      const y = y0 + i * 52
      s += `<text class="g-rot" x="${x0 - 12}" y="${y + 24}" text-anchor="end">${n}</text>`
      const seg = (u, v) => `<rect class="g-barra${n === 'Londres' || n === 'Nova Iorque' ? ' g-barra-forte' : ''} cresce-x" style="--d:${(i * 0.12).toFixed(2)}s" x="${X(u)}" y="${y}" width="${X(v) - X(u)}" height="34" rx="7"/>`
      if (b <= 24) s += seg(a, b); else { if (a < 24) s += seg(a, 24); s += seg(0, b - 24) }
    })
    s += `<text class="g-eixo surge" style="--d:1.1s" x="${(X(13) + X(17)) / 2}" y="${H - 30}" text-anchor="middle">Londres + Nova Iorque</text>`
    return fig('sessoes-forex', 'As sessões do Forex, em hora de Lisboa (inverno)', s, 'Com a mudança de hora, tudo pode mexer uma hora. A janela das 13h às 17h é a de mais movimento nos pares do euro e do dólar.')
  },
  'valor-pip': () => fig('valor-pip', 'Quanto vale 1 pip no EUR/USD, consoante o lote',
    barras([['1,00', 'lote standard', 10], ['0,10', 'minilote', 1], ['0,01', 'microlote', 0.1]].map(([r, r2, v]) => ({ r, r2, v, destaque: v === 0.1 })), { unidade: ' $', max: 11, dec: 2, rotuloTopo: (d) => f(d.v, d.v < 1 ? 2 : 0) + ' $' }),
    'Conta em dólares. Noutra moeda de conta ou noutro par o valor muda: confirma sempre no MetaTrader 5 ou na corretora.'),
  'custo-spread': () => fig('custo-spread', 'O custo invisível: spread de 1 pip com 0,10 lotes',
    barras([[5, 'por mês'], [20, 'por mês'], [60, 'por mês'], [200, 'por mês']].map(([n, r2]) => ({ r: `${n} operações`, r2, v: n * 1, destaque: n >= 60 })), { unidade: ' $', max: 220, rotuloTopo: (d) => f(d.v) + ' $' }),
    'Exemplo ilustrativo: 1 pip × 1 $ por operação, sem comissões nem swap. Quem opera muito paga muito, ganhe ou perca.'),
  'fluxo-operacao': () => fig('fluxo-operacao', 'O ciclo frio de cada operação',
    passos([{ r: 'Contexto', s: 'calendário\ne sessão' }, { r: 'Plano', s: 'zona, stop\ne alvo' }, { r: 'Cálculo', s: 'lote pelo\nrisco' }, { r: 'Execução', s: 'ordem com\nSL e TP' }, { r: 'Diário', s: 'foto, nota\ne emoção' }], { circular: true })),

  'percurso-mt5': () => fig('percurso-mt5', 'O MetaTrader ao longo do livro: um ecrã novo por capítulo',
    passos([{ r: 'Instalar', s: 'cap. 1\ndemo' }, { r: 'Cotações', s: 'cap. 2\npreço' }, { r: 'Volume', s: 'cap. 3\npips' }, { r: 'Gráfico', s: 'cap. 4\nmapa' }, { r: 'Lote', s: 'cap. 5\nrisco' }, { r: 'Ordem', s: 'cap. 6\nSL e TP' }, { r: 'Diário', s: 'cap. 9\nhistórico' }]),
    'Cada capítulo junta uma peça ao que já sabes fazer na app. No fim, o ciclo inteiro está nas tuas mãos.'),
  'anatomia-vela': () => {
    const Y = (v) => 300 - v * 2.4
    const vela = (x, o, c, h, l, k) => {
      const sobe = c > o, top = Math.max(o, c), bot = Math.min(o, c)
      return `<line class="g-linha ${sobe ? 'g-c0' : 'g-c3'} traca" pathLength="1" style="--d:${k}s;stroke-width:3" x1="${x}" x2="${x}" y1="${Y(h)}" y2="${Y(l)}"/>` +
        `<rect class="${sobe ? 'g-c0' : 'g-c3'} cresce" style="--d:${(k + 0.3).toFixed(2)}s" x="${x - 34}" y="${Y(top)}" width="68" height="${Y(bot) - Y(top)}" rx="4"/>`
    }
    const rot = (x, y, t, k, anc = 'start') => `<text class="g-eixo surge" style="--d:${k}s" x="${x}" y="${y + 4}" text-anchor="${anc}">${t}</text>`
    const tra = (x1, x2, y, k) => `<line class="g-grelha surge" style="--d:${k}s" x1="${x1}" x2="${x2}" y1="${y}" y2="${y}"/>`
    let s = vela(200, 40, 80, 100, 25, 0) + vela(500, 80, 40, 95, 20, 0.4)
    s += tra(236, 268, Y(100), 1) + rot(274, Y(100), 'máximo', 1) + tra(236, 268, Y(80), 1.1) + rot(274, Y(80), 'fecho', 1.1) + tra(236, 268, Y(40), 1.2) + rot(274, Y(40), 'abertura', 1.2) + tra(236, 268, Y(25), 1.3) + rot(274, Y(25), 'mínimo', 1.3)
    s += tra(432, 464, Y(80), 1.4) + rot(426, Y(80), 'abertura', 1.4, 'end') + tra(432, 464, Y(40), 1.5) + rot(426, Y(40), 'fecho', 1.5, 'end')
    s += `<text class="g-rot" x="200" y="336" text-anchor="middle">Vela de subida</text><text class="g-rot" x="500" y="336" text-anchor="middle">Vela de descida</text>`
    s += tra(160, 194, Y(92), 1.7) + rot(154, Y(92), 'pavio', 1.7, 'end') + tra(140, 164, Y(60), 1.8) + rot(134, Y(60), 'corpo', 1.8, 'end')
    return fig('anatomia-vela', 'Uma vela, quatro preços', s, 'O corpo vai da abertura ao fecho; os pavios marcam até onde o preço foi. Cada vela é um período: um minuto no M1, uma hora no H1.')
  },
  'tempos-grafico': () => {
    const pts = [50, 54, 49, 56, 60, 57, 63, 58, 61, 67, 64, 70, 66, 72, 69, 75, 71, 68, 74, 78, 73, 79, 76, 80]
    const Y = (v) => 300 - (v - 40) * 5
    let s = `<line class="g-grelha" x1="330" x2="330" y1="30" y2="310"/>`
    pts.forEach((c, j) => {
      const o = j ? pts[j - 1] : 48, x = 30 + j * 11.5, sobe = c >= o
      const top = Math.max(o, c), bot = Math.min(o, c)
      s += `<line class="g-linha ${sobe ? 'g-c0' : 'g-c3'} surge" style="--d:${(j * 0.05).toFixed(2)}s;stroke-width:1.5" x1="${x + 4}" x2="${x + 4}" y1="${Y(top + 2)}" y2="${Y(bot - 2)}"/><rect class="${sobe ? 'g-c0' : 'g-c3'} surge" style="--d:${(j * 0.05).toFixed(2)}s" x="${x}" y="${Y(top)}" width="8" height="${Math.max(2, Y(bot) - Y(top))}" rx="1.5"/>`
    })
    s += `<line class="g-linha g-c0 traca" pathLength="1" style="--d:1.4s;stroke-width:4" x1="480" x2="480" y1="${Y(82)}" y2="${Y(46)}"/><rect class="g-c0 cresce" style="--d:1.6s" x="440" y="${Y(80)}" width="80" height="${Y(48) - Y(80)}" rx="5"/>`
    s += `<text class="g-rot" x="170" y="336" text-anchor="middle">M5: 24 velas</text><text class="g-rot" x="480" y="336" text-anchor="middle">H2: 1 vela</text>`
    return fig('tempos-grafico', 'O mesmo movimento, dois períodos', s, 'Ilustrativo. No período pequeno cada recuo parece uma inversão; no maior vês só a subida. Decide no tempo maior, afina no menor.')
  },
  'limit-stop': () => {
    const yp = 180
    let s = `<line class="g-linha g-c2 traca" pathLength="1" style="--d:0s;stroke-width:2" stroke-dasharray="6 6" x1="40" x2="${W - 40}" y1="${yp}" y2="${yp}"/><text class="g-rot" x="${W / 2}" y="${yp + 5}" text-anchor="middle" style="paint-order:stroke;stroke:#111;stroke-width:6px">preço atual</text>`
    const it = [['Sell Limit', 'vende mais caro', 70, 'g-c3', 150], ['Buy Stop', 'compra no rompimento', 70, 'g-c0', 490], ['Buy Limit', 'compra mais barato', 290, 'g-c0', 150], ['Sell Stop', 'vende no rompimento', 290, 'g-c3', 490]]
    it.forEach(([n, d, y, c, x], k) => {
      s += `<g class="surge" style="--d:${(0.4 + k * 0.25).toFixed(2)}s"><line class="g-linha ${c}" style="stroke-width:3" x1="${x - 90}" x2="${x + 90}" y1="${y}" y2="${y}"/><text class="g-rot" x="${x}" y="${y - 12}" text-anchor="middle">${n}</text><text class="g-eixo" x="${x}" y="${y + 22}" text-anchor="middle">${d}</text></g>`
      s += `<line class="g-seta traca" pathLength="1" style="--d:${(0.6 + k * 0.25).toFixed(2)}s" x1="${x}" x2="${x}" y1="${y < yp ? yp - 14 : yp + 14}" y2="${y < yp ? y + 32 : y - 30}" marker-end="url(#seta2)"/>`
    })
    s = `<defs><marker id="seta2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="g-ponta"/></marker></defs>` + s
    s += `<text class="g-eixo" x="150" y="${H - 6}" text-anchor="middle">Limit: o preço volta até ti</text><text class="g-eixo" x="490" y="${H - 6}" text-anchor="middle">Stop: o preço rompe e segue</text>`
    return fig('limit-stop', 'Limit ou Stop: onde fica a tua ordem em relação ao preço', s, 'Acima do preço: Sell Limit e Buy Stop. Abaixo: Buy Limit e Sell Stop. Troca-os e entras no sítio errado.')
  },

  'webtrader-ordem': () => fig('webtrader-ordem', 'Uma ordem fria no WebTrader, do símbolo à gestão',
    passos([{ r: 'Símbolo', s: 'lista\nou gráfico' }, { r: 'Risco', s: 'volume\nem 1 %' }, { r: 'SL e TP', s: 'escrever\nou arrastar' }, { r: 'Resumo', s: 'risco em $\ne em %' }, { r: 'Confirmar', s: 'sem modo\nnum clique' }, { r: 'Gestão', s: 'Auto BE\ne trailing' }]),
    'O lote sai do stop, não da vontade. Mexes no stop e o lote recalcula-se sozinho.'),
  'auto-be-trailing': () => {
    const pr = [60, 58, 64, 70, 67, 76, 82, 78, 88, 94, 90, 99, 104, 98, 92]
    const X = (j) => 50 + j * 38, Y = (v) => 320 - (v - 40) * 3.6
    let d = pr.map((v, j) => `${j ? 'L' : 'M'}${X(j)},${Y(v)}`).join(' ')
    let s = `<line class="g-grelha" x1="40" x2="${W - 20}" y1="${Y(60)}" y2="${Y(60)}" stroke-dasharray="5 5"/><text class="g-eixo" x="${W - 22}" y="${Y(60) - 6}" text-anchor="end">entrada</text>`
    s += `<path class="g-linha g-c0 traca" pathLength="1" style="--d:0s;stroke-width:3;fill:none" d="${d}"/>`
    // o stop: começa abaixo da entrada, passa à entrada (Auto BE) e depois segue o preço a 14, só a subir
    let sl = 46, pts = []
    pr.forEach((v, j) => { if (j >= 3 && sl < 60) sl = 60; if (j >= 5) sl = Math.max(sl, v - 14); pts.push([X(j), Y(sl)]) })
    let ds = pts.map(([x, y], j) => (j ? `H${x} V${y}` : `M${x},${y}`)).join(' ')
    s += `<path class="g-linha g-c3 traca" pathLength="1" style="--d:0.6s;stroke-width:3;fill:none" d="${ds}"/>`
    s += `<g class="surge" style="--d:1.2s"><circle class="g-pinta" cx="${X(3)}" cy="${Y(60)}" r="7"/><text class="g-rot" x="${X(3)}" y="${Y(60) + 26}" text-anchor="middle">Auto BE</text></g>`
    s += `<g class="surge" style="--d:1.6s"><text class="g-rot" x="${X(8)}" y="${Y(100) - 6}" text-anchor="middle">Auto Trailing</text></g>`
    s += `<g class="surge" style="--d:2s"><circle class="g-pinta" cx="${X(14)}" cy="${Y(90)}" r="7"/><text class="g-rot" x="${X(14) - 6}" y="${Y(90) + 26}" text-anchor="end">fecha com ganho</text></g>`
    s += `<text class="g-eixo" x="50" y="${H - 8}">preço</text><text class="g-tc3" x="120" y="${H - 8}" style="font-size:13px">stop</text>`
    return fig('auto-be-trailing', 'Auto BE e Auto Trailing: o stop só anda para o teu lado', s, 'Ilustrativo. O stop passa para a entrada quando o preço anda a teu favor e depois segue-o a uma distância fixa. Nunca recua.')
  },
  'webtrader-contas': () => fig('webtrader-contas', 'Um WebTrader, três tipos de conta',
    grelha(['Demo', 'MTM Funded\n(simulada)', 'Corretora\n(TradeLocker, MT5)'], ['Treino', 'Gestão\nautomática', 'Diário e\nauditoria'], [[{ n: 3, t: 'sem risco\nsaldo realista' }, { n: 3, t: 'motor MTM' }, { n: 3, t: 'sim' }], [{ n: 2, t: 'regras e\nobjetivos' }, { n: 3, t: 'motor MTM' }, { n: 3, t: 'sim' }], [{ n: 1, t: 'dinheiro\nverdadeiro' }, { n: 3, t: 'servidor MTM' }, { n: 2, t: 'auditoria\nsem dados pessoais' }]]),
    'O mesmo ecrã do treino à conta real: mudas de conta, não de hábitos.'),

}

export function grafico(id, ctx = {}) {
  const fn = G[id]
  if (!fn) { ctx.avisos?.push(`gráfico desconhecido: ${id}`); return '' }
  return fn()
}
export const GRAFICOS = Object.keys(G)
