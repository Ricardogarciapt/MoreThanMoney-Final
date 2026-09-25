/**
 * GUARDA dos limites de cupão. Isto decide quem entra de graça: tem de ser contado, não confiado.
 *
 * 25/09: `coupons.used_count` nunca subia (a RPC que o devia incrementar não existe, e o caminho
 * alternativo gravava uma função como número, que o JSON deixa cair). Como quem validava comparava
 * `used_count >= max_uses`, o limite NUNCA disparava — um cupão de uso único podia ser resgatado
 * sem limite pela app iOS.
 *
 *   npx tsx lib/cupoes-usos.check.ts
 */
import { readFileSync } from 'node:fs'
import { usosDoCupao, cupaoEsgotado } from './cupoes-usos'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }
const dbFalso = (resposta: { count?: number | null; error?: unknown }) => ({
  from: () => ({ select: () => ({ eq: async () => resposta }) }),
}) as never

async function correr() {
  // Conta o que lá está.
  teste('conta os usos reais', (await usosDoCupao(dbFalso({ count: 3 }), 'x')) === 3)
  teste('zero usos é zero, não é falta de resposta', (await usosDoCupao(dbFalso({ count: 0 }), 'x')) === 0)
  teste('erro devolve null, não zero', (await usosDoCupao(dbFalso({ error: new Error('x'), count: null }), 'x')) === null)

  // Sem limite nunca esgota.
  teste('sem limite nunca esgota', (await cupaoEsgotado(dbFalso({ count: 999 }), { id: 'x', max_uses: null })) === false)
  // Com limite, esgota no número certo — nem antes, nem depois.
  teste('abaixo do limite ainda serve', (await cupaoEsgotado(dbFalso({ count: 0 }), { id: 'x', max_uses: 1 })) === false)
  teste('no limite já esgotou', (await cupaoEsgotado(dbFalso({ count: 1 }), { id: 'x', max_uses: 1 })) === true)
  teste('acima do limite esgotou', (await cupaoEsgotado(dbFalso({ count: 5 }), { id: 'x', max_uses: 3 })) === true)

  // A REGRA QUE MAIS IMPORTA: na dúvida, não se dá acesso pago.
  teste('sem conseguir contar, considera esgotado',
    (await cupaoEsgotado(dbFalso({ error: new Error('base em baixo'), count: null }), { id: 'x', max_uses: 1 })) === true)

  // E ninguém pode voltar a decidir pelo contador.
  for (const rota of ['app/api/apple/iap/sign-offer/route.ts', 'app/api/coupons/validate/route.ts']) {
    const src = readFileSync(rota, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    teste(`${rota} não decide pelo used_count`, !/used_count\s*>=\s*/.test(src))
    teste(`${rota} usa a contagem real`, /cupaoEsgotado\(/.test(src))
  }

}

void correr().then(() => {
if (falhas.length) {
  console.error(`cupoes-usos: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('cupoes-usos: conta a fonte, esgota no número certo, e na dúvida não dá acesso ✓')
})
