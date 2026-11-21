// Markdown mínimo dos e-books MTM → HTML. Sem dependências.
// Suporta: # ## ###, parágrafos, **negrito**, *itálico*, listas (- e 1.), tabelas, > citação,
// blocos :::destaque|exercicio|alerta|historia (título opcional) … :::,
// [[grafico:id]], [[citacao: texto | autor]], linhas de ____ (espaço para escrever), ---.
import { grafico } from './graficos.mjs'

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
      out.push(`<aside class="bloco bloco-${tipo}"><div class="bloco-rotulo">${ROTULOS[tipo] || tipo}${titulo ? ` · <span>${inline(titulo)}</span>` : ''}</div>${mdParaHtml(corpo.join('\n'), ctx)}</aside>`)
      continue
    }
    if (t === ':::') { i++; continue }

    const gm = t.match(/^\[\[grafico:\s*([\w-]+)\s*\]\]$/)
    if (gm) { fecharPara(); out.push(grafico(gm[1], ctx)); i++; continue }
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
  return out.join('\n')
}
