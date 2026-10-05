/**
 * A GUARDA DO TOKEN RESTRITO — npx tsx lib/webtrader/feed-directo/narrow-down.check.ts
 *
 * O caso mau: alguém «melhora» o corpo do narrow-down com o papel `trade` ou a aplicação de gestão
 * de contas e o browser do cliente passa a ter uma credencial que negoceia ou apaga a conta.
 */
import { corpoNarrowDown, corpoSoLeitura, lerTokenDaResposta } from './narrow-down'

const falhas: string[] = []
const teste = (nome: string, cond: boolean) => { if (!cond) falhas.push(nome) }

const bom = corpoNarrowDown('4b2f6c1e-0f3a-4c5d-9e8b-1a2b3c4d5e6f')
teste('o corpo que emitimos é só de leitura', corpoSoLeitura(bom))
teste('o corpo nunca contém "trade"', !JSON.stringify(bom).includes('trade'))
teste('só o papel reader', bom.roles.length === 1 && bom.roles[0] === 'reader')
teste('só uma conta', bom.resources.length === 1 && bom.resources[0].entity === 'account')

teste('papel trade é recusado', !corpoSoLeitura({ ...bom, roles: ['reader', 'trade'] }))
teste('papel writer é recusado', !corpoSoLeitura({ ...bom, roles: ['writer'] }))
teste('aplicação de gestão de contas é recusada', !corpoSoLeitura({ ...bom, applications: ['metaapi-api', 'trading-account-management-api'] }))
teste('formato detalhado com methodGroups trade é recusado', !corpoSoLeitura({ ...bom, methodGroups: [{ group: 'trade' }] }))
teste('sem papéis é recusado', !corpoSoLeitura({ ...bom, roles: [] }))
teste('duas contas é recusado (um token, uma conta)', !corpoSoLeitura({ ...bom, resources: [bom.resources[0], { entity: 'account', id: 'x' }] }))
let rebentou = false
try { corpoNarrowDown('../../users') } catch { rebentou = true }
teste('accountId estranho não vira pedido', rebentou)

teste('resposta {token}', lerTokenDaResposta({ token: 'a'.repeat(40) }) === 'a'.repeat(40))
teste('resposta em texto', lerTokenDaResposta('b'.repeat(40)) === 'b'.repeat(40))
teste('resposta vazia dá null', lerTokenDaResposta({}) === null)

if (falhas.length) { console.error('FALHOU:\n - ' + falhas.join('\n - ')); process.exit(1) }
console.log('narrow-down.check: tudo verde')
