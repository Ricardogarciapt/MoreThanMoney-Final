import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

/**
 * CURSOS do educador — playlists próprias (lms_educator_playlists), independentes de uma sala.
 * O dropdown "Cursos" no perfil junta estas às playlists das salas do educador.
 * Público (só leitura); o gating por tier é aplicado no cliente, como nas playlists de sala.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ playlists: [] })
  try {
    const { data } = await getSupabaseAdmin()
      .from("lms_educator_playlists")
      .select("id, title, url, image_url, access_tier, sort_order")
      .eq("educator_id", id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
    return NextResponse.json({ playlists: data ?? [] })
  } catch {
    return NextResponse.json({ playlists: [] })
  }
}
