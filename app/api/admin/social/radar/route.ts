import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { correrRadar } from "@/lib/instagram/radar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** A lista do radar: as conversas por onde vale a pena entrar, por ordem. */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const db = getSupabaseAdmin()
  const [{ data: prospetos }, { data: hashtags }] = await Promise.all([
    db.from("ig_radar_prospetos").select("*").eq("estado", "pendente").order("pontuacao", { ascending: false }).limit(40),
    db.from("ig_radar_hashtags").select("hashtag, ultima_procura, encontrados, media_pontuacao").order("media_pontuacao", { ascending: false }),
  ])

  // Quantas hashtags diferentes se gastaram nos últimos 7 dias — é a quota que decide o ritmo.
  const limite = new Date(Date.now() - 7 * 86400_000).toISOString()
  const gastas = (hashtags ?? []).filter((h) => h.ultima_procura && String(h.ultima_procura) >= limite).length

  return NextResponse.json({
    ok: true,
    prospetos: prospetos ?? [],
    hashtags: hashtags ?? [],
    quota: { gastas, limite: 30 },
  })
}

/** Marcar um prospeto (já entrei / não serve), ou correr o radar agora. */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req)
  if (guard) return guard

  const corpo = (await req.json().catch(() => ({}))) as {
    id?: string
    estado?: string
    correr?: boolean
    comentar?: boolean
  }

  /**
   * Escreve o comentário para este post.
   *
   * O que NÃO se pode fazer, e não é opção nossa: a Graph API não deixa comentar em media de
   * terceiros. Não há endpoint. Fazê-lo por fora — conduzir a app como se fosse uma pessoa — é
   * contra as regras do Instagram, e o que se ganhava em leads perdia-se na conta banida.
   *
   * O que sobra, e é quase tudo: escrever o comentário. O trabalho não era carregar no botão
   * "publicar" — era olhar para o post, perceber o que a pessoa está a dizer, e encontrar a frase
   * que abre conversa sem parecer um anúncio. Isso faz-se aqui; colar é um segundo.
   */
  if (corpo.comentar && corpo.id) {
    const db = getSupabaseAdmin()
    const { data: p } = await db.from("ig_radar_prospetos").select("legenda, hashtag, porque").eq("id", corpo.id).maybeSingle()
    if (!p) return NextResponse.json({ ok: false, erro: "Prospeto desconhecido" }, { status: 404 })

    const key = process.env.ANTHROPIC_API_KEY?.trim()
    if (!key) return NextResponse.json({ ok: false, erro: "Sem chave da IA" }, { status: 400 })

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: process.env.CONTENT_DRAFT_MODEL?.trim() || "claude-sonnet-4-5",
          max_tokens: 200,
          system:
            "Escreves um comentário para deixar num post de Instagram de OUTRA pessoa, em nome do " +
            "Ricardo Garcia (MoreThanMoney, comunidade portuguesa de trading).\n\n" +
            "Regras, e são duras porque é o que separa um comentário de um anúncio:\n" +
            "· Uma a duas frases. Nunca mais.\n" +
            "· Reage ao que a pessoa DISSE. Se não conseguires citar a ideia dela, o comentário está errado.\n" +
            "· ZERO links, zero convites, zero menção à MoreThanMoney. Um comentário que vende é " +
            "spam, é apagado, e queima a conta para os próximos.\n" +
            "· Sem números de desempenho: não os tens.\n" +
            "· Português de Portugal, tratamento por tu, sem emojis a mais (no máximo um).\n" +
            "· Nada de 'ótimo post' nem 'concordo': isso não é conversa, é ruído.\n\n" +
            "O objectivo é uma pessoa ler e ter vontade de ver quem escreveu. Mais nada.",
          messages: [{ role: "user", content: `Post (#${p.hashtag}):\n${String(p.legenda).slice(0, 900)}` }],
        }),
        signal: AbortSignal.timeout(25_000),
      })
      const j = await r.json()
      const texto = ((j?.content ?? []) as { type: string; text?: string }[])
        .filter((x) => x.type === "text")
        .map((x) => x.text ?? "")
        .join("")
        .trim()
      if (!texto) return NextResponse.json({ ok: false, erro: "A IA não devolveu nada" }, { status: 502 })
      return NextResponse.json({ ok: true, comentario: texto })
    } catch (e) {
      return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 502 })
    }
  }

  if (corpo.correr) {
    return NextResponse.json({ ok: true, ...(await correrRadar(3)) })
  }

  if (!corpo.id || !corpo.estado) return NextResponse.json({ ok: false, erro: "Falta o prospeto" }, { status: 400 })
  await getSupabaseAdmin()
    .from("ig_radar_prospetos")
    .update({ estado: corpo.estado, visto_em: new Date().toISOString() })
    .eq("id", corpo.id)

  return NextResponse.json({ ok: true })
}
