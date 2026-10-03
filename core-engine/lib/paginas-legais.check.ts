/**
 * GUARDA: as páginas legais não passam pelo tradutor automático.
 *
 * 25/09, da auditoria legal: `/terms` e `/privacidade` eram traduzidas pelo Google Translate em 21
 * idiomas, e nenhuma delas diz qual versão prevalece. Um documento que vincula não pode depender
 * de uma tradução que ninguém reviu — e o risco não é simétrico: uma frase legal errada num idioma
 * que não falamos não se descobre até alguém a invocar.
 *
 * O precedente está no próprio ficheiro: o `/mtmfunded` foi bloqueado por produzir frases como
 * «The rules, in Portuguese», e essas eram as páginas legais do outro negócio.
 *
 *   npx tsx lib/paginas-legais.check.ts
 */
import { readFileSync } from 'node:fs'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

const loader = readFileSync('components/google-translate-loader.tsx', 'utf8')
const bloco = loader.slice(loader.indexOf('TRANSLATE_BLOCKED_PREFIXES'), loader.indexOf('function isTranslateBlocked'))

for (const p of ['/terms', '/privacidade', '/privacy-policy']) {
  teste(`${p} não se traduz à máquina`, bloco.includes(`"${p}"`))
}
// O /mtmfunded é o precedente e continua bloqueado: se sair, voltam as frases traduzidas ao contrário.
teste('/mtmfunded continua bloqueado', bloco.includes('"/mtmfunded"'))

// A homepage NÃO pode estar aqui: já houve um incidente em que o selector de idioma deixou de
// funcionar na landing por ela ter sido bloqueada por engano.
teste('a landing continua traduzível', !bloco.includes('"/new-landing"'))

// E as páginas legais têm mesmo de existir — bloquear a tradução de uma página que não existe
// dava uma falsa sensação de estar tratado.
for (const f of ['app/terms/page.tsx', 'app/privacidade/page.tsx']) {
  let existe = true
  try { readFileSync(f, 'utf8') } catch { existe = false }
  teste(`${f} existe`, existe)
}

if (falhas.length) {
  console.error(`paginas-legais: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('paginas-legais: os termos e a privacidade ficam em português, e a landing continua traduzível ✓')
