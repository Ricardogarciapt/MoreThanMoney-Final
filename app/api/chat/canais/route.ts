import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { canaisVisiveis, type LinhaCanal } from "@/lib/chat-canais"
import type { ChatChannelUser } from "@/lib/chat-channel-permissions"

export const dynamic = "force-dynamic"

/**
 * GET /api/chat/canais — os canais do chat conforme o admin os deixou (nome, descrição, ordem,
 * escondido, ícone, cor, etiqueta, regras, quem lê e quem escreve).
 *
 * Com `Authorization: Bearer <token>` devolve também `pode_ler` / `pode_escrever` calculados para
 * quem pede — é assim que as apps nativas (iOS/Android) sabem se mostram o cadeado e a caixa de
 * escrita, sem repetirem a regra no código delas. Sem sessão devolve a lista com `pode_* = null`.
 *
 * `select('*')`: as colunas da migração 117 podem ainda não existir; com `*` a leitura não parte e
 * o que faltar cai nos valores de sempre.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()

  let user: ChatChannelUser | null | undefined = undefined
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (token) {
    const { data } = await supabase.auth.getUser(token)
    if (data?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, user_type, member_category, subscription_plan, is_active")
        .eq("id", data.user.id)
        .maybeSingle()
      user = (profile as ChatChannelUser | null) ?? null
    } else {
      user = null
    }
  }

  const { data, error } = await supabase.from("chat_channels").select("*").order("position", { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message, canais: [] }, { status: 500 })

  return NextResponse.json(
    { ok: true, canais: canaisVisiveis((data ?? []) as LinhaCanal[], user) },
    { headers: { "Cache-Control": "private, max-age=15" } },
  )
}
