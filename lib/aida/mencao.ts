/**
 * MENÇÕES A @aida (pedido do Ricardo, 24/11/2026).
 *
 * Um membro escreve «@aida» numa mensagem do canal geral e a AIDA responde logo a seguir,
 * como resposta a essa mensagem. Usa a cadeia de IA grátis e as mesmas regras da interação:
 * é IA quando lhe perguntam, não revela saldos nem números de desempenho, não promete lucros.
 * Só corre no canal geral (os chats de sinais ficam de fora). Erros são engolidos: nunca
 * afetam a publicação da mensagem do membro.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { chamarIAGratis } from '@/lib/ia/chamar'
import { resolveAidaUserId } from '@/lib/aida/perfil'
import { CANAL_BOM_DIA, notificarAida } from '@/lib/aida/bom-dia'
import { MARCA_INTERACAO, SISTEMA_AIDA } from '@/lib/aida/interacao'

const MENCAO_AIDA = /(^|\s)@aida\b/i

/** Verdadeiro se a mensagem menciona @aida. Puro. */
export function mencionaAida(texto: string | null | undefined): boolean {
  return !!texto && MENCAO_AIDA.test(texto)
}

/** Pergunta que a AIDA recebe: a mensagem do membro, com o contexto recente. Puro. */
export function pedidoDeMencao(nome: string, texto: string, recentes: { content: string | null }[]): string {
  const contexto = recentes
    .slice()
    .reverse()
    .map((m) => `- ${String(m.content ?? '').slice(0, 200)}`)
    .join('\n')
  return `Contexto recente do canal geral:\n${contexto || '(sem mensagens recentes)'}\n\n${nome} escreveu-te diretamente:\n"${texto.slice(0, 800)}"\n\nResponde a ${nome} em 2 frases no máximo. Não fiques em silêncio: esta pergunta é para ti.`
}

/**
 * Responde a uma menção. Chamada depois de a mensagem do membro estar guardada.
 * Devolve o estado para o registo; nunca lança.
 */
export async function responderMencaoAida(
  db: SupabaseClient,
  p: { channelSlug: string; texto: string; nome: string; messageId: string; userId: string },
): Promise<{ estado: string; erro?: string }> {
  try {
    if (p.channelSlug !== CANAL_BOM_DIA) return { estado: 'canal_fora' }
    if (!mencionaAida(p.texto)) return { estado: 'sem_mencao' }

    const { data: recentes } = await db
      .from('chat_messages')
      .select('content')
      .eq('channel_slug', CANAL_BOM_DIA)
      .order('created_at', { ascending: false })
      .limit(8)

    const resposta = await chamarIAGratis({
      sistema: SISTEMA_AIDA,
      mensagens: [{ role: 'user', content: pedidoDeMencao(p.nome, p.texto, recentes ?? []) }],
      maxTokens: 160,
      temperatura: 0.7,
      tarefa: 'aida-mencao',
      preferencia: 'rapido',
    })

    const texto = resposta.texto.trim()
    if (!texto || texto === 'SILENCIO') return { estado: 'silencio' }

    const aidaId = await resolveAidaUserId(db)
    const { data: msg, error } = await db.from('chat_messages').insert({
      channel_slug: CANAL_BOM_DIA,
      user_id: aidaId,
      content: `${MARCA_INTERACAO}${texto.slice(0, 600)}`,
      image_url: null,
      link_url: null,
      link_preview: null,
      message_type: 'text',
      reply_to_id: p.messageId,
    }).select('id').single()
    if (error) return { estado: 'erro', erro: error.message }
    await notificarAida(msg?.id, 'AIDA', texto.slice(0, 140), aidaId)
    return { estado: 'respondeu' }
  } catch (e) {
    return { estado: 'erro', erro: e instanceof Error ? e.message : String(e) }
  }
}
