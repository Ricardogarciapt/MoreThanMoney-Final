import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin, requireAdmin, isValidUUID } from "@/lib/admin-api-helpers"
import { randomUUID } from "crypto"

const PRIMARY_BUCKET = "lms-assets"
/** Fallback quando a migração 016 ainda não correu — o feed social usa este bucket. */
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

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck

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
      return NextResponse.json(
        { error: "Formato não suportado. Usa JPEG, PNG, WebP ou GIF." },
        { status: 400 }
      )
    }

    // Uma só rota de upload para todo o LMS: um segundo endpoint para as capas das academias
    // seria um segundo sítio onde o limite de 5 MB e a lista de formatos podiam divergir em
    // silêncio — e divergem sempre, porque só um dos dois é corrigido.
    const SCOPES = new Set(["educator_avatar", "stream_thumbnail", "stream_square", "academy_cover"])
    if (!SCOPES.has(scope)) {
      return NextResponse.json(
        { error: "scope inválido. Usa educator_avatar, stream_thumbnail, stream_square ou academy_cover." },
        { status: 400 }
      )
    }

    if (refId && !isValidUUID(refId)) {
      return NextResponse.json({ error: "refId deve ser um UUID válido." }, { status: 400 })
    }

    const folderId = refId || randomUUID()
    const PREFIXOS: Record<string, string> = {
      educator_avatar: "educators",
      stream_square: "streams-square",
      academy_cover: "academies",
      stream_thumbnail: "streams",
    }
    const prefix = PREFIXOS[scope] ?? "streams"
    const objectPath = `${prefix}/${folderId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`

    const buf = Buffer.from(await file.arrayBuffer())
    const supabase = getSupabaseAdmin()

    let bucket = PRIMARY_BUCKET
    let path = objectPath

    let { error: upErr } = await supabase.storage.from(bucket).upload(path, buf, {
      contentType: file.type,
      upsert: false,
    })

    if (upErr && isBucketMissingError(upErr)) {
      bucket = FALLBACK_BUCKET
      path = `lms/${objectPath}`
      ;({ error: upErr } = await supabase.storage.from(bucket).upload(path, buf, {
        contentType: file.type,
        upsert: false,
      }))
      if (!upErr) {
        console.warn("[lms upload-image] bucket lms-assets em falta; usado uploads com prefixo lms/")
      }
    }

    if (upErr) {
      console.error("[lms upload-image]", upErr)
      return NextResponse.json(
        {
          error:
            upErr.message ||
            "Falha no storage. Cria o bucket lms-assets (migração 016) ou garante que o bucket uploads existe e é público.",
        },
        { status: 500 }
      )
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path)

    return NextResponse.json({ success: true, url: publicUrl, path })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro interno"
    console.error("[lms upload-image]", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
