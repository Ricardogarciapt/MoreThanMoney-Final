/**
 * AVISO DA AIDA ANTES DE CADA AULA AO VIVO (pedido do Ricardo, 24/11/2026).
 *
 * Quinze minutos antes de cada aula, a AIDA avisa no canal geral da app e no Skool (categoria geral)
 * que a aula está prestes a começar. O horário vem do mesmo sítio que o espelho do Google
 * (lms_stream_schedules + lms_streams, via aulasConcretas). Cada aula avisa uma só vez, por chave
 * guardada em site_settings. Corre no cron `mtm-alerts-evaluate` (a cada 15 min); erros nunca o derrubam.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { aulasConcretas } from '@/lib/agenda/aulas-google-servidor'
import { resolveAidaUserId } from '@/lib/aida/perfil'
import { CANAL_BOM_DIA } from '@/lib/aida/bom-dia'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const MARCA_AVISO_AULA = '🤖 AIDA · Aula'
const SITE = 'https://www.morethanmoney.pt'
/** Janela: aulas que começam nos próximos 16 min (o cron corre de 15 em 15 min). */
const JANELA_MIN = 16
const ANTECEDENCIA_MIN = 15

/** Minutos até ao início da aula. Puro. */
export function minutosAte(inicio: Date, agora: Date): number {
  return (inicio.getTime() - agora.getTime()) / 60_000
}

/** Texto do aviso. Puro. */
export function textoAvisoAula(titulo: string, educador: string | null): string {
  const com = educador ? ` com ${educador}` : ''
  return `${MARCA_AVISO_AULA} · daqui a ${ANTECEDENCIA_MIN} minutos começa «${titulo}»${com}. Entra a tempo: ${SITE}/live-sessions`
}

/** Texto da publicação no Telegram, no momento em que a aula começa, com o link de acesso. Puro. */
export function textoTelegramAula(titulo: string, educador: string | null, streamId: string): string {
  const com = educador ? ` com ${educador}` : ''
  return `🔴 Está a começar «${titulo}»${com}.\n\nEntra já: ${SITE}/live-sessions/${streamId}`
}

/** Aulas que começaram nos últimos 16 min (ainda não passou o aviso de arranque). Puro. */
export function aulaAComecar(m: number): boolean {
  return m <= 0 && m > -JANELA_MIN
}

/** Chave de dedupe por aula e por canal. */
export function chaveAviso(chave: string, canal: 'app' | 'skool' | 'telegram'): string {
  return `aida_aviso_aula_${canal}:${chave}`
}

async function jaAvisado(db: SupabaseClient, chave: string): Promise<boolean> {
  const { data } = await db.from('site_settings').select('value').eq('key', chave).maybeSingle()
  return !!data
}

async function marcarAvisado(db: SupabaseClient, chave: string): Promise<void> {
  await db.from('site_settings').upsert({ key: chave, value: true })
}

/** Publica no grupo Telegram «MTM System» (site_settings.telegram_leads_group_id) com a capa e o link. */
async function avisarNoTelegram(texto: string, capa: string | null): Promise<string | null> {
  const token = (process.env.TELEGRAM_AIBOT_TOKEN || '').trim()
  if (!token) return 'TELEGRAM_AIBOT_TOKEN em falta'
  const db = getSupabaseAdmin()
  const { data } = await db.from('site_settings').select('value').eq('key', 'telegram_leads_group_id').maybeSingle()
  const chat = (data?.value as { chat_id?: string } | null)?.chat_id
  if (!chat) return 'grupo MTM System sem chat_id'
  const foto = capa && /^https?:\/\//i.test(capa) ? capa : null
  const metodo = foto ? 'sendPhoto' : 'sendMessage'
  const corpo = foto ? { chat_id: chat, photo: foto, caption: texto.slice(0, 1000) } : { chat_id: chat, text: texto, disable_web_page_preview: false }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(25_000),
    })
    const j = (await r.json().catch(() => null)) as { ok?: boolean; description?: string } | null
    return j?.ok ? null : (j?.description ?? `HTTP ${r.status}`)
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/** Publica no Skool, categoria geral. Sem sessão do Skool devolve erro, sem lançar. */
async function avisarNoSkool(texto: string): Promise<string | null> {
  try {
    const { lerSessao, chamarApi, idDoGrupo, categoriasDoGrupo } = await import('@/lib/skool/ciclo-api')
    await lerSessao()
    const cats = await categoriasDoGrupo()
    await chamarApi('POST', 'posts?follow=true', {
      post_type: 'generic',
      group_id: await idDoGrupo(),
      metadata: { title: MARCA_AVISO_AULA.slice(0, 120), content: texto.slice(0, 9000), attachments: '', labels: cats.geral, action: 0, video_ids: '' },
    })
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/**
 * Avisa as aulas que começam dentro de 15 minutos. Devolve o que fez, para o relatório do cron.
 * Erros são devolvidos, nunca lançados.
 */
export async function avisarAulasAida(db: SupabaseClient, agora: Date = new Date()): Promise<{ estado: string; avisadas: number; erros?: string[] }> {
  try {
    const aulas = await aulasConcretas(agora, 1)
    const proximas = aulas.filter((a) => {
      const m = minutosAte(a.inicio, agora)
      return m > 0 && m <= JANELA_MIN
    })
    const a_comecar = aulas.filter((a) => aulaAComecar(minutosAte(a.inicio, agora)))
    if (!proximas.length && !a_comecar.length) return { estado: 'sem_aulas', avisadas: 0 }

    const userId = await resolveAidaUserId(db)
    const erros: string[] = []
    let avisadas = 0
    for (const aula of proximas) {
      const texto = textoAvisoAula(aula.titulo, aula.educadorNome)

      const kApp = chaveAviso(aula.chave, 'app')
      if (!(await jaAvisado(db, kApp))) {
        const { error } = await db.from('chat_messages').insert({
          channel_slug: CANAL_BOM_DIA,
          user_id: userId,
          content: texto,
          image_url: null,
          link_url: null,
          link_preview: null,
          message_type: 'text',
          reply_to_id: null,
        })
        if (error) erros.push(`app ${aula.chave}: ${error.message}`)
        else {
          await marcarAvisado(db, kApp)
          avisadas++
        }
      }

      const kSkool = chaveAviso(aula.chave, 'skool')
      if (!(await jaAvisado(db, kSkool))) {
        const erroSkool = await avisarNoSkool(texto)
        if (erroSkool) erros.push(`skool ${aula.chave}: ${erroSkool}`)
        else await marcarAvisado(db, kSkool)
      }
    }
    for (const aula of a_comecar) {
      const kTg = chaveAviso(aula.chave, 'telegram')
      if (await jaAvisado(db, kTg)) continue
      const streamId = aula.chave.split(':')[0]
      const { data: st } = await db.from('lms_streams').select('thumbnail_url').eq('id', streamId).maybeSingle()
      const texto = textoTelegramAula(aula.titulo, aula.educadorNome, streamId)
      const erroTg = await avisarNoTelegram(texto, (st?.thumbnail_url as string | null) ?? null)
      if (erroTg) erros.push(`telegram ${aula.chave}: ${erroTg}`)
      else await marcarAvisado(db, kTg)
    }
    return { estado: 'ok', avisadas, ...(erros.length ? { erros } : {}) }
  } catch (e) {
    return { estado: 'erro', avisadas: 0, erros: [e instanceof Error ? e.message : String(e)] }
  }
}
