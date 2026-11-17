import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isLang } from "@/lib/i18n/config"
import { preencherAuto } from "@/lib/i18n/auto-servidor"

/**
 * Cron do dicionário automático (17/11/2026): traduz com IA grátis os textos da app que ainda só
 * existem em PT/EN, até `?limite=` (150 por omissão, máx. 400) por volta, idiomas prioritários
 * primeiro (es, de, fr, it, nl). `?lang=de` força um idioma. Quando já não falta nada, faz uma
 * leitura e sai — não gasta IA.
 * Bearer CRON_SECRET (ou x-vercel-cron).
 */
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") || ""
  if (!(secret && auth === `Bearer ${secret}`) && !req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }
  const lang = req.nextUrl.searchParams.get("lang")
  const limite = Number(req.nextUrl.searchParams.get("limite")) || undefined
  try {
    const r = await preencherAuto(getSupabaseAdmin(), {
      limite,
      lang: lang && isLang(lang) ? lang : undefined,
    })
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
