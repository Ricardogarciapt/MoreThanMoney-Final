/**
 * A GUARDA DO ORÇAMENTO DOS AGENTES.
 *
 *   npx tsx lib/agentes/orcamento-agente.check.ts
 *
 * O que se prova: o dia e o mês são os de Lisboa, só `gastou` conta para os tetos, sem saldo
 * bloqueia antes de tudo, e um teto vazio não bloqueia.
 */
import { calcularOrcamento, lerTeto, lerValor, type MovimentoLido } from './orcamento-agente'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

// 23/10 às 23:30 UTC já é 24/10 às 00:30 em Lisboa (verão, UTC+1).
const AGORA = new Date('2026-10-23T23:30:00Z')
const mov = (tipo: string, valor: number | string, criado_em: string): MovimentoLido => ({ agente_id: 'a', tipo, valor, criado_em })

const movs = [
  mov('gastou', 3, '2026-10-23T23:10:00Z'), // 24/10 Lisboa → hoje
  mov('gastou', '2', '2026-10-23T22:50:00Z'), // 23/10 23:50 Lisboa → ontem, mesmo mês
  mov('credito', 50, '2026-10-23T23:15:00Z'), // carregamento não é gasto
  mov('gastou', 7, '2026-09-30T10:00:00Z'), // mês anterior
]

const livre = calcularOrcamento({ orcamento: '20', gasto: '12' }, movs, AGORA)
teste('saldo = orçamento - gasto', livre.saldo === 8)
teste('gasto do dia em Lisboa', livre.gasto_dia === 3)
teste('gasto do mês em Lisboa, só gastou', livre.gasto_mes === 5)
teste('sem tetos não bloqueia', livre.bloqueado === null)

const dia = calcularOrcamento({ orcamento: 20, gasto: 12, teto_dia: 3 }, movs, AGORA)
teste('teto do dia atingido bloqueia', !!dia.bloqueado?.startsWith('Teto do dia'))

const mes = calcularOrcamento({ orcamento: 20, gasto: 12, teto_dia: 10, teto_mes: '5' }, movs, AGORA)
teste('teto do mês atingido bloqueia', !!mes.bloqueado?.startsWith('Teto do mês'))

const falido = calcularOrcamento({ orcamento: 10, gasto: 11, teto_dia: 3 }, movs, AGORA)
teste('sem saldo vem primeiro e saldo nunca é negativo', !!falido.bloqueado?.startsWith('Sem saldo') && falido.saldo === 0)

const zero = calcularOrcamento({ orcamento: 20, gasto: 0, teto_dia: 0, teto_mes: '' }, movs, AGORA)
teste('teto 0 ou vazio = sem teto', zero.teto_dia === null && zero.teto_mes === null && zero.bloqueado === null)

teste('valor com vírgula', (() => { const r = lerValor('12,5'); return r.ok && r.valor === 12.5 })())
teste('valor negativo recusa', !lerValor(-1).ok)
teste('teto vazio = null', (() => { const r = lerTeto(''); return r.ok && r.valor === null })())

if (falhas.length) {
  console.error(`orcamento-agente: ${falhas.length} falha(s)\n · ${falhas.join('\n · ')}`)
  process.exit(1)
}
console.log('orcamento-agente: verde')
