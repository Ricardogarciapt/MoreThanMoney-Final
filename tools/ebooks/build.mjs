// Monta os e-books MTM: um HTML interativo (gráficos animados, capa 3D, índice) e um PDF A5
// a partir do mesmo HTML. Também desenha a capa plana e o mockup 3D para o marketplace.
//
//   node tools/ebooks/build.mjs [slug|all] [--sem-pdf]
//
// Entradas: conteudo-privado/ebooks/<slug>/NN-*.md
// Saídas:   conteudo-privado/ebooks/<slug>/<slug>.html e <slug>.pdf
//           public/marketplace/ebooks/<slug>-capa.jpg e <slug>-3d.png
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mdParaHtml, inline } from './md.mjs'
import { LIVROS } from './livros.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '../..')
const SRC = path.join(RAIZ, 'conteudo-privado/ebooks')
const PUB = path.join(RAIZ, 'public/marketplace/ebooks')

const b64 = (p) => fs.readFileSync(p).toString('base64')
const fonte = (familia, ficheiro, peso = 400, estilo = 'normal') =>
  `@font-face{font-family:'${familia}';src:url(data:font/ttf;base64,${b64(path.join(AQUI, 'fontes', ficheiro))}) format('truetype');font-weight:${peso};font-style:${estilo};font-display:swap}`
const img = (f) => (f ? `data:image/${f.endsWith('png') ? 'png' : 'jpeg'};base64,${b64(path.join(AQUI, 'img', f))}` : '')

// ── temas ───────────────────────────────────────────────────────────────────────
const TEMAS = {
  rg: {
    fontes: () => fonte('Anton', 'Anton.ttf') + fonte('Oswald', 'Oswald.ttf', '200 700') + fonte('Kalam', 'Kalam.ttf') + fonte('Inter', 'Inter-1.ttf', 400) + fonte('Inter', 'Inter-2.ttf', 600) + fonte('Inter', 'Inter-3.ttf', 800),
    vars: `--fundo:#0b0b0c;--papel:#f6f1e7;--tinta:#1b1a17;--a:#D2A63C;--a2:#E9C46A;--a3:#8a6a1f;--mut:#7a7262;--lin:#e2d8c3;--titulo:'Anton',sans-serif;--sub:'Oswald',sans-serif;--mao:'Kalam',cursive;--corpo:'Inter',sans-serif;--escuro:#121212;--claro-sobre-escuro:#f3ead7`,
  },
  cripto: {
    fontes: () => fonte('SpaceGrotesk', 'SpaceGrotesk-1.ttf', 500) + fonte('SpaceGrotesk', 'SpaceGrotesk-2.ttf', 700) + fonte('JetBrains', 'JetBrainsMono-1.ttf', 500) + fonte('Inter', 'Inter-1.ttf', 400) + fonte('Inter', 'Inter-2.ttf', 600),
    vars: `--fundo:#060a14;--papel:#f4f7fb;--tinta:#0e1626;--a:#19d3c5;--a2:#7c5cff;--a3:#0e8f86;--mut:#5d6b82;--lin:#d9e1ec;--titulo:'SpaceGrotesk',sans-serif;--sub:'SpaceGrotesk',sans-serif;--mao:'JetBrains',monospace;--corpo:'Inter',sans-serif;--escuro:#0a1222;--claro-sobre-escuro:#e6f6ff`,
  },
  faceless: {
    fontes: () => fonte('Cormorant', 'Cormorant-1.ttf', 600) + fonte('Cormorant', 'Cormorant-2.ttf', 500, 'italic') + fonte('DMSans', 'DMSans-1.ttf', 400) + fonte('DMSans', 'DMSans-2.ttf', 700),
    vars: `--fundo:#1a1416;--papel:#fbf6f1;--tinta:#2a2023;--a:#b5737e;--a2:#d9a5a0;--a3:#7d4a52;--mut:#8b7a77;--lin:#eadcd3;--titulo:'Cormorant',serif;--sub:'DMSans',sans-serif;--mao:'Cormorant',serif;--corpo:'DMSans',sans-serif;--escuro:#231a1c;--claro-sobre-escuro:#f7ece6`,
  },
}

// ── arte de capa e aberturas (SVG original por livro) ────────────────────────────
function arteCapa(livro) {
  if (livro.tema === 'rg') {
    // bloco de ouro estilhaçado cujos fragmentos se reorganizam numa linha ascendente
    let frag = ''
    const pts = [[90, 520], [150, 470], [210, 490], [270, 410], [330, 430], [390, 340], [450, 360], [510, 260], [570, 200]]
    pts.forEach(([x, y], i) => {
      const s = 14 + i * 3
      frag += `<polygon class="frag" style="--i:${i}" points="${x},${y - s} ${x + s},${y} ${x + s * 0.3},${y + s * 0.9} ${x - s * 0.8},${y + s * 0.2}" />`
    })
    return `<svg class="arte" viewBox="0 0 640 640" aria-hidden="true">
      <defs><linearGradient id="ouro" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f6dc8a"/><stop offset=".5" stop-color="#D2A63C"/><stop offset="1" stop-color="#7a5714"/></linearGradient></defs>
      <polyline class="rasto" points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="url(#ouro)" stroke-width="3" stroke-dasharray="4 10" opacity=".7"/>
      <g fill="url(#ouro)">${frag}</g>
      <path d="M40,600 L120,560 L95,610 Z M60,560 l30,-10 -8,28z" fill="url(#ouro)" opacity=".55"/>
    </svg>`
  }
  if (livro.tema === 'cripto') {
    // chave feita de blocos isométricos
    const cubo = (x, y, s, c) => `<g transform="translate(${x},${y})" class="cubo" style="--i:${c}"><path d="M0,${-s} L${s * 0.87},${-s / 2} L0,0 L${-s * 0.87},${-s / 2} Z" fill="#7c5cff"/><path d="M${-s * 0.87},${-s / 2} L0,0 L0,${s} L${-s * 0.87},${s / 2} Z" fill="#0e8f86"/><path d="M${s * 0.87},${-s / 2} L0,0 L0,${s} L${s * 0.87},${s / 2} Z" fill="#19d3c5"/></g>`
    let g = ''
    // anel da chave
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g += cubo(200 + Math.cos(a) * 92, 260 + Math.sin(a) * 92, 22, k) }
    // haste
    for (let k = 0; k < 7; k++) g += cubo(300 + k * 38, 260 + k * 22, 22, 12 + k)
    // dentes
    g += cubo(490, 330, 20, 20) + cubo(452, 352, 20, 21) + cubo(528, 352, 18, 22)
    return `<svg class="arte" viewBox="0 0 640 520" aria-hidden="true"><defs><radialGradient id="brilho"><stop offset="0" stop-color="#19d3c5" stop-opacity=".45"/><stop offset="1" stop-color="#19d3c5" stop-opacity="0"/></radialGradient></defs><circle cx="320" cy="280" r="260" fill="url(#brilho)"/>${g}</svg>`
  }
  // faceless: duas mãos em traço contínuo a segurar um telemóvel com uma notificação
  return `<svg class="arte" viewBox="0 0 640 560" aria-hidden="true" fill="none" stroke="#f7ece6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="250" y="120" width="150" height="290" rx="26" stroke="#d9a5a0" stroke-width="4"/>
    <rect x="266" y="150" width="118" height="44" rx="12" fill="#b5737e" stroke="none" class="notif"/>
    <text x="325" y="178" fill="#fbf6f1" stroke="none" font-family="DMSans" font-size="15" text-anchor="middle" font-weight="700">Nova venda ♥</text>
    <path class="traco" d="M120,520 C150,430 170,380 215,350 C235,336 250,330 262,318 C270,300 262,282 246,286 C230,290 214,316 196,330 M215,350 C230,300 245,260 262,240 C272,228 286,236 280,252 L262,300" />
    <path class="traco" d="M530,520 C500,430 480,384 440,356 C420,342 404,332 392,320 C384,300 394,284 410,290 C428,296 440,318 458,332 M392,250 C404,236 420,240 414,258 L398,300 M398,214 C410,200 428,206 420,226 L400,270" />
    <circle cx="325" cy="380" r="9" stroke="#d9a5a0"/>
  </svg>`
}

// ── HTML ─────────────────────────────────────────────────────────────────────────
function montarHtml(slug, livro, capitulos) {
  const tema = TEMAS[livro.tema]
  const avisos = []
  const caps = capitulos.map((c, i) => {
    const md = fs.readFileSync(c, 'utf8')
    const linhas = md.split('\n')
    const t = (linhas.find((l) => l.startsWith('# ')) || '# Capítulo').replace(/^#\s+/, '')
    const resto = linhas.slice(linhas.findIndex((l) => l.startsWith('# ')) + 1)
    let epigrafe = ''
    const k = resto.findIndex((l) => l.trim())
    if (k >= 0 && resto[k].trim().startsWith('>')) { epigrafe = resto[k].trim().replace(/^>\s?/, ''); resto.splice(k, 1) }
    const num = path.basename(c).slice(0, 2)
    return { id: `cap-${num}`, num, titulo: t, epigrafe, html: mdParaHtml(resto.join('\n'), { avisos }) }
  })
  if (avisos.length) console.warn(slug, avisos)

  const numero = (n) => (n === '00' ? '00' : n === String(capitulos.length - 1).padStart(2, '0') && /plano/i.test(caps.at(-1).titulo) ? 'Anexo' : String(Number(n)))
  const capaHtml = `
  <section class="pagina capa" id="capa">
    <div class="capa-3d"><div class="capa-face">
      ${livro.foto ? `<img class="capa-foto" src="${img(livro.foto)}" alt="">` : ''}
      <div class="capa-veu"></div>
      ${arteCapa(livro)}
      <div class="capa-txt">
        <div class="capa-autor">${livro.autor}</div>
        <h1 class="capa-titulo"><span>${livro.titulo}</span><em>${livro.titulo2}</em></h1>
        <p class="capa-sub">${livro.subtitulo}</p>
      </div>
      <img class="capa-selo" src="${img(livro.selo)}" alt="">
    </div></div>
  </section>`

  const rosto = `
  <section class="pagina rosto">
    <div class="rosto-in">
      <div class="rosto-autor">${livro.autor}</div>
      <h1>${livro.titulo} <em>${livro.titulo2}</em></h1>
      <p class="rosto-sub">${livro.subtitulo}</p>
      <div class="rosto-fim"><img src="${img('mtm.png')}" alt="MoreThanMoney"><span>MoreThanMoney · morethanmoney.pt</span></div>
    </div>
  </section>
  <section class="pagina ficha">
    <div class="ficha-in">
      <p><strong>${livro.titulo} ${livro.titulo2}</strong><br>${livro.subtitulo}</p>
      <p>© 2026 ${livro.autor} e MoreThanMoney. Todos os direitos reservados. Esta cópia é pessoal e intransmissível: não a partilhes nem a revendas.</p>
      <p>${livro.edicao}</p>
      <p class="ficha-aviso"><strong>Aviso importante.</strong> ${livro.aviso}</p>
      ${livro.fotoInterior ? `<img class="ficha-foto" src="${img(livro.fotoInterior)}" alt="">` : ''}
      <p class="ficha-bio"><strong>Sobre o autor.</strong> ${livro.autorBio}</p>
    </div>
  </section>`

  const indice = `
  <section class="pagina indice" id="indice">
    <h2 class="indice-t">Índice</h2>
    <ol class="indice-l">${caps.map((c) => `<li><a href="#${c.id}"><span class="i-n">${numero(c.num)}</span><span class="i-t">${inline(c.titulo)}</span></a></li>`).join('')}</ol>
  </section>`

  const corpo = caps.map((c) => `
  <section class="abertura pagina" id="${c.id}">
    <div class="ab-num">${numero(c.num)}</div>
    <h2 class="ab-titulo">${inline(c.titulo)}</h2>
    ${c.epigrafe ? `<p class="ab-epigrafe">${inline(c.epigrafe)}</p>` : ''}
    <div class="ab-arte">${arteAbertura(livro, Number(c.num))}</div>
  </section>
  <article class="capitulo">${c.html}</article>`).join('\n')

  const fecho = `
  <section class="pagina fecho">
    <div class="fecho-in">
      <p class="fecho-mao">Obrigado por leres até aqui.</p>
      <p>Continua o caminho com a comunidade MoreThanMoney: aulas ao vivo, ferramentas e pessoas que estão a fazer o mesmo percurso.</p>
      <p class="fecho-url">morethanmoney.pt</p>
      <p class="ficha-aviso">${livro.aviso}</p>
    </div>
  </section>`

  return `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${livro.titulo} ${livro.titulo2} — ${livro.autor}</title><meta name="robots" content="noindex,nofollow">
<style>${tema.fontes()}:root{${tema.vars}}${CSS}</style></head>
<body class="tema-${livro.tema}">
<header class="barra"><a href="#capa" class="barra-t">${livro.titulo} ${livro.titulo2}</a><span class="barra-a">${livro.autor}</span><a class="barra-b" href="#indice">Índice</a><a class="barra-b barra-pdf" href="?f=pdf">PDF</a><div class="progresso"><i></i></div></header>
<main class="livro">${capaHtml}${rosto}${indice}${corpo}${fecho}</main>
<script>${JS}</script></body></html>`
}

function arteAbertura(livro, n) {
  // motivo geométrico por capítulo, na linguagem de cada marca
  const r = (s) => { let x = s * 9301 + 49297; return () => ((x = (x * 9301 + 49297) % 233280) / 233280) }
  const rnd = r(n + 3)
  let s = ''
  if (livro.tema === 'rg') {
    for (let k = 0; k < 9; k++) {
      const x = 40 + k * 60, h = 30 + rnd() * 140 + k * 8, w = 30
      s += `<rect class="ab-el" style="--i:${k}" x="${x}" y="${220 - h}" width="${w}" height="${h}" rx="3"/>`
    }
    s += `<polyline class="ab-linha" points="${Array.from({ length: 9 }, (_, k) => `${55 + k * 60},${200 - k * 18 - rnd() * 30}`).join(' ')}"/>`
  } else if (livro.tema === 'cripto') {
    for (let k = 0; k < 6; k++) {
      const x = 60 + k * 90, y = 120 + (k % 2 ? 30 : -10)
      s += `<g class="ab-el" style="--i:${k}"><rect x="${x}" y="${y}" width="56" height="56" rx="8"/><text x="${x + 28}" y="${y + 34}" text-anchor="middle">#${(n * 7 + k * 13).toString(16).padStart(2, '0')}</text></g>`
      if (k < 5) s += `<line class="ab-linha" x1="${x + 56}" y1="${y + 28}" x2="${x + 90}" y2="${120 + ((k + 1) % 2 ? 30 : -10) + 28}"/>`
    }
  } else {
    for (let k = 0; k < 5; k++) s += `<circle class="ab-el" style="--i:${k}" cx="${300 + Math.cos(k + n) * 120}" cy="${130 + Math.sin(k * 2 + n) * 50}" r="${20 + rnd() * 50}"/>`
    s += `<path class="ab-linha" d="M60,200 C180,${60 + n * 8} 420,${240 - n * 6} 580,90"/>`
  }
  return `<svg viewBox="0 0 640 240" aria-hidden="true">${s}</svg>`
}

// ── estilos ──────────────────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--fundo);color:var(--tinta);font-family:var(--corpo);font-size:16px;line-height:1.62;-webkit-font-smoothing:antialiased}
.barra{position:sticky;top:0;z-index:10;display:flex;gap:14px;align-items:center;padding:10px 16px;background:color-mix(in srgb,var(--fundo) 88%,transparent);backdrop-filter:blur(10px);color:var(--claro-sobre-escuro);font-family:var(--sub);font-size:14px;letter-spacing:.02em}
.barra a{color:inherit;text-decoration:none}.barra-t{font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.barra-a{opacity:.6}
.barra-b{border:1px solid color-mix(in srgb,var(--a) 60%,transparent);padding:4px 10px;border-radius:999px}
.progresso{position:absolute;left:0;bottom:0;height:2px;width:100%}.progresso i{display:block;height:100%;width:0;background:var(--a)}
.livro{max-width:760px;margin:0 auto;padding:24px 16px 80px}
.pagina,.capitulo{background:var(--papel);border-radius:18px;margin:0 0 28px;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.capitulo{padding:40px clamp(20px,6vw,64px)}
/* capa */
.capa{background:transparent;box-shadow:none;perspective:1400px;padding:20px 0 40px}
.capa-3d{width:min(440px,86vw);margin:0 auto;transform-style:preserve-3d;transition:transform .25s ease-out}
.capa-face{position:relative;aspect-ratio:2/3;border-radius:6px 14px 14px 6px;overflow:hidden;background:var(--escuro);color:var(--claro-sobre-escuro);box-shadow:-14px 26px 60px rgba(0,0,0,.55),inset 6px 0 10px rgba(255,255,255,.08)}
.capa-face::before{content:'';position:absolute;inset:0 auto 0 0;width:14px;background:linear-gradient(90deg,rgba(0,0,0,.45),rgba(255,255,255,.08),transparent);z-index:5}
.capa-foto{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;filter:grayscale(1) contrast(1.15) brightness(.82)}
.capa-veu{position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(8,8,8,.75) 58%,#0b0b0c 82%)}
.capa .arte{position:absolute;left:0;right:0;bottom:22%;width:100%;opacity:.95}
.capa-txt{position:absolute;left:8%;right:8%;bottom:7%;z-index:3}
.capa-autor{font-family:var(--sub);letter-spacing:.28em;text-transform:uppercase;font-size:12px;color:var(--a2)}
.capa-titulo{margin:.2em 0 .25em;line-height:.9}.capa-titulo span{display:block;font-family:var(--titulo);font-size:clamp(46px,10vw,74px);text-transform:uppercase;letter-spacing:.01em}
.capa-titulo em{display:block;font-style:normal;font-family:var(--mao);color:var(--a);font-size:clamp(34px,7vw,52px);transform:rotate(-3deg);margin-top:.12em}
.capa-sub{font-size:13px;line-height:1.45;opacity:.85;max-width:30ch;margin:0}
.capa-selo{position:absolute;top:5%;right:6%;width:44px;opacity:.9;z-index:3}
.tema-cripto .capa-face{background:radial-gradient(120% 80% at 50% 30%,#10203f,#060a14 70%)}
.tema-cripto .capa .arte{top:9%;bottom:auto}.tema-cripto .capa-titulo span{font-weight:700;text-transform:none;letter-spacing:-.02em}
.tema-cripto .capa-titulo em{font-family:var(--titulo);font-weight:700;transform:none;font-size:clamp(56px,12vw,92px);background:linear-gradient(90deg,#19d3c5,#7c5cff);-webkit-background-clip:text;color:transparent;letter-spacing:-.03em;line-height:.95}
.tema-faceless .capa-face{background:linear-gradient(160deg,#2a1e21,#1a1416 60%)}
.tema-faceless .capa .arte{top:6%;bottom:auto;width:92%;left:4%}
.tema-faceless .capa-titulo span{font-family:var(--titulo);text-transform:none;font-weight:600;font-size:clamp(44px,9vw,64px)}
.tema-faceless .capa-titulo em{font-family:var(--titulo);font-style:italic;font-weight:500;color:var(--a2);transform:none;font-size:clamp(76px,16vw,120px);line-height:.85}
/* rosto e ficha */
.rosto,.ficha,.indice,.fecho{padding:56px clamp(22px,7vw,70px)}
.rosto-in{min-height:520px;display:flex;flex-direction:column}.rosto-autor{font-family:var(--sub);letter-spacing:.25em;text-transform:uppercase;color:var(--a3);font-size:13px}
.rosto h1{font-family:var(--titulo);font-size:clamp(40px,8vw,64px);line-height:.95;margin:.4em 0;text-transform:uppercase}.rosto h1 em{font-family:var(--mao);color:var(--a);text-transform:none;font-style:normal;display:block}
.tema-faceless .rosto h1,.tema-cripto .rosto h1{text-transform:none}.tema-faceless .rosto h1 em{font-style:italic}
.rosto-sub{font-size:18px;color:var(--mut);max-width:34ch}.rosto-fim{margin-top:auto;display:flex;gap:10px;align-items:center;font-size:12px;color:var(--mut)}.rosto-fim img{width:34px;filter:drop-shadow(0 0 1px #000)}
.ficha{font-size:13px;color:var(--mut)}.ficha-aviso{border-left:3px solid var(--a);padding-left:12px}.ficha-foto{width:120px;height:150px;object-fit:cover;border-radius:10px;float:right;margin:0 0 10px 16px}
/* índice */
.indice-t{font-family:var(--titulo);font-size:44px;margin:0 0 20px;text-transform:uppercase}.tema-faceless .indice-t,.tema-cripto .indice-t{text-transform:none}
.indice-l{list-style:none;padding:0;margin:0}.indice-l a{display:flex;gap:18px;padding:12px 0;border-bottom:1px solid var(--lin);color:inherit;text-decoration:none;align-items:baseline}
.i-n{font-family:var(--titulo);color:var(--a);min-width:64px;font-size:22px}.i-t{font-size:17px;font-weight:600}
/* aberturas */
.abertura{background:var(--escuro);color:var(--claro-sobre-escuro);padding:60px clamp(22px,7vw,70px) 30px;position:relative;overflow:hidden}
.ab-num{font-family:var(--titulo);font-size:clamp(90px,22vw,170px);line-height:.85;color:transparent;-webkit-text-stroke:2px var(--a);opacity:.9}
.tema-faceless .ab-num{font-style:italic;-webkit-text-stroke:1.5px var(--a2)}
.ab-titulo{font-family:var(--titulo);font-size:clamp(32px,6.5vw,52px);line-height:1;margin:.25em 0 .4em;text-transform:uppercase;max-width:16ch}
.tema-faceless .ab-titulo,.tema-cripto .ab-titulo{text-transform:none;font-weight:700}.tema-faceless .ab-titulo{font-weight:600}
.ab-epigrafe{font-family:var(--mao);font-size:22px;color:var(--a2);max-width:32ch;line-height:1.35}.tema-cripto .ab-epigrafe{font-size:15px}.tema-faceless .ab-epigrafe{font-style:italic;font-size:24px}
.ab-arte svg{width:100%;margin-top:20px}.ab-el{fill:color-mix(in srgb,var(--a) 70%,transparent)}.tema-cripto .ab-el rect{fill:none;stroke:var(--a);stroke-width:2}.tema-cripto .ab-el text{fill:var(--a2);font-family:var(--mao);font-size:14px}
.tema-faceless .ab-el{fill:color-mix(in srgb,var(--a) 30%,transparent)}
.ab-linha{fill:none;stroke:var(--a2);stroke-width:3;stroke-linecap:round}
/* texto */
.capitulo h2{font-family:var(--titulo);font-size:28px;line-height:1.1;margin:1.6em 0 .5em;color:var(--tinta)}.tema-rg .capitulo h2{text-transform:uppercase;letter-spacing:.01em}
.capitulo h3{font-family:var(--sub);font-size:19px;margin:1.4em 0 .4em;color:var(--a3)}
.capitulo p{margin:0 0 1em}.capitulo strong{color:var(--tinta)}.capitulo em{color:var(--a3)}
.capitulo>p:first-child::first-letter{font-family:var(--titulo);float:left;font-size:4.2em;line-height:.8;padding:.06em .1em 0 0;color:var(--a)}
.capitulo ul,.capitulo ol{padding-left:1.3em;margin:0 0 1.1em}.capitulo li{margin:.3em 0}.capitulo li::marker{color:var(--a)}
li.check{list-style:none;position:relative}li.check::before{content:'';position:absolute;left:-1.3em;top:.35em;width:.9em;height:.9em;border:2px solid var(--a);border-radius:4px}
blockquote{margin:1.2em 0;padding:.2em 0 .2em 1em;border-left:3px solid var(--a);color:var(--mut);font-style:italic}
.citacao-grande{border:0;text-align:center;padding:1.4em .5em;margin:1.8em 0;font-style:normal}.citacao-grande p{font-family:var(--mao);font-size:28px;line-height:1.3;color:var(--tinta)}.citacao-grande cite{display:block;font-style:normal;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--a3)}
.tema-faceless .citacao-grande p{font-style:italic;font-size:32px}.tema-cripto .citacao-grande p{font-family:var(--titulo);font-size:24px}
hr{border:0;height:1px;background:var(--lin);margin:2em 0}
code{font-family:'JetBrains',monospace;background:var(--lin);padding:.05em .35em;border-radius:5px;font-size:.9em}
.tabela{overflow-x:auto;margin:1.2em 0}table{border-collapse:collapse;width:100%;font-size:14px}th{background:var(--escuro);color:var(--claro-sobre-escuro);text-align:left;padding:8px 10px;font-family:var(--sub);font-weight:600}td{padding:8px 10px;border-bottom:1px solid var(--lin);vertical-align:top}tr:nth-child(even) td{background:color-mix(in srgb,var(--lin) 35%,transparent)}
.linha-escrever{display:inline-block;min-width:60%;border-bottom:1px solid var(--mut);height:1.2em}.bloco-linha{display:block;width:100%;height:1.8em}
/* blocos */
.bloco{margin:1.6em 0;padding:18px 20px;border-radius:14px;background:color-mix(in srgb,var(--a) 9%,var(--papel));border:1px solid color-mix(in srgb,var(--a) 30%,transparent);page-break-inside:avoid;break-inside:avoid}
.bloco p:last-child{margin-bottom:0}.bloco-rotulo{font-family:var(--sub);font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--a3);font-weight:700;margin-bottom:6px}.bloco-rotulo span{letter-spacing:.04em;text-transform:none;font-size:14px;color:var(--tinta)}
.bloco-destaque{background:var(--escuro);color:var(--claro-sobre-escuro);border:0}.bloco-destaque p{font-size:19px;line-height:1.45;font-family:var(--sub)}.bloco-destaque .bloco-rotulo{color:var(--a2)}.bloco-destaque strong{color:var(--a2)}
.bloco-alerta{background:#fff3ef;border-color:#e7a38f}.bloco-alerta .bloco-rotulo{color:#b2462a}
.bloco-historia{background:transparent;border:0;border-left:4px solid var(--a);border-radius:0;font-family:var(--sub)}.bloco-historia p{font-size:16.5px}
.bloco-exercicio{border-style:dashed;border-width:2px}
/* gráficos */
.grafico{margin:1.8em 0;padding:18px 16px 12px;border-radius:16px;background:var(--escuro);color:var(--claro-sobre-escuro);page-break-inside:avoid;break-inside:avoid}
.g-titulo{font-family:var(--sub);font-weight:700;font-size:15px;margin:0 4px 6px;color:var(--a2)}.grafico svg{width:100%;height:auto;display:block}.g-nota{font-size:12px;opacity:.75;margin:6px 4px 0;line-height:1.45}
.g-grelha{stroke:rgba(255,255,255,.1)}.g-eixo{fill:rgba(255,255,255,.62);font-size:12px;font-family:var(--corpo)}.g-eixo-2{font-size:10px;opacity:.7}
.g-valor{fill:#fff;font-size:13px;font-weight:700;font-family:var(--sub)}.g-rot{fill:#fff;font-size:13.5px;font-weight:600;font-family:var(--sub)}.g-rot-claro{fill:#fff;font-weight:700;font-size:14px;font-family:var(--sub)}.g-eixo-claro{fill:rgba(255,255,255,.85);font-size:11px}
.g-grande{fill:#fff;font-size:34px;font-family:var(--titulo)}.g-grande-claro{fill:var(--escuro);font-size:20px}.g-num{fill:var(--escuro);font-weight:800;font-size:16px;font-family:var(--sub)}
.g-barra{fill:color-mix(in srgb,var(--a) 55%,#555)}.g-barra-forte{fill:var(--a)}
.g-linha{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.g-area{opacity:.16}
.g-c0{stroke:var(--a);fill:var(--a)}.g-c1{stroke:var(--a2);fill:var(--a2)}.g-c2{stroke:#9aa3b2;fill:#9aa3b2}.g-c3{stroke:#e46d5a;fill:#e46d5a}
path.g-linha.g-c0,path.g-linha.g-c1,path.g-linha.g-c2,path.g-linha.g-c3{fill:none}.g-tc0{fill:var(--a)}.g-tc1{fill:var(--a2)}.g-tc2{fill:#c4cad4}.g-tc3{fill:#f19584}
.g-f0{fill:var(--a)}.g-f1{fill:var(--a2)}.g-f2{fill:color-mix(in srgb,var(--a) 45%,#444)}.g-f3{fill:#8d93a0}.g-f4{fill:#e9e2d0}.g-f5{fill:#5b6170}
.tema-faceless .g-f4{fill:#f2d9cf}.tema-cripto .g-f4{fill:#d6e6ff}
.g-bloco{opacity:.95}.g-no{fill:var(--a2)}.g-no-forte{fill:var(--a)}.g-seta{stroke:rgba(255,255,255,.55);stroke-width:2;fill:none}.g-ponta{fill:rgba(255,255,255,.7)}
.g-cel{fill:rgba(255,255,255,.06)}.g-cel-1{fill:color-mix(in srgb,var(--a) 22%,transparent)}.g-cel-2{fill:color-mix(in srgb,var(--a) 45%,transparent)}.g-cel-3{fill:color-mix(in srgb,var(--a) 80%,transparent)}.g-cel-txt{fill:#fff;font-size:12.5px;font-family:var(--sub);font-weight:600}.g-pinta{fill:#fff}
.g-ganho{fill:var(--a)}.g-perda{fill:none;stroke:rgba(255,255,255,.55);stroke-width:2}.g-realce{stroke:#e46d5a;stroke-width:3.5}
.g-leg{}
/* fecho */
.fecho{background:var(--escuro);color:var(--claro-sobre-escuro);text-align:center}.fecho-mao{font-family:var(--mao);font-size:34px;color:var(--a)}.fecho-url{font-family:var(--titulo);font-size:28px;color:var(--a2)}
/* animações (só no ecrã) */
@media screen{
 .js .grafico .cresce{transform:scaleY(0);transform-box:fill-box;transform-origin:50% 100%;transition:transform .9s cubic-bezier(.2,.8,.2,1) var(--d,0s)}
 .js .grafico .cresce-x{transform:scaleX(0);transform-box:fill-box;transform-origin:0 50%;transition:transform .8s cubic-bezier(.2,.8,.2,1) var(--d,0s)}
 .js .grafico .traca{stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset 1.6s ease var(--d,0s)}
 .js .grafico .surge{opacity:0;transition:opacity .6s ease var(--d,0s)}
 .js .grafico.ver .cresce,.js .grafico.ver .cresce-x{transform:none}.js .grafico.ver .traca{stroke-dashoffset:0}.js .grafico.ver .surge{opacity:1}
 .js .grafico .traca[stroke-dasharray="6 6"]{stroke-dasharray:none}
 .frag{transform-box:fill-box;transform-origin:center;animation:flutua 6s ease-in-out infinite;animation-delay:calc(var(--i)*-.6s)}
 @keyframes flutua{50%{transform:translateY(-6px) rotate(8deg)}}
 .cubo{animation:pulsa 4s ease-in-out infinite;animation-delay:calc(var(--i)*-.2s)}@keyframes pulsa{50%{opacity:.6}}
 .notif{animation:notif 3s ease-in-out infinite}@keyframes notif{0%,100%{opacity:1}50%{opacity:.55}}
 .js .abertura .ab-el{opacity:0;transform:translateY(16px);transition:all .7s ease calc(var(--i)*.08s)}.js .abertura.ver .ab-el{opacity:1;transform:none}
}
@media (max-width:520px){.capitulo{font-size:15.5px}.g-eixo{font-size:14px}}
/* impressão: A5, uma secção por página */
@media print{
 @page{size:170mm 240mm;margin:17mm 16mm 19mm}
 @page :first{margin:0}
 html,body{background:#fff}.barra{display:none}.livro{max-width:none;padding:0;margin:0}
 body{font-size:10.2pt;line-height:1.52}
 .pagina,.capitulo{border-radius:0;box-shadow:none;margin:0;background:transparent}
 .capitulo{padding:0}
 .pagina{break-after:page;page-break-after:always}
 .capa{padding:0;margin:0;height:240mm;width:170mm;perspective:none;break-after:page}.capa-3d{width:170mm;margin:0;transform:none!important}.capa-face{border-radius:0;height:240mm;width:170mm;aspect-ratio:auto;box-shadow:none}.capa-face::before{display:none}
 .capa-titulo span{font-size:60pt}.capa-titulo em{font-size:42pt}.tema-cripto .capa-titulo em{font-size:72pt}.tema-faceless .capa-titulo em{font-size:96pt}
 .abertura{background:var(--escuro)!important;min-height:200mm;margin:0;break-before:page;-webkit-print-color-adjust:exact;print-color-adjust:exact;border-radius:12px;padding:20mm 12mm 10mm}
 .capitulo{break-before:page}
 .grafico,.bloco-destaque,.fecho,.capa-face,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
 .fecho{background:var(--escuro)!important;min-height:200mm;border-radius:12px;padding:30mm 12mm}
 .rosto-in{min-height:195mm}
 .indice{padding:14mm 4mm}.indice-t{font-size:30pt;margin-bottom:8mm}.indice-l a{padding:5px 0}.i-t{font-size:11pt}
 h2,h3{break-after:avoid}
 .capitulo h2{font-size:19pt}.capitulo h3{font-size:13pt}.bloco-destaque p{font-size:12.5pt}.citacao-grande p{font-size:18pt}
}
`

const JS = `
document.documentElement.classList.add('js');
(function(){
 var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('ver');io.unobserve(e.target)}})},{threshold:.25});
 document.querySelectorAll('.grafico,.abertura').forEach(function(el){io.observe(el)});
 var bar=document.querySelector('.progresso i');
 addEventListener('scroll',function(){var h=document.documentElement;bar.style.width=(100*h.scrollTop/(h.scrollHeight-h.clientHeight))+'%'},{passive:true});
 var capa=document.querySelector('.capa-3d');
 if(capa&&matchMedia('(hover:hover)').matches){document.querySelector('.capa').addEventListener('mousemove',function(e){var r=capa.getBoundingClientRect();var x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;capa.style.transform='rotateY('+(x*24)+'deg) rotateX('+(-y*14)+'deg)'});document.querySelector('.capa').addEventListener('mouseleave',function(){capa.style.transform='rotateY(-18deg) rotateX(4deg)'});capa.style.transform='rotateY(-18deg) rotateX(4deg)'}
 var pdf=document.querySelector('.barra-pdf');if(pdf){var u=new URL(location.href);u.searchParams.set('f','pdf');pdf.href=u.pathname+u.search}
 if(matchMedia('print').matches)document.documentElement.classList.remove('js');
 addEventListener('beforeprint',function(){document.documentElement.classList.remove('js')});
})();`

// ── execução ─────────────────────────────────────────────────────────────────────
async function construir(slug, { pdf = true } = {}) {
  const livro = LIVROS[slug]
  const dir = path.join(SRC, slug)
  const caps = fs.readdirSync(dir).filter((f) => /^\d\d-.*\.md$/.test(f)).sort().map((f) => path.join(dir, f))
  const html = montarHtml(slug, livro, caps)
  const out = path.join(dir, `${slug}.html`)
  fs.writeFileSync(out, html)
  console.log(`${slug}: ${caps.length} capítulos, html ${(html.length / 1024 / 1024).toFixed(1)} MB`)
  if (!pdf) return
  const { chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(() => document.documentElement.classList.remove('js'))
  const pdfFinal = path.join(dir, `${slug}.pdf`)
  const tmpCapa = path.join(dir, '.capa.pdf'), tmpCorpo = path.join(dir, '.corpo.pdf')
  await page.pdf({ path: tmpCapa, preferCSSPageSize: true, printBackground: true, pageRanges: '1' })
  await page.pdf({
    path: tmpCorpo, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true, pageRanges: '2-',
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font-size:7pt;color:#999;font-family:sans-serif;padding:0 16mm;display:flex;justify-content:space-between"><span>${livro.titulo} ${livro.titulo2} · ${livro.autor}</span><span class="pageNumber"></span></div>`,
  })
  const { execFileSync } = await import('node:child_process')
  execFileSync('pdfunite', [tmpCapa, tmpCorpo, pdfFinal])
  fs.rmSync(tmpCapa); fs.rmSync(tmpCorpo)
  // capa plana + mockup 3D para o marketplace
  fs.mkdirSync(PUB, { recursive: true })
  await page.emulateMedia({ media: 'screen' })
  await page.setViewportSize({ width: 800, height: 1200 })
  await page.evaluate(() => { document.documentElement.classList.remove('js'); const c = document.querySelector('.capa-3d'); c.style.transform = 'none'; c.style.width = '800px'; document.querySelector('.capa').style.padding = '0'; document.querySelector('.livro').style.padding = '0'; document.querySelector('.livro').style.maxWidth = 'none'; document.querySelector('.barra').style.display = 'none'; document.body.style.background = 'transparent' })
  await page.locator('.capa-face').screenshot({ path: path.join(PUB, `${slug}-capa.jpg`), type: 'jpeg', quality: 88 })
  const capaB64 = fs.readFileSync(path.join(PUB, `${slug}-capa.jpg`)).toString('base64')
  await page.setViewportSize({ width: 1200, height: 1200 })
  await page.setContent(mockup3d(capaB64, livro), { waitUntil: 'load' })
  await page.screenshot({ path: path.join(PUB, `${slug}-3d.png`), omitBackground: true })
  await browser.close()
  console.log(`${slug}: pdf + capas prontos`)
}

function mockup3d(capa, livro) {
  const cor = { rg: '#D2A63C', cripto: '#19d3c5', faceless: '#b5737e' }[livro.tema]
  return `<!doctype html><html><body style="margin:0;width:1200px;height:1200px;display:grid;place-items:center;background:transparent;perspective:2200px">
  <div style="position:absolute;width:760px;height:120px;bottom:150px;left:220px;background:radial-gradient(closest-side,rgba(0,0,0,.55),transparent);filter:blur(12px)"></div>
  <div style="position:absolute;width:700px;height:700px;border-radius:50%;background:radial-gradient(closest-side,${cor}55,transparent);filter:blur(40px)"></div>
  <div style="position:relative;width:560px;height:840px;transform-style:preserve-3d;transform:rotateY(-28deg) rotateX(6deg) rotateZ(1deg)">
    <div style="position:absolute;inset:0;background:url(data:image/jpeg;base64,${capa}) center/cover;border-radius:4px 10px 10px 4px;transform:translateZ(30px);box-shadow:inset 8px 0 14px rgba(255,255,255,.12),inset -1px 0 0 rgba(255,255,255,.2)"></div>
    <div style="position:absolute;top:0;left:0;width:60px;height:100%;background:linear-gradient(90deg,#050505,#1c1c1c 40%,#0b0b0b);transform:rotateY(-90deg) translateZ(0) translateX(-30px);transform-origin:left"></div>
    <div style="position:absolute;top:6px;right:0;width:58px;height:calc(100% - 12px);background:repeating-linear-gradient(90deg,#f3eee4 0 2px,#d8d2c4 2px 3px);transform:rotateY(90deg) translateZ(-29px);transform-origin:right"></div>
    <div style="position:absolute;inset:0;transform:translateZ(31px);background:linear-gradient(105deg,rgba(255,255,255,.18),transparent 30%,transparent 70%,rgba(255,255,255,.06));border-radius:4px 10px 10px 4px"></div>
  </div></body></html>`
}

const alvo = process.argv[2] || 'all'
const semPdf = process.argv.includes('--sem-pdf')
for (const slug of alvo === 'all' ? Object.keys(LIVROS) : [alvo]) {
  if (!fs.existsSync(path.join(SRC, slug))) { console.warn('sem capítulos:', slug); continue }
  await construir(slug, { pdf: !semPdf })
}
