import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { getSupabaseAdmin, requireAdmin } from "@/lib/admin-api-helpers"
import { getLmsIngestServerUrl } from "@/lib/lms-stream-ingest"
import { generateMtmIngestStreamKey } from "@/lib/lms-stream-keys"
import { normalizeLmsLanguage } from "@/lib/lms/languages"

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  const { data, error } = await supabase
    .from("lms_educators")
    .select(
      "id, email, display_name, bio, avatar_url, specialty, language, academy_id, is_active, stream_key_fixed, youtube_stream_key, youtube_enabled, restream_enabled, restream_ingest_url, restream_stream_key, restream_embed_url, created_at, updated_at"
    )
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data || [] })
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const email = String(body.email || "").trim().toLowerCase()
    const display_name = String(body.display_name || "").trim()
    const password = String(body.password || "")
    const bio = String(body.bio || "").trim()
    const specialty = String(body.specialty || "").trim()
    const avatar_url = String(body.avatar_url || "").trim()
    const language = normalizeLmsLanguage(body.language)
    let academy_id = body.academy_id || null

    if (!email || !display_name || !password) {
      return NextResponse.json({ error: "email, display_name e password são obrigatórios" }, { status: 400 })
    }

    if (!academy_id) {
      const { data: firstAcademy } = await supabase
        .from("lms_academies")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      academy_id = firstAcademy?.id || null
    }

    if (!academy_id) {
      return NextResponse.json({ error: "Nenhuma academia disponível. Cria uma academia primeiro." }, { status: 400 })
    }

    const password_hash = await bcrypt.hash(password, 10)

    // "Promover user a educador": se existe um profile com este email, liga por profile_id.
    const { data: linkedProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle()

    const { data, error } = await supabase
      .from("lms_educators")
      .insert({
        email,
        display_name,
        password_hash,
        bio: bio || null,
        specialty: specialty || null,
        avatar_url: avatar_url || null,
        language,
        academy_id,
        profile_id: linkedProfile?.id ?? null,
        stream_key_fixed: null,
        is_active: true,
      })
      .select(
        "id, email, display_name, bio, avatar_url, specialty, language, academy_id, is_active, stream_key_fixed, youtube_stream_key, youtube_enabled, restream_enabled, restream_ingest_url, restream_stream_key, restream_embed_url, created_at, updated_at"
      )
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const fixedKey = generateMtmIngestStreamKey(data.id)
    const { data: updatedEducator, error: keyError } = await supabase
      .from("lms_educators")
      .update({ stream_key_fixed: fixedKey })
      .eq("id", data.id)
      .select("id, email, display_name, bio, avatar_url, specialty, language, academy_id, is_active, stream_key_fixed, youtube_stream_key, youtube_enabled, created_at, updated_at")
      .single()
    if (keyError || !updatedEducator) return NextResponse.json({ error: keyError?.message || "Erro ao gerar chave fixa" }, { status: 500 })

    // Canal padrão automático por educador (chave fixa).
    const { data: existingStream } = await supabase
      .from("lms_streams")
      .select("id")
      .eq("educator_id", updatedEducator.id)
      .limit(1)
      .maybeSingle()

    if (!existingStream) {
      const { error: streamError } = await supabase.from("lms_streams").insert({
        academy_id: academy_id,
        educator_id: updatedEducator.id,
        title: `Sala de ${updatedEducator.display_name}`,
        category: null,
        rtmps_url: getLmsIngestServerUrl(),
        stream_key: fixedKey,
        chat_enabled: true,
        is_live: false,
      })
      if (streamError) return NextResponse.json({ error: streamError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: updatedEducator })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })

    const updates: Record<string, any> = {}
    if (body.email !== undefined) {
      const newEmail = String(body.email || "").trim().toLowerCase()
      if (!newEmail) return NextResponse.json({ error: "email não pode ser vazio" }, { status: 400 })
      updates.email = newEmail
      // Religa o profile correspondente ao novo email (promoção/reatribuição).
      const { data: p } = await supabase.from("profiles").select("id").ilike("email", newEmail).maybeSingle()
      updates.profile_id = p?.id ?? null
    }
    if (body.display_name !== undefined) updates.display_name = String(body.display_name || "").trim()
    if (body.bio !== undefined) updates.bio = String(body.bio || "").trim() || null
    if (body.specialty !== undefined) updates.specialty = String(body.specialty || "").trim() || null
    if (body.language !== undefined) updates.language = normalizeLmsLanguage(body.language)
    if (body.avatar_url !== undefined) updates.avatar_url = String(body.avatar_url || "").trim() || null
    if (body.academy_id !== undefined) updates.academy_id = body.academy_id || null
    if (body.youtube_stream_key !== undefined) updates.youtube_stream_key = String(body.youtube_stream_key || "").trim() || null
    if (body.youtube_enabled !== undefined) updates.youtube_enabled = Boolean(body.youtube_enabled)
    if (body.restream_enabled !== undefined) updates.restream_enabled = Boolean(body.restream_enabled)
    if (body.restream_ingest_url !== undefined) {
      updates.restream_ingest_url = String(body.restream_ingest_url || "").trim() || null
    }
    if (body.restream_stream_key !== undefined) {
      updates.restream_stream_key = String(body.restream_stream_key || "").trim() || null
    }
    if (body.restream_embed_url !== undefined) {
      updates.restream_embed_url = String(body.restream_embed_url || "").trim() || null
    }
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active)
    if (body.password) {
      updates.password_hash = await bcrypt.hash(String(body.password), 10)
    }

    const { data, error } = await supabase
      .from("lms_educators")
      .update(updates)
      .eq("id", id)
      .select(
        "id, email, display_name, bio, avatar_url, specialty, language, academy_id, is_active, stream_key_fixed, youtube_stream_key, youtube_enabled, restream_enabled, restream_ingest_url, restream_stream_key, restream_embed_url, created_at, updated_at"
      )
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Se a academia foi alterada, mantém o canal do educador alinhado.
    if (updates.academy_id !== undefined) {
      await supabase
        .from("lms_streams")
        .update({ academy_id: updates.academy_id })
        .eq("educator_id", id)
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

  try {
    const body = await request.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 })

    const { error } = await supabase
      .from("lms_educators")
      .delete()
      .eq("id", id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

