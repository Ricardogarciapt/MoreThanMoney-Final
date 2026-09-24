import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"

const supabaseAdmin = getSupabaseAdmin()

async function getSessionUser() {
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
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: educatorId } = await params

    const { data: educator, error: edError } = await supabaseAdmin
      .from("lms_educators")
      .select("id, display_name, bio, avatar_url, specialty, academy:lms_academies(id, name)")
      .eq("id", educatorId)
      .eq("is_active", true)
      .single()

    if (edError || !educator) {
      return NextResponse.json({ error: "Educador não encontrado" }, { status: 404 })
    }

    const { data: ratings, error: rError } = await supabaseAdmin
      .from("lms_educator_ratings")
      .select(
        "id, rating, comment, user_name, created_at, updated_at, stream_id, stream:lms_streams(id, title)"
      )
      .eq("educator_id", educatorId)
      .order("updated_at", { ascending: false })
      .limit(100)

    if (rError) {
      return NextResponse.json({ error: rError.message }, { status: 500 })
    }

    const list = ratings || []
    const count = list.length
    const average =
      count > 0 ? Math.round((list.reduce((s, r) => s + Number(r.rating), 0) / count) * 10) / 10 : null

    const session = await getSessionUser()
    // Era `(typeof list)[0]`, ou seja, a linha completa da lista (com user_name,
    // stream_id e stream). Mas a consulta abaixo so traz cinco colunas — o tipo
    // prometia campos que nunca vinham.
    let mine: {
      id: string
      rating: number
      comment: string | null
      created_at: string
      updated_at: string
    } | null = null
    if (session?.user?.id) {
      const { data: myRow } = await supabaseAdmin
        .from("lms_educator_ratings")
        .select("id, rating, comment, created_at, updated_at")
        .eq("educator_id", educatorId)
        .eq("user_id", session.user.id)
        .maybeSingle()
      mine = myRow
    }

    return NextResponse.json({
      success: true,
      educator,
      stats: { count, average },
      ratings: list,
      mine,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Inicia sessão para avaliar a aula" }, { status: 401 })
    }

    const { id: educatorId } = await params
    const body = await request.json().catch(() => ({}))
    const rating = Number(body.rating)
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) : ""
    const streamId = typeof body.stream_id === "string" ? body.stream_id.trim() : null

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Avaliação deve ser entre 1 e 5 estrelas" }, { status: 400 })
    }

    const { data: educator } = await supabaseAdmin
      .from("lms_educators")
      .select("id")
      .eq("id", educatorId)
      .eq("is_active", true)
      .single()

    if (!educator) {
      return NextResponse.json({ error: "Educador não encontrado" }, { status: 404 })
    }

    const displayName =
      (session.user.user_metadata?.full_name as string) ||
      (session.user.user_metadata?.name as string) ||
      session.user.email?.split("@")[0] ||
      "Membro"

    const row = {
      educator_id: educatorId,
      stream_id: streamId || null,
      user_id: session.user.id,
      user_name: displayName,
      rating: Math.round(rating),
      comment: comment || null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabaseAdmin
      .from("lms_educator_ratings")
      .upsert(row, { onConflict: "educator_id,user_id" })
      .select("id, rating, comment, created_at, updated_at")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
