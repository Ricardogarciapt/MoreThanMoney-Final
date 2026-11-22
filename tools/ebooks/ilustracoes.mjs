// Ilustrações vetoriais das aberturas de capítulo (sem fotos: nítidas a qualquer resolução).
// Traço a ouro (var(--a)), destaques em var(--a2), preenchimentos suaves com a classe «f».
// Só geometria e objetos: sem rostos nem mãos, para não haver erros de desenho.

const S = (inner) => `<svg viewBox="0 0 400 400" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <defs><radialGradient id="ilg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="var(--a)" stop-opacity=".22"/><stop offset="1" stop-color="var(--a)" stop-opacity="0"/></radialGradient></defs>
  <circle cx="200" cy="200" r="196" fill="url(#ilg)" stroke="none"/>
  <g class="il">${inner}</g></svg>`

// moeda reutilizável
const moeda = (x, y, r = 26, t = '') =>
  `<circle class="f" cx="${x}" cy="${y}" r="${r}"/><circle cx="${x}" cy="${y}" r="${r * 0.72}" class="fino"/>${t ? `<text x="${x}" y="${y + r * 0.28}" text-anchor="middle" class="tx" style="font-size:${r * 0.8}px">${t}</text>` : ''}`

const cadeado = (x, y) => `<rect class="f" x="${x - 34}" y="${y}" width="68" height="56" rx="8"/><path d="M${x - 22},${y} v-16 a22,22 0 0 1 44,0 v16"/><circle cx="${x}" cy="${y + 24}" r="6" class="a2"/><path d="M${x},${y + 30} v12" class="a2"/>`

const calendario = (x, y, cols, rows, marcados, cel = 34) => {
  let s = `<rect class="f" x="${x}" y="${y - 40}" width="${cols * cel + 16}" height="${rows * cel + 56}" rx="12"/><path d="M${x},${y - 6} h${cols * cel + 16}"/><path d="M${x + 30},${y - 52} v22 M${x + cols * cel - 14},${y - 52} v22"/>`
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = r * cols + c, cx = x + 8 + c * cel, cy = y + 6 + r * cel
    s += `<rect x="${cx + 3}" y="${cy + 3}" width="${cel - 6}" height="${cel - 6}" rx="5" class="fino"/>`
    if (marcados(k)) s += `<path d="M${cx + 9},${cy + cel / 2} l6,6 l11,-12" class="a2 grosso"/>`
  }
  return s
}

const CRIPTO = [
  // 0 antes de começares: a chave
  `<circle cx="140" cy="200" r="70" class="f"/><circle cx="140" cy="200" r="28"/><path d="M210,200 H350"/><path d="M300,200 v40 h22 v-40 M330,200 v28 h18 v-28" class="grosso"/><path d="M120,120 l-14,-26 M160,118 l12,-28 M90,150 l-26,-12" class="a2"/>`,
  // 1 o que é dinheiro: notas, moedas, tempo
  `<rect class="f" x="70" y="120" width="190" height="104" rx="10" transform="rotate(-8 165 172)"/><rect class="f" x="90" y="140" width="190" height="104" rx="10"/><circle cx="185" cy="192" r="26"/><text x="185" y="202" text-anchor="middle" class="tx" style="font-size:28px">€</text>${moeda(300, 280, 30, '₿')}${moeda(250, 312, 22)}<circle cx="300" cy="120" r="40" class="fino"/><path d="M300,95 v25 l16,10" class="a2"/>`,
  // 2 o caderno que ninguém apaga: livro-razão em blocos ligados
  `<rect class="f" x="60" y="90" width="130" height="170" rx="8"/><path d="M80,125 h90 M80,150 h90 M80,175 h70 M80,200 h90 M80,225 h50" class="fino"/>${[0, 1, 2].map((k) => `<rect class="f" x="${215 + k * 0}" y="${80 + k * 90}" width="110" height="64" rx="10"/><text x="${270}" y="${118 + k * 90}" text-anchor="middle" class="tx" style="font-size:18px">#${(41 + k * 7).toString(16)}</text>`).join('')}<path d="M270,144 v26 M270,234 v26" class="a2 grosso"/><path d="M190,175 h25" class="a2"/>`,
  // 3 o mapa das moedas: globo com marcadores
  `<circle cx="200" cy="200" r="120" class="f"/><ellipse cx="200" cy="200" rx="50" ry="120" class="fino"/><ellipse cx="200" cy="200" rx="95" ry="120" class="fino"/><path d="M80,200 h240 M95,140 h210 M95,260 h210" class="fino"/>${[[150, 150, '₿'], [262, 182, 'Ξ'], [190, 268, '$']].map(([x, y, t]) => `<path d="M${x},${y + 22} c-22,-26 -22,-48 0,-50 c22,2 22,24 0,50z" class="f a2"/><text x="${x}" y="${y - 6}" text-anchor="middle" class="tx" style="font-size:16px">${t}</text>`).join('')}`,
  // 4 comprar pela primeira vez: telemóvel com botão comprar
  `<rect class="f" x="130" y="60" width="140" height="280" rx="24"/><path d="M180,78 h40" class="fino"/><path d="M152,210 l30,-30 l26,18 l40,-50" class="a2 grosso"/><rect x="150" y="260" width="100" height="40" rx="20" class="f a2"/><text x="200" y="286" text-anchor="middle" class="tx" style="font-size:17px">Comprar</text>${moeda(300, 120, 24, '€')}`,
  // 5 a tua chave: cadeado + 12 palavras
  `${cadeado(200, 120)}${Array.from({ length: 12 }, (_, k) => `<rect x="${78 + (k % 4) * 64}" y="${215 + Math.floor(k / 4) * 40}" width="52" height="28" rx="6" class="fino"/><text x="${104 + (k % 4) * 64}" y="${234 + Math.floor(k / 4) * 40}" text-anchor="middle" class="tx" style="font-size:12px">${k + 1}</text>`).join('')}`,
  // 6 escudo anti-burla
  `<path d="M200,60 L310,100 V200 C310,270 260,315 200,340 C140,315 90,270 90,200 V100 Z" class="f"/><path d="M200,90 L285,120 V200 C285,255 248,290 200,310" class="fino"/><path d="M150,200 l35,35 l70,-75" class="a2 grosso"/><path d="M60,320 l24,-10 M340,320 l-24,-10 M70,80 l22,14" class="fino"/>`,
  // 7 DCA: calendário com moedas a cair todas as semanas
  `${calendario(80, 170, 7, 4, (k) => k % 7 === 4, 32)}${[0, 1, 2].map((k) => moeda(150 + k * 60, 70 + (k % 2) * 20, 16, '€')).join('')}<path d="M150,92 v40 M210,112 v20 M270,92 v40" class="a2 tracejado"/>`,
  // 8 ler o mercado: velas + lupa
  `${[[90, 200, 60, 0], [125, 170, 70, 1], [160, 190, 50, 0], [195, 140, 80, 1], [230, 120, 60, 1], [265, 150, 50, 0]].map(([x, y, h, up]) => `<path d="M${x + 10},${y - 18} v${h + 36}" class="fino"/><rect x="${x}" y="${y}" width="20" height="${h}" rx="3" class="${up ? 'f a2' : 'f'}"/>`).join('')}<circle cx="270" cy="250" r="54" class="f"/><circle cx="270" cy="250" r="40" class="fino"/><path d="M308,288 l46,46" class="grosso"/>`,
  // 9 impostos em Portugal: declaração com €, %, carimbo
  `<rect class="f" x="100" y="60" width="180" height="250" rx="10"/><path d="M125,100 h130 M125,130 h100 M125,160 h120 M125,190 h80" class="fino"/><text x="190" y="262" text-anchor="middle" class="tx" style="font-size:48px">%</text><circle cx="290" cy="290" r="44" class="f a2"/><text x="290" y="300" text-anchor="middle" class="tx" style="font-size:24px">IRS</text>`,
  // 10 perpétuos e alavancagem: alavanca + aviso
  `<path d="M60,280 L340,180" class="grosso"/><path d="M190,236 l-30,64 h60 z" class="f"/>${moeda(90, 240, 26)}<rect x="290" y="118" width="60" height="60" rx="8" class="f"/><path d="M110,90 l40,-70 l40,70 z" class="f a2"/><path d="M150,46 v20 M150,76 v2" class="grosso"/>`,
  // 11 plano de 30 dias
  `${calendario(90, 140, 6, 5, (k) => k < 17, 34)}<path d="M300,330 l20,-20 l20,20" class="a2"/>`,
]

const FACELESS = [
  // 0 antes de começares: telemóvel e brilho
  `<rect class="f" x="135" y="60" width="130" height="270" rx="26"/><circle cx="200" cy="300" r="8" class="fino"/><path d="M200,140 l10,30 l30,10 l-30,10 l-10,30 l-10,-30 l-30,-10 l30,-10 z" class="f a2"/><path d="M290,110 l5,14 l14,5 l-14,5 l-5,14 l-5,-14 l-14,-5 l14,-5 z" class="a2"/>`,
  // 1 a cara não é o produto: câmara desligada, produto em destaque
  `<rect class="f" x="70" y="120" width="150" height="110" rx="16"/><circle cx="145" cy="175" r="32" class="fino"/><path d="M60,250 L240,100" class="a2 grosso"/><rect class="f" x="240" y="170" width="100" height="130" rx="10"/><path d="M260,200 h60 M260,225 h45" class="fino"/><path d="M270,270 l12,12 l26,-26" class="a2 grosso"/>`,
  // 2 o cliente que te procura: íman e mensagens
  `<path d="M90,110 v90 a70,70 0 0 0 140,0 v-90 h-40 v90 a30,30 0 0 1 -60,0 v-90 z" class="f"/><path d="M90,110 h40 M190,110 h40" class="a2 grosso"/>${[[290, 120], [320, 210], [280, 290]].map(([x, y]) => `<path d="M${x - 34},${y - 20} h68 a10,10 0 0 1 10,10 v26 a10,10 0 0 1 -10,10 h-44 l-14,12 v-12 h-10 a10,10 0 0 1 -10,-10 v-26 a10,10 0 0 1 10,-10z" class="f"/>`).join('')}<path d="M245,140 h-10 M260,215 h-20 M245,285 h-12" class="tracejado"/>`,
  // 3 marca sem rosto: paleta e logótipo
  `${[0, 1, 2, 3].map((k) => `<rect x="${70 + k * 70}" y="90" width="56" height="80" rx="8" class="${k % 2 ? 'f a2' : 'f'}"/>`).join('')}<circle cx="200" cy="270" r="64" class="f"/><text x="200" y="288" text-anchor="middle" class="tx" style="font-size:52px;font-style:italic">M</text><path d="M110,330 h180" class="fino"/>`,
  // 4 primeiro produto digital: e-book com etiqueta de preço
  `<path d="M110,80 h140 a10,10 0 0 1 10,10 v220 a10,10 0 0 1 -10,10 h-140 z" class="f"/><path d="M130,80 v240" class="fino"/><path d="M150,130 h85 M150,155 h70" class="fino"/><path d="M250,230 l60,-30 l40,40 l-60,60 z" class="f a2"/><circle cx="312" cy="226" r="6"/>`,
  // 5 conteúdo com IA: pena + faíscas
  `<rect class="f" x="70" y="230" width="260" height="90" rx="12"/><path d="M95,262 h150 M95,290 h110" class="fino"/><path d="M300,70 c-60,20 -100,80 -110,150 l20,-10 c20,-60 50,-100 90,-140z" class="f"/><path d="M190,220 l-14,30" class="grosso"/>${[[110, 110, 18], [160, 70, 10], [90, 180, 8]].map(([x, y, r]) => `<path d="M${x},${y - r} l${r * 0.3},${r * 0.7} l${r * 0.7},${r * 0.3} l-${r * 0.7},${r * 0.3} l-${r * 0.3},${r * 0.7} l-${r * 0.3},-${r * 0.7} l-${r * 0.7},-${r * 0.3} l${r * 0.7},-${r * 0.3} z" class="f a2"/>`).join('')}`,
  // 6 formatos sem cara: carrossel + play
  `<rect x="60" y="110" width="150" height="190" rx="12" class="fino" transform="rotate(-6 135 205)"/><rect x="190" y="110" width="150" height="190" rx="12" class="fino" transform="rotate(6 265 205)"/><rect class="f" x="125" y="95" width="150" height="200" rx="12"/><path d="M185,160 v70 l55,-35 z" class="f a2"/>${[0, 1, 2].map((k) => `<circle cx="${185 + k * 15}" cy="320" r="4" class="${k ? 'fino' : 'a2'}"/>`).join('')}`,
  // 7 stories que vendem: anéis + sondagem
  `${[0, 1, 2].map((k) => `<circle cx="${110 + k * 90}" cy="110" r="34" class="${k === 0 ? 'a2 grosso' : 'fino'}"/><circle cx="${110 + k * 90}" cy="110" r="25" class="f"/>`).join('')}<rect class="f" x="110" y="180" width="180" height="150" rx="14"/><rect x="130" y="210" width="140" height="30" rx="15" class="fino"/><rect x="130" y="210" width="96" height="30" rx="15" class="f a2"/><rect x="130" y="260" width="140" height="30" rx="15" class="fino"/><rect x="130" y="260" width="44" height="30" rx="15" class="f"/>`,
  // 8 a DM que não parece venda: conversa com coração
  `<path d="M70,90 h170 a14,14 0 0 1 14,14 v60 a14,14 0 0 1 -14,14 h-120 l-26,22 v-22 h-24 a14,14 0 0 1 -14,-14 v-60 a14,14 0 0 1 14,-14z" class="f"/><path d="M100,125 h110 M100,150 h70" class="fino"/><path d="M330,210 h-150 a14,14 0 0 0 -14,14 v54 a14,14 0 0 0 14,14 h104 l26,22 v-22 h20 a14,14 0 0 0 14,-14 v-54 a14,14 0 0 0 -14,-14z" class="f"/><path d="M250,240 c-12,-14 -34,-4 -26,14 l26,22 l26,-22 c8,-18 -14,-28 -26,-14z" class="f a2"/>`,
  // 9 mais fontes de rendimento: ramos para moedas
  `<path d="M80,300 C150,300 150,200 220,200 M80,300 C160,300 170,300 240,300 M80,300 C150,300 150,110 230,110" class="grosso"/><circle cx="80" cy="300" r="14" class="f a2"/>${moeda(270, 110, 28, '€')}${moeda(260, 200, 28, '€')}${moeda(280, 300, 28, '€')}`,
  // 10 o negócio que cabe na tua vida: portátil, café, relógio
  `<rect class="f" x="80" y="140" width="190" height="120" rx="10"/><path d="M60,268 h230 l-14,22 h-202 z" class="f"/><path d="M110,220 l30,-30 l25,18 l50,-45" class="a2"/><path d="M300,220 h50 v40 a25,25 0 0 1 -50,0z" class="f"/><path d="M350,232 h10 a10,10 0 0 1 0,20 h-10" class="fino"/><path d="M315,205 c-6,-10 6,-14 0,-24 M335,205 c-6,-10 6,-14 0,-24" class="fino"/><circle cx="300" cy="100" r="40" class="f"/><path d="M300,75 v25 l18,12" class="a2"/>`,
  // 11 plano de 30 dias
  `${calendario(90, 140, 6, 5, (k) => k < 17, 34)}<path d="M300,330 l20,-20 l20,20" class="a2"/>`,
]


const RG = [
  // 0 antes de começares: caderno e caneta
  `<rect class="f" x="110" y="70" width="180" height="250" rx="10"/><path d="M130,70 v250" class="fino"/><path d="M150,120 h110 M150,150 h90 M150,180 h105" class="fino"/><path d="M300,110 l30,-30 l20,20 l-30,30 z M300,110 l-36,92 l56,-62" class="f a2"/>`,
  // 1 o dia em que deixei de fingir: crachá de empresa rachado
  `<rect class="f" x="120" y="90" width="160" height="220" rx="14"/><rect x="175" y="70" width="50" height="30" rx="6" class="fino"/><rect x="150" y="130" width="100" height="80" rx="8" class="fino"/><path d="M150,240 h100 M150,265 h70" class="fino"/><path d="M200,90 l-18,60 l26,30 l-20,50 l16,40 l-12,40" class="a2 grosso"/>`,
  // 2 disciplina quando ninguém pergunta: despertador 06:00 + checklist
  `<circle cx="160" cy="190" r="90" class="f"/><circle cx="160" cy="190" r="72" class="fino"/><path d="M160,190 v-48 M160,190 l30,18" class="a2 grosso"/><path d="M90,110 l-26,-26 M230,110 l26,-26" class="grosso"/><path d="M110,290 l-14,24 M210,290 l14,24"/>${[0, 1, 2].map((k) => `<rect x="270" y="${130 + k * 46}" width="28" height="28" rx="6" class="fino"/><path d="M276,${144 + k * 46} l6,6 l12,-14" class="a2"/><path d="M310,${144 + k * 46} h50" class="fino"/>`).join('')}`,
  // 3 a armadilha das 40 horas: ampulheta numa grade
  `<path d="M140,80 h120 M140,320 h120 M150,80 c0,70 100,90 100,120 c0,30 -100,50 -100,120 M250,80 c0,70 -100,90 -100,120 c0,30 100,50 100,120" class="f"/><path d="M175,290 q25,-30 50,0 z" class="f a2"/><path d="M200,200 v60" class="a2 tracejado"/>${[0, 1, 2, 3, 4].map((k) => `<path d="M${90 + k * 55},50 v300" class="fino"/>`).join('')}<text x="200" y="372" text-anchor="middle" class="tx" style="font-size:24px">40 h</text>`,
  // 4 o inventário: prancheta com visto e lupa
  `<rect class="f" x="100" y="80" width="170" height="240" rx="12"/><rect x="150" y="66" width="70" height="28" rx="8" class="fino"/>${[0, 1, 2, 3].map((k) => `<rect x="122" y="${125 + k * 45}" width="24" height="24" rx="5" class="fino"/>${k < 2 ? `<path d="M127,${137 + k * 45} l6,6 l10,-12" class="a2"/>` : ''}<path d="M160,${137 + k * 45} h80" class="fino"/>`).join('')}<circle cx="290" cy="270" r="44" class="f"/><path d="M322,302 l36,36" class="grosso"/>`,
  // 5 dinheiro com estrutura: templo de pilares sobre fundação
  `<path d="M90,150 L200,80 L310,150 Z" class="f"/><path d="M80,310 h240 M90,290 h220" class="grosso"/>${[0, 1, 2, 3].map((k) => `<rect x="${110 + k * 50}" y="160" width="28" height="125" rx="3" class="${k === 1 ? 'f a2' : 'f'}"/>`).join('')}<text x="200" y="135" text-anchor="middle" class="tx" style="font-size:26px">€</text>`,
  // 6 mercados sem fantasia: bola de cristal riscada + velas reais
  `<circle cx="150" cy="170" r="70" class="f"/><path d="M95,250 h110 l-15,-25 h-80 z" class="f"/><path d="M85,240 L215,100" class="a2 grosso"/>${[[250, 200, 60, 1], [282, 170, 80, 0], [314, 150, 70, 1], [346, 120, 90, 1]].map(([x, y, h, up]) => `<path d="M${x + 10},${y - 15} v${h + 30}" class="fino"/><rect x="${x}" y="${y}" width="20" height="${h}" rx="3" class="${up ? 'f a2' : 'f'}"/>`).join('')}`,
  // 7 como leio um gráfico: zonas, velas e linha de tendência
  `<rect x="60" y="110" width="290" height="44" class="f" rx="4"/><rect x="60" y="250" width="290" height="44" class="f a2" rx="4"/>${[[80, 240, 40, 0], [115, 215, 50, 1], [150, 190, 45, 1], [185, 170, 55, 0], [220, 160, 40, 1], [255, 130, 50, 1], [290, 120, 40, 1]].map(([x, y, h, up]) => `<path d="M${x + 9},${y - 14} v${h + 28}" class="fino"/><rect x="${x}" y="${y}" width="18" height="${h}" rx="3" class="${up ? 'f a2' : 'f'}"/>`).join('')}<path d="M70,300 L330,130" class="tracejado"/>`,
  // 8 risco, o colete: colete com 1 %
  `<path d="M140,80 l30,30 h60 l30,-30 l50,40 v170 a20,20 0 0 1 -20,20 h-180 a20,20 0 0 1 -20,-20 v-170 z" class="f"/><path d="M200,110 v210" class="fino"/><rect x="215" y="200" width="70" height="44" rx="8" class="f a2"/><text x="250" y="230" text-anchor="middle" class="tx" style="font-size:22px">1 %</text><path d="M120,180 h60 M120,215 h60" class="fino"/>`,
  // 9 15 minutos por dia: cronómetro e café
  `<circle cx="170" cy="210" r="100" class="f"/><path d="M170,110 v-26 M150,84 h40" class="grosso"/><path d="M170,210 L170,110 A100,100 0 0 1 270,210 Z" class="f a2"/><path d="M170,210 l40,-40" class="grosso"/><text x="170" y="270" text-anchor="middle" class="tx" style="font-size:30px">15'</text><path d="M290,280 h50 v40 a25,25 0 0 1 -50,0z" class="f"/><path d="M340,292 h10 a10,10 0 0 1 0,20 h-10" class="fino"/>`,
  // 10 ninguém chega sozinho: rede de pessoas ligadas (só círculos)
  `${[[200, 120], [110, 200], [290, 200], [150, 300], [250, 300]].map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="${k ? 26 : 34}" class="${k ? 'f' : 'f a2'}"/>`).join('')}<path d="M180,145 L130,180 M220,145 L270,180 M125,225 L140,275 M275,225 L260,275 M176,300 h48 M136,200 h128" class="fino"/>`,
  // 11 o mapa do método: mapa com caminho e seis marcos
  `<path d="M60,90 l90,-30 l100,30 l90,-30 v250 l-90,30 l-100,-30 l-90,30 z" class="f"/><path d="M150,60 v250 M250,90 v250" class="fino"/><path d="M90,300 C130,260 120,220 170,210 S230,160 210,130 S280,100 310,90" class="a2 tracejado"/>${[[90, 300], [140, 240], [190, 205], [215, 140], [265, 108], [310, 90]].map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="9" class="${k === 5 ? 'f a2' : 'f'}"/>`).join('')}`,
  // 12 plano de 30 dias
  `${calendario(90, 140, 6, 5, (k) => k < 17, 34)}<path d="M300,330 l20,-20 l20,20" class="a2"/>`,
]


// O MÉTODO FRIO (Ricardo, Forex + MetaTrader 5): termómetro, cristais de gelo e instrumentos de precisão
const floco = (x, y, r) => `<path d="M${x},${y - r} v${2 * r} M${x - r * 0.87},${y - r / 2} l${r * 1.74},${r} M${x - r * 0.87},${y + r / 2} l${r * 1.74},${-r}" class="a2"/><path d="M${x - 6},${y - r + 8} l6,-8 l6,8 M${x - 6},${y + r - 8} l6,8 l6,-8" class="fino"/>`
const vela = (x, y, h, up) => `<path d="M${x + 9},${y - 14} v${h + 28}" class="fino"/><rect x="${x}" y="${y}" width="18" height="${h}" rx="3" class="${up ? 'f a2' : 'f'}"/>`
const FRIO = [
  // 0 antes de começares: termómetro em baixo + floco
  `<rect class="f" x="170" y="60" width="44" height="220" rx="22"/><circle cx="192" cy="300" r="40" class="f a2"/><path d="M192,290 v-60" class="a2 grosso"/>${[0, 1, 2, 3, 4].map((k) => `<path d="M214,${90 + k * 36} h18" class="fino"/>`).join('')}${floco(300, 130, 40)}${floco(95, 220, 26)}`,
  // 1 o mercado não sabe que existes: globo com setas de câmbio € $
  `<circle cx="200" cy="200" r="110" class="f"/><ellipse cx="200" cy="200" rx="45" ry="110" class="fino"/><path d="M90,200 h220 M105,145 h190 M105,255 h190" class="fino"/>${moeda(110, 100, 28, '€')}${moeda(300, 310, 28, '$')}<path d="M140,96 C230,80 300,150 302,270" class="a2 tracejado"/><path d="M292,262 l10,14 l10,-14" class="a2"/>`,
  // 2 pips, lotes e o preço de um erro: régua milimétrica sobre vela
  `${vela(110, 140, 150, 1)}<rect class="f" x="170" y="110" width="60" height="230" rx="6"/>${Array.from({ length: 11 }, (_, k) => `<path d="M170,${125 + k * 20} h${k % 5 === 0 ? 26 : 14}" class="${k % 5 === 0 ? 'a2' : 'fino'}"/>`).join('')}<text x="300" y="190" text-anchor="middle" class="tx" style="font-size:34px">0,0001</text><path d="M250,200 h100" class="fino"/>${[0, 1, 2].map((k) => `<rect x="${262 + k * 30}" y="${230 - k * 18}" width="24" height="${40 + k * 18}" rx="4" class="${k === 0 ? 'f a2' : 'f'}"/>`).join('')}`,
  // 3 instalar o MetaTrader 5: telemóvel com gráfico e barra de download
  `<rect class="f" x="130" y="50" width="140" height="290" rx="24"/><path d="M180,68 h40" class="fino"/>${[[150, 200, 40, 1], [175, 180, 50, 0], [200, 160, 45, 1], [225, 140, 50, 1]].map(([x, y, h, u]) => vela(x, y, h, u)).join('')}<rect x="150" y="280" width="100" height="14" rx="7" class="fino"/><rect x="150" y="280" width="64" height="14" rx="7" class="f a2"/><text x="200" y="120" text-anchor="middle" class="tx" style="font-size:22px">MT5</text>`,
  // 4 a ordem fria: botões vender/comprar + escudo do stop
  `<rect class="f" x="70" y="130" width="120" height="70" rx="12"/><rect class="f a2" x="210" y="130" width="120" height="70" rx="12"/><text x="130" y="173" text-anchor="middle" class="tx" style="font-size:20px">Vender</text><text x="270" y="173" text-anchor="middle" class="tx" style="font-size:20px">Comprar</text><path d="M120,240 h160" class="tracejado"/><text x="200" y="232" text-anchor="middle" class="tx" style="font-size:15px">SL</text><path d="M200,260 L250,278 V312 C250,338 228,352 200,362 C172,352 150,338 150,312 V278 Z" class="f"/><path d="M180,310 l14,14 l28,-30" class="a2 grosso"/>`,
  // 5 ler o gráfico: zonas de suporte e resistência e Fibonacci
  `<rect x="60" y="100" width="290" height="36" class="f" rx="4"/><rect x="60" y="270" width="290" height="36" class="f a2" rx="4"/>${[[80, 250, 40, 1], [115, 215, 50, 1], [150, 160, 60, 1], [185, 120, 40, 0], [220, 150, 50, 0], [255, 185, 40, 1], [290, 140, 50, 1]].map(([x, y, h, u]) => vela(x, y, h, u)).join('')}${[[175, '38,2'], [205, '50'], [235, '61,8']].map(([y, t]) => `<path d="M60,${y} h290" class="fino tracejado"/><text x="356" y="${y + 5}" class="tx" style="font-size:12px">${t}</text>`).join('')}`,
  // 6 o tamanho certo: balança com 1 % de um lado e lote do outro
  `<path d="M200,80 v220 M140,320 h120" class="grosso"/><path d="M90,130 h220" class="grosso"/><path d="M90,130 l-36,80 h72 z M310,130 l-36,80 h72 z" class="fino"/><path d="M54,210 a36,14 0 0 0 72,0 M274,210 a36,14 0 0 0 72,0" class="f"/><text x="90" y="200" text-anchor="middle" class="tx" style="font-size:22px">1 %</text><text x="310" y="200" text-anchor="middle" class="tx" style="font-size:18px">0,02</text><circle cx="200" cy="80" r="10" class="f a2"/>`,
  // 7 notícias e calendário: calendário com relâmpago
  `${calendario(80, 150, 5, 4, () => false, 40)}<path d="M240,160 l-40,70 h34 l-24,60 l70,-90 h-36 l26,-40 z" class="f a2"/>`,
  // 8 o plano numa página: folha com checklist presa por clipe
  `<rect class="f" x="110" y="70" width="180" height="260" rx="10"/><path d="M180,58 h40 v30 h-40 z" class="fino"/>${[0, 1, 2, 3, 4].map((k) => `<rect x="132" y="${110 + k * 42}" width="22" height="22" rx="5" class="fino"/><path d="M136,${121 + k * 42} l6,6 l10,-12" class="a2"/><path d="M168,${121 + k * 42} h${90 - (k % 2) * 20}" class="fino"/>`).join('')}`,
  // 9 o diário: caderno aberto com moldura de captura de ecrã
  `<path d="M200,110 C160,90 110,90 70,104 V310 C110,296 160,296 200,316 C240,296 290,296 330,310 V104 C290,90 240,90 200,110 Z" class="f"/><path d="M200,110 V316" class="fino"/><rect x="220" y="140" width="90" height="64" rx="6" class="fino"/>${[[230, 180, 14, 1], [248, 165, 18, 1], [266, 175, 12, 0], [284, 158, 20, 1]].map(([x, y, h, u]) => `<rect x="${x}" y="${y}" width="10" height="${h}" rx="2" class="${u ? 'f a2' : 'f'}"/>`).join('')}<path d="M90,150 h90 M90,180 h70 M90,210 h90 M90,240 h60 M230,240 h70 M230,268 h50" class="fino"/>`,
  // 10 a cabeça fria: cabeça de perfil feita de geometria com floco dentro
  `<path d="M150,330 v-50 c-40,-20 -60,-60 -60,-100 c0,-70 50,-110 115,-110 c60,0 105,45 105,105 c0,20 -6,30 -14,44 l22,40 h-26 v40 c0,14 -10,22 -24,22 h-40 v9" class="f"/>${floco(210, 180, 44)}`,
  // 11 do demo ao real: duas portas, demo e real, com passos
  `<rect class="f" x="70" y="100" width="110" height="200" rx="8"/><rect class="f a2" x="220" y="100" width="110" height="200" rx="8"/><text x="125" y="90" text-anchor="middle" class="tx" style="font-size:18px">DEMO</text><text x="275" y="90" text-anchor="middle" class="tx" style="font-size:18px">REAL</text><circle cx="160" cy="205" r="5" class="a2"/><circle cx="310" cy="205" r="5"/>${[0, 1, 2, 3].map((k) => `<path d="M${120 + k * 40},${340 - k * 8} h30" class="${k === 3 ? 'a2 grosso' : 'fino'}"/>`).join('')}`,
  // 12 plano de 30 dias
  `${calendario(90, 140, 6, 5, (k) => k < 12, 34)}${floco(320, 320, 22)}`,
]

// A DECISÃO QUE ADIAS (Liliana Salgueiro, desenvolvimento pessoal): geometria de mente, ciclos, portas e ondas
const seta = (x, y, ang) => `<path d="M${x},${y} l-10,-6 M${x},${y} l-10,6" class="a2" transform="rotate(${ang} ${x} ${y})"/>`
const ciclo = (cx, cy, r, n, rotulos) => {
  let o = `<circle cx="${cx}" cy="${cy}" r="${r}" class="fino tracejado"/>`
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
    o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" class="${k === 0 ? 'f a2' : 'f'}"/>`
    if (rotulos) o += `<text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle" class="tx" style="font-size:13px">${k + 1}</text>`
  }
  return o
}
const MENTE = [
  // 0 antes de começares: ponto de interrogação feito de ondas
  `${[40, 70, 100, 130].map((r, k) => `<circle cx="200" cy="200" r="${r}" class="${k === 1 ? 'a2' : 'fino'}${k % 2 ? ' tracejado' : ''}"/>`).join('')}<path d="M172,170 c0,-34 56,-34 56,0 c0,22 -28,24 -28,46 v10" class="a2 grosso"/><circle cx="200" cy="252" r="7" class="f a2"/>`,
  // 1 quantas vezes soubeste: lâmpada acesa atrás de uma porta fechada
  `<rect x="120" y="70" width="160" height="270" rx="6" class="f"/><circle cx="252" cy="210" r="7" class="a2"/><path d="M200,120 c-30,0 -46,22 -46,46 c0,20 14,30 20,46 h52 c6,-16 20,-26 20,-46 c0,-24 -16,-46 -46,-46 z" class="fino"/><path d="M180,226 h40 M184,240 h32" class="fino"/><path d="M200,90 v-20 M140,120 l-14,-14 M260,120 l14,-14" class="a2"/>`,
  // 2 o que é uma crença: cabeça de perfil com uma frase-moldura dentro
  `<path d="M150,330 v-50 c-40,-20 -60,-60 -60,-100 c0,-70 50,-110 115,-110 c60,0 105,45 105,105 c0,20 -6,30 -14,44 l22,40 h-26 v40 c0,14 -10,22 -24,22 h-40 v9" class="f"/><rect x="140" y="150" width="130" height="50" rx="10" class="f a2"/><path d="M158,170 h94 M158,184 h60" class="fino"/>`,
  // 3 limitação real ou aprendida: muro sólido vs linha tracejada
  `${[0, 1, 2, 3].map((r) => [0, 1].map((c) => `<rect x="${70 + c * 50 + (r % 2) * 25}" y="${130 + r * 40}" width="46" height="34" rx="3" class="f"/>`).join('')).join('')}<path d="M260,120 v200" class="a2 tracejado grosso"/><path d="M300,220 h60" class="fino"/>${seta(360, 220, 0)}<text x="110" y="110" text-anchor="middle" class="tx" style="font-size:15px">REAL</text><text x="262" y="110" text-anchor="middle" class="tx" style="font-size:15px">APRENDIDA</text>`,
  // 4 a frase que virou voz: balão de fala que se transforma em eco dentro da cabeça
  `<path d="M70,90 h140 a16,16 0 0 1 16,16 v50 a16,16 0 0 1 -16,16 h-90 l-24,22 v-22 h-26 a16,16 0 0 1 -16,-16 v-50 a16,16 0 0 1 16,-16 z" class="f"/><path d="M90,120 h100 M90,140 h70" class="fino"/>${[30, 55, 80].map((r, k) => `<path d="M${280 - r * 0.5},${270 - r} a${r},${r} 0 0 1 0,${r * 2}" class="${k === 0 ? 'a2' : 'fino'}" transform="translate(${k * 4},0)"/>`).join('')}<circle cx="250" cy="270" r="12" class="f a2"/>`,
  // 5 quem tiveste de ser: escudo partido com uma silhueta a sair
  `<path d="M200,70 L300,110 V200 C300,268 254,306 200,330 C146,306 100,268 100,200 V110 Z" class="f"/><path d="M200,70 L190,150 L215,190 L196,250 L205,330" class="a2 grosso"/><circle cx="250" cy="180" r="18" class="fino"/><path d="M226,240 c4,-26 44,-26 48,0" class="fino"/>`,
  // 6 o alívio que te prende: ciclo de seis passos com um elo de corrente
  `${ciclo(200, 200, 110, 6, true)}<path d="M180,200 a14,14 0 0 1 14,-14 h12 a14,14 0 0 1 0,28 h-6 M220,200 a14,14 0 0 1 -14,14 h-12 a14,14 0 0 1 0,-28 h6" class="a2 grosso"/>`,
  // 7 o que ganhas em ficar igual: balança entre «agora» e «depois»
  `<path d="M200,80 v220 M140,320 h120" class="grosso"/><path d="M80,150 l240,-30" class="grosso"/><path d="M80,150 l-30,70 h60 z M320,120 l-30,70 h60 z" class="fino"/><path d="M50,220 a30,12 0 0 0 60,0 M290,190 a30,12 0 0 0 60,0" class="f"/><text x="80" y="210" text-anchor="middle" class="tx" style="font-size:15px">AGORA</text><text x="320" y="180" text-anchor="middle" class="tx" style="font-size:15px">DEPOIS</text><circle cx="200" cy="135" r="10" class="f a2"/>`,
  // 8 desejar não é construir: estrela sonhada em tracejado e uma escada de blocos reais
  `<path d="M290,70 l14,30 l32,4 l-24,22 l7,32 l-29,-16 l-29,16 l7,-32 l-24,-22 l32,-4 z" class="a2 tracejado"/>${[0, 1, 2, 3, 4].map((k) => `<rect x="${70 + k * 44}" y="${320 - (k + 1) * 36}" width="44" height="${(k + 1) * 36}" rx="3" class="${k === 4 ? 'f a2' : 'f'}"/>`).join('')}`,
  // 9 vibração e causa-efeito: diapasão a emitir ondas + dominós
  `<path d="M120,320 v-70 M100,250 v-150 a20,20 0 0 0 40,0 v150 z" class="f"/>${[30, 55, 80].map((r, k) => `<path d="M${150},${150 - r * 0.6} a${r},${r} 0 0 1 0,${r * 1.2}" class="${k === 0 ? 'a2' : 'fino'}" transform="translate(${r * 0.4},0)"/>`).join('')}${[0, 1, 2, 3].map((k) => `<rect x="${230 + k * 30}" y="${250 - k * 6}" width="18" height="70" rx="3" class="${k === 0 ? 'f a2' : 'f'}" transform="rotate(${-25 + k * 8} ${239 + k * 30} 320)"/>`).join('')}`,
  // 10 do saber ao fazer: livro aberto de onde sai um passo/pegada
  `<path d="M200,190 C160,170 110,170 70,184 V320 C110,306 160,306 200,326 C240,306 290,306 330,320 V184 C290,170 240,170 200,190 Z" class="f"/><path d="M200,190 V326" class="fino"/><path d="M200,160 v-70" class="a2 grosso tracejado"/>${seta(200, 82, -90)}<ellipse cx="160" cy="70" rx="14" ry="22" class="f a2"/><ellipse cx="240" cy="110" rx="14" ry="22" class="f"/>`,
  // 11 plano de 30 dias
  `${calendario(90, 140, 6, 5, (k) => k < 9, 34)}<circle cx="320" cy="320" r="22" class="a2"/><circle cx="320" cy="320" r="34" class="fino tracejado"/>`,
]

export function ilustracao(tema, n) {
  const lista = tema === 'cripto' ? CRIPTO : tema === 'faceless' ? FACELESS : tema === 'rg' ? RG : tema === 'frio' ? FRIO : tema === 'mente' ? MENTE : null
  const inner = lista?.[n]
  return inner ? S(inner) : ''
}
