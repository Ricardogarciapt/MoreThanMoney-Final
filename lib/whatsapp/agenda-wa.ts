/**
 * A AGENDA RECONHECE O LEAD DO WHATSAPP (23/11/2026).
 *
 * Quem marca depois de vir do funil de WhatsApp traz o código do link com rasto (utm_content ou o
 * cookie `mtm_wa`, que a página de marcar mete em `utm.wa`) e/ou o telefone. Com isso encontra-se o
 * negócio do pipeline, completa-se o email que faltava, o lead passa à fase `wa_agendou` (o
 * seguimento automático pára) e fica a etiqueta `agendou_wa`. Nunca rebenta a marcação.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { variantesDoNumero } from '@/lib/whatsapp-envio'
import { lerCodigo } from './link-seguido'

export async function negocioDoWhatsApp(p: { utm: Record<string, unknown>; telefone: string | null; email: string }): Promise<string | null> {
  try {
    const db = getSupabaseAdmin()
    const codigo = [p.utm.wa, p.utm.utm_content].find((v) => typeof v === 'string' && lerCodigo(v)) as string | undefined
    const lido = codigo ? lerCodigo(codigo) : null
    // Veio do funil do Telegram: o negócio é o do telegram_id e o lead passa a tg_agendou.
    if (lido?.canal === 'telegram') {
      const chatId = lido.e164.slice(3)
      await db.from('telegram_leads').update({ stage: 'tg_agendou', updated_at: new Date().toISOString() }).eq('chat_id', chatId)
      const { data: nt } = await db.from('vendas_negocios').select('id, email, etiquetas').eq('telegram_id', chatId).order('criado_em', { ascending: false }).limit(1)
      const n = nt?.[0] as { id: string; email: string | null; etiquetas: string[] | null } | undefined
      if (!n) return null
      await db.from('vendas_negocios').update({ ...(n.email ? {} : { email: p.email }), etiquetas: [...new Set([...(n.etiquetas ?? []), 'agendou_tg'])], atualizado_em: new Date().toISOString() }).eq('id', n.id)
      return n.id
    }
    const doLink = lido?.e164 ?? null
    const tel = String(p.telefone ?? '').replace(/[^\d+]/g, '')
    const e164 = doLink ?? (tel.length >= 9 ? (tel.startsWith('+') ? tel : tel.length === 9 ? `+351${tel}` : `+${tel.replace(/^00/, '')}`) : null)
    if (!e164) return null
    const variantes = variantesDoNumero(e164)

    const { data: lead } = await db.from('telegram_leads').select('chat_id').in('chat_id', variantes.map((v) => `wa:${v.replace(/^\+/, '')}`)).limit(1).maybeSingle()
    const { data: negs } = await db.from('vendas_negocios').select('id, email, etiquetas').in('telefone', variantes).order('criado_em', { ascending: false }).limit(1)
    const neg = negs?.[0] as { id: string; email: string | null; etiquetas: string[] | null } | undefined
    // Só se apropria da marcação se houver mesmo um lead/negócio do WhatsApp com este número.
    if (!lead && !neg) return null

    if (lead) await db.from('telegram_leads').update({ stage: 'wa_agendou', updated_at: new Date().toISOString() }).eq('chat_id', lead.chat_id)
    if (!neg) return null
    await db
      .from('vendas_negocios')
      .update({
        ...(neg.email ? {} : { email: p.email }),
        etiquetas: [...new Set([...(neg.etiquetas ?? []), 'agendou_wa'])],
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', neg.id)
    return neg.id
  } catch (e) {
    console.error('[agenda-wa] ligação ao WhatsApp falhou (a marcação segue):', e instanceof Error ? e.message : e)
    return null
  }
}
