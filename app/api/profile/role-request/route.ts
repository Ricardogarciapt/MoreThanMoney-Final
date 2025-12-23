import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { userId, requestedRole, reason } = await request.json()

    if (!userId || !requestedRole) {
      return NextResponse.json({ error: "Dados obrigatórios em falta" }, { status: 400 })
    }

    // Verificar se o usuário existe e obter role atual
    const { data: user, error: userError } = await supabase.from("users").select("user_type").eq("id", userId).single()

    if (userError || !user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }

    // Verificar se já existe um pedido pendente
    const { data: existingRequest } = await supabase
      .from("role_change_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .single()

    if (existingRequest) {
      return NextResponse.json(
        {
          error: "Já existe um pedido de mudança de role pendente",
        },
        { status: 400 },
      )
    }

    // Criar novo pedido
    const { data, error } = await supabase
      .from("role_change_requests")
      .insert({
        user_id: userId,
        current_role: user.user_type,
        requested_role: requestedRole,
        reason: reason || null,
        status: "pending",
      })
      .select()
      .single()

    if (error) {
      console.error("Erro ao criar pedido:", error)
      return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      request: data,
      message: "Pedido de mudança de role enviado com sucesso!",
    })
  } catch (error) {
    console.error("Erro na API de pedido de role:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "User ID é obrigatório" }, { status: 400 })
    }

    // Buscar pedidos do usuário
    const { data, error } = await supabase
      .from("role_change_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Erro ao buscar pedidos:", error)
      return NextResponse.json({ error: "Erro ao buscar pedidos" }, { status: 500 })
    }

    return NextResponse.json({ success: true, requests: data })
  } catch (error) {
    console.error("Erro na API de busca de pedidos:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
