// Prepara um bootcamp para gravação: extrai a narração de cada aula (texto limpo, pronto para a voz
// clonada) e um manifesto com as cenas (o que se vê + o que se diz) para montar os vídeos com o gémeo.
//
//   node tools/ebooks/narracao-bootcamp.mjs a-primeira-chave
//
// Entrada: conteudo-privado/ebooks/bootcamps/<slug>/modulo-N.md
// Saída:   conteudo-privado/ebooks/bootcamps/<slug>/producao/narracao/aula-N.M.txt
//          conteudo-privado/ebooks/bootcamps/<slug>/producao/manifesto.json
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const slug = process.argv[2] || 'a-primeira-chave'
const dir = path.join(RAIZ, 'conteudo-privado/ebooks/bootcamps', slug)
const out = path.join(dir, 'producao')
const PPM = 150 * 1.03 // palavras por minuto (bootcamps a 1,03×)
fs.mkdirSync(path.join(out, 'narracao'), { recursive: true })

const limpar = (t) => t.replace(/\*\*/g, '').replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim()
const modulos = fs.readdirSync(dir).filter((f) => /^modulo-\d+\.md$/.test(f)).sort((a, b) => parseInt(a.slice(7)) - parseInt(b.slice(7)))
const manifesto = { slug, gerado: new Date().toISOString().slice(0, 10), velocidade: 1.03, modulos: [] }

for (const f of modulos) {
  const md = fs.readFileSync(path.join(dir, f), 'utf8')
  const tituloMod = (md.match(/^# (.+)$/m) || [])[1] || f
  const aulas = md.split(/^## /m).slice(1)
  const mod = { ficheiro: f, titulo: tituloMod, aulas: [] }
  for (const bloco of aulas) {
    const titulo = bloco.split('\n')[0].trim()
    const id = (titulo.match(/Aula (\d+\.\d+)/) || [])[1]
    if (!id) continue
    const gancho = limpar((bloco.match(/\*\*Gancho[^*]*\*\*:?\s*(.+)/) || [])[1] || '')
    const cenas = []
    const re = /\*\*\[CENA (\d+)\]\*\*\s*([^\n]*)\n\*\*NARRAÇÃO:\*\*\s*([^\n]+)/g
    let m
    while ((m = re.exec(bloco))) cenas.push({ cena: Number(m[1]), visual: m[2].trim(), narracao: limpar(m[3]) })
    const texto = [gancho, ...cenas.map((c) => c.narracao)].filter(Boolean).join('\n\n')
    const palavras = texto.split(/\s+/).length
    fs.writeFileSync(path.join(out, 'narracao', `aula-${id}.txt`), texto + '\n')
    mod.aulas.push({ id, titulo: titulo.replace(/\s*\(≈[^)]*\)\s*$/, ''), gancho, cenas, palavras, minutos: +(palavras / PPM).toFixed(1) })
  }
  manifesto.modulos.push(mod)
}
fs.writeFileSync(path.join(out, 'manifesto.json'), JSON.stringify(manifesto, null, 2))
const total = manifesto.modulos.flatMap((m) => m.aulas)
console.log(`${slug}: ${manifesto.modulos.length} módulos, ${total.length} aulas, ~${Math.round(total.reduce((s, a) => s + a.minutos, 0))} min de narração`)
for (const m of manifesto.modulos) console.log(` ${m.titulo}: ${m.aulas.map((a) => `${a.id} ${a.minutos}m`).join(' · ')}`)
