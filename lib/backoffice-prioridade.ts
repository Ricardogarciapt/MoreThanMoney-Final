/**
 * A fila «o que faço agora?» lida da base, DENTRO do âmbito de quem pede (o mesmo filtro do
 * pipeline). O cálculo é puro e está em `lib/vendas/prioridade.ts`.
 * Usada pelo microfone (`proxima_accao`) e pelo painel Gestão → Conversão.
 */
import type { ContextoBackoffice } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ambitoDaEquipa } from '@/lib/backoffice-equipas'
import { pode } from '@/lib/backoffice-papeis'
import { COLUNAS_DE_PARTICIPACAO } from '@/lib/backoffice-negocios'
import { podeMexerNoNegocio, type AtribuicoesDoNegocio } from '@/lib/backoffice-escrita'
import { contarAtrasadas, filaDePrioridade, type ItemPrioridade, type NegocioParaPrioridade } from '@/lib/vendas/prioridade'

const TECTO = 2000

/** null = esta conta não tem pipeline. */
export async function filaDoUtilizador(ctx: ContextoBackoffice, max = 10): Promise<ItemPrioridade[] | null> {
  if (!pode(ctx.capacidades, 'bo.pipeline_proprio')) return null
  const db = getSupabaseAdmin()
  const ambito = await ambitoDaEquipa(db, ctx, 'pipeline')
  const { data } = await db
    .from('vendas_negocios')
    .select(`id, nome, origem, estado, criado_em, atualizado_em, email, telefone, telegram_id, ${COLUNAS_DE_PARTICIPACAO.join(', ')}`)
    .not('estado', 'in', '(ganho,perdido)')
    .or('estado.neq.lead,origem.is.null,origem.neq.whatsapp_import')
    .order('atualizado_em', { ascending: false, nullsFirst: false })
    .limit(TECTO)
  const negocios = ((data ?? []) as unknown as Array<AtribuicoesDoNegocio & NegocioParaPrioridade>).filter((n) => podeMexerNoNegocio(n, ambito))
  if (!negocios.length) return []

  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
  const ids = negocios.map((n) => n.id)
  const tarefas: { negocio_id: string | null; prazo: string | null }[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data: t } = await db
      .from('vendas_tarefas')
      .select('negocio_id, prazo')
      .eq('estado', 'aberta')
      .lt('prazo', hoje)
      .in('negocio_id', ids.slice(i, i + 200))
    tarefas.push(...((t ?? []) as typeof tarefas))
  }
  return filaDePrioridade(negocios, contarAtrasadas(tarefas, hoje), new Date(), max)
}
