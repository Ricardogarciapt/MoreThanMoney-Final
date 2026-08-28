import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { correrRadar } from "@/lib/instagram/radar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * O radar de leads, às fatias — 8 horas por dia.
 *
 * Corre de meia em meia hora entre as 9h e as 17h (`*​/30 9-16 * * *` no vercel.json): dezasseis
 * passagens, três hashtags de cada vez.
 *
 * Fatiado por duas razões. A do Instagram: são 30 hashtags diferentes por 7 dias, e um jorro
 * gastava a quota da semana numa manhã. A humana: cem prospetos às nove da manhã não se tratam —
 * um punhado de meia em meia hora trata-se, e chega enquanto o post ainda é recente e o
 * comentário ainda apanha a conversa viva.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const r = await correrRadar(3)
  if (r.erros.length) console.log("[lead-radar]", r.erros.join(" · "))

  return NextResponse.json({ ok: true, ...r })
}
