/**
 * `npx tsx lib/__tests__/modelo-claude.check.ts`
 *
 * O `lib/modelo-claude.ts` já existia para isto, e mesmo assim havia ONZE sítios com o id do
 * modelo escrito à mão — nove deles com `claude-3-5-haiku-20241022`, que está na lista dos
 * mortos do próprio ficheiro. O sintoma é sempre o mesmo e é sempre mudo: um 404 da API que
 * chega ao utilizador como «não consegui responder», sem nada a apontar para o nome do modelo.
 * Numa DM do Instagram nem isso — quem falha é o closer, e um lead que não recebe resposta não
 * reclama.
 *
 * Por isso este ficheiro testa duas coisas: o que a função faz, e que ninguém a contorna.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { modeloClaude } from '@/lib/modelo-claude'

// ── O que a função faz ───────────────────────────────────────────────────────────────────────
const ANTES = process.env.ANTHROPIC_MODEL
delete process.env.ANTHROPIC_MODEL

assert.equal(modeloClaude(), 'claude-sonnet-5', 'sem nada configurado, o recurso tem de existir')
assert.equal(modeloClaude('claude-opus-5-5'), 'claude-opus-5-5', 'a variável dedicada manda')

// Um id morto configurado é IGNORADO — este é o caso que um recurso escrito à mão nunca apanha:
// o `|| "modelo-vivo"` só entra quando a variável está VAZIA, nunca quando está errada.
assert.equal(
  modeloClaude('claude-3-5-haiku-20241022'),
  'claude-sonnet-5',
  'um id morto vindo da configuração é ignorado, não passa à frente',
)

// O valor colado de um painel de configuração, com a barra e o `n` LITERAIS e aspas à volta.
assert.equal(modeloClaude('"claude-opus-5-5\\n"'), 'claude-opus-5-5')

process.env.ANTHROPIC_MODEL = 'claude-opus-5-5'
assert.equal(modeloClaude(), 'claude-opus-5-5', 'sem variável dedicada, cai no ANTHROPIC_MODEL')
assert.equal(modeloClaude(''), 'claude-opus-5-5', 'variável dedicada vazia não conta como escolha')
if (ANTES === undefined) delete process.env.ANTHROPIC_MODEL
else process.env.ANTHROPIC_MODEL = ANTES

// ── E que ninguém a contorna ─────────────────────────────────────────────────────────────────
//
// Os ids mortos vivem em `modelo-claude.ts` e mais nenhures. Se este teste falhar, a correção
// não é acrescentar o ficheiro à lista de perdoados: é chamar o `modeloClaude()` lá.

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))
const MORTOS = [
  'claude-sonnet-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
]

/**
 * Onde um id morto PODE aparecer:
 *  • `lib/modelo-claude.ts` — é a lista em si.
 *  • os testes — citam os ids de propósito, para provar que são recusados.
 *  • `lib/mtm-terminal-analysis.ts` — tem o seu próprio encadeado de candidatos, com guarda
 *    própria em `mtm-terminal.check.ts`, e menciona os ids em comentários históricos.
 */
const PERDOADOS = [
  'lib/modelo-claude.ts',
  'lib/__tests__/',
  'lib/mtm-terminal-analysis.ts',
]

const IGNORAR_PASTAS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.vercel'])

function ficheiros(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR_PASTAS.has(nome)) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) ficheiros(caminho, out)
    else if (/\.(ts|tsx)$/.test(nome)) out.push(caminho)
  }
  return out
}

const infracoes: string[] = []
for (const pasta of ['lib', 'app']) {
  for (const caminho of ficheiros(join(RAIZ, pasta))) {
    const rel = relative(RAIZ, caminho)
    if (PERDOADOS.some((p) => rel.startsWith(p))) continue
    const texto = readFileSync(caminho, 'utf-8')
    texto.split('\n').forEach((linha, i) => {
      // Só conta o id USADO como valor. Este código conta a sua própria história em comentários,
      // e é dessa história que se percebe porque é que a regra existe — proibi-la lá seria apagar
      // a razão de ser da regra. O que faz o 404 é o id dentro de aspas, não dentro de um `//`.
      const semComentario = linha.replace(/\/\/.*$/, '')
      if (/^\s*[*]|^\s*\/\*/.test(linha)) return
      for (const morto of MORTOS) {
        if (semComentario.includes(morto)) infracoes.push(`${rel}:${i + 1}: ${linha.trim()}`)
      }
    })
  }
}

assert.equal(
  infracoes.length,
  0,
  `id de modelo MORTO escrito à mão — usa modeloClaude(). ${infracoes.length} sítio(s):\n` +
    infracoes.join('\n'),
)

console.log('modelo-claude: ok')
