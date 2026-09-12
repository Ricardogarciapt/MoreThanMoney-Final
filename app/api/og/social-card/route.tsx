import { NextRequest } from "next/server"
import { renderSocialCardBuffer } from "@/lib/social-card"

/**
 * Card de marca para posts de Instagram — pré-visualização pública.
 *
 * O `handle` decide o estilo: @morethanmoney.pt sai preto e dourado, centrado; @ricardogarciapt
 * sai com a tipografia dele em duas faixas (ciano e branca). É a mesma função que os crons usam.
 * A geração para publicação sem toque é feita EM PROCESSO (lib/social-card renderSocialCardBuffer),
 * não por esta rota, para não depender da firewall/challenge da Vercel.
 */
/**
 * Corre em node e não em edge: a fonte condensada lê-se do disco, e o edge não tem disco.
 *
 * E usa a MESMA função que publica (`renderSocialCardBuffer`) em vez de montar outra
 * `ImageResponse` à parte — duas montagens divergem, e o sintoma seria aprovar-se aqui um
 * cartão diferente do que sai no Instagram.
 */
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const png = await renderSocialCardBuffer({
    hook: p.get("hook") || "Disciplina cria liberdade.",
    cta: p.get("cta") || "",
    handle: p.get("handle") || "morethanmoney.pt",
    // A prova é um FACTO, não um interruptor: quem quer a linha manda o texto dela. "0"
    // continua a escondê-la, para as pré-visualizações sem número.
    proof: p.get("proof") === "0" ? false : (p.get("proof") ?? undefined),
    kicker: p.get("kicker") || "MORE THAN MONEY",
    formato: p.get("formato") === "reel" ? "reel" : "post",
    fundo: p.get("fundo") || undefined,
    // As três camadas: fundo, pessoa recortada, texto. Ver `SocialCardParams`.
    destaque: p.get("destaque") || undefined,
    destaquePos: (p.get("destaquePos") as "esquerda" | "centro" | "direita") || undefined,
    destaqueEscala: p.get("destaqueEscala") ? Number(p.get("destaqueEscala")) : undefined,
  })
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=300" },
  })
}
