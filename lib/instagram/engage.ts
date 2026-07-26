/**
 * Engagement automático de Instagram — WARM/HOT only.
 *
 * Responde com APREÇO a quem comentou nos posts do Ricardo/MTM dos últimos 15 dias,
 * priorizando os conteúdos com mais views (≥2k). NÃO faz cold outreach: só toca em
 * pessoas que JÁ interagiram (comentaram) com os teus próprios posts. Usa o Graph API
 * (mesmo token do motor de publicação). Dedup por comment_id em `ig_engagement_log`.
 *
 * Limitações da API (assumidas): dá para responder a comentários nos NOSSOS posts;
 * NÃO dá para listar quem só deu like nem comentar no perfil de terceiros (isso é UI/Chrome).
 */
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { IG_ACCOUNTS, tokenForAccount } from "./publish"

const GRAPH = "https://graph.facebook.com/v21.0"

// Config (env override). Caps conservadores para não parecer spam / não ser flagged.
const VIEWS_MIN = Number(process.env.IG_ENGAGE_VIEWS_MIN) || 2000
const DAYS_BACK = Number(process.env.IG_ENGAGE_DAYS) || 15
const MAX_MEDIA_PER_ACCOUNT = Number(process.env.IG_ENGAGE_MAX_MEDIA) || 20
const MAX_REPLIES_PER_POST = Number(process.env.IG_ENGAGE_MAX_PER_POST) || 15
const MAX_REPLIES_PER_ACCOUNT = Number(process.env.IG_ENGAGE_MAX_PER_ACCOUNT) || 40

// Respostas de apreço — variadas (evita padrão repetido que a IG pode marcar como spam),
// voz da marca MTM, curtas, SEM links (o fecho de venda é feito nas DMs pelo closer).
const TEMPLATES: ((h: string) => string)[] = [
  (h) => `Obrigado${h}! 🙏 É por comentários assim que vale a pena.`,
  (h) => `Grande${h} 🔥 obrigado pelo apoio!`,
  (h) => `Agradeço demais${h} 🙌`,
  (h) => `É isso${h}! Bora crescer juntos 🚀`,
  (h) => `Muito obrigado pelo carinho${h} ❤️`,
  (h) => `Fico contente que tenhas gostado${h}! 🙏`,
  (h) => `Valeu${h}! Continua ligado que vem mais 💪`,
  (h) => `Top${h}! Obrigado por estares aqui 🙌`,
  (h) => `Obrigado pelo feedback${h} 🔥 significa muito.`,
  (h) => `Gratidão pelo apoio${h} 🙏 juntos vamos longe.`,
]

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Resposta variada. Metade das vezes menciona o @handle (calor), metade não (natural). */
function buildReply(commentId: string, username: string | null): string {
  const seed = hashSeed(commentId)
  const tpl = TEMPLATES[seed % TEMPLATES.length]
  const tagIt = username && seed % 2 === 0
  return tpl(tagIt ? ` @${username}` : "")
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

/** Views do media (métrica unificada 'views'; fallback 'reach'; senão null). Tolerante a erros. */
async function fetchViews(mediaId: string, token: string): Promise<number | null> {
  for (const metric of ["views", "reach"]) {
    const r = await gget(`${mediaId}/insights?metric=${metric}`, token)
    const val = r.json?.data?.[0]?.values?.[0]?.value
    if (r.ok && Number.isFinite(Number(val))) return Number(val)
  }
  return null
}

interface AccountResult {
  account: string
  eligiblePosts: number
  replied: number
  skipped: number
  errors: string[]
}

/** Corre o engagement para UMA conta IG. */
async function engageAccount(acc: (typeof IG_ACCOUNTS)[number], ownUsernames: Set<string>): Promise<AccountResult> {
  const res: AccountResult = { account: acc.username, eligiblePosts: 0, replied: 0, skipped: 0, errors: [] }
  const token = tokenForAccount(acc.id)
  if (!token) {
    res.errors.push(`sem token (${acc.tokenEnv})`)
    return res
  }
  const supabase = getSupabaseAdmin()
  const sinceUnix = Math.floor((Date.now() - DAYS_BACK * 86400000) / 1000)

  // 1) Media dos últimos N dias.
  const media = await gget(
    `${acc.id}/media?fields=id,caption,media_type,media_product_type,timestamp,comments_count,like_count,permalink&since=${sinceUnix}&limit=${MAX_MEDIA_PER_ACCOUNT}`,
    token,
  )
  if (!media.ok) {
    res.errors.push(`media: ${media.json?.error?.message ?? media.status}`)
    return res
  }
  const posts: any[] = (media.json?.data ?? []).filter((m: any) => (m.comments_count ?? 0) > 0)

  // 2) Enriquecer com views + ordenar por engagement (views desc; sem views vai por comments_count).
  const scored = await Promise.all(
    posts.map(async (p) => ({ ...p, views: await fetchViews(p.id, token) })),
  )
  scored.sort((a, b) => (b.views ?? b.comments_count * 100) - (a.views ?? a.comments_count * 100))

  // 3) Elegíveis: views ≥ 2k (preferência do Ricardo), ou views desconhecidas com ≥3 comentários.
  const eligible = scored.filter((p) => (p.views != null ? p.views >= VIEWS_MIN : (p.comments_count ?? 0) >= 3))
  res.eligiblePosts = eligible.length

  // 4) Responder a comentários novos (warm), com caps.
  for (const post of eligible) {
    if (res.replied >= MAX_REPLIES_PER_ACCOUNT) break
    const comments = await gget(`${post.id}/comments?fields=id,text,username,timestamp&limit=50`, token)
    if (!comments.ok) {
      res.errors.push(`comments ${post.id}: ${comments.json?.error?.message ?? comments.status}`)
      continue
    }
    const list: any[] = comments.json?.data ?? []
    let perPost = 0
    for (const c of list) {
      if (res.replied >= MAX_REPLIES_PER_ACCOUNT || perPost >= MAX_REPLIES_PER_POST) break
      const commenter: string | null = c.username ?? null
      // Nunca responder aos nossos próprios comentários/respostas.
      if (commenter && ownUsernames.has(commenter.toLowerCase())) continue
      // Dedup: já respondido?
      const { data: existing } = await supabase
        .from("ig_engagement_log")
        .select("comment_id")
        .eq("comment_id", c.id)
        .maybeSingle()
      if (existing) { res.skipped++; continue }

      const reply = buildReply(c.id, commenter)
      const posted = await gpost(`${c.id}/replies`, { message: reply }, token)
      const replyId = posted.json?.id ?? null
      await supabase.from("ig_engagement_log").insert({
        comment_id: c.id,
        media_id: post.id,
        ig_account_id: acc.id,
        ig_username: acc.username,
        commenter,
        reply_text: reply,
        reply_id: replyId,
        status: posted.ok ? "replied" : "error",
      })
      if (posted.ok) { res.replied++; perPost++ }
      else res.errors.push(`reply ${c.id}: ${posted.json?.error?.message ?? posted.status}`)
    }
  }
  return res
}

/** Corre o engagement warm/hot para todas as contas IG. */
export async function runIgEngagement(): Promise<{ ok: boolean; accounts: AccountResult[] }> {
  const ownUsernames = new Set(IG_ACCOUNTS.map((a) => a.username.toLowerCase()))
  const accounts: AccountResult[] = []
  for (const acc of IG_ACCOUNTS) {
    try {
      accounts.push(await engageAccount(acc, ownUsernames))
    } catch (e) {
      accounts.push({ account: acc.username, eligiblePosts: 0, replied: 0, skipped: 0, errors: [String(e).slice(0, 200)] })
    }
  }
  return { ok: true, accounts }
}
