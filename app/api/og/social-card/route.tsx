import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"
import { socialCardElement } from "@/lib/social-card"

/**
 * Card de marca para posts de Instagram — pré-visualização pública.
 *
 * O `handle` decide o estilo: @morethanmoney.pt sai preto e dourado, centrado; @ricardogarciapt
 * sai com a tipografia dele em duas faixas (ciano e branca). É a mesma função que os crons usam.
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
      // A prova é um FACTO, não um interruptor: quem quer a linha manda o texto dela. "0"
      // continua a escondê-la, para as pré-visualizações sem número.
      proof: p.get("proof") === "0" ? false : (p.get("proof") ?? undefined),
      kicker: p.get("kicker") || "MORE THAN MONEY",
      formato: p.get("formato") === "reel" ? "reel" : "post",
      fundo: p.get("fundo") || undefined,
    }),
    // Reel é 9:16. A pré-visualização tem de sair no MESMO tamanho da publicação — senão
    // aprova-se um enquadramento e publica-se outro.
    { width: 1080, height: p.get("formato") === "reel" ? 1920 : 1350 },
  )
}
