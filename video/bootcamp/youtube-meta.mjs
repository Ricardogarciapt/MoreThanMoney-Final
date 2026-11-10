// Gera o título, a descrição e a playlist de um vídeo de bootcamp para o upload no YouTube Studio.
// Uso: node video/bootcamp/youtube-meta.mjs <estrategia> <video> <pt|en>  → saida/<est>/bootcamp-<est>-<n>-<lang>-youtube.txt
// A descrição leva os capítulos (gerados pelo render.mjs) e o bloco «Começa aqui» de docs/youtube-descricao-modelo.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const [est, nv, lang = 'pt'] = process.argv.slice(2)
const G = JSON.parse(fs.readFileSync(path.join(DIR, 'guioes', `${est}.${lang}.json`), 'utf8'))
const V = G.videos[Number(nv) - 1]
const N = G.videos.length
const base = `bootcamp-${est}-${nv}-${lang}`
const capsF = path.join(DIR, 'saida', est, `${base}-capitulos.txt`)
const caps = fs.existsSync(capsF) ? fs.readFileSync(capsF, 'utf8').trim() : ''

// playlists por estratégia (lib/estrategias-mtm.ts); null = criar
const lib = fs.readFileSync(path.join(DIR, '../../lib/estrategias-mtm.ts'), 'utf8')
const bloco = lib.split('slug: "' + (G.playlist || est) + '"')[1] || ''
const pl = (bloco.match(/playlist: \{ pt: (null|"[^"]+"), en: (null|"[^"]+") \}/) || [])
const playlist = (lang === 'pt' ? pl[1] : pl[2] || 'null').replace(/"/g, '')

const PT = {
  titulo: G.serie ? `${G.estrategia} ${nv}/${N} · ${V.titulo} | MoreThanMoney` : `${V.rotulo.replace('·', '· Módulo')} · ${V.titulo} | MoreThanMoney`,
  intro: G.serie ? `Vídeo ${nv} de ${N} das Estratégias MTM sobre o ${G.estrategia}: ${V.titulo}.` : `Módulo ${nv} de ${N} do Bootcamp ${G.estrategia}: ${V.titulo}. Aula narrada por Ricardo Garcia, com gráficos ilustrativos (não são resultados reais) para aprenderes a ler a estratégia e a montar um plano com risco definido.`,
  capitulos: 'Capítulos',
  bloco: `▬▬▬▬ Começa aqui ▬▬▬▬
🚀 Regista-te no MTM (3 dias de Premium grátis): https://www.morethanmoney.pt/l/registo
📘 Ebook grátis, o guia Golden Zone (PDF): https://www.morethanmoney.pt/l/ebook
💬 Entra no nosso Telegram: https://www.morethanmoney.pt/l/telegram
🏦 Abre a tua conta na corretora PU Prime: https://www.morethanmoney.pt/l/corretora

⚠️ Conteúdo educativo, não constitui consultoria financeira. O trading envolve risco de perda; resultados passados não garantem resultados futuros.
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`,
  tags: ['MoreThanMoney', 'Ricardo Garcia', G.estrategia, 'bootcamp', 'trading', 'TradingView', 'gestão de risco', 'educação financeira'],
}
const EN = {
  titulo: G.serie ? `${G.estrategia} ${nv}/${N} · ${V.titulo} | MoreThanMoney` : `${V.rotulo.replace('·', '· Module')} · ${V.titulo} | MoreThanMoney`,
  intro: G.serie ? `Video ${nv} of ${N} of MTM Strategies on ${G.estrategia}: ${V.titulo}.` : `Module ${nv} of ${N} of the ${G.estrategia} Bootcamp: ${V.titulo}. Narrated by Ricardo Garcia, with illustrative charts (not real results) so you learn to read the strategy and build a plan with defined risk.`,
  capitulos: 'Chapters',
  bloco: `▬▬▬▬ Start here ▬▬▬▬
🚀 Join MTM (3 days of Premium free): https://www.morethanmoney.pt/l/start
📘 Free ebook, the Golden Zone guide (PDF): https://www.morethanmoney.pt/l/ebook-en
💬 Join us on Telegram: https://www.morethanmoney.pt/l/telegram
🏦 Open your PU Prime broker account: https://www.morethanmoney.pt/l/corretora

⚠️ Educational content, not financial advice. Trading involves risk of loss; past results do not guarantee future results.
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬`,
  tags: ['MoreThanMoney', 'Ricardo Garcia', G.estrategia, 'bootcamp', 'trading', 'TradingView', 'risk management', 'trading education'],
}
const L = lang === 'en' ? EN : PT
const titulo = L.titulo.length > 100 ? L.titulo.replace(' | MoreThanMoney', '') : L.titulo
const desc = [L.intro, caps ? `${L.capitulos}\n${caps}` : '', L.bloco].filter(Boolean).join('\n\n')
const out = `TÍTULO
${titulo}

PLAYLIST
${playlist === 'null' ? `(criar: ${G.estrategia} ${lang === 'en' ? 'Bootcamp EN' : 'Bootcamp PT'})` : playlist}

LEGENDAS
${base}.vtt (${lang === 'en' ? 'English' : 'Português (Portugal)'})

MINIATURA
capa-${nv}-${lang}.jpg

ETIQUETAS
${L.tags.join(', ')}

DESCRIÇÃO
${desc}
`
fs.mkdirSync(path.join(DIR, 'saida', est), { recursive: true })
fs.writeFileSync(path.join(DIR, 'saida', est, `${base}-youtube.txt`), out)
console.log('meta:', `${base}-youtube.txt`)
