/**
 * A GUARDA DO KIT DOS PAPÉIS.
 *
 *   npx tsx lib/backoffice-kit-papeis.check.ts
 *
 * Um guião errado não dá erro: é copiado vinte vezes por pessoas diferentes antes de alguém
 * reparar. Isto prova que nenhum guião traz um preço à mão, um concorrente, uma promessa de ganhos
 * ou o MTM Funded vendido como capital real — e que cada papel vê o seu kit.
 */
import { escadaNumaLinha, bonusNumaLinha, ondeComprarTopoNumaLinha } from './escada-precos'
import { NUNCA_SE_DIZ, kitsPara } from './backoffice-kit-papeis'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

const ctx = { linkRegisto: 'https://www.morethanmoney.pt/register?ref=ABC', linkAgendar: 'https://x/agendar' }
const todos = kitsPara([], true, ctx)
const texto = todos
  .flatMap((k) => [k.missao, ...k.passos, ...k.guioes.flatMap((g) => [g.titulo, g.quando, g.texto]), ...k.objeccoes.flatMap((o) => [o.diz, o.respondes])])
  .join('\n')

// 1. Sem números à mão: tira o que vem das funções da escada e os links; o resto não pode ter dígitos.
const limpo = texto
  .replaceAll(escadaNumaLinha(), '')
  .replaceAll(bonusNumaLinha(), '')
  .replaceAll(ondeComprarTopoNumaLinha(), '')
  .replace(/https?:\/\/\S+/g, '')
  .replace(/\{[a-z_0-9]+\}/g, '') // marcadores {hora1}
teste('nenhum número escrito à mão', !/\d/.test(limpo))
teste('nenhum símbolo de moeda escrito à mão', !/[€$]/.test(limpo))

// 2. Ninguém pelo nome, e nada de promessas.
for (const nome of ['jifu', 'mastery', 'imam', 'iqonic', 'steve mata', 'golden era', 'trendwave', 'killshot']) {
  teste(`não nomeia «${nome}»`, !texto.toLowerCase().includes(nome))
}
teste('sem «garantido»', !/garantid/i.test(texto))
teste('sem «prop firm»', !/prop firm/i.test(texto))
teste('a lista do que nunca se diz proíbe prometer ganhos', NUNCA_SE_DIZ.some((n) => /Prometer ganhos/.test(n)))

// 3. Sem capital → MTM Funded, simulado.
teste('setter e closer encaminham para o MTM Funded', ['setter', 'closer'].every((p) => {
  const k = todos.find((x) => x.papel === p)
  return Boolean(k && JSON.stringify(k).includes('/mtmfunded'))
}))

// 4. Quem vê o quê.
teste('dono vê os quatro kits', todos.length === 4)
teste('team leader vê os quatro', kitsPara(['team_leader'], false, ctx).length === 4)
teste('setter vê só o seu', kitsPara(['setter'], false, ctx).map((k) => k.papel).join() === 'setter')
teste('sem papel não vê nenhum', kitsPara([], false, ctx).length === 0)
teste('afiliado leva o link dele', JSON.stringify(kitsPara(['afiliado'], false, ctx)).includes('ref=ABC'))

if (falhas.length) {
  console.error(`backoffice-kit-papeis: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('backoffice-kit-papeis: quatro kits, sem números à mão, sem nomes, sem promessas ✓')
