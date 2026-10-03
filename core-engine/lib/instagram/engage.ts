/**
 * Engagement automático de Instagram — WARM/HOT only, inteligente.
 *
 * Responde com APREÇO a quem deixou comentários GENUÍNOS nos posts/reels do Ricardo/MTM,
 * priorizando os conteúdos com mais views (top-performers). NÃO faz cold outreach — só toca
 * em pessoas que já interagiram. Filtra spam (GIF/sticker/emoji-only/bait de giveaway) para
 * não responder a lixo. Usa o Graph API (mesmo token do motor de publicação). Dedup por
 * comment_id em `ig_engagement_log`.
 *
 * Consegue via API: media (posts+reels, paginado), insights (views/reach), comentários (texto),
 * responder a comentários. NÃO consegue: lista de quem deu like, comentar/seguir terceiros.
 */
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { IG_ACCOUNTS, tokenForAccount } from "./publish"

const GRAPH = "https://graph.facebook.com/v21.0"

// Config (env override).
const VIEWS_MIN = Number(process.env.IG_ENGAGE_VIEWS_MIN) || 2000
const MAX_MEDIA_PER_ACCOUNT = Number(process.env.IG_ENGAGE_MAX_MEDIA) || 60 // paginação total (abre o espetro)
const MAX_REPLIES_PER_POST = Number(process.env.IG_ENGAGE_MAX_PER_POST) || 12
const MAX_REPLIES_PER_ACCOUNT = Number(process.env.IG_ENGAGE_MAX_PER_ACCOUNT) || 40
const USE_LLM = process.env.IG_ENGAGE_LLM === "true" // resposta tailored por LLM (opt-in)

// Respostas de apreço — variadas por ramo de contexto. Voz da marca MTM, curtas, SEM links.
const T_PRAISE = [
  (h: string) => `Obrigado${h}! 🙏 É por comentários assim que vale a pena.`,
  (h: string) => `Grande${h} 🔥 obrigado pelo apoio!`,
  (h: string) => `Muito obrigado pelo carinho${h} ❤️`,
  (h: string) => `Top${h}! Fico contente que tenhas gostado 🙌`,
  (h: string) => `Gratidão pelo apoio${h} 🙏 juntos vamos longe.`,
]
const T_QUESTION = [
  (h: string) => `Boa pergunta${h}! 🙌 Manda-me DM que ajudo com todo o gosto.`,
  (h: string) => `Ótima questão${h} 🙏 chama-me na DM que explico melhor.`,
  (h: string) => `Adoro a curiosidade${h}! 🔥 DM que falamos disso.`,
]
const T_DEFAULT = [
  (h: string) => `É isso${h}! Bora crescer juntos 🚀`,
  (h: string) => `Obrigado por estares aqui${h} 🙌`,
  (h: string) => `Valeu${h}! Continua ligado que vem mais 💪`,
  (h: string) => `Agradeço demais${h} 🙏`,
]

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── Filtro anti-spam ─────────────────────────────────────────────────────────
const BAIT = [
  "último comentário", "ultimo comentario", "last comment", "último a comentar",
  "sorteio", "giveaway", "me marca", "marca-me", "marca me", "sigo de volta",
  "follow back", "sdv", "s4s", "sigam", "segue de volta", "link na bio para ganhar",
]
// Remove emojis/pontuação e devolve só letras/dígitos (para medir conteúdo real).
function alnum(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, "")
}
/** true = comentário GENUÍNO (texto real, não GIF/sticker/emoji-only/bait). */
function isGenuineComment(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return false // GIF/sticker/foto vêm sem texto
  const low = text.toLowerCase()
  if (BAIT.some((b) => low.includes(b))) return false
  const content = alnum(text)
  if (content.length < 3) return false // emoji-only / "." / etc.
  // Só menções/hashtags (sem substância)
  if (/^([@#]\w+\s*)+$/.test(text.trim())) return false
  return true
}

// ── Resposta ─────────────────────────────────────────────────────────────────
function templateReply(commentId: string, text: string, username: string | null): string {
  const seed = hashSeed(commentId)
  const handle = username && seed % 2 === 0 ? ` @${username}` : ""
  const isQuestion = text.includes("?")
  const praiseHit = /(obrigad|parab|top|gostei|adorei|excelente|incr[ií]vel|forte|melhor|sucesso|orgulho|inspir)/i.test(text)
  const pool = isQuestion ? T_QUESTION : praiseHit ? T_PRAISE : T_DEFAULT
  return pool[seed % pool.length](handle)
}

/** LLM opcional (Anthropic) — resposta curta, PT, apreço, sem links/promessas. Fallback → template. */
async function llmReply(commentText: string, caption: string, commentId: string, username: string | null): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return templateReply(commentId, commentText, username)
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 80,
        system:
          "És o Ricardo (MoreThanMoney), a responder a um comentário no teu Instagram. Escreve UMA resposta de APREÇO curtíssima (máx 12 palavras), em português de Portugal, calorosa, no máximo 1-2 emojis. NUNCA prometas lucros, NUNCA metas links, NUNCA vendas. Só agradecer/aquecer. Devolve só a frase.",
        messages: [{ role: "user", content: `Post: "${caption.slice(0, 120)}"\nComentário: "${commentText.slice(0, 200)}"\nResponde:` }],
      }),
    })
    const j = await r.json().catch(() => null)
    const txt = j?.content?.[0]?.text?.trim()
    if (txt && txt.length <= 200 && !/https?:\/\//i.test(txt)) return txt
  } catch {
    /* fallback */
  }
  return templateReply(commentId, commentText, username)
}

async function gget(pathAndQuery: string, token: string): Promise<{ ok: boolean; status: number; json: any }> {
  const sep = pathAndQuery.includes("?") ? "&" : "?"
  const r = await fetch(`${GRAPH}/${pathAndQuery}${sep}access_token=${encodeURIComponent(token)}`)
  const json = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, json }
}
async function gpost(path: string, params: Record<string, string>, token: string): Promise<{ ok: boolean; status: number; json: any }> {
  const body = new URLSearchParams({ ...params, access_token: token })
  const r = await fetch(`${GRAPH}/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body })
  const json = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, json }
}

// Views: 2026 a Meta tirou as views do insights de media individual → usa o campo `play_count`
// (e `ig_reels_aggregated_all_plays_count` quando existe) no próprio edge de media; insights fica fallback.
function viewsFromMedia(m: any): number | null {
  const v = m?.play_count ?? m?.ig_reels_aggregated_all_plays_count ?? m?.views
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null
}
async function fetchViewsFallback(mediaId: string, token: string): Promise<number | null> {
  for (const metric of ["reach", "plays"]) {
    const r = await gget(`${mediaId}/insights?metric=${metric}`, token)
    const val = r.json?.data?.[0]?.values?.[0]?.value
    if (r.ok && Number.isFinite(Number(val))) return Number(val)
  }
  return null
}

/**
 * Paginação total dos media (posts + reels). Abre o espetro além dos 15 dias. Pede `play_count`
 * (views 2026). NOTA sobre TRIAL REELS: são mostrados só a não-seguidores e a API da Meta só
 * documenta CRIÁ-los (trial_params); listar trial reels existentes + os seus comentários NÃO
 * está suportado de forma fiável — se o edge /media os devolver, são incluídos aqui; senão, só
 * via UI/Chrome. Não filtramos por product_type para apanhar o máximo.
 */
async function fetchAllMedia(igId: string, token: string, max: number): Promise<any[]> {
  const out: any[] = []
  let url = `${igId}/media?fields=id,caption,media_type,media_product_type,timestamp,comments_count,like_count,play_count,permalink&limit=25`
  for (let page = 0; page < 6 && out.length < max; page++) {
    const r = await gget(url, token)
    if (!r.ok) break
    out.push(...(r.json?.data ?? []))
    const next = r.json?.paging?.next
    if (!next) break
    url = next.replace(`${GRAPH}/`, "").replace(/&access_token=[^&]+/, "")
  }
  return out.slice(0, max)
}

interface AccountResult {
  account: string
  scannedPosts: number
  eligiblePosts: number
  replied: number
  skippedSpam: number
  skippedDup: number
  errors: string[]
}

async function engageAccount(acc: (typeof IG_ACCOUNTS)[number], ownUsernames: Set<string>): Promise<AccountResult> {
  const res: AccountResult = { account: acc.username, scannedPosts: 0, eligiblePosts: 0, replied: 0, skippedSpam: 0, skippedDup: 0, errors: [] }
  const token = await tokenForAccount(acc.id)
  if (!token) { res.errors.push(`sem token (${acc.tokenEnv})`); return res }
  const supabase = getSupabaseAdmin()

  const media = await fetchAllMedia(acc.id, token, MAX_MEDIA_PER_ACCOUNT)
  res.scannedPosts = media.length
  const withComments = media.filter((m: any) => (m.comments_count ?? 0) > 0)

  // Enriquecer com views + ordenar por engagement (top-performers primeiro → abre o espetro).
  const scored = await Promise.all(withComments.map(async (p) => ({ ...p, views: viewsFromMedia(p) ?? (await fetchViewsFallback(p.id, token)) })))
  scored.sort((a, b) => (b.views ?? b.comments_count * 100) - (a.views ?? a.comments_count * 100))
  res.eligiblePosts = scored.length

  for (const post of scored) {
    if (res.replied >= MAX_REPLIES_PER_ACCOUNT) break
    const comments = await gget(`${post.id}/comments?fields=id,text,username,timestamp&limit=50`, token)
    if (!comments.ok) { res.errors.push(`comments ${post.id}: ${comments.json?.error?.message ?? comments.status}`); continue }
    let perPost = 0
    for (const c of (comments.json?.data ?? [])) {
      if (res.replied >= MAX_REPLIES_PER_ACCOUNT || perPost >= MAX_REPLIES_PER_POST) break
      const commenter: string | null = c.username ?? null
      if (commenter && ownUsernames.has(commenter.toLowerCase())) continue // não responder a nós próprios
      if (!isGenuineComment(c.text)) { res.skippedSpam++; continue } // ignora GIF/emoji/bait

      // Dedup: só salta comentários JÁ respondidos com sucesso (erros são retentados no próximo run).
      const { data: existing } = await supabase.from("ig_engagement_log").select("comment_id").eq("comment_id", c.id).eq("status", "replied").maybeSingle()
      if (existing) { res.skippedDup++; continue }

      const reply = USE_LLM ? await llmReply(c.text, post.caption ?? "", c.id, commenter) : templateReply(c.id, c.text, commenter)
      const posted = await gpost(`${c.id}/replies`, { message: reply }, token)
      // upsert (não insert) — um erro anterior pode já ter deixado a linha (comment_id é PK).
      await supabase.from("ig_engagement_log").upsert({
        comment_id: c.id, media_id: post.id, ig_account_id: acc.id, ig_username: acc.username,
        commenter, reply_text: reply, reply_id: posted.json?.id ?? null, status: posted.ok ? "replied" : "error",
      }, { onConflict: "comment_id" })
      if (posted.ok) { res.replied++; perPost++ }
      else res.errors.push(`reply ${c.id}: ${posted.json?.error?.message ?? posted.status}`)
    }
  }
  return res
}

/** Engagement warm/hot inteligente para todas as contas. */
export async function runIgEngagement(): Promise<{ ok: boolean; accounts: AccountResult[] }> {
  const ownUsernames = new Set(IG_ACCOUNTS.map((a) => a.username.toLowerCase()))
  const accounts: AccountResult[] = []
  for (const acc of IG_ACCOUNTS) {
    try { accounts.push(await engageAccount(acc, ownUsernames)) }
    catch (e) { accounts.push({ account: acc.username, scannedPosts: 0, eligiblePosts: 0, replied: 0, skippedSpam: 0, skippedDup: 0, errors: [String(e).slice(0, 200)] }) }
  }
  return { ok: true, accounts }
}

/** Diagnóstico de SCOPES/capacidades do token (read-only, NÃO publica nada). */
export async function diagnoseIgAccess(): Promise<any> {
  const out: any[] = []
  for (const acc of IG_ACCOUNTS) {
    const token = await tokenForAccount(acc.id)
    if (!token) { out.push({ account: acc.username, hasToken: false }); continue }
    const media = await gget(`${acc.id}/media?fields=id,media_product_type,comments_count&limit=3`, token)
    const first = media.json?.data?.[0]
    const insights = first ? await gget(`${first.id}/insights?metric=reach`, token) : { ok: false, json: {} }
    const comments = first ? await gget(`${first.id}/comments?fields=id,text&limit=1`, token) : { ok: false, json: {} }
    // Scopes reais do token (debug_token) → ver se tem instagram_manage_messages (DM/private_replies).
    const dbg = await gget(`debug_token?input_token=${encodeURIComponent(token)}`, token)
    const scopes: string[] = (dbg.json?.data?.scopes ?? []) as string[]
    out.push({
      account: acc.username,
      hasToken: true,
      canReadMedia: media.ok,
      canReadInsights: insights.ok, // → instagram_manage_insights
      canReadComments: comments.ok, // → instagram_manage_comments (reply usa o mesmo scope)
      canDM: scopes.includes("instagram_manage_messages"), // → private_replies (setter)
      scopes,
      sampleMediaCount: (media.json?.data ?? []).length,
      errors: [media.ok ? null : media.json?.error?.message, insights.ok ? null : (insights as any).json?.error?.message, comments.ok ? null : (comments as any).json?.error?.message].filter(Boolean),
    })
  }
  return { accounts: out, note: "canReadInsights=instagram_manage_insights · canReadComments=instagram_manage_comments (reply usa o mesmo)" }
}
