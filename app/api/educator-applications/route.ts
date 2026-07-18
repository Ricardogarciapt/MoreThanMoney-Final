import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * POST /api/educator-applications — candidatura pública ao programa de
 * Trading Educators (formulário em /docs/forms). Insere via service role
 * (a tabela tem RLS sem políticas públicas).
 */

const SESSIONS = new Set(['asia', 'new_york', 'both', 'flexible'])
const MAX = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))

    const full_name = MAX(body.full_name, 120)
    const email = MAX(body.email, 200).toLowerCase()
    const whatsapp = MAX(body.whatsapp, 60)
    const country = MAX(body.country, 80)
    const experience_years = MAX(body.experience_years, 20)
    const preferred_session = MAX(body.preferred_session, 20)
    const motivation = MAX(body.motivation, 2000)
    const links = MAX(body.links, 1000) || null
    const teaching_experience = MAX(body.teaching_experience, 1000) || null
    const languages = Array.isArray(body.languages)
      ? body.languages.map((l: unknown) => MAX(l, 30)).filter(Boolean).slice(0, 10)
      : []
    const markets = Array.isArray(body.markets)
      ? body.markets.map((m: unknown) => MAX(m, 30)).filter(Boolean).slice(0, 10)
      : []

    if (!full_name || !email.includes('@') || !whatsapp || !country) {
      return NextResponse.json({ error: 'Preenche nome, email, WhatsApp e país. / Fill in name, email, WhatsApp and country.' }, { status: 400 })
    }
    if (!languages.length || !markets.length || !experience_years || !motivation) {
      return NextResponse.json({ error: 'Preenche idiomas, mercados, experiência e motivação. / Fill in languages, markets, experience and motivation.' }, { status: 400 })
    }
    if (!SESSIONS.has(preferred_session)) {
      return NextResponse.json({ error: 'Escolhe a sessão preferida. / Choose your preferred session.' }, { status: 400 })
    }
    if (body.consent !== true) {
      return NextResponse.json({ error: 'É necessário aceitar o tratamento de dados (RGPD). / Data-processing consent is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Anti-duplicado simples: 1 candidatura por email
    const { data: existing } = await supabase
      .from('educator_applications')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ success: true, duplicate: true })
    }

    const { error } = await supabase.from('educator_applications').insert({
      full_name, email, whatsapp, country, languages, markets,
      experience_years, preferred_session, links, teaching_experience, motivation,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro interno' }, { status: 500 })
  }
}
