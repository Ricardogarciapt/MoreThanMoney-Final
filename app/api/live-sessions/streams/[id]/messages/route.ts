import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import {
  getLmsChatRollingCutoffIso,
  shouldPurgeEntireStreamChat,
} from "@/lib/lms-chat-retention"

const supabaseAdmin = getSupabaseAdmin()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const limit = Math.min(200, Number(new URL(request.url).searchParams.get("limit") || 80))

    const { data: streamMeta } = await supabaseAdmin
      .from("lms_streams")
      .select("live_ended_at")
      .eq("id", id)
      .maybeSingle()

    const rollingCutoff = getLmsChatRollingCutoffIso()

    if (shouldPurgeEntireStreamChat(streamMeta?.live_ended_at)) {
      await supabaseAdmin.from("lms_stream_messages").delete().eq("stream_id", id)
    } else {
      await supabaseAdmin
        .from("lms_stream_messages")
        .delete()
        .eq("stream_id", id)
        .lt("created_at", rollingCutoff)
    }

    const { data, error } = await supabaseAdmin
      .from("lms_stream_messages")
      .select("*")
      .eq("stream_id", id)
      .gte("created_at", rollingCutoff)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data: (data || []).reverse() })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const message = String(body.message || "").trim()

    if (!message) {
      return NextResponse.json({ error: "Mensagem obrigatória" }, { status: 400 })
    }

    const cookieStore = await cookies()
    const educatorToken = cookieStore.get(getEducatorCookieName())?.value
    const educator = educatorToken ? verifyEducatorToken(educatorToken) : null

    if (educator) {
      const { data, error } = await supabaseAdmin
        .from("lms_stream_messages")
        .insert({
          stream_id: id,
          sender_type: "educator",
          sender_name: educator.displayName,
          message,
        })
        .select("*")
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, data })
    }

    const supabase = createServerClient(
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
    const { data: auth } = await supabase.auth.getSession()
    if (!auth.session?.user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const senderName =
      auth.session.user.user_metadata?.full_name ||
      auth.session.user.user_metadata?.name ||
      auth.session.user.email ||
      "Aluno"

    const { data, error } = await supabaseAdmin
      .from("lms_stream_messages")
      .insert({
        stream_id: id,
        sender_type: "student",
        sender_name: senderName,
        message,
      })
      .select("*")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

/** Apaga todo o histórico do chat: apenas educador dono do canal ou admin do site. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: streamId } = await params
    if (!streamId) {
      return NextResponse.json({ error: "streamId inválido" }, { status: 400 })
    }

    const cookieStore = await cookies()
    const educatorToken = cookieStore.get(getEducatorCookieName())?.value
    const educator = educatorToken ? verifyEducatorToken(educatorToken) : null

    let educatorOwnsStream = false
    if (educator) {
      const { data: stream } = await supabaseAdmin
        .from("lms_streams")
        .select("id")
        .eq("id", streamId)
        .eq("educator_id", educator.educatorId)
        .maybeSingle()
      educatorOwnsStream = Boolean(stream)
    }

    if (!educatorOwnsStream) {
      const adminGate = await requireAdmin(request)
      if (adminGate !== null) return adminGate
    }

    const { error } = await supabaseAdmin.from("lms_stream_messages").delete().eq("stream_id", streamId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

