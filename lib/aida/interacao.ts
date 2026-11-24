/**
 * INTERAÇÃO DA AIDA AO LONGO DO DIA (pedido do Ricardo, 24/11/2026).
 *
 * Entre as 07h e as 22h de Lisboa, a AIDA intervém no canal geral em alguns momentos do dia:
 * lê as últimas mensagens e responde ou puxa pela conversa. Apresenta-se como IA e nunca como
 * pessoa. Não revela saldos nem números de desempenho, não promete lucros e não interage nos
 * chats de sinais. Corre no cron `social-link-preview`, ao lado do bom dia.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { chamarIAGratis } from '@/lib/ia/chamar'
import { resolveSystemUserId } from '@/lib/system-chat-user'
import { CANAL_BOM_DIA, horaLisboa, notificarAida } from '@/lib/aida/bom-dia'

export const MARCA_INTERACAO = '🤖 AIDA · '
/** Horas (Lisboa) em que a AIDA pode intervir. */
export const HORAS_INTERACAO = [10, 13, 16, 19]
/** Não volta a intervir antes de passarem estas horas desde a última mensagem dela. */
const INTERVALO_MIN_H = 2

export const SISTEMA_AIDA = `És a AIDA (Artificial Intelligence Development Assistant), uma assistente de inteligência artificial da comunidade MoreThanMoney.
Regras:
- Escreves em português de Portugal, tratas por «tu», tom próximo, positivo e sem exageros. Máximo 2 frases, até 280 caracteres.
- És uma IA. Se alguém perguntar se és pessoa, dizes sempre que és uma IA. Nunca te apresentas como pessoa real.
- Nunca revelas saldos, contas ou dados de membros. Nunca mostras números de desempenho nem prometes lucros.
- Nada de conselhos de investimento. Podes incentivar a estudar, a rever o plano e a participar.
- Se a conversa recente for de sinais ou de trading em concreto, não entras; respondes só com uma pergunta de estudo geral ou ficas em silêncio.
- Se não tiveres nada útil a acrescentar, devolve exatamente: SILENCIO`

/** Janela do dia em que a AIDA pode intervir. Puro. */
export function podeIntervir(agora: Date): boolean {
  const h = horaLisboa(agora)
  return h >= 7 && h < 22 && HORAS_INTERACAO.includes(h)
}

/** Constrói o pedido à IA com as últimas mensagens do canal. Puro. */
export function contextoParaAida(mensagens: { content: string | null; created_at: string }[]): string {
  const linhas = mensagens
    .slice()
    .reverse()
    .map((m) => `- ${String(m.content ?? '').slice(0, 280)}`)
  return linhas.length
    ? `Últimas mensagens do canal geral, da mais antiga para a mais recente:\n${linhas.join('\n')}\n\nEscreve a tua próxima mensagem para o canal.`
    : 'O canal geral está calmo. Escreve uma mensagem curta a puxar pela conversa, com uma pergunta de estudo ou de rotina.'
}

/**
 * Intervém no canal geral se for a hora certa e a última intervenção já tiver passado o intervalo.
 * Erros são devolvidos, nunca lançados.
 */
export async function correrInteracaoAida(db: SupabaseClient, agora: Date = new Date()): Promise<{ estado: string; erro?: string }> {
  try {
    if (!podeIntervir(agora)) return { estado: 'fora_da_janela' }

    const { data: ultima } = await db
      .from('chat_messages')
      .select('created_at')
      .eq('channel_slug', CANAL_BOM_DIA)
      .like('content', `${MARCA_INTERACAO}%`)
      .order('created_at', { ascending: false })
      .limit(1)
    const ultimaData = ultima?.[0]?.created_at ? Date.parse(String(ultima[0].created_at)) : 0
    if (ultimaData && agora.getTime() - ultimaData < INTERVALO_MIN_H * 3_600_000) {
      return { estado: 'ainda_recente' }
    }

    const { data: recentes } = await db
      .from('chat_messages')
      .select('content, created_at')
      .eq('channel_slug', CANAL_BOM_DIA)
      .order('created_at', { ascending: false })
      .limit(12)

    const resposta = await chamarIAGratis({
      sistema: SISTEMA_AIDA,
      mensagens: [{ role: 'user', content: contextoParaAida(recentes ?? []) }],
      maxTokens: 160,
      temperatura: 0.7,
      tarefa: 'aida-interacao',
      preferencia: 'rapido',
    })

    const texto = resposta.texto.trim()
    if (!texto || texto === 'SILENCIO') return { estado: 'silencio' }

    const userId = await resolveSystemUserId(db)
    const { data: msg, error } = await db.from('chat_messages').insert({
      channel_slug: CANAL_BOM_DIA,
      user_id: userId,
      content: `${MARCA_INTERACAO}${texto.slice(0, 600)}`,
      image_url: null,
      link_url: null,
      link_preview: null,
      message_type: 'text',
      reply_to_id: null,
    }).select('id').single()
    if (error) return { estado: 'erro', erro: error.message }
    await notificarAida(msg?.id, 'AIDA', texto.slice(0, 140), userId)
    return { estado: 'publicado' }
  } catch (e) {
    return { estado: 'erro', erro: e instanceof Error ? e.message : String(e) }
  }
}

