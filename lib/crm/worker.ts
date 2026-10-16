import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { chamarIA } from '@/lib/ia/chamar'
import { entradaBot, pedidoQualificacao, prepararQualificacao, pedeRevisaoAntesDaIA } from './qualificar'

/** Um item por invocação: as reservas SQL permitem workers concorrentes sem duplicar o mesmo item. */
export async function processarBot(db: SupabaseClient, ia: typeof chamarIA = chamarIA) {
  const { data, error } = await db.rpc('crm_bot_reservar')
  if (error) throw new Error('crm_reserva_falhou')
  const item = data?.[0] as { id: string; lease: string; entrada: unknown } | undefined
  if (!item) return { estado: 'vazio' }
  async function falhar(codigo: string, revisao: boolean) {
    const { error } = await db.rpc('crm_bot_falhar', { p_id: item!.id, p_lease: item!.lease, p_codigo: codigo, p_revisao: revisao })
    if (error) throw new Error('crm_registo_falha_indisponivel')
    return { estado: revisao ? 'revisao' : 'retry' }
  }
  const entrada = entradaBot.safeParse(item.entrada)
  if (!entrada.success) return falhar('entrada_invalida', true)
  if (pedeRevisaoAntesDaIA(entrada.data.text)) return falhar('pedido_saida_rever', true)
  let resposta: Awaited<ReturnType<typeof chamarIA>>
  try { resposta = await ia(pedidoQualificacao(entrada.data.text)) } catch {
    return falhar('ia_indisponivel', false)
  }
  let preparado: ReturnType<typeof prepararQualificacao>
  try { preparado = prepararQualificacao(entrada.data, resposta.texto) } catch {
    return falhar('resposta_ia_invalida', true)
  }
  if (preparado.revisao) return falhar('revisao_necessaria', true)
  const p = preparado.lead
  const hash = createHash('sha256').update(JSON.stringify(p)).digest('hex')
  const { error: concluirErro } = await db.rpc('crm_bot_concluir', { p_id: item.id, p_lease: item.lease, p_hash: hash, p_lead: p })
  if (concluirErro) return falhar(concluirErro.code === 'P0001' ? 'conflito_ou_lease' : 'gravacao_falhou', concluirErro.code === 'P0001')
  return { estado: 'feito' }
}
