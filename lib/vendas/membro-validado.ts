/**
 * MEMBRO VALIDADO PELA CORRETORA → CRM + UTILIZADOR + CHAMADA DE ONBOARDING (23/11/2026).
 *
 * Pedido do Ricardo: «estar ligado aos membros que se ativarem, para agendar com eles as chamadas
 * de onboarding, interligado com os users». Quando o UID + depósito ficam validados (Telegram ou
 * WhatsApp, `lib/telegram-broker-gate.ts`):
 *   · o negócio do pipeline passa a `ganho`, funil `corretora`, com o UID e a etiqueta
 *     `validado_corretora` (criado se não existir);
 *   · se já houver conta no site com o mesmo telefone/email, fica ligado (`comprador_id`);
 *   · abre-se uma tarefa «Chamada de onboarding» para hoje, papel setter.
 * O link da agenda de onboarding vai na própria mensagem de acesso libertado. Nunca rebenta o grant.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { donoPorPapel, marcarDonoNoNegocio } from '@/lib/vendas/dono-por-papel'

export async function membroValidado(p: { chatId: string; uid: string | null; nome?: string | null }): Promise<string | null> {
  try {
    const db = getSupabaseAdmin()
    const wa = p.chatId.startsWith('wa:')
    const telefone = wa ? `+${p.chatId.slice(3).replace(/\D/g, '')}` : null
    type Neg = { id: string; etiquetas: string[] | null; nome: string | null; email: string | null; comprador_id: string | null }
    const cols = 'id, etiquetas, nome, email, comprador_id'
    let neg: Neg | null = null
    if (wa && telefone) {
      const { variantesDoNumero } = await import('@/lib/whatsapp-envio')
      const { data } = await db.from('vendas_negocios').select(cols).in('telefone', variantesDoNumero(telefone)).order('criado_em', { ascending: false }).limit(1)
      neg = (data?.[0] as Neg | undefined) ?? null
    } else {
      const { data } = await db.from('vendas_negocios').select(cols).eq('telegram_id', p.chatId).order('criado_em', { ascending: false }).limit(1)
      neg = (data?.[0] as Neg | undefined) ?? null
    }
    if (!neg && p.uid) {
      const { data } = await db.from('vendas_negocios').select(cols).eq('broker_uid', p.uid).limit(1)
      neg = (data?.[0] as Neg | undefined) ?? null
    }

    // Utilizador do site com o mesmo telefone (ou email do negócio) → liga-se.
    let comprador: string | null = neg?.comprador_id ?? null
    if (!comprador) {
      const ult9 = (telefone ?? '').replace(/\D/g, '').slice(-9)
      if (ult9.length === 9) {
        const { data } = await db.from('profiles').select('id').or(`phone.ilike.%${ult9},whatsapp.ilike.%${ult9}`).limit(1)
        comprador = (data?.[0] as { id?: string } | undefined)?.id ?? null
      }
      if (!comprador && neg?.email) {
        const { data } = await db.from('profiles').select('id').ilike('email', neg.email).limit(1)
        comprador = (data?.[0] as { id?: string } | undefined)?.id ?? null
      }
    }

    const agora = new Date().toISOString()
    const etiquetas = [...new Set([...(neg?.etiquetas ?? []), 'validado_corretora'])]
    if (neg) {
      await db
        .from('vendas_negocios')
        .update({ estado: 'ganho', funil: 'corretora', broker_uid: p.uid, etiquetas, fechado_em: agora, atualizado_em: agora, ...(comprador ? { comprador_id: comprador } : {}) })
        .eq('id', neg.id)
    } else {
      const { data: novo } = await db
        .from('vendas_negocios')
        .insert({
          nome: p.nome || null,
          telefone,
          telegram_id: wa ? null : p.chatId,
          origem: wa ? 'whatsapp' : 'telegram',
          chave_origem: `validado:${p.chatId}`,
          funil: 'corretora',
          estado: 'ganho',
          broker_uid: p.uid,
          etiquetas,
          fechado_em: agora,
          comprador_id: comprador,
        })
        .select(cols)
        .single()
      neg = (novo as Neg | null) ?? null
    }
    if (!neg) return null

    const chave = `onboarding:${neg.id}`
    const { data: ja } = await db.from('vendas_tarefas').select('id').eq('chave', chave).maybeSingle()
    if (!ja) {
      const quem = neg.nome || p.nome || telefone || p.chatId
      const dono = await donoPorPapel(db, 'setter')
      if (dono) await marcarDonoNoNegocio(db, neg.id, dono)
      await db.from('vendas_tarefas').insert({
        chave,
        titulo: `Chamada de onboarding com ${quem} (conta validada)`,
        descricao:
          `Conta PU Prime validada (UID ${p.uid ?? '?'}) por ${wa ? 'WhatsApp' : 'Telegram'}. ` +
          `Recebeu o link da agenda de onboarding; se não marcar em 24 h, liga-lhe. ` +
          (comprador ? 'Já tem conta no site (ligada ao negócio).' : 'Ainda sem conta no site: ajuda-o a registar-se com o cupão.'),
        negocio_id: neg.id,
        papel: 'setter',
        responsavel_id: dono?.userId ?? null,
        prazo: agora.slice(0, 10),
        estado: 'aberta',
      })
    }
    return neg.id
  } catch (e) {
    console.error('[membro-validado] falhou:', e instanceof Error ? e.message : e)
    return null
  }
}
