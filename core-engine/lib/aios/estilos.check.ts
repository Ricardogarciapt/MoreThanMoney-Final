/**
 * A GUARDA DOS NOMES DAS CLASSES DO AIOS.
 *
 *   npx tsx lib/aios/estilos.check.ts
 *
 * Num CSS module, `s["gaveta-aberta"]` quando a classe se chama `aberto` devolve **undefined** —
 * sem erro, sem aviso, sem nada. O elemento fica com `class="undefined"` e sem estilo nenhum. Num
 * painel lateral que devia estar escondido, isso é um painel permanentemente em cima do conteúdo
 * no telemóvel; e a página continua a compilar, a construir e a servir.
 *
 * O TypeScript não apanha isto (um CSS module é, para ele, um saco de strings) e o `next build`
 * também não. Só uma verificação que compare os dois ficheiros.
 */
import { readFileSync } from 'fs'

const CSS = 'app/aios/aios.module.css'
const TSX = ['components/aios/consola.tsx']

const css = readFileSync(CSS, 'utf8')
const definidas = new Set<string>()
for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) definidas.add(m[1])

const falhas: string[] = []
for (const ficheiro of TSX) {
  const fonte = readFileSync(ficheiro, 'utf8')
  // s["nome-da-classe"] e s.nome
  for (const m of fonte.matchAll(/\bs\["([\w-]+)"\]/g)) {
    if (!definidas.has(m[1])) falhas.push(`${ficheiro}: usa s["${m[1]}"] e ${CSS} não tem .${m[1]}`)
  }
  for (const m of fonte.matchAll(/\bs\.([a-zA-Z][\w]*)/g)) {
    if (!definidas.has(m[1])) falhas.push(`${ficheiro}: usa s.${m[1]} e ${CSS} não tem .${m[1]}`)
  }
}

/**
 * E o que esta alteração trouxe: sem media queries, o AIOS tinha colunas de largura fixa
 * (`260px 1fr 280px`) e num portátil de 13" os painéis comiam mais de metade do ecrã. Se alguém as
 * tirar, isto cai — e cai com o motivo escrito, em vez de só se notar num telemóvel.
 */
if (!/@media[^{]*max-width/.test(css)) {
  falhas.push(`${CSS}: ficou sem media queries — o AIOS volta a ser um ecrã de largura fixa.`)
}
if (/grid-template-columns:\s*\d+px\s+1fr\s+\d+px/.test(css)) {
  falhas.push(`${CSS}: as colunas voltaram a ser fixas em pixéis.`)
}
// `100vh` no telemóvel conta com a barra do browser que desaparece ao deslizar: o rodapé fica
// escondido por baixo dela justamente onde há menos espaço para o perder.
if (/height:\s*100vh/.test(css)) {
  falhas.push(`${CSS}: usa 100vh — no telemóvel esconde o rodapé por baixo da barra do browser. Usa 100dvh.`)
}

if (falhas.length) {
  console.error(`aios/estilos: ${falhas.length} falha(s)`)
  for (const f of [...new Set(falhas)]) console.error('  · ' + f)
  process.exit(1)
}
console.log(`aios/estilos: as classes existem todas (${definidas.size} no módulo) e o ecrã é adaptativo ✓`)
