import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularOrcamento, type MovimentoLido, type OrcamentoAgente } from './orcamento-agente'

/**
 * Lê o orçamento de toda a equipa: as linhas (com os tetos da 207, se já existirem) e os
 * movimentos de dinheiro dos últimos 32 dias. Serve o painel do orçamento E a rota do motor, para
 * os dois verem o mesmo «bloqueado» com o mesmo motivo.
 *
 * Tolerante: sem a 207 aplicada lê sem tetos e diz `semTetos`; um erro nos movimentos lê-se como
 * «sem movimentos» e vem em `erro` — o motor não pára por não conseguir ler o livro.
 */
export async function orcamentosDaEquipa(db: SupabaseClient, agora: Date) {
  let semTetos = false
  const comTetos = await db.from('agentes_equipa').select('id, orcamento, gasto, teto_dia, teto_mes')
  let linhas = comTetos.data as Array<Record<string, unknown>> | null
  if (comTetos.error) {
    semTetos = true
    const r = await db.from('agentes_equipa').select('id, orcamento, gasto')
    linhas = r.data as Array<Record<string, unknown>> | null
  }

  const desde = new Date(agora.getTime() - 32 * 86_400_000).toISOString()
  const { data: movs, error } = await db
    .from('agentes_eventos')
    .select('id, agente_id, tipo, valor, detalhe, criado_em')
    .in('tipo', ['credito', 'gastou', 'teto'])
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(2000)

  const porAgente = new Map<string, MovimentoLido[]>()
  for (const m of (movs ?? []) as MovimentoLido[]) {
    const l = porAgente.get(m.agente_id) ?? []
    l.push(m)
    porAgente.set(m.agente_id, l)
  }

  const orcamentos = new Map<string, OrcamentoAgente>()
  for (const l of linhas ?? []) {
    orcamentos.set(String(l.id), calcularOrcamento(l as never, porAgente.get(String(l.id)) ?? [], agora))
  }
  return { semTetos, orcamentos, movimentos: (movs ?? []) as Array<MovimentoLido & { id: string }>, erro: error?.message ?? null }
}
