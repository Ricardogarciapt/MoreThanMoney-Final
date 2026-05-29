import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"

const supabaseAdmin = getSupabaseAdmin()

/** Educador autenticado apaga um feedback da sua própria sala. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ ratingId: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(getEducatorCookieName())?.value
    const edu = token ? verifyEducatorToken(token) : null
    if (!edu?.educatorId) {
      return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })
    }

    const { ratingId } = await params
    if (!ratingId?.trim()) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 })
    }

    const { data: row, error: fetchError } = await supabaseAdmin
      .from("lms_educator_ratings")
      .select("id, educator_id")
      .eq("id", ratingId)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ error: "Feedback não encontrado" }, { status: 404 })
    }
    if (row.educator_id !== edu.educatorId) {
      return NextResponse.json({ error: "Sem permissão para apagar este feedback" }, { status: 403 })
    }

    const { error: deleteError } = await supabaseAdmin
      .from("lms_educator_ratings")
      .delete()
      .eq("id", ratingId)
      .eq("educator_id", edu.educatorId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
