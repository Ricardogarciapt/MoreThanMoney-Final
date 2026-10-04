/**
 * Relay Telegram → Telegram: republica as mensagens do MTMgold (MoreThanMoney
 * Premium Signals) num canal de parceiro, ESCONDENDO a marca no remetente/corpo e
 * assinando como "Alcy".
 *
 * - NÃO usa forwardMessage (mostraria "Encaminhado de …"). Envia mensagem nova.
 * - Sanitiza o texto: remove/substitui marca (MoreThanMoney, RicardoGarciaPT,
 *   @MTMgold, links do site) e acrescenta assinatura.
 * - Config em site_settings.telegram_relay_alcy (togglável sem redeploy).
 * - Dedup em telegram_relay_log (source_chat_id, source_message_id, target).
 *
 * O bot que publica é o `bot_token_env` da config (por defeito o aibot). Para o
 * remetente ler literalmente "Alcy", basta apontar bot_token_env a um bot chamado
 * "Alcy" — o código é agnóstico ao bot.
 */
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getMtmcopyBotToken } from "@/lib/mtmcopy/telegram-bot"

export type RelayConfig = {
  enabled: boolean
  source_chat_id: string
  target_chat_id: string
  signature: string
  /** Cabeçalho de marca do parceiro (ex.: "🟡 Wifi Money") prefixado a cada mensagem. */
  header: string
  bot_token_env: string
  relay_photos: boolean
  skip_new_position: boolean
}

const DEFAULTS: RelayConfig = {
  enabled: false,
  source_chat_id: "-1002424441843",
  target_chat_id: "-1004343748070",
  // Marca do parceiro SEM assinatura "— Alcy"/"— …". Até 2026-10-04 o default era a marca da
  // fonte de então ("Gold Did"); essa fonte saiu e o relay está desligado desde 20/08 — o default
  // passa a ser a marca da casa. A config viva (site_settings.telegram_relay_alcy) manda sempre.
  signature: "",
  header: "🏦 MTM Premium",
  bot_token_env: "TELEGRAM_WIFIMONEY_TOKEN",
  relay_photos: true,
  skip_new_position: false,
}

/** Aplica cabeçalho de marca + sanitização + assinatura. */
function brandForPartner(text: string | null | undefined, cfg: RelayConfig): string {
  // Marca usada nas substituições: assinatura, senão o texto do header (sem emojis), senão "MTM Premium".
  const brandWord = cfg.signature.trim() || cfg.header.replace(/[^\p{L}\p{N} ]+/gu, "").trim() || "MTM Premium"
  let body = sanitizeForAlcy(text, cfg.signature, brandWord)
  // Remove o cabeçalho de marca original (linha a começar por 🏦, ex.: "🏦 MTM Premium")
  // para não duplicar com o header do parceiro.
  if (cfg.header) body = body.replace(/^\s*🏦[^\n]*\n+/, "")
  return cfg.header ? `${cfg.header}\n\n${body}` : body
}

export async function getRelayConfig(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<RelayConfig> {
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "telegram_relay_alcy")
      .maybeSingle()
    const v = (data?.value ?? {}) as Partial<RelayConfig>
    return { ...DEFAULTS, ...v }
  } catch {
    return DEFAULTS
  }
}

/** Compara ids de chat do Telegram tolerando variantes (-100…, dígitos, @user). */
function chatMatches(a: unknown, b: string): boolean {
  const norm = (x: string) => x.replace(/^-100/, "").replace(/^@/, "").replace(/^-/, "").trim().toLowerCase()
  const A = String(a ?? "").trim()
  if (!A || !b) return false
  return A === b || norm(A) === norm(b)
}

/**
 * Esconde a marca e assina como o parceiro. Substitui menções à marca/autor por
 * "Alcy" e remove links que apontem de volta para a MTM.
 */
export function sanitizeForAlcy(input: string | null | undefined, signature: string, brandOverride?: string): string {
  let t = (input ?? "").trim()
  if (!t) return signature ? signature : ""

  // 1) Remover URLs que revelem a origem (site MTM, t.me/MTMgold, invite links).
  t = t.replace(/https?:\/\/(www\.)?morethanmoney\.pt\S*/gi, "")
  t = t.replace(/https?:\/\/t\.me\/(mtmgold|joinchat\/)\S*/gi, "")
  t = t.replace(/\bt\.me\/mtmgold\b/gi, "")

  // 2) Substituir menções à marca/autor pela marca do parceiro (case-insensitive).
  const brand = (brandOverride && brandOverride.trim()) || signature || "MTM Premium"
  const replacements: [RegExp, string][] = [
    [/more\s*than\s*money\s*premium\s*signals/gi, brand],
    [/more\s*than\s*money/gi, brand],
    [/morethanmoney(\.pt)?/gi, brand],
    [/ricardo\s*garcia\s*pt/gi, brand],
    [/@?ricardogarciapt/gi, brand],
    [/ricardo\s*garcia/gi, brand],
    [/@mtmgold\b/gi, brand],
    [/\bmtmgold\b/gi, brand],
    [/\bMTM\b/g, brand],
  ]
  for (const [re, to] of replacements) t = t.replace(re, to)

  // 3) Limpeza de espaços/linhas resultantes.
  t = t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()

  // 4) Assinatura do parceiro (evita duplicar se já terminar com ela).
  if (signature) {
    const endsWithSig = new RegExp(`${signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i").test(t)
    if (!endsWithSig) t = t ? `${t}\n\n— ${signature}` : `— ${signature}`
  }
  return t
}

async function sendMessageVia(token: string, chatId: string, text: string, replyToTarget?: number | null) {
  const body: Record<string, unknown> = { chat_id: chatId, text, disable_web_page_preview: true }
  if (replyToTarget) body.reply_parameters = { message_id: replyToTarget, allow_sending_without_reply: true }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { message_id?: number } }
  return { ok: !!data.ok, messageId: data.result?.message_id, error: data.description }
}

/** Descarrega a foto pelo bot de ingestão e reenvia pelo bot de relay (funciona cross-bot). */
async function sendPhotoVia(
  relayToken: string,
  ingestToken: string,
  chatId: string,
  fileId: string,
  caption: string,
  replyToTarget?: number | null,
) {
  // 1) Resolver caminho do ficheiro no bot que RECEBEU (file_id é válido nesse bot).
  const fileRes = await fetch(`https://api.telegram.org/bot${ingestToken}/getFile?file_id=${fileId}`)
  const fileData = (await fileRes.json().catch(() => ({}))) as { ok?: boolean; result?: { file_path?: string } }
  if (!fileData.ok || !fileData.result?.file_path) {
    // Fallback: tenta enviar por file_id direto (só funciona se relay=ingest bot).
    const body: Record<string, unknown> = { chat_id: chatId, photo: fileId, caption: caption || undefined }
    if (replyToTarget) body.reply_parameters = { message_id: replyToTarget, allow_sending_without_reply: true }
    const res = await fetch(`https://api.telegram.org/bot${relayToken}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { message_id?: number } }
    return { ok: !!d.ok, messageId: d.result?.message_id, error: d.description }
  }
  // 2) Descarregar bytes e reenviar por multipart no bot de relay.
  const bin = await fetch(`https://api.telegram.org/file/bot${ingestToken}/${fileData.result.file_path}`)
  const buf = Buffer.from(await bin.arrayBuffer())
  const form = new FormData()
  form.append("chat_id", chatId)
  if (caption) form.append("caption", caption)
  if (replyToTarget) form.append("reply_parameters", JSON.stringify({ message_id: replyToTarget, allow_sending_without_reply: true }))
  form.append("photo", new Blob([buf]), "chart.jpg")
  const res = await fetch(`https://api.telegram.org/bot${relayToken}/sendPhoto`, { method: "POST", body: form })
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { message_id?: number } }
  return { ok: !!d.ok, messageId: d.result?.message_id, error: d.description }
}

/**
 * Relay de TEXTO enviado PELO SITE (bot-posted) para o canal do parceiro. O webhook NÃO
 * entrega ao bot as suas próprias mensagens, por isso este caminho cobre tudo o que o
 * MoreThanMoney_bot publica na Premium (relay do Signal Master Elite, sinais Premium…). Best-effort.
 * `sourceChatId` opcional: se vier, só relaya quando for o canal-fonte configurado.
 */
export async function relayTextToWifi(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  text: string,
  sourceMessageId: number,
  sourceChatId?: string,
  replyToSourceId?: number | null,
): Promise<{ ok: boolean; skipped?: string; error?: string; messageId?: number }> {
  try {
    const cfg = await getRelayConfig(supabase)
    if (!cfg.enabled) return { ok: false, skipped: "disabled" }
    if (sourceChatId && !chatMatches(sourceChatId, cfg.source_chat_id)) return { ok: false, skipped: "not_source" }
    if (!text || !text.trim()) return { ok: false, skipped: "empty" }
    if (cfg.skip_new_position && text.trim().toUpperCase() === "NEW POSITION") return { ok: false, skipped: "new_position" }

    // Dedup por (source_chat_id, source_message_id, target).
    const { data: ins } = await supabase
      .from("telegram_relay_log")
      .insert({
        source_chat_id: cfg.source_chat_id,
        source_message_id: sourceMessageId,
        target_chat_id: cfg.target_chat_id,
        status: "pending",
      })
      .select("id")
      .maybeSingle()
    if (!ins) return { ok: false, skipped: "dup" }

    const relayToken = (process.env[cfg.bot_token_env]?.trim() || "").trim()
    if (!relayToken) {
      await supabase.from("telegram_relay_log").update({ status: "error", error: `token ${cfg.bot_token_env} em falta` }).eq("id", ins.id)
      return { ok: false, error: `token ${cfg.bot_token_env} em falta` }
    }
    // Encadeamento: se a mensagem-fonte é resposta a outra já relayada, responde à correspondente.
    let replyToTarget: number | null = null
    if (replyToSourceId) {
      const { data: parent } = await supabase
        .from("telegram_relay_log")
        .select("target_message_id")
        .eq("source_chat_id", cfg.source_chat_id)
        .eq("source_message_id", replyToSourceId)
        .eq("target_chat_id", cfg.target_chat_id)
        .eq("status", "sent")
        .maybeSingle()
      replyToTarget = parent?.target_message_id ?? null
    }
    const clean = brandForPartner(text, cfg)
    const result = await sendMessageVia(relayToken, cfg.target_chat_id, clean, replyToTarget)
    await supabase
      .from("telegram_relay_log")
      .update({ status: result.ok ? "sent" : "error", target_message_id: result.messageId ?? null, error: result.ok ? null : result.error ?? "falha" })
      .eq("id", ins.id)
    return { ok: result.ok, messageId: result.messageId, error: result.error }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Republica uma mensagem de canal (channel_post) do MTMgold no canal do parceiro,
 * com a marca escondida. Best-effort: nunca lança (não bloqueia o webhook).
 */
export async function relayPremiumMessage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  message: any,
): Promise<void> {
  try {
    const cfg = await getRelayConfig(supabase)
    if (!cfg.enabled) return
    if (!chatMatches(message?.chat?.id, cfg.source_chat_id)) return

    const text: string | null = message?.text ?? message?.caption ?? null
    const photo = Array.isArray(message?.photo) && message.photo.length > 0 ? message.photo[message.photo.length - 1] : null
    if (!text && !photo) return
    if (cfg.skip_new_position && text && text.trim().toUpperCase() === "NEW POSITION") return

    const sourceMessageId = Number(message?.message_id)
    if (!sourceMessageId) return

    // Dedup: insere primeiro; conflito no unique → já foi relayado.
    const { data: ins } = await supabase
      .from("telegram_relay_log")
      .insert({
        source_chat_id: cfg.source_chat_id,
        source_message_id: sourceMessageId,
        target_chat_id: cfg.target_chat_id,
        status: "pending",
      })
      .select("id")
      .maybeSingle()
    if (!ins) return // já existia

    // Token de ENVIO = bot configurado (WifiMoney). NUNCA cair para o aibot/marca —
    // se o token não estiver no runtime, não envia (senão vazava o nome da marca).
    // Encadeamento de respostas: se a mensagem do MTMgold é reply a outra, publica a versão
    // no destino como reply à versão correspondente (mesma cadeia sinal→follow-ups, igual ao Premium).
    let replyToTarget: number | null = null
    const replyToSource = Number(message?.reply_to_message?.message_id)
    if (replyToSource) {
      const { data: parent } = await supabase
        .from("telegram_relay_log")
        .select("target_message_id")
        .eq("source_chat_id", cfg.source_chat_id)
        .eq("source_message_id", replyToSource)
        .eq("target_chat_id", cfg.target_chat_id)
        .eq("status", "sent")
        .maybeSingle()
      replyToTarget = parent?.target_message_id ?? null
    }

    const relayToken = (process.env[cfg.bot_token_env]?.trim() || "").trim()
    const ingestToken = getMtmcopyBotToken() // só para DESCARREGAR fotos do MTMgold
    if (!relayToken) {
      await supabase
        .from("telegram_relay_log")
        .update({ status: "error", error: `token ${cfg.bot_token_env} em falta no runtime — não envio pela marca` })
        .eq("id", ins.id)
      return
    }

    const cleanCaption = brandForPartner(text, cfg)

    let result: { ok: boolean; messageId?: number; error?: string }
    if (photo && cfg.relay_photos) {
      result = await sendPhotoVia(relayToken, ingestToken, cfg.target_chat_id, photo.file_id, cleanCaption, replyToTarget)
    } else if (text) {
      result = await sendMessageVia(relayToken, cfg.target_chat_id, cleanCaption, replyToTarget)
    } else {
      // foto com relay_photos=false → nada a enviar
      await supabase.from("telegram_relay_log").update({ status: "skipped", error: "foto desativada" }).eq("id", ins.id)
      return
    }

    await supabase
      .from("telegram_relay_log")
      .update({
        status: result.ok ? "sent" : "error",
        target_message_id: result.messageId ?? null,
        error: result.ok ? null : result.error ?? "falha",
      })
      .eq("id", ins.id)
  } catch (e) {
    console.error("[telegram-relay] erro:", e instanceof Error ? e.message : e)
  }
}
