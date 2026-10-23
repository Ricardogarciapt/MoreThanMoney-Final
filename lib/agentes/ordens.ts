import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * AS ORDENS DO DONO AOS AGENTES — uma só camada para o painel, o chat IA da Gestão
 * (`lib/mcp/ferramentas.ts → dar_ordem_agente`) e a rota do motor.
 *
 * Ciclo de vida: pendente → entregue (o motor pô-la no prompt) → em_curso | feita | recusada.
 * O dono pode cancelar enquanto não está feita. Nada se apaga.
 */

export const ESTADOS_ABERTOS = ['pendente', 'entregue', 'em_curso'] as const
export const ESTADOS_DO_AGENTE = ['entregue', 'em_curso', 'feita', 'recusada'] as const
export type EstadoDoAgente = (typeof ESTADOS_DO_AGENTE)[number]
export type Origem = 'painel' | 'chat' | 'telegram' | 'aios'

export type Ordem = {
  id: string; agente_id: string; texto: string; origem: Origem; estado: string
  resposta: string | null; criado_por: string | null; criado_em: string; entregue_em: string | null; respondida_em: string | null
}

const COLUNAS = 'id, agente_id, texto, origem, estado, resposta, criado_por, criado_em, entregue_em, respondida_em'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Encontra o agente por id, nome ou código de receita (o chat escreve nomes, o painel ids). */
export async function acharAgente(db: SupabaseClient, ref: string) {
  const r = ref.trim()
  if (!r) return null
  if (UUID.test(r)) {
    const { data } = await db.from('agentes_equipa').select('id, nome, estado').eq('id', r).maybeSingle()
    return data
  }
  const limpo = r.replace(/[%,()"\\*]/g, '')
  const { data } = await db.from('agentes_equipa').select('id, nome, estado, chave_receita')
    .or(`nome.ilike."${limpo}",chave_receita.ilike."${limpo}"`).limit(2)
  return data?.length === 1 ? data[0] : null
}

export async function darOrdem(db: SupabaseClient, p: { agente: string; texto: string; origem: Origem; por?: string | null }) {
  const texto = p.texto.trim().slice(0, 4000)
  if (!texto) return { ok: false as const, erro: 'A ordem está vazia.' }
  const ag = await acharAgente(db, p.agente)
  if (!ag) return { ok: false as const, erro: `Não encontrei o agente «${p.agente}» (usa o nome exacto ou o código).` }
  if (['morto', 'arquivado'].includes(String(ag.estado))) return { ok: false as const, erro: `«${ag.nome}» está ${ag.estado}: não recebe ordens.` }
  const { data, error } = await db.from('agentes_ordens')
    .insert({ agente_id: ag.id, texto, origem: p.origem, criado_por: p.por ?? null }).select(COLUNAS).single()
  if (error) return { ok: false as const, erro: error.message }
  return { ok: true as const, ordem: data as Ordem, agente: ag.nome as string }
}

export async function cancelarOrdem(db: SupabaseClient, id: string) {
  const { data, error } = await db.from('agentes_ordens').update({ estado: 'cancelada', respondida_em: new Date().toISOString() })
    .eq('id', id).in('estado', ESTADOS_ABERTOS as unknown as string[]).select('id').maybeSingle()
  if (error) return { ok: false as const, erro: error.message }
  return data ? { ok: true as const } : { ok: false as const, erro: 'A ordem já não está aberta.' }
}

export async function listarOrdens(db: SupabaseClient, f: { agenteId?: string; abertas?: boolean; limite?: number }) {
  let q = db.from('agentes_ordens').select(COLUNAS).order('criado_em', { ascending: false }).limit(Math.min(f.limite ?? 100, 300))
  if (f.agenteId) q = q.eq('agente_id', f.agenteId)
  if (f.abertas) q = q.in('estado', ESTADOS_ABERTOS as unknown as string[])
  const { data, error } = await q
  return { ordens: (data ?? []) as Ordem[], erro: error?.message ?? null }
}

/** O motor marca a ordem (entregue ao pôr no prompt; depois o que o agente respondeu). */
export async function marcarOrdem(db: SupabaseClient, p: { id: string; agenteId: string; estado: string; resposta?: string | null }) {
  if (!(ESTADOS_DO_AGENTE as readonly string[]).includes(p.estado)) return { ok: false as const, erro: `Estado inválido (${ESTADOS_DO_AGENTE.join(', ')}).` }
  const agora = new Date().toISOString()
  const mudanca: Record<string, unknown> = { estado: p.estado }
  if (p.estado === 'entregue') mudanca.entregue_em = agora
  else { mudanca.respondida_em = agora; if (p.resposta) mudanca.resposta = String(p.resposta).slice(0, 4000) }
  // Só mexe em ordens ainda abertas e DESTE agente: um agente não fecha a ordem de outro.
  const { data, error } = await db.from('agentes_ordens').update(mudanca)
    .eq('id', p.id).eq('agente_id', p.agenteId).in('estado', ESTADOS_ABERTOS as unknown as string[]).select('id').maybeSingle()
  if (error) return { ok: false as const, erro: error.message }
  return data ? { ok: true as const } : { ok: false as const, erro: 'Ordem inexistente, de outro agente, ou já fechada.' }
}
