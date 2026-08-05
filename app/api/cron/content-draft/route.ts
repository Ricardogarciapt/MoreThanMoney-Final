import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CAPTION_INTERNAL_MARK, rehostMedia } from '@/lib/instagram/publish'

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.morethanmoney.pt'

/** Gera o card de marca (server-side) e re-hospeda no bucket → URL público estável. */
async function buildCardImage(hook: string, cta: string, handle: string): Promise<string | null> {
  try {
    const q = new URLSearchParams({ hook, cta, handle }).toString()
    return await rehostMedia(`${SITE}/api/og/social-card?${q}`, { prefix: 'auto' })
  } catch (e) {
    console.error('[content-draft] card falhou:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * GERADOR AUTÓNOMO DE CONTEÚDO (Fase 2 da máquina de vendas).
 * Escreve rascunhos de posts para @morethanmoney.pt → tabela social_scheduled_posts (status='draft').
 * O Ricardo só APROVA (status='approved') e o cron ig-publish publica. Tudo server-side, sem browser.
 *
 * O fecho do ciclo: cada legenda pede um COMENTÁRIO com uma palavra-chave que o cron ig-funnel
 * deteta (SINAIS/COPY/GRUPO → Telegram copytrading · APP/PREMIUM/QUERO/MUNDO → trial 3 dias) →
 * comentário → DM → funil. O brief visual viaja depois do marcador —INTERNO— (nunca é publicado).
 *
 * Bearer CRON_SECRET (ou x-vercel-cron). Não inunda: pára se já há >= TARGET rascunhos por rever.
 */
export const dynamic = 'force-dynamic'

const IG_MTM = '17841474872672009' // @morethanmoney.pt
const TARGET_BACKLOG = Number(process.env.CONTENT_DRAFT_BACKLOG || 4) // máx. rascunhos por rever
const BATCH = Number(process.env.CONTENT_DRAFT_BATCH || 3) // quantos gerar por passagem

// CTAs válidos = palavras-chave que o ig-funnel reconhece (lib/instagram/funnel.ts INTENTS).
const CTA_KEYWORDS = ['SINAIS', 'APP', 'PREMIUM', 'QUERO', 'MUNDO', 'COPY']

const SYSTEM = `És o estratega de conteúdo da MoreThanMoney (comunidade portuguesa de educação financeira e trading, fundada pelo Ricardo Garcia).
Escreves posts curtos para o Instagram @morethanmoney.pt que educam, criam confiança e puxam um comentário.

FACTOS REAIS (usa só estes; NUNCA promic lucros — é educação, não aconselhamento):
- Provas da comunidade: 675 trades acompanhados, 63% win rate, +7.060€ documentados, 356 membros ativos.
- App MTM System (grátis): alertas, scanner, sessões ao vivo, ferramentas.
- Trial de 3 dias de Premium sem cartão em morethanmoney.pt/register.
- Copytrading (copiar sinais automaticamente) via assistente no Telegram.

MECÂNICA DE CTA (obrigatória): cada post TERMINA a pedir um comentário com UMA palavra-chave exata
que te será indicada. Ex.: «Comenta "SINAIS" que eu envio o acesso 👇». O comentário abre a conversa.
- SINAIS / COPY → quem quer copiar/sinais (encaminhado para o Telegram)
- APP / QUERO / MUNDO → quem quer começar (trial grátis / app)
- PREMIUM → quem quer o Premium

ESTILO: português de Portugal, humano, direto, gancho forte na 1.ª linha, 60–120 palavras, no máx. 1–2 emojis, 3–5 hashtags no fim.

FORMATO DE SAÍDA (exato, sem JSON, sem markdown, sem texto fora dos blocos). Para CADA post escreve um bloco:
===POST===
KEYWORD: <UMA palavra-chave das indicadas>
HOOK: <frase de impacto para a IMAGEM do post, no máx. 10 palavras, sem hashtags nem emojis>
VISUAL: <1 frase: o que mostrar na imagem para o designer>
CAPTION:
<a legenda completa PRONTA A PUBLICAR, já com o CTA e as hashtags — pode ter várias linhas>
===END===

Repete o bloco ${BATCH} vezes. Nada antes do primeiro ===POST=== nem depois do último ===END===.`

function todayLisbon(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date())
}

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (secret && auth === `Bearer ${secret}`) return true
  return Boolean(req.headers.get('x-vercel-cron'))
}

async function draftBatch(assigned: string[]): Promise<Array<{ hook: string; caption: string; cta_keyword: string; visual_brief: string }>> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) throw new Error('ANTHROPIC_API_KEY em falta')
  const model = process.env.CONTENT_DRAFT_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-5-haiku-20241022'
  const user =
    `Gera ${BATCH} posts distintos (temas variados: mentalidade/disciplina, prova social, educação de trading, bastidores da comunidade, sessões ao vivo).\n` +
    `Atribui a cada post, por ordem, esta palavra-chave de CTA: ${assigned.join(', ')}.\n` +
    `Evita repetir ganchos. Não uses datas nem números que não estejam nos factos.`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1600, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const text: string = (data?.content || []).filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('').trim()
    // Parser do formato delimitado (robusto a legendas multi-linha).
    const out: Array<{ hook: string; caption: string; cta_keyword: string; visual_brief: string }> = []
    for (const block of text.split('===POST===').slice(1)) {
      const body = block.split('===END===')[0]
      const kw = (body.match(/KEYWORD:\s*([^\n]+)/i)?.[1] || '').trim().toUpperCase()
      const hk = (body.match(/HOOK:\s*([^\n]+)/i)?.[1] || '').trim()
      const vis = (body.match(/VISUAL:\s*([^\n]+)/i)?.[1] || '').trim()
      const cap = (body.split(/CAPTION:\s*/i)[1] || '').trim()
      if (!cap) continue
      out.push({ hook: (hk || cap.split('\n')[0]).slice(0, 120), caption: cap, cta_keyword: kw, visual_brief: vis })
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const supabase = getSupabaseAdmin()

  // Guarda anti-inundação: conta posts ainda não publicados (rascunho ou aprovados por publicar).
  const { count: pending } = await supabase
    .from('social_scheduled_posts')
    .select('id', { count: 'exact', head: true })
    .eq('ig_account_id', IG_MTM)
    .in('status', ['draft', 'approved', 'processing'])
  if ((pending ?? 0) >= TARGET_BACKLOG) {
    return NextResponse.json({ ok: true, skipped: 'backlog_cheio', pending })
  }

  // Roda as palavras-chave para variar a mistura de CTA.
  const start = new Date().getUTCDate() % CTA_KEYWORDS.length
  const assigned = Array.from({ length: BATCH }, (_, i) => CTA_KEYWORDS[(start + i) % CTA_KEYWORDS.length])

  let drafts: Array<{ hook: string; caption: string; cta_keyword: string; visual_brief: string }>
  try {
    drafts = await draftBatch(assigned)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (!drafts.length) return NextResponse.json({ ok: false, error: 'sem rascunhos gerados' }, { status: 500 })

  // Autopilot: se ligado, os posts COM imagem entram já como 'approved' (publicam sem toque).
  // Flag em site_settings.content_autopilot { morethanmoney: true|false }. Default: false (rascunho).
  const { data: apRow } = await supabase.from('site_settings').select('value').eq('key', 'content_autopilot').maybeSingle()
  const autopilot = Boolean((apRow?.value as { morethanmoney?: boolean } | null)?.morethanmoney)

  // Agenda escalonado: próximos dias às 18:00 UTC (~19:00 Lisboa).
  const now = Date.now()
  const rows = await Promise.all(
    drafts.slice(0, BATCH).map(async (d, i) => {
      const when = new Date(now + (i + 1) * 24 * 3600 * 1000)
      when.setUTCHours(18, 0, 0, 0)
      const cta = (d.cta_keyword || assigned[i] || 'APP').toUpperCase()
      // Gera o card de marca (imagem) para publicação sem toque.
      const card = await buildCardImage(d.hook, cta, 'morethanmoney.pt')
      // Só auto-publica se o autopilot estiver ligado E houver imagem; senão fica rascunho.
      const status = autopilot && card ? 'approved' : 'draft'
      const caption =
        `${(d.caption || '').trim()}\n\n${CAPTION_INTERNAL_MARK}\n` +
        `🎨 Visual sugerido: ${d.visual_brief || '—'}\n` +
        `🔑 CTA: comentário "${cta}" → funil automático\n` +
        `🤖 ${status === 'approved' ? 'Auto-publicado pela máquina de vendas (card de marca gerado).' : 'Rascunho da máquina — revê/troca a imagem e aprova.'}`
      return {
        channel: 'instagram',
        ig_account_id: IG_MTM,
        ig_username: 'morethanmoney.pt',
        media_type: 'IMAGE',
        media_urls: card ? [card] : ([] as string[]),
        caption,
        pillar: `cta:${cta.toLowerCase()}`,
        scheduled_at: when.toISOString(),
        status,
        created_by: 'sales-machine',
        ...(status === 'approved' ? { approved_by: 'sales-machine', approved_at: new Date().toISOString() } : {}),
      }
    }),
  )

  const { data, error } = await supabase.from('social_scheduled_posts').insert(rows).select('id')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const approved = rows.filter((r) => r.status === 'approved').length
  return NextResponse.json({
    ok: true,
    created: data?.length ?? 0,
    approved,
    drafts: (data?.length ?? 0) - approved,
    withImage: rows.filter((r) => r.media_urls.length > 0).length,
    autopilot,
    day: todayLisbon(),
    ctas: assigned,
  })
}
