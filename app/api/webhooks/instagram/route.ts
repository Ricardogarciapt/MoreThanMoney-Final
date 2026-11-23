import { NextRequest, NextResponse } from "next/server"
import { mensagensDoWebhook, responderMensagem } from "@/lib/social/dm-motor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Webhook de MENSAGENS do Instagram — motor de DM SELF-HOSTED (1º nível).
 *
 * GET  → verificação do webhook Meta (hub.challenge).
 * POST → DM recebida → AI closer → resposta pela Graph API (dedup por mid em ig_dm_log).
 *
 * INTERRUPTOR: se `IG_DM_SELFHOSTED_ENABLED='false'`, não responde — e desde 04/10/2026 não há
 * rede de segurança por trás (o ManyChat saiu). Desligar isto é deixar as DMs sem resposta.
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

// ── POST: mensagens recebidas (Instagram e, desde 22/11, Messenger das Páginas) ─────────────
export async function POST(request: NextRequest) {
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }
  // INTERRUPTOR: motor desligado → não responde (e ninguém responde por nós).
  if (process.env.IG_DM_SELFHOSTED_ENABLED === "false") {
    return NextResponse.json({ ok: true, selfhosted: false })
  }
  const mensagens = mensagensDoWebhook(body)
  if (!mensagens.length) return NextResponse.json({ ok: true, ignored: true })
  let handled = 0
  // O motor (lib/social/dm-motor.ts) faz dedup por mid, closer, envio, livro e áudio.
  for (const m of mensagens) {
    const r = await responderMensagem(m)
    if (r.resultado === "respondida") handled++
  }
  return NextResponse.json({ ok: true, handled })
}
