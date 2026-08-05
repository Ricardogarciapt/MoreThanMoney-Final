import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CAPTION_INTERNAL_MARK, publicCaption } from '@/lib/instagram/publish'

/**
 * REPOST / AMPLIFICAÇÃO: @ricardogarciapt republica (com VOZ PESSOAL do Ricardo) os posts que
 * a marca @morethanmoney.pt acabou de publicar. Reutiliza a mesma imagem (é um repost) e escreve
 * uma legenda em 1.ª pessoa que remata a apontar para @morethanmoney.pt. Autónomo, sem browser.
 *
 * Dedup: cada post de marca é republicado UMA vez (pillar 'repost:<brand_post_id>' no post do Ricardo).
 * Autopilot: site_settings.content_autopilot { ricardo: true } → entra 'approved' (publica sem toque);
 * senão fica 'draft'. Bearer CRON_SECRET (ou x-vercel-cron).
 */
export const dynamic = 'force-dynamic'

const IG_MTM = '17841474872672009' // @morethanmoney.pt
const IG_RIC = '17841405656956716' // @ricardogarciapt
const LOOKBACK_H = Number(process.env.REPOST_LOOKBACK_H || 72)
const MAX_PER_RUN = Number(process.env.REPOST_MAX || 2)

const SYSTEM = `És o Ricardo (Ricardo Subtil Garcia), fundador da MoreThanMoney, a escrever no TEU Instagram pessoal @ricardogarciapt.
Vais AMPLIFICAR, com as TUAS palavras e na 1.ª pessoa, uma publicação da marca. NÃO copies a legenda da marca — reage a ela como pessoa real.
Estilo: humano, direto, 40–90 palavras, no máx. 1–2 emojis, 2–4 hashtags. Termina a mandar ver o @morethanmoney.pt (onde está a app grátis, o trial e a equipa).
REGRAS: nunca prometas lucros (é educação, não aconselhamento). Sem links de pagamento. Responde em português de Portugal.
Devolve APENAS a legenda final (texto puro, sem aspas, sem JSON).`

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (secret && auth === `Bearer ${secret}`) return true
  return Boolean(req.headers.get('x-vercel-cron'))
}

async function personalCaption(brandCaption: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error('ANTHROPIC_API_KEY em falta')
  const model = process.env.CONTENT_DRAFT_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-haiku-20241022'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Publicação da marca a amplificar:\n"""${brandCaption.slice(0, 800)}"""` }],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}`)
    const data = await res.json()
    return (data?.content || []).filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('').trim()
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()
  const sinceIso = new Date(Date.now() - LOOKBACK_H * 3600 * 1000).toISOString()

  // Posts de marca publicados recentemente, com imagem.
  const { data: brandPosts } = await supabase
    .from('social_scheduled_posts')
    .select('id, caption, media_urls, published_media_id, created_at')
    .eq('ig_account_id', IG_MTM)
    .eq('status', 'published')
    .gte('updated_at', sinceIso)
    .order('updated_at', { ascending: false })
    .limit(10)
  if (!brandPosts?.length) return NextResponse.json({ ok: true, reposted: 0, reason: 'sem posts de marca recentes' })

  // Já republicados? (pillar repost:<id> nos posts do Ricardo).
  const { data: existing } = await supabase
    .from('social_scheduled_posts')
    .select('pillar')
    .eq('ig_account_id', IG_RIC)
    .like('pillar', 'repost:%')
  const done = new Set((existing ?? []).map((r) => String(r.pillar).replace('repost:', '')))

  // Autopilot do Ricardo.
  const { data: apRow } = await supabase.from('site_settings').select('value').eq('key', 'content_autopilot').maybeSingle()
  const autopilot = Boolean((apRow?.value as { ricardo?: boolean } | null)?.ricardo)

  const rows: any[] = []
  const now = Date.now()
  for (const bp of brandPosts) {
    if (rows.length >= MAX_PER_RUN) break
    if (done.has(String(bp.id))) continue
    const img = (bp.media_urls || []).filter(Boolean)[0]
    if (!img) continue // sem imagem não republica
    let personal: string
    try {
      personal = await personalCaption(publicCaption(bp.caption || ''))
    } catch {
      continue
    }
    if (!personal) continue
    const when = new Date(now + (rows.length + 1) * 3 * 3600 * 1000) // escalona +3h cada
    const status = autopilot ? 'approved' : 'draft'
    rows.push({
      channel: 'instagram',
      ig_account_id: IG_RIC,
      ig_username: 'ricardogarciapt',
      media_type: 'IMAGE',
      media_urls: [img],
      caption:
        `${personal}\n\n${CAPTION_INTERNAL_MARK}\n` +
        `🔁 Repost automático de @morethanmoney.pt (post ${bp.id}).\n` +
        `🤖 ${status === 'approved' ? 'Auto-publicado pela máquina de vendas.' : 'Rascunho — revê e aprova.'}`,
      pillar: `repost:${bp.id}`,
      scheduled_at: when.toISOString(),
      status,
      created_by: 'sales-machine',
      ...(status === 'approved' ? { approved_by: 'sales-machine', approved_at: new Date().toISOString() } : {}),
    })
  }

  if (!rows.length) return NextResponse.json({ ok: true, reposted: 0, reason: 'nada novo para republicar' })
  const { data, error } = await supabase.from('social_scheduled_posts').insert(rows).select('id')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, reposted: data?.length ?? 0, autopilot })
}
