import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isCronAuthorized } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * DIAGNÓSTICO DAS DMs DO INSTAGRAM — perguntado à Meta a partir da Vercel (20/11/2026).
 *
 * Porquê: `ig_dm_log` nunca teve uma linha. O webhook /api/webhooks/instagram está configurado na
 * app «Agente de Conteudo», com `messages` e `comments` subscritos, mas a Meta só entrega mensagens
 * de uma conta se a PÁGINA ligada a essa conta estiver subscrita à app (`/{page}/subscribed_apps`).
 * A cloud e o Mac não chegam à graph.facebook.com; a Vercel chega. Esta rota diz o estado de cada
 * página e, com `?acao=subscrever`, faz a subscrição (reversível; não envia nada a ninguém).
 *
 * Devolve só estados, nunca tokens. Grava o resultado em `site_settings.instagram_diagnostico`.
 * Acesso: `Authorization: Bearer CRON_SECRET` (o mesmo dos crons).
 */
const GRAPH = 'https://graph.facebook.com/v21.0'
// leadgen: os formulários instantâneos dos anúncios chegam a /api/webhooks/meta-leadgen.
const CAMPOS = 'messages,messaging_postbacks,message_reactions,feed,leadgen'

const CONTAS = [
  { conta: 'morethanmoney.pt', ig: '17841474872672009', chave: 'INSTAGRAM_TOKEN' },
  { conta: 'ricardogarciapt', ig: '17841405656956716', chave: 'INSTAGRAM_TOKEN_RICARDO' },
]

async function g(caminho: string, token: string, metodo: 'GET' | 'POST' = 'GET', extra: Record<string, string> = {}) {
  try {
    const qs = new URLSearchParams({ ...extra, access_token: token })
    const r = await fetch(`${GRAPH}/${caminho}${metodo === 'GET' ? `?${qs}` : ''}`, {
      method: metodo,
      headers: metodo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
      body: metodo === 'POST' ? qs.toString() : undefined,
      cache: 'no-store',
    })
    const corpo = await r.json().catch(() => ({}))
    if (r.ok && !corpo?.error) return corpo
    const e = corpo?.error ?? {}
    return { erro: true, status: r.status, code: e.code, subcode: e.error_subcode, message: e.message }
  } catch (e) {
    return { erro: true, message: String(e) }
  }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ ok: false, erro: 'nao_autorizado' }, { status: 401 })
  const subscrever = req.nextUrl.searchParams.get('acao') === 'subscrever'
  const db = getSupabaseAdmin()

  let guardados: Record<string, string> = {}
  try {
    const { data } = await db.from('site_settings').select('value').eq('key', 'instagram_tokens').maybeSingle()
    const v = data?.value
    guardados = ((typeof v === 'string' ? JSON.parse(v) : v) ?? {}) as Record<string, string>
  } catch {}

  const contas = []
  for (const c of CONTAS) {
    const token = (guardados[c.chave] || process.env[c.chave] || '').trim()
    if (!token) {
      contas.push({ conta: c.conta, erro: 'sem_token' })
      continue
    }
    // O token é de Página: `me` é a página. A conta IG ligada confirma que é a certa.
    const pagina = await g('me', token, 'GET', { fields: 'id,name,instagram_business_account' })
    const pageId: string | undefined = pagina?.id
    let subscricao: unknown = null
    if (pageId && subscrever) subscricao = await g(`${pageId}/subscribed_apps`, token, 'POST', { subscribed_fields: CAMPOS })
    const apps = pageId ? await g(`${pageId}/subscribed_apps`, token) : null
    contas.push({
      conta: c.conta,
      pagina: pagina?.erro ? pagina : { id: pageId, nome: pagina?.name, ig: pagina?.instagram_business_account?.id },
      subscricao,
      apps_subscritas: apps,
    })
  }

  const out = { em: new Date().toISOString(), subscrever, contas }
  try {
    await db.from('site_settings').upsert({ key: 'instagram_diagnostico', value: out }, { onConflict: 'key' })
  } catch {}
  return NextResponse.json({ ok: true, ...out })
}
