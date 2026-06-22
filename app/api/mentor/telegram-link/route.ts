import { NextResponse } from "next/server"
import { MTMCOPY_BOT_USERNAME } from "@/lib/mtmcopy/telegram-bot"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

function generateToken() {
  return `mtm_${crypto.randomUUID().replace(/-/g, "")}`
}

async function getAuthedClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
}

export async function GET() {
  try {
    const supabase = await getAuthedClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const botUsername = MTMCOPY_BOT_USERNAME()

    const { data: profile } = await supabase
      .from("mentor_profiles")
      .select("telegram_start_token, telegram_chat_id")
      .eq("user_id", session.user.id)
      .maybeSingle()

    const currentToken = profile?.telegram_start_token || generateToken()
    if (!profile?.telegram_start_token) {
      await supabase
        .from("mentor_profiles")
        .upsert({ user_id: session.user.id, telegram_start_token: currentToken }, { onConflict: "user_id" })
    }

    const telegramLink = botUsername ? `https://t.me/${botUsername}?start=${currentToken}` : null

    return NextResponse.json({
      success: true,
      data: {
        telegram_link: telegramLink,
        start_token: currentToken,
        bot_connected: Boolean(profile?.telegram_chat_id),
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

