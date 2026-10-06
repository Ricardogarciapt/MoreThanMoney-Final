import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { AG, linkAssinado, linkTemAg } from './codigos'
import { pareceCodigoDeAgente } from './atribuicao'
import { agenteDoFunil, prepararMensagem } from './mensagem-saida'
import { linkAgendar, LINK_AGENDAR, LINK_AGENDAR_ONBOARDING } from '@/lib/agenda/link'
import { linkDeRetoma } from '@/lib/vendas/recuperacao-checkout'

/**
 * Guarda da regra de 06/10: TODO o link que a máquina gera sai com `?ag=` do agente dono.
 * Corre com `npx tsx lib/agentes/codigos.check.ts`. Um link sem código não mede, e um agente sem
 * medição morre pela regra das 48 h com trabalho feito.
 */
let n = 0
const caso = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

caso('MAU: um link sem ?ag= é apanhado', () => {
  assert.equal(linkTemAg('https://www.morethanmoney.pt/register'), false)
  assert.equal(linkTemAg('https://www.morethanmoney.pt/register?ag=BLACKFRIDAY50'), false, 'cupão passou por agente')
  assert.equal(linkTemAg('não é url'), false)
  assert.equal(linkTemAg(linkAssinado('/register', AG.SOCIAL)), true)
})

caso('os códigos têm a forma de agente', () => {
  for (const c of Object.values(AG)) assert.ok(pareceCodigoDeAgente(c), c)
})

caso('links da agenda saem com AG-SETTER', () => {
  for (const l of [linkAgendar(), linkAgendar('copytrading'), LINK_AGENDAR, LINK_AGENDAR_ONBOARDING]) {
    assert.ok(linkTemAg(l) && l.includes('ag=AG-SETTER'), l)
  }
})

caso('links de recuperação de checkout saem com AG-EMAIL', () => {
  assert.ok(linkDeRetoma({ origem: 'checkout_sessions', produto: 'premium_monthly' }).includes('ag=AG-EMAIL'))
  assert.ok(linkDeRetoma({ origem: 'marketplace_leads', produto: 'membro-anual' }).includes('ag=AG-EMAIL'))
})

// ── Todos os funis que o código usa têm dono ─────────────────────────────────────────────────────
const raiz = join(__dirname, '..', '..')
const funis = new Map<string, string>()
function varrer(dir: string) {
  for (const nome of readdirSync(dir)) {
    if (['node_modules', '.next'].includes(nome)) continue
    const c = join(dir, nome)
    if (statSync(c).isDirectory()) varrer(c)
    else if (/\.tsx?$/.test(nome) && !nome.endsWith('.check.ts')) {
      const src = readFileSync(c, 'utf8')
      for (const m of src.matchAll(/funil:\s*['"`]([a-z]+:[a-z0-9:_-]+)/gi)) funis.set(m[1], relative(raiz, c))
    }
  }
}
varrer(join(raiz, 'app'))
varrer(join(raiz, 'lib'))

caso(`os ${funis.size} funis de mensagens do código têm agente (nenhum sai sem ?ag=)`, () => {
  assert.ok(funis.size >= 5, `só encontrei ${funis.size} funis — a varredura partiu?`)
  for (const [f, onde] of funis) {
    assert.ok(agenteDoFunil(f), `o funil «${f}» (${onde}) não tem agente — os links dele saem sem ?ag=`)
    const r = prepararMensagem({ canal: 'telegram', texto: 'Começa em www.morethanmoney.pt/register', funil: f })
    assert.ok(/register\?ag=(AG|CEO)-/.test(r.texto), `${f}: ${r.texto}`)
  }
})

caso('MAU: um funil novo sem dono declarado é apanhado', () => {
  assert.equal(agenteDoFunil('telegram:inventado-hoje'), null)
})

// ── Os geradores que não se podem chamar sem base: lê-se o código ────────────────────────────────
caso('o bot do Telegram assina as mensagens do funil (lerMensagem → AG-FORMACAO)', () => {
  const src = readFileSync(join(raiz, 'lib/mensagens-funil.ts'), 'utf8')
  assert.match(src, /codigo: string = AG\.FORMACAO/)
  assert.match(src, /return prepararMensagem\(\{ canal: 'telegram', texto, codigoExplicito: codigo \}\)\.texto/)
})
caso('as publicações IG automáticas nunca ficam sem código', () => {
  const draft = readFileSync(join(raiz, 'lib/instagram/content-draft.ts'), 'utf8')
  assert.match(draft, /agenteDoPilar\(`cta:\$\{cta\.toLowerCase\(\)\}`\) \?\? AG\.SOCIAL/)
  const repost = readFileSync(join(raiz, 'lib/instagram/content-repost.ts'), 'utf8')
  assert.match(repost, /bp\.agente_codigo \|\| AG\.SOCIAL/)
})

console.log(`agentes/codigos: ${n} casos — nenhum link da máquina sai sem ?ag= ✓`)
