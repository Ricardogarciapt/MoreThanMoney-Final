/**
 * Guarda do diagnóstico de tráfego:  npx tsx lib/trafego/diagnostico.check.ts
 */
import { diagnosticar } from './diagnostico'
import type { CampanhaMeta } from './meta'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }
const c = (id: string, p: Partial<CampanhaMeta>): CampanhaMeta => ({
  conta: '1', id, nome: id, estado: 'ACTIVE', objectivo: null, gasto: 0, impressoes: 0, cliques: 0, ctr: null, cpc: null, leads: 0, frequencia: null, orcamentoDiario: null, ...p,
})

const a = diagnosticar([
  c('boa', { gasto: 100, leads: 20, impressoes: 10000, cliques: 150 }),
  c('cara', { gasto: 100, leads: 4, impressoes: 10000, cliques: 120 }),
  c('vazia', { gasto: 60, leads: 0, impressoes: 8000, cliques: 30 }),
  c('saturada', { gasto: 50, leads: 8, impressoes: 5000, cliques: 60, frequencia: 4.2 }),
  c('pequena', { gasto: 3, leads: 0 }),
])
const de = (id: string) => a.filter((x) => x.campanhaId === id).map((x) => x.titulo)
teste('gasto sem leads é grave', a.some((x) => x.campanhaId === 'vazia' && x.gravidade === 'grave'))
teste('o grave vem primeiro', a[0]?.gravidade === 'grave')
teste('CPL alto é aviso', de('cara').includes('CPL bem acima da média'))
teste('a melhor é sinalizada', de('boa').includes('Melhor custo por lead'))
teste('frequência alta é sinalizada', de('saturada').includes('Público saturado'))
teste('gasto pequeno não dá conclusões', de('pequena').length === 0)
teste('sem campanhas, sem achados', diagnosticar([]).length === 0)

if (falhas.length) {
  console.error(`diagnostico: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('diagnostico: gasto sem leads é grave, o caro avisa, o bom escala, e pouco gasto não conclui ✓')
