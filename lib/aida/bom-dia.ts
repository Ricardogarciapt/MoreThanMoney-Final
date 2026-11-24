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
import { notifyChatChannelMessage } from '@/lib/chat-channel-notify'

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

/** Feriados nacionais fixos (mês-dia). Os móveis (Páscoa, Corpo de Deus) entram à mão em `EVENTOS_DO_DIA`. */
const FERIADOS_FIXOS: Record<string, string> = {
  '01-01': 'Feliz Ano Novo!',
  '04-25': 'Hoje é feriado: 25 de Abril.',
  '05-01': 'Hoje é feriado: Dia do Trabalhador.',
  '06-10': 'Hoje é feriado: Dia de Portugal.',
  '08-15': 'Hoje é feriado: Assunção de Nossa Senhora.',
  '10-05': 'Hoje é feriado: Implantação da República.',
  '11-01': 'Hoje é feriado: Todos os Santos.',
  '12-01': 'Hoje é feriado: Restauração da Independência.',
  '12-08': 'Hoje é feriado: Imaculada Conceição.',
  '12-25': 'Feliz Natal a todos!',
}

/**
 * Datas à mão: eventos económicos, aniversários da equipa e feriados móveis.
 * Acrescentar aqui (mês-dia → texto). Ex.: '11-27': 'Black Friday: cuidado com as compras por impulso.'
 */
export const EVENTOS_DO_DIA: Record<string, string> = {
  '11-27': 'Black Friday: antes de comprar por impulso, pergunta-te se fazia falta na semana passada.',
}

/** Linha de ocasião do dia (feriado, data à mão, ou alerta de emergência). Puro. */
export function ocasiaoDoDia(agora: Date, alertaEmergencia?: string | null): string | null {
  if (alertaEmergencia && alertaEmergencia.trim()) return `🚨 ${alertaEmergencia.trim()}`
  const md = diaLisboa(agora).slice(5)
  return FERIADOS_FIXOS[md] ?? EVENTOS_DO_DIA[md] ?? null
}

/** Texto do bom dia. Abertura e foco mudam de dia para dia; ocasiões especiais entram à parte. Puro. */
export function textoBomDia(agora: Date, alertaEmergencia?: string | null): string {
  const dia = diaLisboa(agora)
  const foco = FOCOS[indiceDoDia(dia, FOCOS.length)]
  const abertura = ABERTURAS[indiceDoDia(dia + 'a', ABERTURAS.length)]
  const ocasiao = ocasiaoDoDia(agora, alertaEmergencia)
  return [
    MARCA_BOM_DIA,
    '',
    `${abertura} Sou a AIDA, uma assistente de inteligência artificial da MoreThanMoney. Estou aqui das 07h às 22h para tirar dúvidas, moderar e ajudar-te a crescer.`,
    ...(ocasiao ? ['', ocasiao] : []),
    '',
    `💡 Foco do dia: ${foco}`,
    '',
    '⚠️ Conteúdo educativo. Não é aconselhamento financeiro.',
  ].join('\n')
}

/** Notificação de uma mensagem da AIDA, como as dos membros (o Ricardo pediu que existam). */
export async function notificarAida(messageId: string | undefined, titulo: string, corpo: string, userId: string): Promise<void> {
  try {
    await notifyChatChannelMessage({
      channelSlug: CANAL_BOM_DIA,
      title: titulo,
      body: corpo,
      messageId,
      excludeUserId: userId,
    })
  } catch {
    /* a notificação nunca derruba a publicação */
  }
}

/**
 * Parabéns aos membros que fazem anos hoje, no canal geral. RGPD: a data de nascimento é dado
 * pessoal, por isso só entra quem deu consentimento para ser celebrado (`profiles.aniversario_consentimento`
 * = true). Só o primeiro nome aparece, nunca a data nem a idade. Devolve quantos foram celebrados.
 */
export async function festejarAniversarios(db: SupabaseClient, agora: Date, userId: string): Promise<number> {
  const mesDia = diaLisboa(agora).slice(5)
  const { data: perfis, error } = await db
    .from('profiles')
    .select('full_name, birth_date')
    .eq('aniversario_consentimento', true)
    .not('birth_date', 'is', null)
  if (error || !perfis) return 0
  const nomes = perfis
    .filter((p) => typeof p.birth_date === 'string' && p.birth_date.slice(5, 10) === mesDia)
    .map((p) => String(p.full_name ?? '').trim().split(/\s+/)[0])
    .filter(Boolean)
  if (!nomes.length) return 0
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  const { error: erroInsert } = await db.from('chat_messages').insert({
    channel_slug: CANAL_BOM_DIA,
    user_id: userId,
    content: `🎂 Hoje é dia de festa! Parabéns, ${lista}! Que o dia seja bom e o ano traga coisas boas. 🎉 — a AIDA`,
    image_url: null,
    link_url: null,
    link_preview: null,
    message_type: 'text',
    reply_to_id: null,
  })
  return erroInsert ? 0 : nomes.length
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

    // Alerta de emergência ou calamidade: escrito à mão em site_settings (chave aida_alerta). Vazio = nenhum.
    let alerta: string | null = null
    try {
      const { data: s } = await db.from('site_settings').select('value').eq('key', 'aida_alerta').maybeSingle()
      const v = s?.value as unknown
      alerta = typeof v === 'string' ? v : (v && typeof v === 'object' && typeof (v as { texto?: unknown }).texto === 'string' ? (v as { texto: string }).texto : null)
    } catch {
      alerta = null
    }

    const userId = await resolveSystemUserId(db)
    const { data: msg, error } = await db.from('chat_messages').insert({
      channel_slug: CANAL_BOM_DIA,
      user_id: userId,
      content: textoBomDia(agora, alerta),
      image_url: null,
      link_url: null,
      link_preview: null,
      message_type: 'text',
      reply_to_id: null,
    }).select('id').single()
    if (error) return { estado: 'erro', erro: error.message }
    await notificarAida(msg?.id, 'AIDA · Bom dia', 'Bom dia, comunidade MTM! ☀️ A AIDA está de volta.', userId)
    const festejados = await festejarAniversarios(db, agora, userId).catch(() => 0)
    return { estado: 'publicado', ...(festejados ? { aniversarios: festejados } : {}) }
  } catch (e) {
    return { estado: 'erro', erro: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Bom dia da AIDA no Skool (categoria geral). Só corre com a sessão do Skool guardada
 * (integracoes_privadas, pelo /admin/skool). Sem sessão, devolve «sem_sessao» e não faz nada.
 * Dedupe por dia no próprio post: uma vez por dia de Lisboa, mesmo se o cron correr duas vezes.
 */
export async function bomDiaSkool(db: SupabaseClient, agora: Date = new Date()): Promise<{ estado: string; erro?: string }> {
  try {
    if (horaLisboa(agora) !== HORA_BOM_DIA) return { estado: 'fora_da_hora' }
    const dia = diaLisboa(agora)
    const { data: marca } = await db.from('site_settings').select('value').eq('key', 'aida_skool_ultimo_bom_dia').maybeSingle()
    if (marca?.value === dia) return { estado: 'ja_publicado' }

    const { lerSessao, chamarApi, idDoGrupo, categoriasDoGrupo } = await import('@/lib/skool/ciclo-api')
    await lerSessao()
    const cats = await categoriasDoGrupo()
    const titulo = `${MARCA_BOM_DIA}`
    const conteudo = textoBomDia(agora, null).replace(`${MARCA_BOM_DIA}\n\n`, '')
    await chamarApi('POST', 'posts?follow=true', {
      post_type: 'generic',
      group_id: await idDoGrupo(),
      metadata: { title: titulo.slice(0, 120), content: conteudo.slice(0, 9000), attachments: '', labels: cats.geral, action: 0, video_ids: '' },
    })
    await db.from('site_settings').upsert({ key: 'aida_skool_ultimo_bom_dia', value: dia })
    return { estado: 'publicado' }
  } catch (e) {
    return { estado: 'sem_sessao_ou_erro', erro: e instanceof Error ? e.message : String(e) }
  }
}
