import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAnonServerClient } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAnonServerClient()

export async function PUT(request: NextRequest) {
  try {
    const { userId, updates } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "User ID é obrigatório" }, { status: 400 })
    }

    // Verificar se o usuário existe
    const { data: existingUser, error: userError } = await supabase.from("users").select("*").eq("id", userId).single()

    if (userError || !existingUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }

    // Validar campos únicos se estiverem sendo atualizados
    if (updates.username && updates.username !== existingUser.username) {
      const { data: usernameCheck } = await supabase
        .from("users")
        .select("id")
        .eq("username", updates.username)
        .neq("id", userId)
        .single()

      if (usernameCheck) {
        return NextResponse.json({ error: "Nome de usuário já está em uso" }, { status: 400 })
      }
    }

    if (updates.jifu_id && updates.jifu_id !== existingUser.jifu_id) {
      const { data: jifuCheck } = await supabase
        .from("users")
        .select("id")
        .eq("jifu_id", updates.jifu_id)
        .neq("id", userId)
        .single()

      if (jifuCheck) {
        return NextResponse.json({ error: "ID JIFU já está registrado" }, { status: 400 })
      }
    }

    // Atualizar perfil
    const { data, error } = await supabase
      .from("users")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single()

    if (error) {
      console.error("Erro ao atualizar perfil:", error)
      return NextResponse.json({ error: "Erro ao atualizar perfil" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user: data,
      message: "Perfil atualizado com sucesso!",
    })
  } catch (error) {
    console.error("Erro na API de atualização de perfil:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
