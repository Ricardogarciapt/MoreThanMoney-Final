import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin, verifyAdminAccess } from "@/lib/admin-api-helpers"

const DEFAULT_GROUPS = [
  { name: "Trade Chat", description: "Discussões sobre trading e estratégias" },
  { name: "Crypto Chat", description: "Conversas sobre criptomoedas e mercado" },
  { name: "Forex Chat", description: "Conversas sobre Forex e mercados de divisas" },
  { name: "Social Chat", description: "Networking e conversas gerais" },
] as const

/**
 * POST: Cria os 4 grupos de chat padrão (Trade, Crypto, Forex, Social)
 * associados ao admin atual. Só administradores. Idempotente.
 */
export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const auth = await verifyAdminAccess()
  if (!auth.isAdmin || !auth.userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const adminId = auth.userId
  const supabase = getSupabaseAdmin()

  try {
    const created: string[] = []
    const alreadyExisted: string[] = []

    for (const g of DEFAULT_GROUPS) {
      const { data: existingGroup } = await supabase
        .from("group_conversations")
        .select("id")
        .eq("name", g.name)
        .maybeSingle()

      if (existingGroup) {
        alreadyExisted.push(g.name)
        await supabase
          .from("group_members")
          .upsert(
            { group_id: existingGroup.id, user_id: adminId, role: "admin" },
            { onConflict: "group_id,user_id" }
          )
        continue
      }

      const { data: newGroup, error: insertError } = await supabase
        .from("group_conversations")
        .insert({
          name: g.name,
          description: g.description,
          is_public: true,
          is_mobile_visible: true,
          created_by: adminId,
        })
        .select("id")
        .single()

      if (insertError || !newGroup) {
        console.error("[CREATE-DEFAULT-GROUPS] Erro ao criar grupo:", g.name, insertError)
        return NextResponse.json(
          { error: "Erro ao criar grupo", details: insertError?.message },
          { status: 500 }
        )
      }

      await supabase.from("group_members").insert({
        group_id: newGroup.id,
        user_id: adminId,
        role: "admin",
      })
      created.push(g.name)
    }

    return NextResponse.json({
      success: true,
      created,
      alreadyExisted,
      message:
        created.length > 0
          ? `Grupos criados: ${created.join(", ")}. Associados a ti como admin.`
          : `Todos os grupos já existiam. Foste associado como admin.`,
    })
  } catch (error: unknown) {
    console.error("[CREATE-DEFAULT-GROUPS] Erro:", error)
    return NextResponse.json(
      { error: "Erro interno", details: error instanceof Error ? error.message : "" },
      { status: 500 }
    )
  }
}
