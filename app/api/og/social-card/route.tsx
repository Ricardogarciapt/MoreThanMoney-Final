import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"
import { socialCardElement } from "@/lib/social-card"

/**
 * Card de marca MTM para posts autónomos de Instagram (4:5, 1080×1350) — preview público.
 * A geração para publicação sem toque é feita EM PROCESSO (lib/social-card renderSocialCardBuffer),
 * não por esta rota, para não depender da firewall/challenge da Vercel.
 */
export const runtime = "edge"

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  return new ImageResponse(
    socialCardElement({
      hook: p.get("hook") || "Disciplina cria liberdade.",
      cta: p.get("cta") || "",
      handle: p.get("handle") || "morethanmoney.pt",
      proof: p.get("proof") !== "0",
      kicker: p.get("kicker") || "MORE THAN MONEY",
    }),
    { width: 1080, height: 1350 },
  )
}
