import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getMtmcopyBotToken } from "@/lib/mtmcopy/telegram-bot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * CURADORIA DE CONTEÚDO IG → grupo de leads Telegram.
 * Puxa os posts recentes + stories (24h) das 2 contas IG, faz DEDUP por media.id,
 * um pré-filtro heurístico barato e depois um score LLM (0-1) de "utilidade para o
 * funil MTM". Só publica no grupo de leads o que for útil (score >= threshold) e
 * NUNCA repete (ig_curation_log). Desenho: docs de pesquisa 2026-07-21.
 *
 * Permissões do INSTAGRAM_TOKEN (Página): instagram_basic + pages_read_engagement
 * cobrem /media E /stories (stories NÃO precisam de instagram_manage_insights).
 */

const GRAPH = "https://graph.facebook.com/v21.0"
const THRESHOLD = Number(process.env.IG_CURATION_THRESHOLD ?? 0.65)
// Máx. de items novos avaliados pelo LLM por ciclo (evita timeout no 1º run/backlog;
// como corre de hora a hora, o backlog é apanhado em poucas horas). Regime estável = poucos/dia.
const MAX_SCORE_PER_RUN = Number(process.env.IG_CURATION_MAX_PER_RUN ?? 8)

const IG_ACCOUNTS = [
  // @morethanmoney.pt: System User token (nunca expira, negócio MoreThanMoney).
  { id: "17841474872672009", username: "morethanmoney.pt", tokenEnv: "INSTAGRAM_TOKEN" },
  // @ricardogarciapt: Página noutro negócio → token próprio (fallback ao INSTAGRAM_TOKEN).
  { id: "17841405656956716", username: "ricardogarciapt", tokenEnv: "INSTAGRAM_TOKEN_RICARDO" },
]

const CTA_DM = { text: "💬 Falar com o assistente MTM", url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || "MoreThanMoney_aibot"}?start=lead` }
const CTA_TRIAL = { text: "📲 Testar grátis", url: "https://www.morethanmoney.pt/register" }

// Pré-filtro heurístico (config barata; o LLM decide o resto).
const DISCARD_KW = /anivers[aá]rio|viagem|f[eé]rias|fam[ií]lia|jantar|almo[çc]o|gin[aá]sio|treino|futebol|praia|feliz natal|bom dia\b/i
const USEFUL_KW = /copytrad|copy\s*trad|mtm\s*copy|tap\s*to\s*trade|resultado|lucro|win\s*rate|backtest|prova|risco|an[aá]lise|xauusd|ouro|eurusd|sinal|setup|testemunh|aluno|membro|\bapp\b|premium|corretora|pu\s*prime|educa[çc][aã]o financeira|trading|invest|mercado|forex|desafio|c[oó]digo|desconto|founder|live|aula/i

interface IgItem {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp?: string
  like_count?: number
  comments_count?: number
}

async function fetchEdge(igId: string, edge: "media" | "stories", token: string): Promise<IgItem[]> {
  const fields =
    "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp" +
    (edge === "media" ? ",like_count,comments_count" : "")
  const limit = edge === "media" ? 25 : 50
  try {
    const r = await fetch(`${GRAPH}/${igId}/${edge}?fields=${fields}&limit=${limit}&access_token=${token}`)
    const j = (await r.json()) as { data?: IgItem[]; error?: { message?: string } }
    if (j.error) {
      console.warn(`[ig-curation] ${edge} ${igId} erro:`, j.error.message)
      return []
    }
    return j.data ?? []
  } catch (e) {
    console.warn(`[ig-curation] ${edge} ${igId} falhou:`, e)
    return []
  }
}

interface Score {
  score: number
  category: string
  publish: boolean
  reason: string
  suggested_caption: string
}

async function scoreWithLLM(item: IgItem, username: string): Promise<Score | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  const model =
    process.env.IG_CURATION_MODEL?.trim() ||
    process.env.IG_CLOSER_MODEL?.trim() ||
    "claude-haiku-4-5-20251001"

  const system = `És o curador de conteúdo da More Than Money (MTM), marca de educação financeira e copytrading. Recebes UM post/story de Instagram e decides se é ÚTIL para o funil de vendas de um grupo de Telegram de leads (pessoas interessadas em trading/copytrading/app MTM).

CONTA ÚTIL (score alto) se for uma destas categorias:
- proof: provas/resultados reais de trading (P&L, win rate, trades, prints)
- education: educação financeira/trading acionável (análise, risco, setups)
- testimonial: testemunho/feedback de aluno ou membro
- cta: chamada à ação de produto (copytrading, MTM Copy, Tap to Trade, app, Premium, registo corretora, comunidade, live/aula)
- offer: campanha, desconto, código de parceria, oferta com prazo

DESCARTA (score baixo) se for:
- personal: vida pessoal, família, viagens, lifestyle sem gancho de negócio
- offtopic: estético/fotografia pura, memes, política, religião, "bom dia" genérico, ou qualquer tema sem ligação a finanças/trading/produto MTM

Avalia sobretudo pela CAPTION. Se estiver vazia/ambígua e for IMAGE pessoal, assume personal (score baixo). Não inventes conteúdo que não esteja no texto. Nunca prometas lucros.

Devolve APENAS JSON válido, sem markdown:
{"score":<0.0-1.0>,"category":"proof|education|testimonial|cta|offer|personal|offtopic","publish":<true se score>=0.65>,"reason":"<1 frase PT>","suggested_caption":"<reescrita curta e vendedora p/ Telegram com 1 CTA; vazio se publish=false>"}`

  const user = `POST:
- conta: @${username}
- tipo: ${item.media_type ?? "?"} / ${item.media_product_type ?? "?"}
- engagement: ${item.like_count ?? 0} likes, ${item.comments_count ?? 0} comentários
- caption: """${(item.caption ?? "").slice(0, 1200)}"""`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 400, temperature: 0.1, system, messages: [{ role: "user", content: user }] }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const text: string = (data?.content || []).filter((p: { type?: string }) => p?.type === "text").map((p: { text?: string }) => p.text).join("").trim()
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const j = JSON.parse(m[0])
    return {
      score: Number(j.score) || 0,
      category: String(j.category ?? "offtopic"),
      publish: Boolean(j.publish) && Number(j.score) >= THRESHOLD,
      reason: String(j.reason ?? ""),
      suggested_caption: String(j.suggested_caption ?? ""),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function publishToLeads(token: string, chatId: string, item: IgItem, s: Score, username: string): Promise<string | null> {
  const photo = item.media_type === "VIDEO" ? item.thumbnail_url ?? item.media_url : item.media_url
  const caption = `${s.suggested_caption || (item.caption ?? "").slice(0, 500)}\n\n📸 @${username}`.slice(0, 1000)
  const buttons = [[{ text: "Ver no Instagram", url: item.permalink || `https://instagram.com/${username}` }], [CTA_DM, CTA_TRIAL]]
  try {
    if (photo) {
      const r = await fetch(`${GRAPH_TG(token)}/sendPhoto`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, photo, caption, parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) return String(j?.result?.message_id ?? "")
    }
    // Fallback texto (sem media_url ou falhou o sendPhoto)
    const r2 = await fetch(`${GRAPH_TG(token)}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: caption, parse_mode: "HTML", disable_web_page_preview: false, reply_markup: { inline_keyboard: buttons } }),
    })
    const j2 = await r2.json().catch(() => ({}))
    return r2.ok ? String(j2?.result?.message_id ?? "") : null
  } catch {
    return null
  }
}

function GRAPH_TG(token: string) {
  return `https://api.telegram.org/bot${token}`
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!process.env.INSTAGRAM_TOKEN?.trim() && !process.env.INSTAGRAM_TOKEN_RICARDO?.trim())
    return NextResponse.json({ ok: false, error: "INSTAGRAM_TOKEN em falta" })
  const botToken = getMtmcopyBotToken()
  if (!botToken) return NextResponse.json({ ok: false, error: "sem bot token" })

  const supabase = getSupabaseAdmin()
  const { data: row } = await supabase.from("site_settings").select("value").eq("key", "telegram_leads_group_id").maybeSingle()
  const chatId = (row?.value as { chat_id?: string } | null)?.chat_id
  if (!chatId) return NextResponse.json({ ok: false, error: "grupo de leads não configurado" })

  const stats = { seen: 0, dup: 0, heuristic_skip: 0, scored: 0, published: 0, low_score: 0 }

  for (const acc of IG_ACCOUNTS) {
    if (stats.scored >= MAX_SCORE_PER_RUN) break
    const token = process.env[acc.tokenEnv]?.trim() || process.env.INSTAGRAM_TOKEN?.trim()
    if (!token) continue
    const items = [...(await fetchEdge(acc.id, "media", token)), ...(await fetchEdge(acc.id, "stories", token))]
    for (const item of items) {
      stats.seen++
      // Dedup: já processado?
      const { data: existing } = await supabase.from("ig_curation_log").select("ig_media_id").eq("ig_media_id", item.id).maybeSingle()
      if (existing) { stats.dup++; continue }

      const cap = item.caption ?? ""
      // Pré-filtro heurístico: claramente pessoal e sem sinal útil → salta o LLM.
      if (DISCARD_KW.test(cap) && !USEFUL_KW.test(cap)) {
        await supabase.from("ig_curation_log").upsert(
          { ig_media_id: item.id, ig_account_id: acc.id, ig_username: acc.username, media_type: item.media_type, media_product_type: item.media_product_type, permalink: item.permalink, caption: cap.slice(0, 2000), llm_score: 0, llm_category: "personal", llm_reason: "pré-filtro heurístico (pessoal)", status: "skipped_low_score" },
          { onConflict: "ig_media_id", ignoreDuplicates: true },
        )
        stats.heuristic_skip++
        continue
      }

      if (stats.scored >= MAX_SCORE_PER_RUN) break // cap por ciclo (resto no próximo run)
      const s = await scoreWithLLM(item, acc.username)
      stats.scored++
      if (!s) continue // erro no LLM → não grava (tenta no próximo ciclo)

      let status = "skipped_low_score"
      let msgId: string | null = null
      if (s.publish) {
        msgId = await publishToLeads(botToken, chatId, item, s, acc.username)
        if (msgId !== null) { status = "published"; stats.published++ } else { status = "publish_failed" }
      } else {
        stats.low_score++
      }
      await supabase.from("ig_curation_log").upsert(
        { ig_media_id: item.id, ig_account_id: acc.id, ig_username: acc.username, media_type: item.media_type, media_product_type: item.media_product_type, permalink: item.permalink, caption: cap.slice(0, 2000), llm_score: s.score, llm_category: s.category, llm_reason: s.reason, status, telegram_msg_id: msgId },
        { onConflict: "ig_media_id", ignoreDuplicates: true },
      )
    }
  }

  return NextResponse.json({ ok: true, threshold: THRESHOLD, ...stats })
}
