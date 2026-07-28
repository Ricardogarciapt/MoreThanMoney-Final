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
  bot_token_env: string
  relay_photos: boolean
  skip_new_position: boolean
}

const DEFAULTS: RelayConfig = {
  enabled: false,
  source_chat_id: "-1002424441843",
  target_chat_id: "-1004343748070",
  signature: "Alcy",
  bot_token_env: "TELEGRAM_AIBOT_TOKEN",
  relay_photos: true,
  skip_new_position: false,
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
export function sanitizeForAlcy(input: string | null | undefined, signature: string): string {
  let t = (input ?? "").trim()
  if (!t) return signature ? signature : ""

  // 1) Remover URLs que revelem a origem (site MTM, t.me/MTMgold, invite links).
  t = t.replace(/https?:\/\/(www\.)?morethanmoney\.pt\S*/gi, "")
  t = t.replace(/https?:\/\/t\.me\/(mtmgold|joinchat\/)\S*/gi, "")
  t = t.replace(/\bt\.me\/mtmgold\b/gi, "")

  // 2) Substituir menções à marca/autor por "Alcy" (case-insensitive).
  const brand = signature || "Alcy"
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

async function sendMessageVia(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
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
) {
  // 1) Resolver caminho do ficheiro no bot que RECEBEU (file_id é válido nesse bot).
  const fileRes = await fetch(`https://api.telegram.org/bot${ingestToken}/getFile?file_id=${fileId}`)
  const fileData = (await fileRes.json().catch(() => ({}))) as { ok?: boolean; result?: { file_path?: string } }
  if (!fileData.ok || !fileData.result?.file_path) {
    // Fallback: tenta enviar por file_id direto (só funciona se relay=ingest bot).
    const res = await fetch(`https://api.telegram.org/bot${relayToken}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: fileId, caption: caption || undefined }),
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
  form.append("photo", new Blob([buf]), "chart.jpg")
  const res = await fetch(`https://api.telegram.org/bot${relayToken}/sendPhoto`, { method: "POST", body: form })
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { message_id?: number } }
  return { ok: !!d.ok, messageId: d.result?.message_id, error: d.description }
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

    const relayToken = (process.env[cfg.bot_token_env]?.trim() || getMtmcopyBotToken() || "").trim()
    const ingestToken = getMtmcopyBotToken()
    if (!relayToken) {
      await supabase.from("telegram_relay_log").update({ status: "error", error: "sem token de relay" }).eq("id", ins.id)
      return
    }

    const cleanCaption = sanitizeForAlcy(text, cfg.signature)

    let result: { ok: boolean; messageId?: number; error?: string }
    if (photo && cfg.relay_photos) {
      result = await sendPhotoVia(relayToken, ingestToken, cfg.target_chat_id, photo.file_id, cleanCaption)
    } else if (text) {
      result = await sendMessageVia(relayToken, cfg.target_chat_id, cleanCaption)
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
