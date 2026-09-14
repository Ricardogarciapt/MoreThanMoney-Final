import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { renderCarrossel, renderSocialCardBuffer, type Lamina, type SocialCardParams } from "@/lib/social-card"
import { uploadBufferToBucket } from "@/lib/instagram/publish"
import { modeloClaude } from '@/lib/modelo-claude'

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
        model: modeloClaude(process.env.CONTENT_DRAFT_MODEL),
        max_tokens: 1200,
        // O Sonnet 5 pensa por omissão e o pensamento come o max_tokens: a resposta vinha
        // cortada ou vazia. Isto é trabalho de formato, não de raciocínio.
        thinking: { type: 'disabled' },
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
    tipo?: "cartao" | "carrossel" | "lamina"
    /** Só para `lamina`: qual refazer, e de quantas. */
    indice?: number
    total?: number
    handle?: string
    hook?: string
    cta?: string
    proof?: string
    formato?: "post" | "reel"
    fundo?: string
    destaque?: string
    destaquePos?: 'esquerda' | 'centro' | 'direita'
    destaqueEscala?: number
    /** Já escritas. Vazio = a IA escreve. */
    textos?: string[]
    laminas?: number
    /**
     * As posições arrastadas no editor, em fracções de 0 a 1. Só entram na capa — é a única
     * lâmina com camadas para mover. Ver `SocialCardParams.posicoes`.
     */
    posicoes?: SocialCardParams["posicoes"]
  }

  const handle = (corpo.handle || "ricardogarciapt").replace(/^@/, "")
  const posicoes = corpo.posicoes && typeof corpo.posicoes === "object" ? corpo.posicoes : undefined

  /**
   * REFAZER UMA LÂMINA SÓ.
   *
   * Mudar uma palavra na terceira lâmina obrigava a gerar o carrossel inteiro outra vez — seis
   * renderizações e, pior, um fundo NOVO gerado pela IA, o que fazia a capa mudar por causa de
   * uma correcção no meio. Aqui refaz-se a que se mexeu e devolve-se só ela; quem chamou troca
   * o endereço na posição certa.
   */
  if (corpo.tipo === "lamina") {
    const { laminaElement, renderElemento } = await import("@/lib/social-card")
    const indice = Math.max(0, Number(corpo.indice) || 0)
    const total = Math.max(2, Number(corpo.total) || 2)
    const png = await renderElemento(
      laminaElement(
        {
          papel: indice === 0 ? "capa" : indice === total - 1 ? "fim" : "meio",
          texto: String(corpo.hook ?? ""),
          ...(indice === total - 1 && corpo.cta ? { cta: corpo.cta } : {}),
          ...(corpo.fundo ? { fundo: corpo.fundo } : {}),
          ...(corpo.destaque
            ? { destaque: corpo.destaque, destaquePos: corpo.destaquePos, destaqueEscala: corpo.destaqueEscala }
            : {}),
          // O editor arrastável refaz a capa com as posições novas, sem tocar nas outras.
          ...(indice === 0 && posicoes ? { posicoes } : {}),
        },
        indice,
        total,
        handle,
      ),
      1080,
      1350,
    )
    const url = await uploadBufferToBucket(png, "image/png", "estudio")
    return NextResponse.json({ ok: true, urls: [url], indice })
  }

  // ── Um cartão só ────────────────────────────────────────────────────────────────────────────
  if (corpo.tipo !== "carrossel") {
    const png = await renderSocialCardBuffer({
      hook: corpo.hook || "",
      cta: corpo.cta,
      handle,
      proof: corpo.proof || false,
      formato: corpo.formato === "reel" ? "reel" : "post",
      fundo: corpo.fundo,
      destaque: corpo.destaque,
      destaquePos: corpo.destaquePos,
      destaqueEscala: corpo.destaqueEscala,
      posicoes,
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
    // A capa leva as imagens; as lâminas do meio ficam com a tipografia sozinha, que é o que
    // as faz ler-se depressa ao deslizar.
    ...(i === 0 && corpo.fundo ? { fundo: corpo.fundo } : {}),
    ...(i === 0 && corpo.destaque
      ? { destaque: corpo.destaque, destaquePos: corpo.destaquePos, destaqueEscala: corpo.destaqueEscala }
      : {}),
    ...(i === 0 && posicoes ? { posicoes } : {}),
  }))

  const pngs = await renderCarrossel(laminas, handle)
  const urls: string[] = []
  for (const png of pngs) urls.push(await uploadBufferToBucket(png, "image/png", "estudio"))

  return NextResponse.json({ ok: true, urls, textos })
}
