/**
 * BOM DIA DA AIDA (pedido do Ricardo, 24/11/2026).
 *
 * A AIDA (Artificial Intelligence Development Assistant) dá os bons dias no canal #geral às
 * 07h de Lisboa, na sua voz. Apresenta-se como pessoa IA, em PT-PT, tratamento «tu».
 * Não revela saldos, não mostra números de desempenho e não promete lucros.
 * Corre dentro do cron `social-link-preview` (a vercel.json está no tecto de crons).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSystemUserId } from '@/lib/system-chat-user'

export const CANAL_BOM_DIA = 'geral'
export const MARCA_BOM_DIA = '🤖 AIDA · Bom dia'
const HORA_BOM_DIA = 7

const FOCOS = [
  'Revê o teu plano de hoje e escolhe uma coisa pequena para fazer até ao almoço.',
  'Partilha uma dúvida no chat: a comunidade aprende mais quando perguntamos.',
  'Faz a tua missão do dia na app e conta-me como correu, se quiseres.',
  'Lembra-te de proteger o tempo: 15 minutos de mercado bem usados valem mais do que horas de ansiedade.',
  'Se estás a começar, o Início Rápido é o melhor ponto de partida. Sem pressa.',
  'Hoje, escreve um objetivo e um passo concreto para o alcançar. Isso já é progresso.',
  'Consistência ganha ao impulso. Um dia de cada vez.',
]

/** Hora de Lisboa (0–23). Puro e testável com uma data fixa. */
export function horaLisboa(agora: Date): number {
  const h = new Intl.DateTimeFormat('pt-PT', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Lisbon' }).format(agora)
  return Number(h)
}

/** Dia de Lisboa no formato AAAA-MM-DD. Puro. */
export function diaLisboa(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Lisbon' }).format(agora)
}

const ABERTURAS = [
  'Bom dia, comunidade MTM! ☀️',
  'Bons dias, pessoal! ☀️',
  'Bom dia a todos! Mais um dia para dar um passo. ☀️',
  'Bom dia! Como está a correr a semana? ☀️',
  'Acordámos juntos, vamos a isso. ☀️',
]

/** Índice estável por dia: varia de dia para dia sem repetir em sequência. Puro. */
export function indiceDoDia(dia: string, tamanho: number): number {
  let h = 0
  for (const c of dia) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % tamanho
}

/** Texto do bom dia. Abertura e foco mudam de dia para dia, sem sequência fixa. Puro. */
export function textoBomDia(agora: Date): string {
  const dia = diaLisboa(agora)
  const foco = FOCOS[indiceDoDia(dia, FOCOS.length)]
  const abertura = ABERTURAS[indiceDoDia(dia + 'a', ABERTURAS.length)]
  return [
    MARCA_BOM_DIA,
    '',
    `${abertura} Sou a AIDA, uma assistente de inteligência artificial da MoreThanMoney. Estou aqui das 07h às 22h para tirar dúvidas, moderar e ajudar-te a crescer.`,
    '',
    `💡 Foco do dia: ${foco}`,
    '',
    '⚠️ Conteúdo educativo. Não é aconselhamento financeiro.',
  ].join('\n')
}

/**
 * Publica o bom dia uma vez por dia, na hora certa. Devolve o estado para o relatório do cron.
 * Erros são devolvidos, nunca lançados, para não derrubar o cron que o chama.
 */
export async function correrBomDiaAida(db: SupabaseClient, agora: Date = new Date()): Promise<{ estado: string; erro?: string }> {
  try {
    if (horaLisboa(agora) !== HORA_BOM_DIA) return { estado: 'fora_da_hora' }

    const inicioDia = new Date(`${diaLisboa(agora)}T00:00:00+01:00`).toISOString()
    const { data: ja } = await db
      .from('chat_messages')
      .select('id')
      .eq('channel_slug', CANAL_BOM_DIA)
      .like('content', `${MARCA_BOM_DIA}%`)
      .gte('created_at', inicioDia)
      .limit(1)
    if (ja && ja.length) return { estado: 'ja_publicado' }

    const userId = await resolveSystemUserId(db)
    const { error } = await db.from('chat_messages').insert({
      channel_slug: CANAL_BOM_DIA,
      user_id: userId,
      content: textoBomDia(agora),
      image_url: null,
      link_url: null,
      link_preview: null,
      message_type: 'text',
      reply_to_id: null,
    })
    if (error) return { estado: 'erro', erro: error.message }
    return { estado: 'publicado' }
  } catch (e) {
    return { estado: 'erro', erro: e instanceof Error ? e.message : String(e) }
  }
}
