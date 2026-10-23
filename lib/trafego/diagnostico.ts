/**
 * DIAGNÓSTICO DAS CAMPANHAS — o que um gestor de tráfego diria ao olhar para a tabela.
 *
 * Regras e limiares no estilo das auditorias de paid media (o «digital-marketing-pro» que o dono
 * deu como referência faz o mesmo por skills; aqui é código, para correr sempre igual e sem IA):
 * comparar cada campanha com a média da própria conta no mesmo período — não com «benchmarks do
 * sector», que para trading/educação financeira em PT não existem com fonte declarada.
 *
 * PURO: sem rede, sem base. Testado em `diagnostico.check.ts`.
 */
import type { CampanhaMeta } from './meta'

export type Gravidade = 'grave' | 'aviso' | 'bom'
export type Achado = { campanhaId: string; gravidade: Gravidade; titulo: string; detalhe: string; sugestao: string }

/** Abaixo disto o período tem pouco gasto para se tirar conclusões. */
const GASTO_MINIMO = 10

export function diagnosticar(campanhas: CampanhaMeta[]): Achado[] {
  const activas = campanhas.filter((c) => c.gasto >= GASTO_MINIMO)
  if (!activas.length) return []
  const gasto = activas.reduce((s, c) => s + c.gasto, 0)
  const leads = activas.reduce((s, c) => s + c.leads, 0)
  const cliques = activas.reduce((s, c) => s + c.cliques, 0)
  const impressoes = activas.reduce((s, c) => s + c.impressoes, 0)
  const cplMedio = leads ? gasto / leads : null
  const ctrMedio = impressoes ? (cliques / impressoes) * 100 : null

  const out: Achado[] = []
  for (const c of activas) {
    const cpl = c.leads ? c.gasto / c.leads : null
    const ctr = c.impressoes ? (c.cliques / c.impressoes) * 100 : null

    if (!c.leads && c.gasto >= Math.max(GASTO_MINIMO * 2, (cplMedio ?? 0) * 2)) {
      out.push({
        campanhaId: c.id, gravidade: 'grave', titulo: 'Gasta sem gerar leads',
        detalhe: `${c.gasto.toFixed(2)} gastos e 0 leads${cplMedio ? ` — o dobro do CPL médio da conta (${cplMedio.toFixed(2)})` : ''}.`,
        sugestao: 'Pausar ou trocar a oferta/criativo. Confirma antes que o evento de lead está a disparar (pixel/formulário).',
      })
    } else if (cpl != null && cplMedio != null && activas.length > 1 && cpl > cplMedio * 1.6) {
      out.push({
        campanhaId: c.id, gravidade: 'aviso', titulo: 'CPL bem acima da média',
        detalhe: `CPL ${cpl.toFixed(2)} contra ${cplMedio.toFixed(2)} da conta (+${Math.round((cpl / cplMedio - 1) * 100)}%).`,
        sugestao: 'Baixar orçamento e passar verba para as campanhas com CPL abaixo da média.',
      })
    } else if (cpl != null && cplMedio != null && activas.length > 1 && cpl < cplMedio * 0.7 && c.leads >= 3) {
      out.push({
        campanhaId: c.id, gravidade: 'bom', titulo: 'Melhor custo por lead',
        detalhe: `CPL ${cpl.toFixed(2)} — ${Math.round((1 - cpl / cplMedio) * 100)}% abaixo da média, com ${c.leads} leads.`,
        sugestao: 'Candidata a escalar: subir o orçamento 20–30% de cada vez, para não reiniciar a aprendizagem.',
      })
    }

    if (ctr != null && c.impressoes >= 2000 && ctr < 0.8 && (ctrMedio == null || ctr < ctrMedio * 0.7)) {
      out.push({
        campanhaId: c.id, gravidade: 'aviso', titulo: 'CTR baixo — o criativo não prende',
        detalhe: `CTR ${ctr.toFixed(2)}%${ctrMedio != null ? ` (média da conta ${ctrMedio.toFixed(2)}%)` : ''} em ${c.impressoes.toLocaleString('pt-PT')} impressões.`,
        sugestao: 'Testar um gancho novo nos primeiros 3 segundos e um título mais concreto. O estúdio de anúncios em baixo gera variações.',
      })
    }

    if (c.frequencia != null && c.frequencia >= 3.5) {
      out.push({
        campanhaId: c.id, gravidade: 'aviso', titulo: 'Público saturado',
        detalhe: `Frequência ${c.frequencia.toFixed(1)}: a mesma pessoa vê o anúncio quase 4 vezes.`,
        sugestao: 'Renovar o criativo ou alargar o público (lookalike das leads do CRM).',
      })
    }
  }
  const peso: Record<Gravidade, number> = { grave: 0, aviso: 1, bom: 2 }
  return out.sort((a, b) => peso[a.gravidade] - peso[b.gravidade])
}
