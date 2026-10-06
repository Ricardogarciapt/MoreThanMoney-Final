import { postFresco } from './radar-frescura'
export { postFresco, filtroFrescoPostgrest, RADAR_IDADE_MAX_DIAS } from './radar-frescura'
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

  /**
   * Português do Brasil ou de Portugal.
   *
   * Apareceu na primeira corrida real e não estava previsto: metade dos melhores prospetos eram
   * brasileiros ("pra começar", "você"). Não é motivo para excluir — há membros lá fora — mas o
   * funil está montado à volta da PU Prime e do depósito em euros, e um lead brasileiro encalha
   * no passo da corretora. Vale menos, não vale zero, e fica DITO para não se descobrir isso só
   * depois de escrever o comentário.
   */
  if (/\b(você|vocês|pra|tá|legal|galera|cara|grana|bora lá)\b/.test(t)) {
    p -= 18
    razoes.push("parece do Brasil — encalha na corretora")
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

      /**
       * DOIS baldes por hashtag: os recentes primeiro, os populares a seguir.
       *
       * O radar só lia `top_media` — o topo de uma hashtag é o que ACUMULOU gostos, e por isso
       * traz publicações de semanas ou meses. A lista estava cheia de posts com 60 dias, e não
       * era avaria: era a pergunta errada. Quem quer falar com alguém HOJE precisa de
       * `recent_media`, que devolve as últimas horas.
       *
       * Os populares ficam na mesma — servem para perceber o que a hashtag valoriza e apanham
       * contas grandes. Mas quem manda na lista do dia é o fresco.
       */
      const baldes: Array<{ edge: 'recent_media' | 'top_media'; origem: 'fresco' | 'popular' }> = [
        { edge: 'recent_media', origem: 'fresco' },
        { edge: 'top_media', origem: 'popular' },
      ]

      let houveErro = false
      let vistos = 0
      const pontuacoes: number[] = []
      for (const balde of baldes) {
      const r = await graph(
        // 12 e não 25: nas hashtags grandes a Meta recusa com "reduce the amount of data" — o
        // limite dela é sobre o VOLUME devolvido, e as legendas dos posts populares são longas.
        `${id}/${balde.edge}?user_id=${conta.id}&fields=id,caption,like_count,comments_count,permalink,timestamp&limit=12`,
        token,
      )
      if (r.error) {
        houveErro = true
        erros.push(`#${tag} (${balde.origem}): ${(r.error as { message?: string }).message ?? "erro"}`)
        /**
         * Marcar a tentativa MESMO tendo falhado.
         *
         * Sem isto uma hashtag que falha nunca escreve `ultima_procura`, fica eternamente à
         * cabeça da fila por ser "a que nunca foi procurada", e as duas ou três que falham comem
         * todas as passagens do dia. Foi exactamente o que aconteceu na primeira corrida real:
         * as mesmas duas hashtags à frente em três passagens seguidas.
         *
         * Pontuação negativa para ir para o fim da fila sem sair da lista — pode voltar a
         * funcionar amanhã, quando o post gigante que a entupiu deixar de estar no topo.
         */
        continue
      }

      const posts = (r.data as Array<Record<string, unknown>>) ?? []
      encontrados += posts.length
      vistos += posts.length

      for (const p of posts) {
        // Só conteúdo fresco: um post com mais de RADAR_IDADE_MAX_DIAS já não tem conversa a acontecer.
        // Sem data (a Meta nem sempre a devolve) só entra o balde dos recentes, que são das últimas horas.
        const publicadoEm = typeof p.timestamp === "string" ? p.timestamp : null
        if (!postFresco(publicadoEm, balde.origem)) continue
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
            origem: balde.origem,
            publicado_em: publicadoEm,
          },
          { onConflict: "media_id", ignoreDuplicates: true },
        )
        if (!error) guardados++
      }

      }

      /**
       * Marcar a tentativa MESMO tendo falhado.
       *
       * Sem isto uma hashtag que falha nunca escreve `ultima_procura`, fica eternamente à cabeça
       * da fila por ser "a que nunca foi procurada", e as duas ou três que falham comem todas as
       * passagens do dia. Pontuação negativa manda-a para o fim da fila sem a tirar da lista —
       * pode voltar a funcionar amanhã.
       */
      const media = pontuacoes.length ? pontuacoes.reduce((a, b) => a + b, 0) / pontuacoes.length : 0
      await db.from("ig_radar_hashtags").upsert(
        {
          hashtag: tag,
          hashtag_id: id,
          ultima_procura: new Date().toISOString(),
          encontrados: vistos,
          media_pontuacao: vistos ? Math.round(media) : (houveErro ? -20 : 0),
        },
        { onConflict: "hashtag" },
      )
    } catch (e) {
      erros.push(`#${tag}: ${e instanceof Error ? e.message : "erro"}`)
    }
  }

  return { hashtags: escolhidas, encontrados, guardados, erros }
}
