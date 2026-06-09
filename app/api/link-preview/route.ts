import { NextRequest, NextResponse } from "next/server"
import { fetchLinkPreview } from "@/lib/link-preview-fetch"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")
  if (!url?.trim()) {
    return NextResponse.json({ error: "Parâmetro url obrigatório" }, { status: 400 })
  }

  try {
    const preview = await fetchLinkPreview(url.trim())
    if (!preview) {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 })
    }
    return NextResponse.json({ preview })
  } catch (e) {
    console.error("[link-preview]", e)
    return NextResponse.json({ error: "Erro ao obter pré-visualização" }, { status: 500 })
  }
}
