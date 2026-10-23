/**
 * A GUARDA DAS PROGRAMAÇÕES.
 *
 *   npx tsx lib/agentes/programacao.check.ts
 *
 * O que se prova: as chaves que não se editam ficam intactas, valores fora dos limites recusam,
 * e o override por agente apaga-se com null.
 */
import { aplicarAgente, aplicarGlobais, programacaoDoAgente } from './programacao'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const ACTUAL = { ritmo_ceo_min: 60, contacto_tectos: { por_agente_dia: 40 }, envios_dia_agente: 20 }

const g = aplicarGlobais(ACTUAL, { ritmo_ceo_min: 30, horas_trabalho: [8, 22] })
teste('global aplica e guarda o resto', g.ok && g.valor.ritmo_ceo_min === 30 && (g.valor.contacto_tectos as { por_agente_dia: number }).por_agente_dia === 40 && g.valor.envios_dia_agente === 20)
teste('chave desconhecida recusa', !aplicarGlobais(ACTUAL, { contacto_tectos: 1 }).ok)
teste('ritmo abaixo de 15 recusa', !aplicarGlobais(ACTUAL, { ritmo_ceo_min: 5 }).ok)
teste('horas fora de 0–24 recusam', !aplicarGlobais(ACTUAL, { horas_trabalho: [8, 25] }).ok)
teste('string JSON lê-se', aplicarGlobais(JSON.stringify(ACTUAL), { timeout_ciclo_seg: 600 }).ok)

const a = aplicarAgente(ACTUAL, 'x', { ritmo_min: 45, horas_trabalho: [9, 18] })
teste('override por agente', a.ok && programacaoDoAgente(a.valor, 'x').ritmo_min === 45)
const b = a.ok ? aplicarAgente(a.valor, 'x', { ritmo_min: null, horas_trabalho: null }) : a
teste('null apaga e o agente sai do mapa', b.ok && !('x' in (b.valor.por_agente as object)))
teste('override não toca no resto', b.ok && b.valor.ritmo_ceo_min === 60)

if (falhas.length) {
  console.error(`programacao: ${falhas.length} falha(s)\n · ${falhas.join('\n · ')}`)
  process.exit(1)
}
console.log('programacao: verde')
