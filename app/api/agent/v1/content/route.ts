import { NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import {
  agentError,
  agentOk,
  requireAgentAccess,
  validateRequiredFields,
} from "@/lib/agent-site-api"

const VALID_TYPES = ["link", "video", "file", "text", "image"]
const VALID_CATEGORIES = ["navbar", "footer", "landing", "education", "trading", "general"]

export async function GET(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  const { searchParams } = new URL(request.url)
  const category = searchParams.get("category")
  const type = searchParams.get("type")

  const supabase = getSupabaseAdmin()
  let query = supabase.from("site_content").select("*").order("order_index", { ascending: true })
  if (category) query = query.eq("category", category)
  if (type) query = query.eq("type", type)

  const { data, error } = await query
  if (error) return agentError(error.message, 500)
  return agentOk(data || [])
}

export async function POST(request: NextRequest) {
  const auth = await requireAgentAccess(request)
  if (auth instanceof Response) return auth

  try {
    const body = await request.json()
    const validation = validateRequiredFields(body, ["type", "category", "title"])
    if (!validation.valid) {
      return agentError(validation.error || "Campos em falta", 400, { missing: validation.missing })
    }

    const { type, category, title } = body
    if (!VALID_TYPES.includes(type)) {
      return agentError(`type inválido. Permitidos: ${VALID_TYPES.join(", ")}`)
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return agentError(`category inválida. Permitidas: ${VALID_CATEGORIES.join(", ")}`)
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("site_content")
      .insert({
        type,
        category,
        title,
        description: body.description ?? null,
        url: body.url ?? null,
        content: body.content ?? null,
        file_url: body.file_url ?? null,
        file_name: body.file_name ?? null,
        file_size: body.file_size ?? null,
        is_active: body.is_active ?? true,
        order_index: body.order_index ?? 0,
        metadata: body.metadata ?? {},
        created_by: auth.userId ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return agentError(error.message, 500)
    return agentOk(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar conteúdo"
    return agentError(msg, 500)
  }
}
