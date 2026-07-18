import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser, getSupabaseAdmin } from "@/lib/admin-api-helpers"

// Campos que o próprio utilizador pode editar no seu perfil.
// NUNCA incluir user_type / is_active / role / email / id — evita escalonamento de
// privilégios ou desincronização com o auth (mass-assignment).
const ALLOWED_FIELDS = [
  "full_name",
  "username",
  "phone",
  "whatsapp",
  "social_media",
  "jifu_id",
  "jifu_affiliate_link",
  "birth_date",
  "preferred_language",
  "country",
] as const

export async function PUT(request: NextRequest) {
  try {
    // Autorização: o utilizador vem SEMPRE da sessão, nunca do corpo do pedido.
    const auth = await getAuthenticatedUser()
    if (!auth.userId) {
      return NextResponse.json({ error: auth.error || "Não autenticado" }, { status: 401 })
    }
    const userId = auth.userId

    const body = await request.json()
    const rawUpdates = (body?.updates ?? {}) as Record<string, unknown>

    // Filtrar apenas os campos permitidos (ignora userId do corpo e qualquer campo sensível)
    const updates: Record<string, unknown> = {}
    for (const field of ALLOWED_FIELDS) {
      if (field in rawUpdates) updates[field] = rawUpdates[field]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nenhum campo válido para atualizar" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Verificar se o perfil existe
    const { data: existingUser, error: userError } = await supabase
      .from("profiles")
      .select("id, username, jifu_id")
      .eq("id", userId)
      .single()

    if (userError || !existingUser) {
      return NextResponse.json({ error: "Utilizador não encontrado" }, { status: 404 })
    }

    // Validar campos únicos se estiverem a ser atualizados
    if (updates.username && updates.username !== existingUser.username) {
      const { data: usernameCheck } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", updates.username)
        .neq("id", userId)
        .maybeSingle()

      if (usernameCheck) {
        return NextResponse.json({ error: "Nome de utilizador já está em uso" }, { status: 400 })
      }
    }

    if (updates.jifu_id && updates.jifu_id !== existingUser.jifu_id) {
      const { data: jifuCheck } = await supabase
        .from("profiles")
        .select("id")
        .eq("jifu_id", updates.jifu_id)
        .neq("id", userId)
        .maybeSingle()

      if (jifuCheck) {
        return NextResponse.json({ error: "ID JIFU já está registado" }, { status: 400 })
      }
    }

    // Atualizar perfil (apenas o próprio, id da sessão)
    const { data, error } = await supabase
      .from("profiles")
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
