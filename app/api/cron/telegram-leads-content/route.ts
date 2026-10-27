import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getMtmcopyBotToken } from "@/lib/mtmcopy/telegram-bot"
import { getWeeklyFlyerStats, fmtSigned, fmtPt } from "@/lib/mtm-flyer/weekly-stats"
import { tradesGanhasRecentes } from "@/lib/pips-proof"
import { postDoSlot, type DadosPosts } from "@/lib/telegram-leads-posts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Conteúdo automático no GRUPO DE LEADS — publica em horário posts que mostram
 * resultados reais + sistemas + prova, e puxam o lead para a app/grupos/DM.
 * Roda o ângulo por slot (trade ganha real, certificados, criar conta, corretora, dúvida, packs —
 * `lib/telegram-leads-posts.ts`). Só dados reais, sem taxas de acerto. NUNCA promete lucro.
 */

const BOT_USER = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || "MoreThanMoney_aibot"
const CTA_DM = { text: "💬 Falar com o assistente MTM", url: `https://t.me/${BOT_USER}?start=lead` }
const CTA_TRIAL = { text: "📲 Testar grátis", url: "https://www.morethanmoney.pt/register" }

/** Último post do Instagram @morethanmoney.pt via Graph API (se houver token). */
async function latestIgPost(): Promise<{ caption: string; permalink: string; media_url: string; is_video: boolean } | null> {
  const token = process.env.INSTAGRAM_TOKEN?.trim()
  if (!token) return null
  try {
    // Fluxo Instagram Login (graph.instagram.com) — o token do "Generate Instagram
    // Access Token" acede /me/media diretamente. Fallback: fluxo FB Page (graph.facebook).
    let m = await (
      await fetch(
        `https://graph.instagram.com/me/media?fields=caption,permalink,media_url,thumbnail_url,media_type&limit=1&access_token=${token}`,
      )
    ).json()
    if (m?.error) {
      let igId = process.env.INSTAGRAM_BUSINESS_ID?.trim()
      if (!igId) {
        const acc = await (
          await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account&access_token=${token}`)
        ).json()
        igId = acc?.data?.find((p: { instagram_business_account?: { id?: string } }) => p.instagram_business_account?.id)?.instagram_business_account?.id
      }
      if (!igId) return null
      m = await (
        await fetch(
          `https://graph.facebook.com/v21.0/${igId}/media?fields=caption,permalink,media_url,thumbnail_url,media_type&limit=1&access_token=${token}`,
        )
      ).json()
    }
    const p = m?.data?.[0]
    if (!p) return null
    return {
      caption: (p.caption ?? "").slice(0, 700),
      permalink: p.permalink,
      media_url: p.media_type === "VIDEO" ? p.thumbnail_url ?? p.media_url : p.media_url,
      is_video: p.media_type === "VIDEO",
    }
  } catch {
    return null
  }
}

/**
 * Os dados REAIS do dia para os posts: vencedoras recentes da conta-espelho, certificados emitidos
 * (só contagens) e o número público de membros. Cada leitura falha sozinha — um ângulo sem dados
 * sai da roda, os outros continuam.
 */
async function dadosDoDia(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<DadosPosts> {
  const [ganhas, certificados, membros] = await Promise.all([
    tradesGanhasRecentes(3).catch(() => []),
    (async () => {
      const desde = new Date(Date.now() - 30 * 864e5).toISOString()
      const [f, f30, a, a30, ultF, ultA] = await Promise.all([
        supabase.from("mtm_certificates").select("id", { count: "exact", head: true }),
        supabase.from("mtm_certificates").select("id", { count: "exact", head: true }).gte("emitido_em", desde),
        supabase.from("assessment_attempts").select("id", { count: "exact", head: true }).eq("passed", true),
        supabase.from("assessment_attempts").select("id", { count: "exact", head: true }).eq("passed", true).gte("created_at", desde),
        supabase.from("mtm_certificates").select("tipo, emitido_em").order("emitido_em", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("assessment_attempts").select("created_at").eq("passed", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
      const total = (f.count ?? 0) + (a.count ?? 0)
      if (!total) return null
      const uf = ultF.data as { tipo?: string; emitido_em?: string } | null
      const ua = ultA.data as { created_at?: string } | null
      const ultimo =
        uf?.emitido_em && (!ua?.created_at || uf.emitido_em > ua.created_at)
          ? { ultimoTipo: uf.tipo ?? null, ultimoEm: uf.emitido_em }
          : { ultimoTipo: ua?.created_at ? "avaliacao" : null, ultimoEm: ua?.created_at ?? null }
      return { total, ultimos30d: (f30.count ?? 0) + (a30.count ?? 0), ...ultimo }
    })().catch(() => null),
    (async () => {
      const { data } = await supabase.from("site_settings").select("value").eq("key", "membros_publicos").maybeSingle()
      const n = Number(data?.value)
      return Number.isFinite(n) && n > 0 ? n : null
    })().catch(() => null),
  ])
  return { bot: BOT_USER, ganhas, certificados, membros }
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  const token = getMtmcopyBotToken()
  if (!token) return NextResponse.json({ ok: false, error: "sem bot token" })

  const { data: row } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "telegram_leads_group_id")
    .maybeSingle()
  const chatId = (row?.value as { chat_id?: string } | null)?.chat_id
  if (!chatId) return NextResponse.json({ ok: false, error: "grupo de leads não configurado" })

  // SÁBADO: flyer "Resultados da Semana" (PT+EN) no funil — pedido Ricardo 2026-08-22.
  // Dedup por semana em site_settings para o slot das 18:00 não repetir o das 11:00.
  if (new Date().getUTCDay() === 6) {
    const stats = await getWeeklyFlyerStats(null)
    const stateKey = "weekly_flyer_leads_posted"
    const { data: st } = await supabase.from("site_settings").select("value").eq("key", stateKey).maybeSingle()
    if ((st?.value as { week?: string } | null)?.week !== stats.weekStart) {
      const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.morethanmoney.pt"
      const captions = {
        pt:
          `📊 <b>Resultados da semana ${stats.periodLabel}</b>\n\n` +
          `<b>${fmtSigned(stats.totalPips)} pips</b> em sinais fechados · ≈ <b>$${fmtPt(stats.minLotUsd)}</b> a lote mínimo (0.01/0.1)\n` +
          `🥇 Premium ${fmtSigned(stats.premium.netPips)} · 📡 Scanner ${fmtSigned(stats.scanner.pips)} · 🧠 Sensei ${fmtSigned(stats.sensei.pips)} · ⚔️ GoldKiller ${fmtSigned(stats.goldkiller.pips)}\n\n` +
          `Conteúdo educativo — resultados passados não garantem resultados futuros. Queres receber estes sinais? 👇`,
        en: `📊 <b>Weekly results ${stats.periodLabelEn}</b> — educational content; past results do not guarantee future results.`,
      }
      let sent = 0
      let detail: string | null = null
      for (const lang of ["pt", "en"] as const) {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            photo: `${site}/api/flyer/weekly?w=${stats.weekStart}&lang=${lang}`,
            caption: captions[lang],
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [[CTA_TRIAL], [CTA_DM]] },
          }),
        })
        const j = await r.json().catch(() => ({} as { description?: string }))
        if (r.ok) sent++
        else detail = j?.description ?? "sendPhoto falhou"
      }
      if (sent > 0) {
        await supabase.from("site_settings").upsert(
          {
            key: stateKey,
            value: { week: stats.weekStart, at: new Date().toISOString(), sent },
            description: "Última semana cujo flyer de resultados foi publicado no grupo de leads",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        )
      }
      return NextResponse.json({ ok: sent > 0, type: "weekly-flyer", sent, week: stats.weekStart, detail })
    }
  }

  // Fila de vídeos nativos (sendVideo) para o grupo de leads: site_settings.telegram_leads_video_queue
  // = { items: [{ video, legenda, botoes: [[texto, url]], apos }] }. Um vídeo por ronda, só depois de `apos`.
  {
    const qKey = "telegram_leads_video_queue"
    const { data: q } = await supabase.from("site_settings").select("value").eq("key", qKey).maybeSingle()
    type VideoItem = { video: string; legenda: string; botoes?: [string, string][]; apos?: string }
    const items = (q?.value as { items?: VideoItem[] } | null)?.items ?? []
    const next = items[0]
    if (next && (!next.apos || new Date(next.apos).getTime() <= Date.now())) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          video: next.video,
          caption: next.legenda,
          parse_mode: "HTML",
          supports_streaming: true,
          width: 1080,
          height: 1920,
          reply_markup: next.botoes?.length
            ? { inline_keyboard: next.botoes.map(([text, url]) => [{ text, url }]) }
            : undefined,
        }),
      })
      const j = await r.json().catch(() => ({} as { description?: string }))
      if (r.ok) {
        await supabase.from("site_settings").upsert(
          {
            key: qKey,
            value: { items: items.slice(1), ultimo: { video: next.video, at: new Date().toISOString() } },
            description: "Fila de vídeos nativos para o grupo de leads do Telegram",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        )
      }
      return NextResponse.json({ ok: r.ok, type: "video", video: next.video, detail: j?.description ?? null })
    }
  }

  // Roda o post pelo slot (dois por dia: 11:00 e 18:00 UTC), determinístico e sem repetir seguidos
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5)
  const slot = Math.floor(Date.now() / 864e5) * 2 + (new Date().getUTCHours() >= 15 ? 1 : 0)

  // Slot Instagram (1 em cada 4 dias, se houver token): último post do @morethanmoney.pt
  if (process.env.INSTAGRAM_TOKEN && dayOfYear % 4 === 3) {
    const ig = await latestIgPost()
    if (ig) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          photo: ig.media_url,
          caption: `📸 <b>Do nosso Instagram</b> @morethanmoney.pt\n\n${ig.caption}`.slice(0, 1000),
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "Ver no Instagram", url: ig.permalink }],
              [{ text: "📲 Testar grátis", url: "https://www.morethanmoney.pt/register" }],
            ],
          },
        }),
      })
      const j = await r.json().catch(() => ({}))
      return NextResponse.json({ ok: r.ok, posted: r.ok, type: "instagram", detail: j?.description ?? null })
    }
  }

  const post = postDoSlot(await dadosDoDia(supabase), slot)

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: post.texto,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: post.botoes },
    }),
  })
  const j = await res.json().catch(() => ({}))
  return NextResponse.json({ ok: res.ok, posted: res.ok, tipo: post.tipo, slot, detail: j?.description ?? null })
}
