import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import { getExecSwitches, setExecSwitches } from '@/lib/mtmcopy/exec-switches'
import { publicCaption } from '@/lib/instagram/publish'

/**
 * HUB da MÁQUINA DE VENDAS — ponto único de estado + comandos.
 * Consumido por: consola /admin (sessão-admin), AIOS do site (mesma origem) e AIOS local (Bearer).
 *
 *  GET  → estado completo (funil, rascunhos, conversões, execução, autopilot).
 *  POST → comando { action, ... }:
 *         approve_post{id} · reject_post{id} · generate_now · repost_now · digest_now ·
 *         set_autopilot{account,on} · set_exec{key,on}
 *
 * Auth: Bearer CRON_SECRET (AIOS local/VPS) OU sessão de admin (browser). Zero browser no caminho autónomo.
 */
export const dynamic = 'force-dynamic'

const IG_MTM = '17841474872672009'
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.morethanmoney.pt'

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET
  if (secret && (req.headers.get('authorization') || '') === `Bearer ${secret}`) return null
  return requireAdmin(req) // null se admin; senão devolve 401
}

/** Dispara um endpoint de cron interno (server-side) com o CRON_SECRET. */
async function runCron(path: string): Promise<any> {
  const secret = process.env.CRON_SECRET || ''
  const r = await fetch(`${SITE}${path}`, { headers: { authorization: `Bearer ${secret}` }, cache: 'no-store' })
  return r.json().catch(() => ({ ok: r.ok }))
}

async function buildState() {
  const supabase = getSupabaseAdmin()
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())

  const [{ data: leads }, { data: drafts }, { count: pagos24h }, { count: brokerClients }, { count: signals24h }, { data: ap }, execSwitches] =
    await Promise.all([
      supabase.from('telegram_leads').select('stage, granted_at, created_at, username'),
      supabase
        .from('social_scheduled_posts')
        .select('id, ig_username, pillar, status, scheduled_at, media_urls, caption')
        .in('status', ['draft', 'approved', 'processing'])
        .order('scheduled_at', { ascending: true })
        .limit(20),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('subscription_status', 'active').neq('subscription_platform', 'manual').gte('updated_at', sinceIso),
      supabase.from('broker_clients').select('uid', { count: 'exact', head: true }),
      supabase.from('tradingview_signals').select('id', { count: 'exact', head: true }).gte('received_at', sinceIso),
      supabase.from('site_settings').select('value').eq('key', 'content_autopilot').maybeSingle(),
      getExecSwitches(),
    ])

  const byStage: Record<string, number> = {}
  let novos24h = 0
  let grantedToday = 0
  for (const l of leads ?? []) {
    byStage[l.stage || 'new'] = (byStage[l.stage || 'new'] || 0) + 1
    if (l.created_at && l.created_at >= sinceIso) novos24h++
    if (l.granted_at && String(l.granted_at).slice(0, 10) === day) grantedToday++
  }

  const drafted = (drafts ?? []).map((d) => ({
    id: d.id,
    account: d.ig_username,
    pillar: d.pillar,
    status: d.status,
    scheduled_at: d.scheduled_at,
    has_image: Array.isArray(d.media_urls) && d.media_urls.length > 0,
    preview: publicCaption(d.caption || '').slice(0, 140),
  }))

  const autopilot = (ap?.value as { morethanmoney?: boolean; ricardo?: boolean } | null) || {}

  return {
    day,
    funnel: { byStage, novos24h, grantedToday, total: (leads ?? []).length },
    content: {
      pending: drafted.length,
      drafts: drafted,
      autopilot: { morethanmoney: !!autopilot.morethanmoney, ricardo: !!autopilot.ricardo },
    },
    conversions_24h: pagos24h ?? 0,
    broker_clients: brokerClients ?? 0,
    signals_24h: signals24h ?? 0,
    execution: execSwitches,
  }
}

export async function GET(req: NextRequest) {
  const denied = await authorize(req)
  if (denied) return denied
  try {
    return NextResponse.json({ ok: true, state: await buildState() })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denied = await authorize(req)
  if (denied) return denied
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string; account?: string; key?: string; on?: boolean }
  const action = (body.action || '').trim()
  const supabase = getSupabaseAdmin()

  try {
    switch (action) {
      case 'approve_post': {
        if (!body.id) return NextResponse.json({ ok: false, error: 'id em falta' }, { status: 400 })
        const { error } = await supabase
          .from('social_scheduled_posts')
          .update({ status: 'approved', approved_by: 'sales-machine-hub', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', body.id)
          .eq('status', 'draft')
        if (error) throw error
        return NextResponse.json({ ok: true, approved: body.id })
      }
      case 'reject_post': {
        if (!body.id) return NextResponse.json({ ok: false, error: 'id em falta' }, { status: 400 })
        const { error } = await supabase.from('social_scheduled_posts').delete().eq('id', body.id).in('status', ['draft', 'approved'])
        if (error) throw error
        return NextResponse.json({ ok: true, rejected: body.id })
      }
      case 'set_autopilot': {
        const acc = (body.account || '').trim()
        if (!['morethanmoney', 'ricardo'].includes(acc)) return NextResponse.json({ ok: false, error: 'account inválido' }, { status: 400 })
        const { data: cur } = await supabase.from('site_settings').select('value').eq('key', 'content_autopilot').maybeSingle()
        const val = { ...((cur?.value as object) || {}), [acc]: !!body.on }
        await supabase.from('site_settings').upsert({ key: 'content_autopilot', value: val }, { onConflict: 'key' })
        return NextResponse.json({ ok: true, autopilot: val })
      }
      case 'set_exec': {
        if (!body.key) return NextResponse.json({ ok: false, error: 'key em falta' }, { status: 400 })
        const next = await setExecSwitches({ [body.key]: !!body.on } as any)
        return NextResponse.json({ ok: true, execution: next })
      }
      case 'generate_now':
        return NextResponse.json({ ok: true, result: await runCron('/api/cron/content-draft') })
      case 'repost_now':
        return NextResponse.json({ ok: true, result: await runCron('/api/cron/content-repost') })
      case 'digest_now':
        return NextResponse.json({ ok: true, result: await runCron('/api/cron/sales-digest') })
      default:
        return NextResponse.json({ ok: false, error: `ação desconhecida: ${action}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
