import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"
import { getLmsIngestServerUrl } from "@/lib/lms-stream-ingest"

const supabase = getSupabaseAdmin()

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function generateEducatorStreamKey(name: string) {
  const rnd = randomBytes(3).toString("hex")
  return `mtm_${slugify(name) || "educador"}_${rnd}`
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const email = String(body.email || "").trim().toLowerCase()
    const displayName = String(body.name || body.display_name || "").trim()
    const password = String(body.password || "").trim()
    let academyId = body.academy_id || null
    const title = String(body.stream_title || `${displayName} - Live Session`).trim()

    if (!email || !displayName || !password) {
      return NextResponse.json({ error: "name, email e password são obrigatórios" }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const streamKey = generateEducatorStreamKey(displayName)

    const { data: educator, error: educatorError } = await supabase
      .from("lms_educators")
      .insert({
        email,
        display_name: displayName,
        password_hash: passwordHash,
        academy_id: academyId,
        is_active: true,
      })
      .select("id, display_name, email")
      .single()

    if (educatorError || !educator) {
      return NextResponse.json({ error: educatorError?.message || "Erro ao criar educador" }, { status: 500 })
    }

    if (!academyId) {
      const { data: firstAcademy } = await supabase
        .from("lms_academies")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      academyId = firstAcademy?.id || null
    }

    if (!academyId) {
      return NextResponse.json({ error: "Nenhuma academia disponível. Cria uma academia primeiro." }, { status: 400 })
    }

    const { data: stream, error: streamError } = await supabase
      .from("lms_streams")
      .insert({
        academy_id: academyId,
        educator_id: educator.id,
        title,
        rtmps_url: getLmsIngestServerUrl(),
        stream_key: streamKey,
        chat_enabled: true,
        is_live: false,
      })
      .select("*")
      .single()

    if (streamError) {
      return NextResponse.json({ error: streamError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      educator,
      stream,
      stream_key: streamKey,
      rtmps_url: getLmsIngestServerUrl(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

