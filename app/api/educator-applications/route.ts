import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * POST /api/educator-applications — candidatura pública aos programas de
 * Educadores MTM (formulários em /docs/forms). Insere via service role
 * (a tabela tem RLS sem políticas públicas).
 *
 * application_type:
 *  - 'trading'        → Trading Educator (métricas de performance obrigatórias)
 *  - 'ugc' | 'sales' | 'both' → UGC Social Media / Small Products Sales Educator
 */

const SESSIONS = new Set(['asia', 'new_york', 'both', 'flexible'])
const TYPES = new Set(['trading', 'ugc', 'sales', 'both'])
const MAX = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n)

const strArray = (v: unknown, itemMax = 30, listMax = 10): string[] =>
  Array.isArray(v) ? v.map((x) => MAX(x, itemMax)).filter(Boolean).slice(0, listMax) : []

// Chaves de métricas aceites por tipo de candidatura (whitelist → jsonb)
const TRADING_METRIC_KEYS = [
  'trading_style', 'avg_monthly_return', 'max_drawdown', 'win_rate', 'track_record_url', 'account_size_range',
] as const
const UGC_METRIC_KEYS = [
  'role_focus', 'followers_total', 'engagement_rate', 'avg_views', 'portfolio_links', 'sales_results', 'products_types',
] as const

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    const application_type = MAX(body.application_type, 20) || 'trading'
    if (!TYPES.has(application_type)) {
      return NextResponse.json({ error: 'Tipo de candidatura inválido. / Invalid application type.' }, { status: 400 })
    }
    const isTrading = application_type === 'trading'

    const full_name = MAX(body.full_name, 120)
    const email = MAX(body.email, 200).toLowerCase()
    const whatsapp = MAX(body.whatsapp, 60)
    const country = MAX(body.country, 80)
    const experience_years = MAX(body.experience_years, 20)
    const motivation = MAX(body.motivation, 2000)
    const links = MAX(body.links, 1000) || null
    const teaching_experience = MAX(body.teaching_experience, 1000) || null
    const community_size = MAX(body.community_size, 40)
    const proof = MAX(body.proof, 2000)
    const languages = strArray(body.languages)
    const markets = strArray(body.markets)
    const preferred_session = isTrading ? MAX(body.preferred_session, 20) : (MAX(body.preferred_session, 20) || 'flexible')

    // Métricas: whitelist por tipo, valores truncados
    const rawMetrics = (body.metrics && typeof body.metrics === 'object') ? body.metrics : {}
    const allowedKeys: readonly string[] = isTrading ? TRADING_METRIC_KEYS : UGC_METRIC_KEYS
    const metrics: Record<string, unknown> = {}
    for (const key of allowedKeys) {
      const v = (rawMetrics as Record<string, unknown>)[key]
      if (Array.isArray(v)) {
        const arr = strArray(v)
        if (arr.length) metrics[key] = arr
      } else {
        const s = MAX(v, key === 'portfolio_links' ? 1000 : 200)
        if (s) metrics[key] = s
      }
    }

    // — Validação comum —
    if (!full_name || !email.includes('@') || !whatsapp || !country) {
      return NextResponse.json({ error: 'Preenche nome, email, WhatsApp e país. / Fill in name, email, WhatsApp and country.' }, { status: 400 })
    }
    if (!languages.length || !experience_years || !motivation) {
      return NextResponse.json({ error: 'Preenche idiomas, experiência e motivação. / Fill in languages, experience and motivation.' }, { status: 400 })
    }
    if (!community_size || !proof) {
      return NextResponse.json({ error: 'Indica a dimensão da tua audiência/alunos e links de comprovativo. / Provide your audience/students size and proof links.' }, { status: 400 })
    }
    if (body.consent !== true) {
      return NextResponse.json({ error: 'É necessário aceitar o tratamento de dados (RGPD). / Data-processing consent is required.' }, { status: 400 })
    }

    // — Validação por tipo —
    if (isTrading) {
      if (!markets.length) {
        return NextResponse.json({ error: 'Indica os mercados que negoceias. / Select the markets you trade.' }, { status: 400 })
      }
      if (!SESSIONS.has(preferred_session)) {
        return NextResponse.json({ error: 'Escolhe a sessão preferida. / Choose your preferred session.' }, { status: 400 })
      }
      if (!metrics.trading_style || !metrics.avg_monthly_return || !metrics.max_drawdown || !metrics.win_rate) {
        return NextResponse.json({ error: 'Preenche as métricas de performance (estilo, retorno médio, drawdown, win rate). / Fill in your performance metrics.' }, { status: 400 })
      }
      if (!metrics.track_record_url) {
        return NextResponse.json({ error: 'Indica um link de track record verificado (Myfxbook, FXBlue…). / A verified track-record link is required.' }, { status: 400 })
      }
    } else {
      if (!metrics.role_focus) {
        return NextResponse.json({ error: 'Escolhe o foco (UGC, vendas ou ambos). / Choose your focus (UGC, sales or both).' }, { status: 400 })
      }
      if ((application_type === 'ugc' || application_type === 'both') && (!markets.length || !metrics.followers_total)) {
        return NextResponse.json({ error: 'Indica as plataformas e o total de seguidores. / Select your platforms and total followers.' }, { status: 400 })
      }
      if (!metrics.portfolio_links) {
        return NextResponse.json({ error: 'Partilha links do teu melhor conteúdo/portfólio. / Share links to your best content or portfolio.' }, { status: 400 })
      }
      if ((application_type === 'sales' || application_type === 'both') && !metrics.sales_results) {
        return NextResponse.json({ error: 'Descreve os teus resultados de vendas. / Describe your sales results.' }, { status: 400 })
      }
    }

    const supabase = getSupabaseAdmin()

    // Anti-duplicado: 1 candidatura por email dentro do mesmo grupo de vagas
    const typeGroup = isTrading ? ['trading'] : ['ugc', 'sales', 'both']
    const { data: existing } = await supabase
      .from('educator_applications')
      .select('id')
      .eq('email', email)
      .in('application_type', typeGroup)
      .limit(1)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ success: true, duplicate: true })
    }

    const { error } = await supabase.from('educator_applications').insert({
      application_type, full_name, email, whatsapp, country, languages, markets,
      experience_years, preferred_session, links, teaching_experience, motivation,
      community_size, proof, metrics,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 })
  }
}
