/**
 * A GUARDA DO MTM MASTER FRAMEWORK.
 *
 *   npx tsx lib/framework-mtm.check.ts
 *
 * O que isto protege não dá erro — dá uma IA a dizer o que a casa não pode dizer:
 *
 *  · um concorrente ou uma pessoa de outra empresa nomeados (difamação / publicidade comparativa);
 *  · um preço ou um resultado escritos à mão (os números vivem em escada-precos e pips-proof);
 *  · o MTM Funded vendido como prop firm ou como «capital para operar»;
 *  · uma superfície sem a regra de não prometer retornos.
 */
import {
  FRAMEWORK_VERSAO,
  blocoFramework,
  frameworkConteudo,
  frameworkEncaminharCapital,
  type SuperficieFramework,
} from './framework-mtm'
import { TRIAL_DAYS } from './trial-access'
import { CUPAO_CAMPANHA_90D, DIAS_CAMPANHA_90D } from './stripe-checkout-premium'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const SUPERFICIES: SuperficieFramework[] = ['apoio', 'setter', 'closer', 'conteudo', 'backoffice']
const tudo = SUPERFICIES.map((s) => blocoFramework(s, { linkAgendar: 'https://x/agendar' })).join('\n')

// 1. Ninguém pelo nome.
for (const nome of ['jifu', 'mastery', 'imam', 'iqonic', 'iq auto', 'steve mata', 'golden era', 'trendwave', 'killshot', 'skool']) {
  teste(`não nomeia «${nome}»`, !tudo.toLowerCase().includes(nome))
}
teste('não chama «desleal» a ninguém', !/desleal/i.test(tudo))

// 2. Sem números de negócio escritos à mão. Só a versão, a duração do trial (de TRIAL_DAYS) e a
//    numeração dos passos do setter.
const semPermitidos = tudo.replaceAll(FRAMEWORK_VERSAO, '').replaceAll(`${TRIAL_DAYS} dias`, '')
  // A campanha: o cupão e a duração vêm de lib/stripe-checkout-premium.ts, não são escritos à mão.
  .replaceAll(CUPAO_CAMPANHA_90D, '').replaceAll(`${DIAS_CAMPANHA_90D} dias`, '').replace(/^\d\. /gm, '')
teste('nenhum número escrito à mão (preço, %, pips, €)', !/\d/.test(semPermitidos))
teste('nenhum símbolo de moeda', !/[€$]/.test(semPermitidos))

// 3. Todas as superfícies levam a regra de não prometer.
for (const s of SUPERFICIES) {
  const b = blocoFramework(s)
  teste(`${s}: leva «Nunca prometas retornos»`, b.includes('Nunca prometas retornos'))
  teste(`${s}: leva a ressalva educativa`, b.includes('não constitui consultoria financeira'))
}

// 4. MTM Funded: simulado, não prop firm, não «capital para operar».
const cap = frameworkEncaminharCapital()
teste('capital → MTM Funded com link', cap.includes('/mtmfunded'))
teste('capital → diz conta simulada', /simulad/i.test(cap))
teste('prop firm só aparece negada', !/(?<!Não é uma )prop firm/i.test(tudo))

// 5. O apoio encaminha capital; o conteúdo não carrega o protocolo de vendas.
teste('apoio leva o encaminhamento de capital', blocoFramework('apoio').includes('DÚVIDAS DE CAPITAL'))
teste('conteúdo leva os ganchos', blocoFramework('conteudo').includes(frameworkConteudo()))
teste('conteúdo não leva o protocolo setter', !blocoFramework('conteudo').includes('PROTOCOLO SETTER'))

if (falhas.length) {
  console.error(`framework-mtm: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('framework-mtm: blocos sem nomes, sem números e sem promessas ✓')
