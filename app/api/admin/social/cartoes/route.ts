import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { renderCarrossel, renderSocialCardBuffer, type Lamina } from "@/lib/social-card"
import { uploadBufferToBucket } from "@/lib/instagram/publish"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * O estúdio de cartões: um cartão só, ou um carrossel inteiro.
 *
 * Até aqui a imagem era feita por um cron e não havia forma de a ver antes nem de a mexer.
 * Quem escreve o post via o texto e a imagem só aparecia no fim — e uma imagem que não se pode
 * rever é uma imagem que se publica à sorte.
 */

const MIN_LAMINAS = 6

/** Escreve as lâminas do carrossel, quando não vêm escritas. */
async function escreverLaminas(tema: string, cta: string, quantas: number): Promise<string[] | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.CONTENT_DRAFT_MODEL?.trim() || "claude-sonnet-4-5",
        max_tokens: 1200,
        system:
          "Escreves carrosséis de Instagram para o Ricardo Garcia (MoreThanMoney, trading).\n\n" +
          "Devolves APENAS JSON: {\"capa\":\"...\",\"meio\":[\"...\",\"...\"],\"fim\":\"...\"}\n\n" +
          "· A CAPA tem de parar o dedo: no máximo 6 palavras, sem ponto final.\n" +
          "· Cada lâmina do MEIO é UMA ideia, 12 a 25 palavras. Uma ideia por lâmina — duas " +
          "juntas fazem a pessoa deslizar sem ler.\n" +
          "· A do FIM pede a acção, no máximo 8 palavras.\n" +
          "· Português de Portugal, tratamento por tu, primeira pessoa (é ELE que fala).\n" +
          "· NUNCA prometas lucro. NUNCA inventes números, percentagens ou resultados.\n" +
          "· Sem emojis, sem hashtags, sem aspas dentro do texto.",
        messages: [{ role: "user", content: `Tema: ${tema}\nPalavra do CTA: ${cta || "(nenhuma)"}\nLâminas do meio: ${quantas}` }],
      }),
      signal: AbortSignal.timeout(50_000),
    })
    const j = await r.json()
    const bruto = ((j?.content ?? []) as { type: string; text?: string }[])
      .filter((x) => x.type === "text").map((x) => x.text ?? "").join("").trim()
    const limpo = bruto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()
    const o = JSON.parse(limpo) as { capa?: string; meio?: string[]; fim?: string }
    if (!o.capa || !Array.isArray(o.meio)) return null
    return [o.capa, ...o.meio, o.fim ?? "Comenta abaixo"]
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const corpo = (await req.json().catch(() => ({}))) as {
    tipo?: "cartao" | "carrossel"
    handle?: string
    hook?: string
    cta?: string
    proof?: string
    formato?: "post" | "reel"
    fundo?: string
    /** Já escritas. Vazio = a IA escreve. */
    textos?: string[]
    laminas?: number
  }

  const handle = (corpo.handle || "ricardogarciapt").replace(/^@/, "")

  // ── Um cartão só ────────────────────────────────────────────────────────────────────────────
  if (corpo.tipo !== "carrossel") {
    const png = await renderSocialCardBuffer({
      hook: corpo.hook || "",
      cta: corpo.cta,
      handle,
      proof: corpo.proof || false,
      formato: corpo.formato === "reel" ? "reel" : "post",
      fundo: corpo.fundo,
    })
    const url = await uploadBufferToBucket(png, "image/png", "estudio")
    return NextResponse.json({ ok: true, urls: [url] })
  }

  // ── Carrossel ───────────────────────────────────────────────────────────────────────────────
  /**
   * Mínimo de seis. Um carrossel de duas lâminas não é carrossel — e foi o pedido explícito.
   * Se a IA devolver menos, sobe-se o pedido em vez de encher com texto vazio: texto de encher
   * lê-se como texto de encher, e uma lâmina má estraga as boas.
   */
  const quantas = Math.max(MIN_LAMINAS, Math.min(Number(corpo.laminas) || MIN_LAMINAS, 10))

  let textos = (corpo.textos ?? []).map((t) => String(t).trim()).filter(Boolean)
  if (textos.length < quantas) {
    const escritas = await escreverLaminas(corpo.hook || "", corpo.cta || "", quantas - 2)
    if (escritas) textos = escritas
  }
  if (textos.length < MIN_LAMINAS) {
    return NextResponse.json(
      { ok: false, erro: `Só consegui ${textos.length} lâminas e o mínimo é ${MIN_LAMINAS}. Escreve-as ou tenta outra vez.` },
      { status: 400 },
    )
  }

  const laminas: Lamina[] = textos.map((texto, i) => ({
    papel: i === 0 ? "capa" : i === textos.length - 1 ? "fim" : "meio",
    texto,
    ...(i === textos.length - 1 && corpo.cta ? { cta: corpo.cta } : {}),
    // A foto vai só na capa: repeti-la em todas rouba a legibilidade ao texto, que é o que se
    // vem cá ler.
    ...(i === 0 && corpo.fundo ? { fundo: corpo.fundo } : {}),
  }))

  const pngs = await renderCarrossel(laminas, handle)
  const urls: string[] = []
  for (const png of pngs) urls.push(await uploadBufferToBucket(png, "image/png", "estudio"))

  return NextResponse.json({ ok: true, urls, textos })
}
