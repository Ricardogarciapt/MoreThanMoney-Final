/**
 * Threads (Meta) — cliente mínimo da API oficial (graph.threads.net), para a conta pessoal
 * @ricardogarciapt. Pedido do Ricardo (23/11/2026): usar o Threads para interagir e recrutar
 * setters e closers.
 *
 * O token NÃO é o do Instagram: o Threads tem OAuth próprio (threads.net/oauth/authorize) e
 * escopos próprios. Vive em `site_settings.threads_token` ({ access_token, user_id, expira_em }),
 * dura 60 dias e renova-se sozinho no cron (`renovarSeFaltarPouco`). Ligação em
 * /api/threads/oauth (só admin). Precisa de THREADS_APP_ID e THREADS_APP_SECRET na Vercel.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const THREADS_GRAPH = 'https://graph.threads.net/v1.0'
export const CHAVE_TOKEN = 'threads_token'
export const ESCOPOS = [
  'threads_basic',
  'threads_content_publish',
  'threads_manage_replies',
  'threads_read_replies',
].join(',')

export type TokenThreads = { access_token: string; user_id: string; expira_em: string; username?: string }

export async function lerToken(db: SupabaseClient): Promise<TokenThreads | null> {
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_TOKEN).maybeSingle()
  const v = data?.value as TokenThreads | null
  return v?.access_token ? v : null
}

export async function guardarToken(db: SupabaseClient, t: TokenThreads): Promise<void> {
  await db.from('site_settings').upsert({ key: CHAVE_TOKEN, value: t }, { onConflict: 'key' })
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (!r.ok || (j as { error?: unknown }).error) {
    throw new Error(`Threads ${r.status}: ${(j as { error?: { message?: string } }).error?.message ?? 'erro'}`)
  }
  return j
}

/** Renova o token de longa duração quando faltam menos de 10 dias. Devolve o token válido. */
export async function renovarSeFaltarPouco(db: SupabaseClient, t: TokenThreads): Promise<TokenThreads> {
  const falta = new Date(t.expira_em).getTime() - Date.now()
  if (falta > 10 * 86_400_000) return t
  const j = await pedir<{ access_token: string; expires_in: number }>(
    `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(t.access_token)}`,
  )
  const novo = { ...t, access_token: j.access_token, expira_em: new Date(Date.now() + j.expires_in * 1000).toISOString() }
  await guardarToken(db, novo)
  return novo
}

/** Cria e publica um post de texto (ou uma resposta, com `respostaA`). Devolve o id publicado. */
export async function publicarTexto(t: TokenThreads, texto: string, respostaA?: string): Promise<string> {
  const corpo = new URLSearchParams({ media_type: 'TEXT', text: texto.slice(0, 500), access_token: t.access_token })
  if (respostaA) corpo.set('reply_to_id', respostaA)
  const c = await pedir<{ id: string }>(`${THREADS_GRAPH}/${t.user_id}/threads`, { method: 'POST', body: corpo })
  const p = await pedir<{ id: string }>(`${THREADS_GRAPH}/${t.user_id}/threads_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: c.id, access_token: t.access_token }),
  })
  return p.id
}

export type RespostaThreads = { id: string; text?: string; username?: string; timestamp?: string }

/** Respostas diretas a um post nosso. */
export async function respostasDe(t: TokenThreads, mediaId: string): Promise<RespostaThreads[]> {
  const j = await pedir<{ data?: RespostaThreads[] }>(
    `${THREADS_GRAPH}/${mediaId}/replies?fields=id,text,username,timestamp&access_token=${encodeURIComponent(t.access_token)}`,
  )
  return j.data ?? []
}
