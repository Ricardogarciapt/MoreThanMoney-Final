import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

/**
 * Instruções FIXAS de seguimento de sinal por canal (card expansível no chat — web + apps nativas).
 * Fonte: site_settings.chat_pinned_instructions (map slug → {emoji,title,body}).
 * Público (só leitura). GET ?slug=<canal> → 1 canal; sem slug → todos.
 */
export const dynamic = "force-dynamic"

type Instruction = { emoji?: string; title?: string; body?: string }

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim() || null
  try {
    const { data } = await getSupabaseAdmin()
      .from("site_settings")
      .select("value")
      .eq("key", "chat_pinned_instructions")
      .maybeSingle()
    const all = (data?.value ?? {}) as Record<string, Instruction>
    if (slug) {
      const one = all[slug] ?? null
      return NextResponse.json({ slug, instruction: one }, { headers: { "Cache-Control": "public, max-age=120" } })
    }
    return NextResponse.json({ instructions: all }, { headers: { "Cache-Control": "public, max-age=120" } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro", instruction: null }, { status: 500 })
  }
}
