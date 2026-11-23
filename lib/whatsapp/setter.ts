/**
 * A FILA DOS SETTERS a partir do WhatsApp (23/11/2026): quem pede uma pessoa, ou quem esgotou o
 * seguimento automático depois de ir ao site, ganha uma tarefa aberta para hoje, papel setter, no
 * negócio do pipeline (criado se ainda não existir). Nunca rebenta o funil.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { variantesDoNumero } from '@/lib/whatsapp-envio'
import type { Lingua } from '@/lib/whatsapp/linguas'

/**
 * Quem pede uma pessoa vai para a FILA DOS SETTERS no pipeline (pedido do Ricardo 23/11): o negócio
 * ganha a etiqueta `quer_pessoa` e uma tarefa aberta para hoje, papel setter. Nunca rebenta o funil.
 */
export async function passarParaSetter(e164: string, nome: string, lingua: Lingua, frase: string, motivo: 'pediu' | 'seguimento' = 'pediu') {
  try {
    const db = getSupabaseAdmin()
    type Neg = { id: string; etiquetas: string[] | null; nome: string | null }
    const { data } = await db.from('vendas_negocios').select('id, etiquetas, nome').in('telefone', variantesDoNumero(e164)).order('criado_em', { ascending: false }).limit(1)
    let neg = (data?.[0] as Neg | undefined) ?? null
    if (!neg) {
      const { data: novo } = await db
        .from('vendas_negocios')
        .insert({ nome: nome || null, telefone: e164, origem: 'whatsapp', chave_origem: `wa-humano:${e164}`, funil: 'educacao', estado: 'lead', etiquetas: [motivo === 'pediu' ? 'quer_pessoa' : 'seguimento_wa', `lingua-${lingua}`] })
        .select('id, etiquetas, nome')
        .single()
      neg = (novo as Neg | null) ?? null
    } else {
      await db
        .from('vendas_negocios')
        .update({ etiquetas: [...new Set([...(neg.etiquetas ?? []), motivo === 'pediu' ? 'quer_pessoa' : 'seguimento_wa', `lingua-${lingua}`])], atualizado_em: new Date().toISOString() })
        .eq('id', neg.id)
    }
    if (!neg) return
    const hoje = new Date().toISOString().slice(0, 10)
    const chave = `wa-${motivo === 'pediu' ? 'humano' : 'seguimento'}:${neg.id}:${hoje}`
    const { data: ja } = await db.from('vendas_tarefas').select('id').eq('chave', chave).maybeSingle()
    if (!ja) {
      await db.from('vendas_tarefas').insert({
        chave,
        titulo: motivo === 'pediu' ? `Falar com ${neg.nome || nome || e164} no WhatsApp (pediu uma pessoa)` : `Retomar ${neg.nome || nome || e164} no WhatsApp (foi ao site e calou-se)`,
        descricao: motivo === 'pediu'
          ? `Pediu para falar com uma pessoa no funil de WhatsApp. Língua: ${lingua.toUpperCase()}. Número ${e164}. Disse: «${frase.slice(0, 300)}». Já recebeu o link da agenda.`
          : `Seguimento automático do WhatsApp esgotado. Língua: ${lingua.toUpperCase()}. Número ${e164}. ${frase.slice(0, 400)}`,
        negocio_id: neg.id,
        papel: 'setter',
        prazo: hoje,
        estado: 'aberta',
      })
    }
  } catch (e) {
    console.error('[whatsapp-fluxo] fila de setters falhou:', e instanceof Error ? e.message : e)
  }
}


/** O mesmo, para um lead do Telegram (negócio pelo `telegram_id`). */
export async function passarParaSetterTelegram(chatId: string, nome: string, lingua: Lingua, frase: string, motivo: 'pediu' | 'seguimento' = 'pediu') {
  try {
    const db = getSupabaseAdmin()
    type Neg = { id: string; etiquetas: string[] | null; nome: string | null }
    const etiqueta = motivo === 'pediu' ? 'quer_pessoa' : 'seguimento_tg'
    const { data } = await db.from('vendas_negocios').select('id, etiquetas, nome').eq('telegram_id', chatId).order('criado_em', { ascending: false }).limit(1)
    let neg = (data?.[0] as Neg | undefined) ?? null
    if (!neg) {
      const { data: novo } = await db
        .from('vendas_negocios')
        .insert({ nome: nome || null, telegram_id: chatId, origem: 'telegram', chave_origem: `tg-humano:${chatId}`, funil: 'educacao', estado: 'lead', etiquetas: [etiqueta, `lingua-${lingua}`] })
        .select('id, etiquetas, nome')
        .single()
      neg = (novo as Neg | null) ?? null
    } else {
      await db
        .from('vendas_negocios')
        .update({ etiquetas: [...new Set([...(neg.etiquetas ?? []), etiqueta, `lingua-${lingua}`])], atualizado_em: new Date().toISOString() })
        .eq('id', neg.id)
    }
    if (!neg) return
    const hoje = new Date().toISOString().slice(0, 10)
    const chave = `tg-${motivo === 'pediu' ? 'humano' : 'seguimento'}:${neg.id}:${hoje}`
    const { data: ja } = await db.from('vendas_tarefas').select('id').eq('chave', chave).maybeSingle()
    if (!ja) {
      await db.from('vendas_tarefas').insert({
        chave,
        titulo: motivo === 'pediu' ? `Falar com ${neg.nome || nome || chatId} no Telegram (pediu uma pessoa)` : `Retomar ${neg.nome || nome || chatId} no Telegram (foi ao site e calou-se)`,
        descricao: `${motivo === 'pediu' ? 'Pediu para falar com uma pessoa no funil do Telegram.' : 'Seguimento automático do Telegram esgotado.'} Língua: ${lingua.toUpperCase()}. Chat ${chatId}. ${frase.slice(0, 400)} Responde no back-office → Conversas → Telegram.`,
        negocio_id: neg.id,
        papel: 'setter',
        prazo: hoje,
        estado: 'aberta',
      })
    }
  } catch (e) {
    console.error('[telegram-funil] fila de setters falhou:', e instanceof Error ? e.message : e)
  }
}
