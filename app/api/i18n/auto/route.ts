import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isLang } from "@/lib/i18n/config"
import { lerAuto } from "@/lib/i18n/auto-servidor"

/**
 * GET /api/i18n/auto?lang=de → { lang, textos: { chave: texto } }
 *
 * O complemento do dicionário estático para os idiomas sem tradução à mão (ver lib/i18n/auto-servidor).
 * Público (são textos de interface, os mesmos para todos) e com cache na CDN: um alemão a abrir a
 * app não chega à base de dados, lê a cópia em cache.
 */
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang") || ""
  if (!isLang(lang) || lang === "pt" || lang === "en") {
    return NextResponse.json({ lang, textos: {} }, { headers: { "Cache-Control": "public, s-maxage=86400" } })
  }
  try {
    const textos = await lerAuto(getSupabaseAdmin(), lang)
    return NextResponse.json(
      { lang, textos },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    )
  } catch {
    return NextResponse.json({ lang, textos: {} }, { headers: { "Cache-Control": "no-store" } })
  }
}
