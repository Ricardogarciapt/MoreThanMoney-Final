/**
 *   npx tsx lib/whatsapp/linguas.check.ts
 */
import { linguaDoIndicativo, linguaEscolhida, linhasDeLinguas } from './linguas'
import { GUIAO, menuComLingua } from '@/lib/vendas/guiao-whatsapp'
import { intencaoDoBotao } from './fluxo'
import { TEMPLATES_MTM } from './templates-mtm'

const falhas: string[] = []
const teste = (nome: string, c: boolean) => { if (!c) falhas.push(nome) }

teste('PT', linguaDoIndicativo('+351912666699') === 'pt')
teste('PT sem indicativo', linguaDoIndicativo('912666699') === 'pt')
teste('Angola PT', linguaDoIndicativo('+244923000000') === 'pt')
teste('Brasil PT', linguaDoIndicativo('+5511999999999') === 'pt')
teste('UK EN', linguaDoIndicativo('+447700900000') === 'en')
teste('Lux FR', linguaDoIndicativo('+352621000000') === 'fr')
teste('França FR', linguaDoIndicativo('+33612345678') === 'fr')
teste('Suíça DE', linguaDoIndicativo('+41791234567') === 'de')
teste('Alemanha DE', linguaDoIndicativo('+491701234567') === 'de')
teste('Espanha ES', linguaDoIndicativo('+34612345678') === 'es')
teste('EUA EN', linguaDoIndicativo('+12025550123') === 'en')
teste('bandeira id', linguaEscolhida('lingua:fr') === 'fr')
teste('botão PT do template', linguaEscolhida('🇵🇹 Português') === 'pt')
teste('5 bandeiras', linhasDeLinguas().length === 5)
for (const l of ['pt', 'en', 'fr', 'de', 'es'] as const) {
  const g = GUIAO[l]
  teste(`${l}: sim`, intencaoDoBotao(g.botaoSim) === 'sim')
  teste(`${l}: depois`, intencaoDoBotao(g.botaoDepois) === 'depois')
  teste(`${l}: sair`, intencaoDoBotao(g.botaoSair) === 'sair')
  teste(`${l}: menu ≤ 10 e títulos ≤ 24`, menuComLingua(l).length <= 10 && menuComLingua(l).every((r) => [...r.titulo].length <= 24))
  teste(`${l}: descrições ≤ 72`, menuComLingua(l).every((r) => (r.descricao ?? '').length <= 72))
  teste(`${l}: botões ≤ 20`, [g.botaoSim, g.botaoDepois, g.botaoSair, g.botaoMenu, g.botaoLinguas].every((b) => [...b].length <= 20))
  teste(`${l}: rodapé ≤ 60`, g.avisoIa.length <= 60)
  teste(`${l}: sem promessas`, !/garant|guarantee|garanti|garantiert|lucro f|easy money!/i.test(g.audioAbertura('X')))
  const tpl = TEMPLATES_MTM.find((t) => t.name === 'mtm_reencontro_v3' && t.language === (l === 'pt' ? 'pt_PT' : l))
  const botoes = (tpl?.components.find((c) => c.type === 'BUTTONS') as { buttons: Array<{ text: string }> } | undefined)?.buttons.map((b) => b.text) ?? []
  teste(`${l}: template v3 existe`, !!tpl)
  teste(`${l}: botões do template batem com o guião`, botoes[0] === g.botaoSim && botoes[1] === g.botaoDepois && botoes[2] === g.botaoSair)
  teste(`${l}: botão PT nas estrangeiras`, l === 'pt' || botoes[3] === '🇵🇹 Português')
}

if (falhas.length) { console.error('FALHOU:\n- ' + falhas.join('\n- ')); process.exit(1) }
console.log('linguas: ok')
