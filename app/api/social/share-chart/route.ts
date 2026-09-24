import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { ehAdminUi, ehVipUi } from "@/lib/perfil-ui"
import {
  CHART_SOCIAL_CATEGORIES,
  inferChartSocialCategory,
  type ChartSocialCategory,
} from "@/lib/chart-social-category"
import {
  isNativeTradingViewShareUrl,
  normalizeNativeTradingViewShareUrl,
} from "@/lib/chart-share-capture"
import {
  buildChartSharePostContent,
  type TradeDirection,
} from "@/lib/chart-share-trade"
import { getPrimaryUrlFromText } from "@/lib/url-utils"

async function getAuthedSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
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
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  // `[\s\S]` em vez de `.` com a flag `s` (que exigia alvo ES2018 ou superior) —
  // faz exactamente o mesmo e compila com o alvo actual do projecto.
  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/)
  if (!match?.[2]) return null
  try {
    return Buffer.from(match[2], "base64")
  } catch {
    return null
  }
}

async function uploadChartImageData(
  chartImage: string,
  userId: string,
  category: string,
  symbol: string
): Promise<string | null> {
  const admin = getSupabaseAdmin()
  let buffer: Buffer | null = null
  let contentType = "image/png"

  if (chartImage.startsWith("data:")) {
    buffer = dataUrlToBuffer(chartImage)
    const mime = chartImage.match(/^data:([^;]+);base64,/)?.[1]
    if (mime) contentType = mime
  }

  if (!buffer && chartImage.length > 500) {
    try {
      buffer = Buffer.from(chartImage, "base64")
    } catch {
      /* not raw base64 */
    }
  }

  if (!buffer || buffer.length === 0) return null

  const ext = contentType.includes("jpeg") ? "jpg" : "png"
  const fileName = `chart-${category}-${symbol.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.${ext}`
  const filePath = `social/charts/${userId}/${fileName}`

  const { data: uploadData, error: uploadError } = await admin.storage
    .from("uploads")
    .upload(filePath, buffer, { contentType, upsert: false })

  if (uploadError || !uploadData) {
    console.warn("[share-chart] upload chart image:", uploadError)
    return null
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("uploads").getPublicUrl(uploadData.path)
  return publicUrl
}

function parseTakeProfits(body: Record<string, unknown>): [string, string, string, string, string] {
  return [0, 1, 2, 3, 4].map((i) => {
    if (Array.isArray(body.takeProfits) && body.takeProfits[i] != null) {
      return String(body.takeProfits[i]).trim()
    }
    const key = `tp${i + 1}`
    return typeof body[key] === "string" ? String(body[key]).trim() : ""
  }) as [string, string, string, string, string]
}

function parseMediaUrls(body: Record<string, unknown>): string[] {
  if (!Array.isArray(body.mediaUrls)) return []
  return body.mediaUrls
    .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    .map((u) => u.trim())
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getAuthedSupabase()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_type, member_category, membership_level, subscription_plan, is_active, full_name, username")
      .eq("id", session.user.id)
      .single()

    // Mesma leitura de VIP do resto do site (qualquer um dos campos) — é a que o botão do
    // scanner passa a usar, para o botão e a rota nunca discordarem.
    const canPost = ehAdminUi(profile) || ehVipUi(profile)

    if (!canPost) {
      return NextResponse.json(
        { error: "Apenas membros VIP ou Admin podem partilhar gráficos no Social." },
        { status: 403 }
      )
    }

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: "Corpo do pedido inválido (JSON)." }, { status: 400 })
    }

    const symbol = String(body.symbol || "").trim() || "Ativo"
    const chartUrlRaw = typeof body.chartUrl === "string" ? body.chartUrl.trim() : ""
    const chartImage = typeof body.chartImage === "string" ? body.chartImage : ""
    const description = typeof body.description === "string" ? body.description.trim() : ""
    const categoryRaw = String(body.category || "").trim() as ChartSocialCategory
    const category: ChartSocialCategory = CHART_SOCIAL_CATEGORIES.some((c) => c.value === categoryRaw)
      ? categoryRaw
      : inferChartSocialCategory(symbol)

    const directionRaw = String(body.direction || "").trim()
    const direction: TradeDirection =
      directionRaw === "bullish" || directionRaw === "bearish" ? directionRaw : ""

    const entry = typeof body.entry === "string" ? body.entry.trim() : ""
    const stopLoss =
      typeof body.stopLoss === "string"
        ? body.stopLoss.trim()
        : typeof body.sl === "string"
          ? body.sl.trim()
          : ""

    const takeProfits = parseTakeProfits(body)
    const clientMediaUrls = parseMediaUrls(body)

    const chartUrl = isNativeTradingViewShareUrl(chartUrlRaw)
      ? normalizeNativeTradingViewShareUrl(chartUrlRaw)
      : chartUrlRaw

    const hasChartImage = chartImage.length > 200

    let mediaUrls: string[] = [...clientMediaUrls]
    let imageWarning: string | undefined

    if (mediaUrls.length === 0 && hasChartImage) {
      const uploaded = await uploadChartImageData(chartImage, session.user.id, category, symbol)
      if (uploaded) {
        mediaUrls = [uploaded]
      } else {
        imageWarning = "Snapshot do gráfico não foi guardado; o post segue com o link TradingView."
      }
    }

    const mediaUrl = mediaUrls[0] ?? null

    const userName =
      profile?.full_name ||
      profile?.username ||
      session.user.user_metadata?.full_name ||
      session.user.email?.split("@")[0] ||
      "Membro"

    const content = buildChartSharePostContent({
      symbol,
      chartUrl,
      description,
      trade: { direction, entry, stopLoss, takeProfits },
    })

    let linkPreview: Record<string, unknown> | null = null
    if (mediaUrls.length === 0) {
      const primaryUrl = getPrimaryUrlFromText(content) || chartUrl
      if (primaryUrl) {
        try {
          const origin = request.nextUrl.origin
          const previewRes = await fetch(
            `${origin}/api/link-preview?url=${encodeURIComponent(primaryUrl)}`,
            { headers: { cookie: request.headers.get("cookie") || "" } }
          )
          if (previewRes.ok) {
            const previewData = (await previewRes.json()) as { preview?: Record<string, unknown> }
            linkPreview = previewData.preview ?? null
          }
        } catch (e) {
          console.warn("[share-chart] link preview:", e)
        }
      }
    }

    const postData: Record<string, unknown> = {
      user_id: session.user.id,
      user_name: userName,
      content: content || `📊 ${symbol}`,
      category,
      media_url: mediaUrl,
      ...(mediaUrls.length > 0 && { media_urls: mediaUrls }),
      ...(linkPreview && { link_preview: linkPreview }),
    }

    const { data: inserted, error: insertError } = await supabase
      .from("posts")
      .insert([postData])
      .select("id")
      .single()

    if (insertError) {
      console.error("[share-chart] insert posts:", insertError)
      const fallbackData = {
        user_id: session.user.id,
        user_name: userName,
        content: postData.content,
        category,
        media_url: mediaUrl,
      }
      const { data: fallbackInserted, error: fallbackError } = await supabase
        .from("posts")
        .insert([fallbackData])
        .select("id")
        .single()

      if (fallbackError) {
        return NextResponse.json(
          { error: insertError.message || "Erro ao criar post no Social" },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        postId: fallbackInserted?.id,
        category,
        mediaUrl,
        warning: imageWarning || "Algumas colunas opcionais não foram gravadas.",
        redirectUrl: `/app-mobile?tab=social&category=${category}`,
      })
    }

    return NextResponse.json({
      success: true,
      postId: inserted?.id,
      category,
      mediaUrl,
      warning: imageWarning,
      redirectUrl: `/app-mobile?tab=social&category=${category}`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno"
    console.error("[share-chart]", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
