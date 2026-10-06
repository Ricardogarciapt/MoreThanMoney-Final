/**
 * OS AGENTES IA NO BACKOFFICE — o que os humanos vêem deles (só leitura).
 *
 * Os agentes de vendas (Prospector, Setter, Closer, Email, Social, Vendedora) trabalham o pipeline
 * pela rota do motor (`lib/agentes/pipeline-agentes.ts`). Aqui só se LÊ: quem são (para o selo
 * «Agente IA» ao lado dos nomes das pessoas) e o que fizeram (`vendas_agentes_accoes`, o registo).
 * Nunca rebenta: um backoffice sem a linha dos agentes continua a ser um backoffice.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { NOME_DO_AGENTE, raizDeVendas } from '@/lib/agentes/pipeline-agentes'

export interface AgenteNoBackoffice {
  id: string
  nome: string
  codigo: string
  /** O papel no funil, em palavras (Prospector, Setter…). */
  papel: string
  estado: string
}

export interface AccaoDeAgente {
  negocio_id: string | null
  agente_id: string
  accao: string
  texto: string | null
  depois: Record<string, unknown> | null
  criado_em: string
}

export const NOME_DA_ACCAO: Record<string, string> = {
  criar_lead: 'criou o lead',
  assumir: 'assumiu o negócio',
  qualificar: 'qualificou',
  nota: 'deixou uma nota',
  mudar_etapa: 'mudou a etapa',
  criar_tarefa: 'criou uma tarefa',
  fechar_tarefa: 'fechou uma tarefa',
  agendar_followup: 'agendou follow-up',
  passar_a_humano: 'passou a uma pessoa',
  registar_actividade: 'registou actividade',
  rascunho_mensagem: 'preparou um rascunho (não enviado)',
}

export async function agentesDoPipeline(): Promise<Record<string, AgenteNoBackoffice>> {
  try {
    const { data } = await getSupabaseAdmin().from('agentes_equipa').select('id, nome, chave_receita, estado')
    const out: Record<string, AgenteNoBackoffice> = {}
    for (const a of (data ?? []) as Array<{ id: string; nome: string; chave_receita: string | null; estado: string }>) {
      const raiz = raizDeVendas(a.chave_receita)
      if (!raiz) continue
      out[a.id] = { id: a.id, nome: a.nome, codigo: String(a.chave_receita), papel: NOME_DO_AGENTE[raiz], estado: a.estado }
    }
    return out
  } catch {
    return {}
  }
}

/** As últimas acções aceites dos agentes nestes negócios (até `porNegocio` por negócio). */
export async function accoesDosAgentes(negocioIds: readonly string[], porNegocio = 4): Promise<Record<string, AccaoDeAgente[]>> {
  const ids = [...new Set(negocioIds)].filter(Boolean)
  if (ids.length === 0) return {}
  try {
    const { data } = await getSupabaseAdmin()
      .from('vendas_agentes_accoes')
      .select('negocio_id, agente_id, accao, texto, depois, criado_em')
      .eq('ok', true)
      .in('negocio_id', ids)
      .order('criado_em', { ascending: false })
      .limit(Math.min(500, ids.length * porNegocio * 2))
    const out: Record<string, AccaoDeAgente[]> = {}
    for (const a of (data ?? []) as AccaoDeAgente[]) {
      const k = String(a.negocio_id)
      const l = (out[k] ??= [])
      if (l.length < porNegocio) l.push(a)
    }
    return out
  } catch {
    return {}
  }
}

/** Quantas acções cada agente fez hoje — o painel diz o ritmo de cada um ao lado dos humanos. */
export async function accoesDeHojePorAgente(): Promise<Record<string, number>> {
  try {
    const desde = new Date()
    desde.setUTCHours(0, 0, 0, 0)
    const { data } = await getSupabaseAdmin()
      .from('vendas_agentes_accoes')
      .select('agente_id')
      .eq('ok', true)
      .gte('criado_em', desde.toISOString())
      .limit(2000)
    const out: Record<string, number> = {}
    for (const r of (data ?? []) as Array<{ agente_id: string }>) out[r.agente_id] = (out[r.agente_id] ?? 0) + 1
    return out
  } catch {
    return {}
  }
}
