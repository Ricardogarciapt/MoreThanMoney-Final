// Markdown mínimo dos e-books MTM → HTML. Sem dependências.
// Suporta: # ## ###, parágrafos, **negrito**, *itálico*, listas (- e 1.), tabelas, > citação,
// blocos :::destaque|exercicio|alerta|historia (título opcional) … :::,
// [[grafico:id]], [[citacao: texto | autor]], linhas de ____ (espaço para escrever), ---.
import { grafico } from './graficos.mjs'
import { UI, traduzirSvg } from './i18n.mjs'
const U = (ctx) => UI[ctx?.lingua || 'pt'] || UI.pt

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function inline(s) {
  let t = esc(s)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  t = t.replace(/_{4,}/g, '<span class="linha-escrever"></span>')
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  return t
}

const ROTULOS = { destaque: 'Ideia-chave', exercicio: 'Exercício', alerta: 'Atenção', historia: 'História' }

export function mdParaHtml(md, ctx = {}) {
  const linhas = md.replace(/\r/g, '').split('\n')
  const out = []
  let i = 0
  let para = []
  const fecharPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`)
    para = []
  }
  while (i < linhas.length) {
    const l = linhas[i]
    const t = l.trim()
    if (!t) { fecharPara(); i++; continue }

    // bloco especial
    const bm = t.match(/^:::\s*(destaque|exercicio|exercício|alerta|historia|história)\s*(.*)$/i)
    if (bm) {
      fecharPara()
      const tipo = bm[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      const titulo = bm[2].trim()
      const corpo = []
      i++
      while (i < linhas.length && linhas[i].trim() !== ':::') { corpo.push(linhas[i]); i++ }
      i++
      out.push(`<aside class="bloco bloco-${tipo}"><div class="bloco-rotulo">${U(ctx).rotulos[tipo] || tipo}${titulo ? ` · <span>${inline(titulo)}</span>` : ''}</div>${mdParaHtml(corpo.join('\n'), ctx)}</aside>`)
      continue
    }
    // blocos ilustrados (ver tools/ebooks/ESCRITA.md)
    const im = t.match(/^:::\s*(post|story|conversa|cartao|cartão|nota|ecra|ecrã|curso|scanner|galeria)\s*(.*)$/i)
    if (im) {
      fecharPara()
      const tipo = im[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      const arg = im[2].trim()
      const corpo = []
      i++
      while (i < linhas.length && linhas[i].trim() !== ':::') { corpo.push(linhas[i]); i++ }
      i++
      out.push(ilustrado(tipo, arg, corpo, ctx))
      continue
    }
    if (t === ':::') { i++; continue }

    const fm = t.match(/^\[\[foto:\s*([^|\]]+?)\s*(?:\|\s*([^|\]]*?)\s*)?(?:\|\s*(\w+)\s*)?\]\]$/)
    if (fm) { fecharPara(); out.push(foto(fm[1], fm[2] || '', (fm[3] || 'polaroid').toLowerCase(), ctx)); i++; continue }

    const gm = t.match(/^\[\[grafico:\s*([\w-]+)\s*\]\]$/)
    if (gm) { fecharPara(); out.push(traduzirSvg(grafico(gm[1], ctx), ctx.lingua)); i++; continue }
    const cm = t.match(/^\[\[citacao:\s*(.+?)\s*(?:\|\s*(.+?))?\s*\]\]$/)
    if (cm) { fecharPara(); out.push(`<blockquote class="citacao-grande"><p>${inline(cm[1])}</p>${cm[2] ? `<cite>${inline(cm[2])}</cite>` : ''}</blockquote>`); i++; continue }

    const hm = t.match(/^(#{1,4})\s+(.*)$/)
    if (hm) {
      fecharPara()
      const n = hm[1].length
      out.push(`<h${n}>${inline(hm[2])}</h${n}>`)
      i++; continue
    }
    if (/^(-{3,}|\*{3,})$/.test(t)) { fecharPara(); out.push('<hr>'); i++; continue }

    if (t.startsWith('>')) {
      fecharPara()
      const q = []
      while (i < linhas.length && linhas[i].trim().startsWith('>')) { q.push(linhas[i].trim().replace(/^>\s?/, '')); i++ }
      out.push(`<blockquote>${q.filter(Boolean).map((x) => `<p>${inline(x)}</p>`).join('')}</blockquote>`)
      continue
    }

    if (t.startsWith('|')) {
      fecharPara()
      const rows = []
      while (i < linhas.length && linhas[i].trim().startsWith('|')) { rows.push(linhas[i].trim()); i++ }
      const cel = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const head = cel(rows[0])
      const corpo = rows.slice(1).filter((r) => !/^\|?\s*:?-{2,}/.test(r.replace(/\|/g, '|')) || /[^\s|:-]/.test(r))
        .filter((r) => !/^\|[\s:|-]+\|$/.test(r))
      out.push(`<div class="tabela"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${corpo.map((r) => `<tr>${cel(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }

    if (/^([-*•]|\d+[.)])\s+/.test(t)) {
      fecharPara()
      const ordenada = /^\d/.test(t)
      const itens = []
      while (i < linhas.length) {
        const x = linhas[i].trim()
        if (/^([-*•]|\d+[.)])\s+/.test(x)) { itens.push(x.replace(/^([-*•]|\d+[.)])\s+/, '')); i++ }
        else if (x && !/^[#>|:[]/.test(x) && itens.length && /^\s{2,}/.test(linhas[i])) { itens[itens.length - 1] += ' ' + x; i++ }
        else break
      }
      const tag = ordenada ? 'ol' : 'ul'
      out.push(`<${tag}>${itens.map((x) => {
        const chk = x.match(/^\[( |x)\]\s*(.*)$/i)
        return chk ? `<li class="check${chk[1].trim() ? ' feito' : ''}">${inline(chk[2])}</li>` : `<li>${inline(x)}</li>`
      }).join('')}</${tag}>`)
      continue
    }

    if (/^_{4,}$/.test(t)) { fecharPara(); out.push('<div class="linha-escrever bloco-linha"></div>'); i++; continue }
    para.push(t)
    i++
  }
  fecharPara()
  return out.join('\n').replace(/((?:<figure class="story">[\s\S]*?<\/figure><!--story-->\s*)+)/g, (m) => `<div class="stories">${m}</div>`)
}

// ── blocos ilustrados ────────────────────────────────────────────────────────────
let rodar = 0
const inclina = () => [-1.6, 1.2, -0.8, 1.7, -1.2, 0.9][rodar++ % 6]
const AVATARES = { 'morethanmoney.pt': 'mtm.png', ricardogarciapt: 'rg-pb.jpg', 'ruben.cripto': 'ruben-retrato.jpg', 'maria.vendersemaparecer': 'maria-maos.jpg', mafaldamariac: 'maria-foto.jpg' }
const ICONES = `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.3-9.2C1.4 8.4 3.6 5 7 5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 16.4 12 21 12 21z"/></svg><svg viewBox="0 0 24 24"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/></svg><svg viewBox="0 0 24 24"><path d="M22 3 11 13M22 3l-7 18-4-8-8-4z"/></svg><svg class="guardar" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>`

function campos(corpo) {
  const c = { texto: [] }
  for (const l of corpo) {
    const m = l.trim().match(/^(imagem|foto|legenda|sticker|fundo):\s*(.*)$/i)
    if (m) c[m[1].toLowerCase()] = m[2]
    else if (l.trim()) c.texto.push(l.trim())
  }
  return c
}

function avatar(handle, ctx) {
  const h = handle.replace(/^@/, '')
  const f = AVATARES[h]
  if (f && ctx.img) return `<span class="av" style="background-image:url(${ctx.img(f)})"></span>`
  const ini = h.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || 'MT'
  return `<span class="av av-ini">${ini}</span>`
}

function foto(f, legenda, estilo, ctx) {
  const src = ctx.img ? ctx.img(f.trim()) : ''
  if (!src) { (ctx.avisos || []).push(`foto em falta: ${f}`); return '' }
  const r = estilo === 'polaroid' ? ` style="--r:${inclina()}deg"` : ''
  return `<figure class="foto foto-${estilo}"${r}><img src="${src}" alt="${esc(legenda || '')}">${legenda ? `<figcaption>${inline(legenda)}</figcaption>` : ''}</figure>`
}

function ilustrado(tipo, arg, corpo, ctx) {
  if (tipo === 'post') {
    const c = campos(corpo)
    const handle = arg || '@morethanmoney.pt'
    const quadro = c.foto && ctx.img
      ? `<div class="ig-img"><img src="${ctx.img(c.foto.trim())}" alt=""></div>`
      : `<div class="ig-img ig-texto"><p>${inline(c.imagem || c.texto.join(' '))}</p></div>`
    return `<figure class="ig">
      <div class="ig-topo">${avatar(handle, ctx)}<b>${esc(handle.replace(/^@/, ''))}</b><span class="ig-pts">•••</span></div>
      ${quadro}
      <div class="ig-acoes">${ICONES}</div>
      ${c.legenda ? `<p class="ig-leg"><b>${esc(handle.replace(/^@/, ''))}</b> ${inline(c.legenda)}</p>` : ''}
    </figure>`
  }
  if (tipo === 'story') {
    const c = campos(corpo)
    let st = ''
    if (c.sticker) {
      const ops = c.sticker.split('|').map((x) => x.trim()).filter(Boolean)
      st = ops.length > 1
        ? `<div class="st-poll">${ops.map((o) => `<span>${inline(o)}</span>`).join('')}</div>`
        : `<div class="st-q"><small>${U(ctx).pergunta}</small>${inline(ops[0])}</div>`
    }
    return `<figure class="story"><div class="st-barras"><i></i><i></i><i></i></div><div class="st-txt">${c.texto.map((x) => `<p>${inline(x)}</p>`).join('')}</div>${st}</figure><!--story-->`
  }
  if (tipo === 'conversa') {
    const bolhas = corpo.filter((l) => l.trim()).map((l) => {
      const m = l.trim().match(/^([^:]{1,24}):\s*(.*)$/)
      if (!m) return `<p class="bl bl-info">${inline(l.trim())}</p>`
      const meu = /^(eu|tu|me|you|yo)$/i.test(m[1].trim())
      return `<p class="bl ${meu ? 'bl-eu' : 'bl-ele'}">${meu ? '' : `<small>${esc(m[1].trim())}</small>`}${inline(m[2])}</p>`
    }).join('')
    return `<figure class="conversa"><div class="cv-topo"><span class="av av-ini">${esc((arg.split('·').pop() || 'C').trim().slice(0, 1).toUpperCase())}</span>${inline(arg || U(ctx).mensagens)}</div><div class="cv-corpo">${bolhas}</div></figure>`
  }
  if (tipo === 'cartao') {
    return `<figure class="cartao"><span class="tesoura">✂</span><div class="ct-rot">${U(ctx).recorta}</div>${arg ? `<h4>${inline(arg)}</h4>` : ''}${mdParaHtml(corpo.join('\n'), ctx)}</figure>`
  }
  if (tipo === 'nota') {
    return `<figure class="postit" style="--r:${inclina()}deg">${arg ? `<b>${inline(arg)}</b>` : ''}${corpo.filter((l) => l.trim()).map((l) => `<p>${inline(l.trim().replace(/^[-*]\s+/, '• '))}</p>`).join('')}</figure>`
  }
  if (tipo === 'curso') {
    // «espreitadela» de uma aula do curso: cartão em forma de slide
    const pe = corpo.find((l) => /^no curso:/i.test(l.trim()))
    const resto = corpo.filter((l) => l !== pe)
    const [aula, ...tit] = arg.split('·')
    return `<figure class="curso"><div class="cu-topo"><span class="cu-marca">${U(ctx).espreitadela} · ${esc(ctx?.academia || "MTM Forex Academy")}</span><span class="cu-aula">${inline(aula.trim())}</span></div>${tit.length ? `<h4>${inline(tit.join('·').trim())}</h4>` : ''}<div class="cu-corpo">${mdParaHtml(resto.join('\n'), ctx)}</div>${pe ? `<div class="cu-pe"><b>No curso</b> ${inline(pe.trim().replace(/^no curso:\s*/i, ''))}</div>` : ''}<div class="cu-rot">Espreitadela do curso</div></figure>`
  }
  if (tipo === 'scanner') {
    const ficha = [], texto = []
    let fotoS = ''
    for (const l of corpo) {
      const m = l.trim().match(/^(estilo|ativos|tempo|foto):\s*(.*)$/i)
      if (m && m[1].toLowerCase() === 'foto') fotoS = m[2].trim()
      else if (m) ficha.push(`<div><span>${U(ctx).ficha[m[1].toLowerCase()]}</span><b>${inline(m[2])}</b></div>`)
      else texto.push(l)
    }
    const src = fotoS && ctx?.img ? ctx.img(fotoS) : ''
    return `<figure class="scanner">${src ? `<img src="${src}" alt="">` : ''}<div class="sc-in"><div class="sc-rot">${U(ctx).ferramenta}</div><h4>${inline(arg)}</h4><div class="sc-ficha">${ficha.join('')}</div>${mdParaHtml(texto.join('\n'), ctx)}</div></figure>`
  }
  if (tipo === 'galeria') {
    const itens = corpo.filter((l) => l.trim()).map((l) => {
      const [f, leg = ''] = l.split('|').map((x) => x.trim())
      const src = ctx?.img ? ctx.img(f) : ''
      if (!src) { ctx?.avisos?.push(`foto em falta: ${f}`); return '' }
      return `<figure style="--r:${inclina()}deg"><img src="${src}" alt=""><figcaption>${inline(leg)}</figcaption></figure>`
    }).join('')
    return `<div class="galeria${arg ? '' : ''}">${arg ? `<div class="ga-tit">${inline(arg)}</div>` : ''}<div class="ga-grelha">${itens}</div></div>`
  }
  // ecra
  const linhasE = corpo.filter((l) => l.trim()).map((l) => {
    const m = l.trim().match(/^([^:]{1,40}):\s*(.*)$/)
    return m ? `<div class="ec-l"><span>${inline(m[1])}</span><b>${inline(m[2])}</b></div>` : `<div class="ec-p">${inline(l.trim())}</div>`
  }).join('')
  return `<figure class="ecra"><div class="ec-status"><span>9:41</span><span>▮▮▮ ◔</span></div>${arg ? `<div class="ec-tit">${inline(arg)}</div>` : ''}${linhasE}</figure>`
}
