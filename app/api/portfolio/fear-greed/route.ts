import { NextResponse } from "next/server"

/** Proxy ao Fear & Greed Index (Alternative.me) — evita CORS e permite cache na edge. */
export async function GET() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      next: { revalidate: 1800 },
      headers: { Accept: "application/json" },
    })
    if (!res.ok) {
      return NextResponse.json({ success: false, error: "Upstream HTTP" }, { status: 502 })
    }
    const j = (await res.json()) as {
      data?: Array<{ value?: string; value_classification?: string; timestamp?: string }>
    }
    const row = j.data?.[0]
    if (!row?.value) {
      return NextResponse.json({ success: false, error: "Sem dados" }, { status: 502 })
    }
    const value = Number.parseInt(String(row.value), 10)
    if (!Number.isFinite(value)) {
      return NextResponse.json({ success: false, error: "Valor inválido" }, { status: 502 })
    }
    return NextResponse.json({
      success: true,
      value,
      classification: row.value_classification || "Neutral",
      timestamp: row.timestamp,
    })
  } catch {
    return NextResponse.json({ success: false, error: "Falha de rede" }, { status: 500 })
  }
}
