import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { generateDmReply, sendInstagramDmResilient, candidateTokensForIgAccount } from "@/lib/instagram/dm-closer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Webhook de MENSAGENS do Instagram — motor de DM SELF-HOSTED (1º nível).
 *
 * GET  → verificação do webhook Meta (hub.challenge).
 * POST → DM recebida → AI closer → resposta pela Graph API (dedup por mid em ig_dm_log).
 *
 * FAILSAFE: se `IG_DM_SELFHOSTED_ENABLED='false'`, não responde (deixa o ManyChat tratar).
 * O ManyChat continua ligado como rede de segurança.
 */

// ── GET: verificação do webhook (Meta) ───────────────────────────────────────
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")
  const verify = process.env.IG_WEBHOOK_VERIFY_TOKEN?.trim() || "mtm-ig-webhook-2026"
  if (mode === "subscribe" && token === verify) {
    return new NextResponse(challenge ?? "", { status: 200 })
  }
  return NextResponse.json({ error: "verify failed" }, { status: 403 })
}

type IgMessaging = {
  sender?: { id?: string }
  recipient?: { id?: string }
  timestamp?: number
  message?: { mid?: string; text?: string; is_echo?: boolean }
}

// ── POST: mensagens recebidas ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Responder 200 rápido é obrigatório; processamos e respondemos na mesma invocação (maxDuration 60).
  let body: {
    object?: string
    entry?: { id?: string; messaging?: IgMessaging[]; time?: number }[]
  } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  if (body.object !== "instagram" || !Array.isArray(body.entry)) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  // FAILSAFE: motor self-hosted desligado → não responde (ManyChat trata).
  if (process.env.IG_DM_SELFHOSTED_ENABLED === "false") {
    return NextResponse.json({ ok: true, selfhosted: false })
  }

  const supabase = getSupabaseAdmin()
  let handled = 0

  for (const entry of body.entry) {
    const accountId = entry.id || ""
    for (const m of entry.messaging ?? []) {
      const msg = m.message
      const senderId = m.sender?.id
      // Ignora echos (mensagens nossas), sem texto, ou sem remetente.
      if (!msg || msg.is_echo || !msg.text?.trim() || !senderId) continue
      const mid = msg.mid || `${senderId}-${m.timestamp ?? ""}`

      // Dedup + auditoria (resiliente: se a tabela ainda não existir, segue em frente).
      let alreadySeen = false
      try {
        const { data: ins } = await supabase
          .from("ig_dm_log")
          .insert({ mid, account_id: accountId, sender_id: senderId, message: msg.text, status: "received" })
          .select("id")
          .maybeSingle()
        alreadySeen = !ins // conflito no mid único → já tratado
      } catch {
        /* tabela em falta ou erro de BD → não bloqueia a resposta */
      }
      if (alreadySeen) continue

      if (candidateTokensForIgAccount(accountId).length === 0) {
        try {
          await supabase.from("ig_dm_log").update({ status: "error", error: "sem token IG" }).eq("mid", mid)
        } catch {}
        continue
      }

      try {
        const reply = await generateDmReply(msg.text)
        const sent = await sendInstagramDmResilient(accountId, senderId, reply)
        try {
          await supabase
            .from("ig_dm_log")
            .update({
              reply,
              status: sent.ok ? "replied" : "error",
              error: sent.ok ? null : sent.error,
            })
            .eq("mid", mid)
        } catch {}
        if (sent.ok) handled++
      } catch (e) {
        try {
          await supabase
            .from("ig_dm_log")
            .update({ status: "error", error: e instanceof Error ? e.message : "erro" })
            .eq("mid", mid)
        } catch {}
      }
    }
  }

  return NextResponse.json({ ok: true, handled })
}
