import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { correrRadar } from "@/lib/instagram/radar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** A lista do radar: as conversas por onde vale a pena entrar, por ordem. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const db = getSupabaseAdmin()
  const [{ data: prospetos }, { data: hashtags }] = await Promise.all([
    db.from("ig_radar_prospetos").select("*").eq("estado", "pendente").order("pontuacao", { ascending: false }).limit(40),
    db.from("ig_radar_hashtags").select("hashtag, ultima_procura, encontrados, media_pontuacao").order("media_pontuacao", { ascending: false }),
  ])

  // Quantas hashtags diferentes se gastaram nos últimos 7 dias — é a quota que decide o ritmo.
  const limite = new Date(Date.now() - 7 * 86400_000).toISOString()
  const gastas = (hashtags ?? []).filter((h) => h.ultima_procura && String(h.ultima_procura) >= limite).length

  return NextResponse.json({
    ok: true,
    prospetos: prospetos ?? [],
    hashtags: hashtags ?? [],
    quota: { gastas, limite: 30 },
  })
}

/** Marcar um prospeto (já entrei / não serve), ou correr o radar agora. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const corpo = (await req.json().catch(() => ({}))) as { id?: string; estado?: string; correr?: boolean }

  if (corpo.correr) {
    return NextResponse.json({ ok: true, ...(await correrRadar(3)) })
  }

  if (!corpo.id || !corpo.estado) return NextResponse.json({ ok: false, erro: "Falta o prospeto" }, { status: 400 })
  await getSupabaseAdmin()
    .from("ig_radar_prospetos")
    .update({ estado: corpo.estado, visto_em: new Date().toISOString() })
    .eq("id", corpo.id)

  return NextResponse.json({ ok: true })
}
