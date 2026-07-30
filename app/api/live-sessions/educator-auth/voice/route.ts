import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"

const supabase = getSupabaseAdmin()

// Voice ID por defeito = clone Fish "Ricardo Garcia" (regra MTM: voz sempre clonada).
const DEFAULT_VOICE_ID = "1e0fa8b490c744acba94da72710e6db2"

/**
 * GET — devolve o fish_voice_id do educador autenticado (ou null se usar o default).
 * POST — o educador define a SUA voz Fish para as traduções dobradas das sessões.
 *   Body: { fish_voice_id }  — vazio/null = volta ao default (Ricardo Garcia).
 * O pipeline de legendas/dobragem já lê lms_educators.fish_voice_id (default tratado na lib).
 */
export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  const educator = token ? verifyEducatorToken(token) : null
  if (!educator) return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })

  const { data } = await supabase
    .from("lms_educators")
    .select("fish_voice_id")
    .eq("id", educator.educatorId)
    .maybeSingle()

  return NextResponse.json({
    fish_voice_id: data?.fish_voice_id ?? null,
    default_voice_id: DEFAULT_VOICE_ID,
  })
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const educator = token ? verifyEducatorToken(token) : null
    if (!educator) return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })

    const body = await request.json()
    // vazio → null → a lib usa o default (Ricardo). Aceita o voice_id do Fish (hex de 32 chars).
    const raw = String(body.fish_voice_id || "").trim()
    const voiceId = raw ? raw : null
    if (voiceId && !/^[a-zA-Z0-9]{16,64}$/.test(voiceId)) {
      return NextResponse.json({ error: "Voice ID inválido (esperado o ID do modelo Fish)" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("lms_educators")
      .update({ fish_voice_id: voiceId })
      .eq("id", educator.educatorId)
      .select("id, fish_voice_id")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, fish_voice_id: data?.fish_voice_id ?? null, default_voice_id: DEFAULT_VOICE_ID })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}
