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

    // Validate type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Tipo de ficheiro não suportado" }, { status: 400 })
    }

    // Validate size (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Ficheiro demasiado grande (máx 10 MB)" }, { status: 400 })
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

    return NextResponse.json({ publicUrl: urlData.publicUrl })
  } catch (err: any) {
    console.error("[chat/upload-image] exception:", err)
    return NextResponse.json({ error: err.message || "Erro interno" }, { status: 500 })
  }
}
