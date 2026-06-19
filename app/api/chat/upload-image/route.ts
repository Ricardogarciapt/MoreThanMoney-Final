import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAdmin()
const BUCKET = "chat-images"

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const authHeader = request.headers.get("authorization") || ""
    const token = authHeader.replace(/^Bearer\s+/i, "").trim()

    let userId: string | null = null
    if (token) {
      const { data, error } = await supabase.auth.getUser(token)
      if (!error && data?.user) userId = data.user.id
    }

    // Also try cookie-based auth via the request cookies
    if (!userId) {
      // Fall back: get user from cookie session
      const cookieHeader = request.headers.get("cookie") || ""
      if (cookieHeader.includes("sb-")) {
        // Try to extract access token from cookie
        const match = cookieHeader.match(/sb-[^-]+-auth-token=([^;]+)/)
        if (match) {
          try {
            const decoded = decodeURIComponent(match[1])
            const parsed = JSON.parse(decoded)
            const accessToken = parsed?.access_token || parsed?.[0]?.access_token
            if (accessToken) {
              const { data, error } = await supabase.auth.getUser(accessToken)
              if (!error && data?.user) userId = data.user.id
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const channelSlug = (formData.get("channel_slug") as string | null) || "general"

    if (!file) {
      return NextResponse.json({ error: "Ficheiro em falta" }, { status: 400 })
    }

    const isImage = file.type.startsWith("image/")
    const isVideo = file.type.startsWith("video/")
    const isDocument = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/csv",
    ].includes(file.type)

    const allowedTypes = [
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
      "video/mp4", "video/webm", "video/quicktime", "video/mpeg",
    ]
    if (!isImage && !isVideo && !isDocument && !allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Tipo de ficheiro não suportado" }, { status: 400 })
    }

    const maxSize = isVideo ? 25 * 1024 * 1024 : isDocument ? 20 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: isVideo ? "Vídeo demasiado grande (máx 25 MB)" : isDocument ? "Documento demasiado grande (máx 20 MB)" : "Ficheiro demasiado grande (máx 10 MB)" },
        { status: 400 }
      )
    }

    const ext = file.name.split(".").pop() || "jpg"
    const fileName = `${channelSlug}/${userId}/${Date.now()}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error("[chat/upload-image] upload error:", uploadError)
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName)

    return NextResponse.json({
      publicUrl: urlData.publicUrl,
      mediaType: isVideo ? "video" : isDocument ? "document" : "image",
      fileName: file.name,
    })
  } catch (err: any) {
    console.error("[chat/upload-image] exception:", err)
    return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 })
  }
}
