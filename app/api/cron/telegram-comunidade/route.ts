import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getMtmcopyBotToken, MTMCOPY_BOT_USERNAME } from "@/lib/mtmcopy/telegram-bot"
import { tradesGanhasRecentes } from "@/lib/pips-proof"
import { postsPossiveis } from "@/lib/telegram-leads-posts"
import {
  CHAVE_CONFIG,
  CONVITES_POR_RONDA,
  TAG_CONVIDADO,
  TAG_CONVITE_FALHOU,
  acharGrupoPeloTitulo,
  lerConfig,
  podeSerConvidado,
  postDaComunidade,
  slotDaHora,
  textoConvite,
  type LeadParaConvite,
} from "@/lib/telegram-comunidade"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * MTM CHAT — posts do dia e convites por DM (ver `lib/telegram-comunidade.ts`).
 * Corre às 09, 13 e 19 UTC. Cada parte só age com o seu interruptor ligado em
 * `site_settings.telegram_comunidade` (tudo false por omissão).
 */
async function tg(token: string, metodo: string, corpo: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  })
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string; error_code?: number; result?: unknown }
  return { ok: r.ok && j.ok !== false, status: r.status, ...j }
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = getSupabaseAdmin()
  const token = getMtmcopyBotToken()
  if (!token) return NextResponse.json({ ok: false, error: "sem bot token" })
  const bot = MTMCOPY_BOT_USERNAME()

  const { data: rows } = await db.from("site_settings").select("key, value").in("key", [CHAVE_CONFIG, "telegram_known_groups"])
  const bruto = (rows?.find((r) => r.key === CHAVE_CONFIG)?.value ?? {}) as Record<string, unknown>
  const cfg = lerConfig(bruto)
  const conhecidos = (rows?.find((r) => r.key === "telegram_known_groups")?.value ?? {}) as Record<string, { title?: string | null }>

  // O grupo pode mudar de id (grupo básico → supergrupo ao entrar na comunidade): segue o título.
  const chatId = acharGrupoPeloTitulo(conhecidos) ?? cfg.chat_id
  if (chatId && chatId !== cfg.chat_id) {
    await db.from("site_settings").upsert(
      { key: CHAVE_CONFIG, value: { ...bruto, chat_id: chatId }, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    )
  }
  if (!chatId) return NextResponse.json({ ok: false, error: "MTM Chat ainda não visto pelo bot" })

  const out: Record<string, unknown> = { chatId }

  // 1) Post do slot
  if (cfg.posts) {
    const dia = Math.floor(Date.now() / 864e5)
    const slot = slotDaHora(new Date().getUTCHours())
    let prova = null
    if (slot === 1) {
      const ganhas = await tradesGanhasRecentes(3).catch(() => [])
      prova = postsPossiveis({ bot, ganhas, certificados: null, membros: null }, dia).find((p) => p.tipo === "trade-ganha") ?? null
    }
    const post = postDaComunidade({ bot, prova }, dia, slot)
    const r = await tg(token, "sendMessage", {
      chat_id: chatId,
      text: post.texto,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: post.botoes },
    })
    out.post = { tipo: post.tipo, ok: r.ok, detail: r.description ?? null }
  }

  // 2) Convites por DM — só quem já falou com o bot em privado, uma vez por pessoa
  if (cfg.convites) {
    let link = cfg.convite
    if (!link) {
      const r = await tg(token, "createChatInviteLink", { chat_id: chatId, name: "convite DM bot" })
      link = (r.result as { invite_link?: string } | undefined)?.invite_link ?? null
      if (link) {
        await db.from("site_settings").upsert(
          { key: CHAVE_CONFIG, value: { ...bruto, chat_id: chatId, convite: link }, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        )
      }
    }
    if (!link) {
      out.convites = { ok: false, error: "sem link de convite (o bot precisa de «Convidar utilizadores»)" }
    } else {
      const [{ data: leads }, { data: membros }] = await Promise.all([
        db.from("telegram_leads").select("chat_id, source, message_count, stage, tags, first_name").limit(2000),
        db.from("telegram_grupo_membros").select("tg_user_id").eq("grupo_id", chatId).is("saiu_em", null),
      ])
      const jaNoGrupo = new Set((membros ?? []).map((m) => String(m.tg_user_id)))
      const alvo = ((leads ?? []) as LeadParaConvite[]).filter((l) => podeSerConvidado(l, jaNoGrupo)).slice(0, CONVITES_POR_RONDA)
      let enviados = 0
      let falhados = 0
      for (const l of alvo) {
        const r = await tg(token, "sendMessage", {
          chat_id: l.chat_id,
          text: textoConvite(l.first_name),
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "💬 Entrar no MTM Chat", url: link }]] },
        })
        const tag = r.ok ? TAG_CONVIDADO : TAG_CONVITE_FALHOU
        if (r.ok) enviados++
        else falhados++
        await db
          .from("telegram_leads")
          .update({ tags: Array.from(new Set([...(l.tags ?? []), tag])), updated_at: new Date().toISOString() })
          .eq("chat_id", l.chat_id)
        await new Promise((res) => setTimeout(res, 1200)) // longe dos limites do Telegram
      }
      out.convites = { ok: true, candidatos: alvo.length, enviados, falhados }
    }
  }

  return NextResponse.json({ ok: true, ...out })
}
