import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { IG_ACCOUNTS, tokenForAccount } from "./publish"

/**
 * Radar de leads — encontrar as conversas do nosso nicho que estão a acontecer agora.
 *
 * ── O que a API deixa, testado contra a conta real ────────────────────────────────────────────
 *   ✅ procurar hashtags e ler os posts com mais tração
 *   ✅ ler quem nos marca
 *   ❌ comentar em posts de terceiros · seguir · mandar DM a quem não nos falou
 *
 * Ou seja: isto ENCONTRA e ORDENA. Não fala com ninguém, e não é por falta de vontade — é o que
 * a API permite. Automatizar o comentar em posts alheios obrigava a conduzir a app como se fosse
 * uma pessoa, o que é contra as regras do Instagram; o que se ganhasse em leads perdia-se na
 * conta banida, e uma conta banida não tem funil nenhum.
 *
 * O trabalho que sobra para uma pessoa é o de comentar. O trabalho que desaparece é o de
 * PROCURAR — que é onde se perdem as horas.
 *
 * ── A quota, que decide o desenho todo ────────────────────────────────────────────────────────
 * O Instagram deixa procurar 30 hashtags DIFERENTES por conta em cada 7 dias. Não é por chamada:
 * é por hashtag distinta. Por isso o radar guarda o `hashtag_id` de cada uma (procurar de novo a
 * mesma não gasta nada) e roda por uma lista fixa, em vez de perguntar por tudo o que lhe apetece.
 */

const GRAPH = "https://graph.facebook.com/v21.0"

/**
 * As hashtags do nicho, por ordem de proximidade ao que vendemos.
 *
 * São 24 e não trinta: fica margem para experimentar sem gastar a quota da semana. Em português
 * primeiro porque é onde estão os nossos — uma hashtag em inglês traz mil posts e nenhum lead
 * que fale connosco.
 */
export const HASHTAGS = [
  "tradingportugal", "traderportugues", "forexportugal", "investirportugal",
  "bolsaportuguesa", "rendimentopassivoportugal", "liberdadefinanceirapt",
  "educacaofinanceirapt", "investimentospt", "traderpt", "criptoportugal",
  "mercadosfinanceiros", "analisetecnica", "tradingdiario", "copytrading",
  "sinaisdetrading", "ouroxauusd", "forextrader", "daytraderlife",
  "mentalidadedetrader", "disciplinanotrading", "gestaoderisco",
  "primeirosmilhoes", "rendimentoextra",
]

/** Palavras que denunciam quem está a VENDER e não a aprender. Um vendedor não é um lead. */
const CONCORRENCIA = [
  "sinais grátis", "grupo vip", "link na bio", "lucro garantido", "robô",
  "mentoria", "curso", "método infalível", "dobrar o capital", "gestão de contas",
]

/** Palavras de quem está a começar, com dúvidas, ou a perder dinheiro. Esses são leads. */
const DOR = [
  "comecei", "começar", "iniciante", "não percebo", "perdi", "queimei",
  "conta rebentada", "ajuda", "alguém sabe", "vale a pena", "como fazer",
  "aprender", "dúvida", "medo", "não consigo", "primeira vez",
]

export interface Prospeto {
  media_id: string
  hashtag: string
  permalink: string | null
  legenda: string
  gostos: number
  comentarios: number
  pontuacao: number
  porque: string
}

/**
 * Quanto vale a pena entrar nesta conversa.
 *
 * O que se procura NÃO é o post maior. Um post com cem mil gostos tem trezentos comentários e o
 * nosso passa despercebido; um post pequeno de alguém a dizer que rebentou a conta é uma pessoa a
 * pedir ajuda em voz alta. O primeiro é alcance, o segundo é um lead — e a escada só começa no
 * segundo.
 *
 * Por isso a conversa dá mais pontos do que os gostos, a dor dá mais do que a conversa, e a venda
 * tira tudo.
 */
export function pontuar(legenda: string, gostos: number, comentarios: number): { pontos: number; porque: string } {
  const t = legenda.toLowerCase()
  const razoes: string[] = []
  let p = 0

  const dor = DOR.filter((d) => t.includes(d))
  if (dor.length) {
    p += 40 * Math.min(dor.length, 2)
    razoes.push(`fala em dificuldade ("${dor[0]}")`)
  }

  // Conversa vale mais do que audiência: comentários são gente a falar, gostos são gente a passar.
  if (comentarios > 0) {
    p += Math.min(30, comentarios * 2)
    razoes.push(`${comentarios} comentários`)
  }
  if (gostos > 0) {
    p += Math.min(15, Math.log10(gostos + 1) * 6)
  }

  // Um post gigante é alcance, não conversa: o nosso comentário desaparece.
  if (gostos > 20000) {
    p -= 25
    razoes.push("grande demais para se ser visto")
  }

  const vendedor = CONCORRENCIA.filter((c) => t.includes(c))
  if (vendedor.length) {
    // Não é castigo, é exclusão: quem vende o mesmo não compra o nosso.
    p -= 60
    razoes.push(`parece concorrência ("${vendedor[0]}")`)
  }

  // Em português é onde estão os nossos.
  if (/\b(que|não|para|com|uma|isso|muito|obrigado)\b/.test(t)) {
    p += 12
    razoes.push("em português")
  }

  return { pontos: Math.round(p), porque: razoes.join(" · ") || "sem sinais claros" }
}

async function graph(caminho: string, token: string): Promise<Record<string, unknown>> {
  const r = await fetch(`${GRAPH}/${caminho}${caminho.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  })
  return (await r.json().catch(() => ({}))) as Record<string, unknown>
}

/**
 * Uma passagem do radar: procura ALGUMAS hashtags, não todas.
 *
 * Fatiado de propósito. Procurar as 24 de uma vez daria um jorro de cem prospetos às nove da
 * manhã e nada o resto do dia — e ninguém trata de cem de uma vez. Espalhado por oito horas, cada
 * passagem traz um punhado no momento em que os posts ainda são recentes e o comentário ainda
 * apanha a conversa viva.
 */
export async function correrRadar(quantasHashtags = 3): Promise<{
  hashtags: string[]
  encontrados: number
  guardados: number
  erros: string[]
}> {
  const db = getSupabaseAdmin()
  const erros: string[] = []

  // A conta pessoal tem o alcance; é a dela que se usa para procurar.
  const conta = IG_ACCOUNTS.find((a) => a.username === "ricardogarciapt") ?? IG_ACCOUNTS[0]
  const token = await tokenForAccount(conta.id)
  if (!token) return { hashtags: [], encontrados: 0, guardados: 0, erros: ["sem token"] }

  const { data: memoria } = await db.from("ig_radar_hashtags").select("*")
  const porNome = new Map((memoria ?? []).map((h) => [String(h.hashtag), h]))

  /**
   * Escolhe as próximas: primeiro as que nunca foram procuradas, depois as mais antigas — e as
   * que só trouxeram lixo ficam para o fim.
   */
  const ordenadas = [...HASHTAGS].sort((a, b) => {
    const ma = porNome.get(a)
    const mb = porNome.get(b)
    if (!ma?.ultima_procura) return -1
    if (!mb?.ultima_procura) return 1
    const qualidade = Number(mb.media_pontuacao ?? 0) - Number(ma.media_pontuacao ?? 0)
    if (Math.abs(qualidade) > 15) return qualidade
    return String(ma.ultima_procura).localeCompare(String(mb.ultima_procura))
  })

  const escolhidas = ordenadas.slice(0, quantasHashtags)
  let encontrados = 0
  let guardados = 0

  for (const tag of escolhidas) {
    try {
      // O id da hashtag é estável: guardá-lo evita gastar quota a perguntar sempre o mesmo.
      let id = porNome.get(tag)?.hashtag_id as string | undefined
      if (!id) {
        const busca = await graph(`ig_hashtag_search?user_id=${conta.id}&q=${encodeURIComponent(tag)}`, token)
        id = ((busca.data as Array<{ id?: string }>) ?? [])[0]?.id
        if (!id) {
          erros.push(`#${tag}: não existe`)
          continue
        }
      }

      const r = await graph(
        `${id}/top_media?user_id=${conta.id}&fields=id,caption,like_count,comments_count,permalink&limit=25`,
        token,
      )
      if (r.error) {
        erros.push(`#${tag}: ${(r.error as { message?: string }).message ?? "erro"}`)
        continue
      }

      const posts = (r.data as Array<Record<string, unknown>>) ?? []
      encontrados += posts.length
      const pontuacoes: number[] = []

      for (const p of posts) {
        const legenda = String(p.caption ?? "")
        const { pontos, porque } = pontuar(legenda, Number(p.like_count ?? 0), Number(p.comments_count ?? 0))
        pontuacoes.push(pontos)
        // Abaixo de 30 não vale o tempo de olhar. Guardar tudo enche a lista de ruído e a lista
        // deixa de ser lida — que é o mesmo que não a haver.
        if (pontos < 30) continue

        const { error } = await db.from("ig_radar_prospetos").upsert(
          {
            media_id: String(p.id),
            hashtag: tag,
            permalink: (p.permalink as string) ?? null,
            legenda: legenda.slice(0, 600),
            gostos: Number(p.like_count ?? 0),
            comentarios: Number(p.comments_count ?? 0),
            pontuacao: pontos,
            porque,
          },
          { onConflict: "media_id", ignoreDuplicates: true },
        )
        if (!error) guardados++
      }

      const media = pontuacoes.length ? pontuacoes.reduce((a, b) => a + b, 0) / pontuacoes.length : 0
      await db.from("ig_radar_hashtags").upsert(
        {
          hashtag: tag,
          hashtag_id: id,
          ultima_procura: new Date().toISOString(),
          encontrados: posts.length,
          media_pontuacao: Math.round(media),
        },
        { onConflict: "hashtag" },
      )
    } catch (e) {
      erros.push(`#${tag}: ${e instanceof Error ? e.message : "erro"}`)
    }
  }

  return { hashtags: escolhidas, encontrados, guardados, erros }
}
