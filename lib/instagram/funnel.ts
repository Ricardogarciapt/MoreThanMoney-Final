/**
 * Funil IG — PROSPECTOR + SETTER (comment → DM). Warm/hot only.
 *
 * PROSPECTOR: varre os comentários dos posts/reels e deteta INTENÇÃO por palavra-chave
 *   (as CTAs dos reels: MUNDO, EU VOU, DISCIPLINA, PREMIUM, SINAIS, APP...).
 * SETTER: tenta uma DM PRIVADA (Graph `private_replies`) com a oferta + link; se o scope de DM
 *   faltar (app sem `instagram_manage_messages`, ManyChat Essential), cai para RESPOSTA PÚBLICA
 *   QUE JÁ LEVA O LINK. Regista o lead em `ig_leads`.
 * CLOSER (modelo ESSENTIAL, sem ManyChat): o fecho NÃO é no IG — o link leva ao funil do Telegram
 *   (`MoreThanMoney_aibot?start=lead` → lead-funnel + broker-gate) ou ao `/register` (trial
 *   self-serve). Toda a conversa/close é nativa (Telegram/site), não precisa de ManyChat nem de
 *   webhook de mensagens do IG. (/api/manychat/closer fica só para quando o ManyChat existir.)
 */
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { IG_ACCOUNTS, isAutoPublishBlocked, tokenForAccount } from "./publish"

const GRAPH = "https://graph.facebook.com/v21.0"
const DAYS_BACK = Number(process.env.IG_FUNNEL_DAYS) || 7 // janela de private_reply = 7 dias
const MAX_MEDIA = Number(process.env.IG_FUNNEL_MAX_MEDIA) || 40
const MAX_DM_PER_ACCOUNT = Number(process.env.IG_FUNNEL_MAX_PER_ACCOUNT) || 30

const REGISTER = "https://www.morethanmoney.pt/register"
const TELEGRAM = "https://t.me/MoreThanMoney_aibot?start=lead"
const CRIADORES = "https://www.morethanmoney.pt/criadores"

interface Intent {
  key: string
  kw: string[]
  dm: (handle: string) => string
  pub: (handle: string) => string
}

// Ordem importa: copytrading primeiro (mais específico). Regra da marca: trial = 3 dias.
const INTENTS: Intent[] = [
  {
    key: "copytrading",
    kw: ["SINAIS", "SINAL", "COPY", "COPYTRADING", "COPIAR", "GRUPO", "GRUPOS"],
    dm: (h) => `Boa${h}! 🙌 Para os sinais + copytrading, fala com o nosso assistente aqui 👉 ${TELEGRAM} — ele guia-te a abrir conta e ter acesso. 🚀`,
    // Sem DM (app sem scope de mensagens): a resposta PÚBLICA leva já o link → o lead auto-serve-se.
    pub: (h) => `Boa${h}! 🔥 Sinais + copytrading é aqui no nosso Telegram 👉 ${TELEGRAM} (abre conta e tens acesso). 🚀`,
  },
  {
    // RECRUTAMENTO DE CRIADORES (carrossel «TRAZ O TEU CONTEÚDO. NÓS VENDEMOS POR TI.»).
    // Antes do 'trial' porque "QUERO CRIAR" deve cair aqui, não no trial. Filtro anti-vendedor:
    // a resposta PEDE 1 exemplo do conteúdo/portfólio ANTES de encaminhar para o Ricardo — quem só
    // quer fazer spam/vender cursos genéricos não passa esta porta. Qualificação fina no dm-closer.
    key: "educator",
    kw: ["CRIAR", "CRIADOR", "CRIADORA", "CRIADORES", "EDUCADOR", "EDUCADORA", "CREATE", "CREATOR", "EDUCATOR", "UGC"],
    dm: (h) =>
      `Boa${h}! 🙌 Que bom quereres criar com a MTM. Vê o modelo (ficas com 90–95%, 0€ de entrada) e candidata-te 👉 ${CRIADORES}. ` +
      `Para avançar, responde-me aqui com 1 exemplo do teu conteúdo (link do perfil/portfólio) + a tua área — se encaixar, o Ricardo (@ricardogarciapt) fala contigo em privado. 🚀`,
    pub: (h) =>
      `Boa${h}! 🔥 Candidaturas de criadores abertas 👉 ${CRIADORES}. ` +
      `Manda-nos DM com 1 exemplo do teu conteúdo + a tua área e o Ricardo (@ricardogarciapt) fala contigo. 🙌`,
  },
  {
    key: "trial",
    kw: ["MUNDO", "EU VOU", "EUVOU", "DISCIPLINA", "PREMIUM", "APP", "TRIAL", "GRÁTIS", "GRATIS", "QUERO", "COMEÇAR", "COMECAR", "BORA"],
    dm: (h) => `Boa${h}! 🙌 Começa GRÁTIS: 3 dias de Premium, sem cartão 👉 ${REGISTER} — qualquer dúvida diz-me aqui na DM que ajudo. 🚀`,
    pub: (h) => `Boa${h}! 🚀 Começa GRÁTIS 3 dias de Premium (sem cartão) 👉 ${REGISTER} — qualquer dúvida, comenta aqui que ajudo! 🙌`,
  },
]

function detectIntent(text: string): Intent | null {
  const up = (text || "").toUpperCase()
  for (const it of INTENTS) if (it.kw.some((k) => up.includes(k))) return it
  return null
}

async function gget(pathAndQuery: string, token: string) {
  const sep = pathAndQuery.includes("?") ? "&" : "?"
  const r = await fetch(`${GRAPH}/${pathAndQuery}${sep}access_token=${encodeURIComponent(token)}`)
  const json = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, json } as { ok: boolean; status: number; json: any }
}
async function gpost(path: string, params: Record<string, string>, token: string) {
  const body = new URLSearchParams({ ...params, access_token: token })
  const r = await fetch(`${GRAPH}/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body })
  const json = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, json } as { ok: boolean; status: number; json: any }
}

async function fetchMedia(igId: string, token: string): Promise<any[]> {
  const out: any[] = []
  let url = `${igId}/media?fields=id,caption,timestamp,comments_count,permalink&limit=25`
  for (let p = 0; p < 4 && out.length < MAX_MEDIA; p++) {
    const r = await gget(url, token)
    if (!r.ok) break
    out.push(...(r.json?.data ?? []))
    const next = r.json?.paging?.next
    if (!next) break
    url = next.replace(`${GRAPH}/`, "").replace(/&access_token=[^&]+/, "")
  }
  return out.slice(0, MAX_MEDIA)
}

interface AcctResult { account: string; leads: number; dmsSent: number; publicFallback: number; skippedDup: number; errors: string[] }

async function funnelAccount(acc: (typeof IG_ACCOUNTS)[number], own: Set<string>): Promise<AcctResult> {
  const res: AcctResult = { account: acc.username, leads: 0, dmsSent: 0, publicFallback: 0, skippedDup: 0, errors: [] }
  const token = await tokenForAccount(acc.id)
  if (!token) { res.errors.push(`sem token (${acc.tokenEnv})`); return res }
  const supabase = getSupabaseAdmin()
  const cutoff = Date.now() - DAYS_BACK * 86400000

  const media = (await fetchMedia(acc.id, token)).filter((m) => (m.comments_count ?? 0) > 0)
  for (const post of media) {
    if (res.leads >= MAX_DM_PER_ACCOUNT) break
    const comments = await gget(`${post.id}/comments?fields=id,text,username,timestamp&limit=50`, token)
    if (!comments.ok) { res.errors.push(`comments ${post.id}: ${comments.json?.error?.message ?? comments.status}`); continue }
    for (const c of (comments.json?.data ?? [])) {
      if (res.leads >= MAX_DM_PER_ACCOUNT) break
      const commenter: string | null = c.username ?? null
      if (commenter && own.has(commenter.toLowerCase())) continue
      // PROSPECTOR: deteta intenção em TODO o conteúdo (sem cortar por data — nada se perde).
      const intent = detectIntent(c.text)
      if (!intent) continue

      const { data: existing } = await supabase.from("ig_leads").select("comment_id").eq("comment_id", c.id).maybeSingle()
      if (existing) { res.skippedDup++; continue }
      res.leads++

      const handle = commenter ? ` @${commenter}` : ""
      const dmText = intent.dm(commenter ? ` ${commenter.split(" ")[0]}` : "")
      // SETTER: DM só dentro da janela de 7 dias (regra Meta). Fora → loga como window_expired
      // (segues à mão). Dentro → private_reply; se falhar (scope), resposta pública sem link.
      const withinWindow = !c.timestamp || new Date(c.timestamp).getTime() >= cutoff
      let dm_status = "window_expired"
      let dm_error: string | null = null
      if (withinWindow) {
        const dm = await gpost(`${c.id}/private_replies`, { message: dmText }, token)
        if (dm.ok) { dm_status = "sent"; res.dmsSent++ }
        else {
          dm_status = "public_fallback"
          dm_error = String(dm.json?.error?.message ?? dm.status).slice(0, 200)
          if (isAutoPublishBlocked(acc.id)) {
            // Conta pessoal: fica registado como lead para seguir à mão, sem escrever nada lá.
            dm_status = "window_expired"
          } else {
            const pub = await gpost(`${c.id}/replies`, { message: intent.pub(handle) }, token)
            if (pub.ok) res.publicFallback++
            else { dm_status = "error"; res.errors.push(`${intent.key} ${c.id}: dm(${dm_error}) pub(${pub.json?.error?.message ?? pub.status})`) }
          }
        }
      }
      await supabase.from("ig_leads").upsert({
        comment_id: c.id, media_id: post.id, ig_account_id: acc.id, ig_username: acc.username,
        commenter, keyword: intent.kw.find((k) => (c.text || "").toUpperCase().includes(k)) ?? intent.key,
        intent: intent.key, comment_text: (c.text || "").slice(0, 500),
        dm_status, dm_text: dmText, dm_error,
      }, { onConflict: "comment_id" })
    }
  }
  return res
}

/** Corre o funil (prospector + setter) para todas as contas. */
export async function runIgFunnel(): Promise<{ ok: boolean; accounts: AcctResult[] }> {
  // O funil lê os comentários das duas contas mas só ESCREVE na da marca: quando a DM falha,
  // a alternativa é uma resposta pública no post — e essa resposta apareceria no Instagram
  // pessoal do Ricardo, assinada por um cron. Ver isAutoPublishBlocked em ./publish.
  const own = new Set(IG_ACCOUNTS.map((a) => a.username.toLowerCase()))
  const accounts: AcctResult[] = []
  for (const acc of IG_ACCOUNTS) {
    try { accounts.push(await funnelAccount(acc, own)) }
    catch (e) { accounts.push({ account: acc.username, leads: 0, dmsSent: 0, publicFallback: 0, skippedDup: 0, errors: [String(e).slice(0, 200)] }) }
  }
  return { ok: true, accounts }
}
