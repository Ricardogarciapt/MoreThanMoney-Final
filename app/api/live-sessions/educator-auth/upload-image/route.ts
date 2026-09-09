import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin, isValidUUID } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { randomUUID } from "crypto"

const PRIMARY_BUCKET = "lms-assets"
const FALLBACK_BUCKET = "uploads"
const MAX_BYTES = 5 * 1024 * 1024

function isBucketMissingError(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message || "").toLowerCase()
  return m.includes("bucket not found") || (m.includes("not found") && m.includes("bucket"))
}

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
])

/** Upload de imagens (avatar do educador, thumbnail/quadrada da sala) autenticado pelo educador. */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  const educator = token ? verifyEducatorToken(token) : null
  if (!educator) {
    return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    const scope = String(formData.get("scope") || "").trim()
    const refIdRaw = formData.get("refId")
    const refId = refIdRaw && String(refIdRaw).trim() ? String(refIdRaw).trim() : ""

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Ficheiro em falta ou vazio." }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Imagem demasiado grande (máximo 5 MB)." }, { status: 400 })
    }
    const ext = ALLOWED.get(file.type)
    if (!ext) {
      return NextResponse.json({ error: "Formato não suportado. Usa JPEG, PNG, WebP ou GIF." }, { status: 400 })
    }
    if (scope !== "educator_avatar" && scope !== "stream_thumbnail" && scope !== "stream_square" && scope !== "playlist_cover") {
      return NextResponse.json({ error: "scope inválido." }, { status: 400 })
    }
    if (refId && !isValidUUID(refId)) {
      return NextResponse.json({ error: "refId deve ser um UUID válido." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Para scopes de sala, garantir que o stream pertence a este educador.
    if ((scope === "stream_thumbnail" || scope === "stream_square") && refId) {
      const { data: owned } = await supabase
        .from("lms_streams")
        .select("id")
        .eq("id", refId)
        .eq("educator_id", educator.educatorId)
        .maybeSingle()
      if (!owned) {
        return NextResponse.json({ error: "Canal não pertence a esta conta." }, { status: 403 })
      }
    }

    // O avatar é sempre do próprio educador (ignora refId externo).
    const folderId = scope === "educator_avatar" ? educator.educatorId : refId || randomUUID()
    const prefix = scope === "educator_avatar" ? "educators" : scope === "stream_square" ? "streams-square" : "streams"
    const objectPath = `${prefix}/${folderId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`

    const buf = Buffer.from(await file.arrayBuffer())
    let bucket = PRIMARY_BUCKET
    let path = objectPath
    let { error: upErr } = await supabase.storage.from(bucket).upload(path, buf, { contentType: file.type, upsert: false })
    if (upErr && isBucketMissingError(upErr)) {
      bucket = FALLBACK_BUCKET
      path = `lms/${objectPath}`
      ;({ error: upErr } = await supabase.storage.from(bucket).upload(path, buf, { contentType: file.type, upsert: false }))
    }
    if (upErr) {
      return NextResponse.json({ error: upErr.message || "Falha no storage." }, { status: 500 })
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path)

    // Avatar: persistir já no educador (auto-save).
    if (scope === "educator_avatar") {
      await supabase.from("lms_educators").update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq("id", educator.educatorId)
    }

    return NextResponse.json({ success: true, url: publicUrl, path })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro interno" }, { status: 500 })
  }
}
