import { NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { agentError, agentOk, requireAgentAccess } from "@/lib/agent-site-api"

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  const { id } = await params
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from("site_content").select("*").eq("id", id).single()
  if (error) return agentError(error.message, error.code === "PGRST116" ? 404 : 500)
  return agentOk(data)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  const { id } = await params
  try {
    const body = await request.json()
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("site_content")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) return agentError(error.message, error.code === "PGRST116" ? 404 : 500)
    return agentOk(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao atualizar"
    return agentError(msg, 500)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  const { id } = await params
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from("site_content").delete().eq("id", id)
  if (error) return agentError(error.message, 500)
  return agentOk({ deleted: true, id })
}
