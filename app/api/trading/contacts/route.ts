import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

async function getSupabaseWithSession(request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { supabase: null, session: null }
  }

  return { supabase, session }
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, session } = await getSupabaseWithSession(request)

    if (!supabase || !session) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      )
    }

    const { data, error } = await supabase
      .from("trading_contacts")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[TRADING CONTACTS] Erro ao buscar:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, contacts: data || [] })
  } catch (error: any) {
    console.error("[TRADING CONTACTS] Erro GET:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Erro desconhecido" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, session } = await getSupabaseWithSession(request)

    if (!supabase || !session) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, channel, interest, notes } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Nome é obrigatório" },
        { status: 400 }
      )
    }

    const insertPayload = {
      user_id: session.user.id,
      name: name.trim(),
      channel: channel || null,
      interest: interest || null,
      notes: notes || null,
      status: "novo",
    }

    const { data, error } = await supabase
      .from("trading_contacts")
      .insert(insertPayload)
      .select("*")
      .single()

    if (error) {
      console.error("[TRADING CONTACTS] Erro ao inserir:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, contact: data })
  } catch (error: any) {
    console.error("[TRADING CONTACTS] Erro POST:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Erro desconhecido" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, session } = await getSupabaseWithSession(request)

    if (!supabase || !session) {
      return NextResponse.json(
        { success: false, error: "Não autenticado" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { id, status } = body as { id?: string; status?: string }

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "ID e status são obrigatórios" },
        { status: 400 }
      )
    }

    if (!["novo", "em_followup", "cliente", "perdido"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "Status inválido" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("trading_contacts")
      .update({ status })
      .eq("id", id)
      .eq("user_id", session.user.id)
      .select("*")
      .single()

    if (error) {
      console.error("[TRADING CONTACTS] Erro ao atualizar:", error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, contact: data })
  } catch (error: any) {
    console.error("[TRADING CONTACTS] Erro PATCH:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Erro desconhecido" },
      { status: 500 }
    )
  }
}

