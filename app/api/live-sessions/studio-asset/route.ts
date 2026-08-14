import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { randomUUID } from "crypto"

/**
 * Upload de assets do Studio interno (imagem / áudio / vídeo) autenticado pelo educador → storage,
 * devolve URL público. Torna DURÁVEIS os ficheiros locais (blobs) do compositor, para o botão
 * "Guardar posições" guardar mesmo tudo. Ver `internal-streaming-studio`.
 */

const PRIMARY_BUCKET = "lms-assets"
const FALLBACK_BUCKET = "uploads"
const MAX_BYTES = 50 * 1024 * 1024 // 50 MB (mp3/intro/vídeos curtos)

function isBucketMissingError(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message || "").toLowerCase()
  return m.includes("bucket not found") || (m.includes("not found") && m.includes("bucket"))
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "video/mp4": "mp4",
  "video/webm": "webm",
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  const educator = token ? verifyEducatorToken(token) : null
  if (!educator) return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Ficheiro em falta ou vazio." }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Ficheiro demasiado grande (máx. 50 MB)." }, { status: 400 })
    }
    const ext = EXT[file.type] || (file.type.startsWith("image") ? "png" : file.type.startsWith("audio") ? "mp3" : "")
    if (!ext) return NextResponse.json({ error: "Formato não suportado." }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const kind = file.type.startsWith("image") ? "image" : file.type.startsWith("audio") ? "audio" : "video"
    const objectPath = `studio/${educator.educatorId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`

    const buf = Buffer.from(await file.arrayBuffer())
    let bucket = PRIMARY_BUCKET
    let path = objectPath
    let { error: upErr } = await supabase.storage.from(bucket).upload(path, buf, { contentType: file.type, upsert: false })
    if (upErr && isBucketMissingError(upErr)) {
      bucket = FALLBACK_BUCKET
      path = `lms/${objectPath}`
      ;({ error: upErr } = await supabase.storage.from(bucket).upload(path, buf, { contentType: file.type, upsert: false }))
    }
    if (upErr) return NextResponse.json({ error: upErr.message || "Falha no storage." }, { status: 500 })

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path)
    return NextResponse.json({ success: true, url: publicUrl, kind })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro interno" }, { status: 500 })
  }
}
