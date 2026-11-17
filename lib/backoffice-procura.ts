/**
 * Procura de negócios por nome DENTRO do âmbito de quem pede (o mesmo filtro do pipeline).
 * Usada pelo microfone (`/api/backoffice/comando`) e pelas chamadas (`/api/backoffice/chamada/*`).
 */
import type { ContextoBackoffice } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ambitoDaEquipa } from '@/lib/backoffice-equipas'
import { pode } from '@/lib/backoffice-papeis'
import { COLUNAS_DE_PARTICIPACAO } from '@/lib/backoffice-negocios'
import { podeMexerNoNegocio, type AtribuicoesDoNegocio } from '@/lib/backoffice-escrita'
import { padraoDeProcura } from '@/lib/backoffice-voz'

export type NegocioCurto = { id: string; nome: string; estado: string }

/** null = esta conta não tem pipeline. */
export async function procurarNegocios(ctx: ContextoBackoffice, texto: string): Promise<NegocioCurto[] | null> {
  if (!pode(ctx.capacidades, 'bo.pipeline_proprio')) return null
  const supabase = getSupabaseAdmin()
  const ambito = await ambitoDaEquipa(supabase, ctx, 'pipeline')
  const { data } = await supabase
    .from('vendas_negocios')
    .select(`id, nome, estado, ${COLUNAS_DE_PARTICIPACAO.join(', ')}`)
    .ilike('nome', padraoDeProcura(texto))
    .order('atualizado_em', { ascending: false, nullsFirst: false })
    .limit(40)
  const linhas = (data ?? []) as unknown as Array<AtribuicoesDoNegocio & NegocioCurto>
  return linhas
    .filter((n) => podeMexerNoNegocio(n, ambito))
    .slice(0, 8)
    .map((n) => ({ id: n.id, nome: n.nome, estado: n.estado }))
}

/** A nota actual de UM negócio, só se estiver no âmbito. undefined = não encontrado / fora do âmbito. */
export async function notaDoNegocio(ctx: ContextoBackoffice, id: string): Promise<{ nome: string; nota: string | null } | undefined> {
  if (!pode(ctx.capacidades, 'bo.pipeline_proprio')) return undefined
  const supabase = getSupabaseAdmin()
  const ambito = await ambitoDaEquipa(supabase, ctx, 'pipeline')
  const { data } = await supabase
    .from('vendas_negocios')
    .select(`id, nome, nota, ${COLUNAS_DE_PARTICIPACAO.join(', ')}`)
    .eq('id', id)
    .maybeSingle()
  const n = data as unknown as (AtribuicoesDoNegocio & { nome: string; nota: string | null }) | null
  if (!n || !podeMexerNoNegocio(n, ambito)) return undefined
  return { nome: n.nome, nota: n.nota }
}
