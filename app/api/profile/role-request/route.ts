import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser, getSupabaseAdmin } from "@/lib/admin-api-helpers"

export async function POST(request: NextRequest) {
  try {
    // Autorização: utilizador da sessão, nunca do corpo do pedido.
    const auth = await getAuthenticatedUser()
    if (!auth.userId) {
      return NextResponse.json({ error: auth.error || "Não autenticado" }, { status: 401 })
    }
    const userId = auth.userId

    const { requestedRole, reason } = await request.json()

    if (!requestedRole) {
      return NextResponse.json({ error: "Dados obrigatórios em falta" }, { status: 400 })
    }

    // Só roles válidos (constraint da BD: member/affiliate/admin)
    const ALLOWED_ROLES = ["member", "affiliate", "admin"]
    if (!ALLOWED_ROLES.includes(requestedRole)) {
      return NextResponse.json({ error: "Role inválido" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Verificar se o utilizador existe e obter role atual
    const { data: user, error: userError } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("id", userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: "Utilizador não encontrado" }, { status: 404 })
    }

    // Verificar se já existe um pedido pendente
    const { data: existingRequest } = await supabase
      .from("role_change_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle()

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
        current_user_role: user.user_type ?? "member",
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

export async function GET() {
  try {
    // Autorização: só devolve os pedidos do próprio utilizador (sessão), nunca por userId do cliente.
    const auth = await getAuthenticatedUser()
    if (!auth.userId) {
      return NextResponse.json({ error: auth.error || "Não autenticado" }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // Buscar pedidos do utilizador autenticado
    const { data, error } = await supabase
      .from("role_change_requests")
      .select("*")
      .eq("user_id", auth.userId)
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
