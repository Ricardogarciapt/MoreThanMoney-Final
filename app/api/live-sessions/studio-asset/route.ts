import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"
import { randomUUID } from "crypto"

/**
 * Assets do Studio interno (imagem / áudio / vídeo). DOIS modos:
 *  1) POST JSON {name, type} → devolve um URL ASSINADO de upload direto p/ o Supabase Storage
 *     (o cliente faz PUT do ficheiro direto ao storage → contorna o limite de body da Vercel ~4.5MB
 *     que dava 413 nos mp3/imagens grandes). Devolve também o publicUrl final.
 *  2) POST multipart {file} → upload pequeno via servidor (fallback). Ver `internal-streaming-studio`.
 */

const PRIMARY_BUCKET = "lms-assets"
const FALLBACK_BUCKET = "uploads"
const MAX_BYTES = 200 * 1024 * 1024 // 200 MB (direto ao storage)

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

function extFor(type: string, name?: string): string {
  if (EXT[type]) return EXT[type]
  const fromName = (name || "").split(".").pop()?.toLowerCase()
  if (fromName && fromName.length <= 4) return fromName
  return type.startsWith("image") ? "png" : type.startsWith("audio") ? "mp3" : "bin"
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  const educator = token ? verifyEducatorToken(token) : null
  if (!educator) return NextResponse.json({ error: "Não autenticado como educador" }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const contentType = request.headers.get("content-type") || ""

  // ── Modo 1: assinar URL de upload direto (JSON) ──
  if (contentType.includes("application/json")) {
    let body: { name?: string; type?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }
    const type = String(body.type || "application/octet-stream")
    const ext = extFor(type, body.name)
    const objectPath = `studio/${educator.educatorId}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`

    let bucket = PRIMARY_BUCKET
    let path = objectPath
    let signed = await supabase.storage.from(bucket).createSignedUploadUrl(path)
    if (signed.error && isBucketMissingError(signed.error)) {
      bucket = FALLBACK_BUCKET
      path = `lms/${objectPath}`
      signed = await supabase.storage.from(bucket).createSignedUploadUrl(path)
    }
    if (signed.error || !signed.data) {
      return NextResponse.json({ error: signed.error?.message || "sign_failed" }, { status: 500 })
    }
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path)
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
    // signedUrl vem tipo "/object/upload/sign/<bucket>/<path>?token=..."
    const uploadUrl = `${supabaseUrl}/storage/v1${signed.data.signedUrl.startsWith("/") ? "" : "/"}${signed.data.signedUrl}`
    return NextResponse.json({ mode: "signed", uploadUrl, token: signed.data.token, path, bucket, publicUrl: pub.publicUrl })
  }

  // ── Modo 2: upload pequeno via servidor (multipart) ──
  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Ficheiro em falta ou vazio." }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Ficheiro demasiado grande." }, { status: 413 })
    }
    const ext = extFor(file.type, file.name)
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
    return NextResponse.json({ mode: "direct", success: true, url: publicUrl })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro interno" }, { status: 500 })
  }
}
