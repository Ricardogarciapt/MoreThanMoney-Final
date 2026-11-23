/**
 * GUARDA do plano de pagamento das comissões da equipa.
 *
 *   npx tsx lib/pagamentos/comissoes-plano.check.ts
 */
import { chaveDoLote, planearPagamentos, type LinhaComissao, type PessoaPagamento } from './comissoes-plano'
import { estadoDaConta } from './connect'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

const agora = '2026-11-23T12:00:00Z'
const antiga = '2026-10-01T12:00:00Z'
const recente = '2026-11-20T12:00:00Z'

const linha = (id: string, ben: string, cents: number, extra: Partial<LinhaComissao> = {}): LinhaComissao => ({
  id,
  beneficiario_id: ben,
  valor_cents: cents,
  moeda: 'EUR',
  estado: 'aprovada',
  estornada_em: null,
  venda_pago_em: antiga,
  venda_estornada_em: null,
  ...extra,
})
const pessoa = (id: string, extra: Partial<PessoaPagamento> = {}): PessoaPagamento => ({
  id,
  connectId: `acct_${id}`,
  connectEstado: 'complete',
  admin: false,
  dividaCents: 0,
  ...extra,
})

const pessoas = new Map<string, PessoaPagamento>([
  ['ana', pessoa('ana')],
  ['bruno', pessoa('bruno', { connectId: null, connectEstado: null })],
  ['carla', pessoa('carla', { connectEstado: 'pending' })],
  ['dino', pessoa('dino', { dividaCents: 500 })],
  ['casa', pessoa('casa', { admin: true })],
  ['eva', pessoa('eva')],
])

const { lotes, espera } = planearPagamentos({
  agoraIso: agora,
  pessoas,
  linhas: [
    linha('a1', 'ana', 1300),
    linha('a2', 'ana', 700),
    linha('a3', 'ana', 900, { venda_pago_em: recente }),
    linha('a4', 'ana', 900, { estado: 'pendente' }),
    linha('a5', 'ana', 900, { venda_estornada_em: recente }),
    linha('b1', 'bruno', 1000),
    linha('c1', 'carla', 1000),
    linha('d1', 'dino', 1000),
    linha('k1', 'casa', 50000),
    linha('e1', 'eva', 40),
  ],
})

teste('a Ana recebe um lote só com as duas aprovadas fora da janela', lotes.length === 1 && lotes[0].beneficiarioId === 'ana')
teste('o lote soma 20 €', lotes[0]?.totalCents === 2000)
teste('o lote leva a1 e a2', JSON.stringify(lotes[0]?.ids) === '["a1","a2"]')
const motivo = (ben: string) => espera.filter((e) => e.beneficiarioId === ben).map((e) => e.motivo).sort().join(',')
teste('venda recente espera pela janela', motivo('ana') === 'janela')
teste('sem conta espera', motivo('bruno') === 'sem_conta')
teste('conta por validar espera', motivo('carla') === 'conta_incompleta')
teste('com dívida espera', motivo('dino') === 'divida')
teste('a casa nunca recebe transferência', motivo('casa') === 'casa')
teste('abaixo de 1 € espera', motivo('eva') === 'minimo')

teste('a chave do lote não depende da ordem', chaveDoLote({ beneficiarioId: 'x', ids: ['b', 'a'] }) === chaveDoLote({ beneficiarioId: 'x', ids: ['a', 'b'] }))
teste('lotes diferentes, chaves diferentes', chaveDoLote({ beneficiarioId: 'x', ids: ['a'] }) !== chaveDoLote({ beneficiarioId: 'x', ids: ['a', 'b'] }))

// O erro de 23/11: conta só com transferências nunca tem charges_enabled e tem de contar como completa.
teste('conta de transferências activa é completa', estadoDaConta({ payouts_enabled: true, details_submitted: true, capabilities: { transfers: 'active' } }) === 'complete')
teste('sem levantamentos fica pendente', estadoDaConta({ payouts_enabled: false, details_submitted: true, capabilities: { transfers: 'active' } }) === 'pending')
teste('sem dados fica incompleta', estadoDaConta({ payouts_enabled: false, details_submitted: false, capabilities: { transfers: 'inactive' } }) === 'incomplete')

if (falhas.length) {
  console.error(`FALHOU (${falhas.length}):\n - ${falhas.join('\n - ')}`)
  process.exit(1)
}
console.log('comissoes-plano: tudo certo')
