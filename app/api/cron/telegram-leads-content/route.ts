import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getMtmcopyBotToken } from "@/lib/mtmcopy/telegram-bot"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Conteúdo automático no GRUPO DE LEADS — publica em horário posts que mostram
 * resultados reais + sistemas + prova, e puxam o lead para a app/grupos/DM.
 * Roda o tipo de post por dia. Métricas reais (executado) + provas vetadas
 * (docs/mtm-sales-brain.md). NUNCA promete lucro.
 */

const BOT_USER = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || "MoreThanMoney_aibot"
const CTA_DM = { text: "💬 Falar com o assistente MTM", url: `https://t.me/${BOT_USER}?start=lead` }
const CTA_TRIAL = { text: "📲 Testar grátis", url: "https://www.morethanmoney.pt/register" }
const CTA_FOREX = { text: "💱 Grupo Forex", url: "https://t.me/+cVcMbCRt2rlmNzg0" }
const CTA_SENSEI = { text: "🧠 Grupo Sensei", url: "https://t.me/+mbqBggXniu5lNTBk" }

/** Win rate real das estratégias-mestre nos últimos 30d (fallback = prova vetada). */
async function recentWinRate(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<number | null> {
  try {
    const { data } = await supabase
      .from("trading_plan_trades")
      .select("pnl")
      .eq("trade_source", "strategy")
      .not("pnl", "is", null)
      .gte("opened_at", new Date(Date.now() - 30 * 864e5).toISOString())
      .limit(2000)
    if (!data || data.length < 20) return null
    const wins = data.filter((t) => Number(t.pnl) > 0).length
    return Math.round((wins / data.length) * 1000) / 10
  } catch {
    return null
  }
}

function buildPost(idx: number, winRate: number | null): { text: string; buttons: Array<{ text: string; url: string }>[] } {
  const wr = winRate ?? 63
  const posts = [
    {
      text:
        "📊 <b>Resultados reais da comunidade</b>\n\n" +
        `Prova documentada: <b>675 trades</b> · <b>63% win rate</b> · <b>+7.060€</b>.\n` +
        `Estratégias-mestre nos últimos 30 dias: <b>~${wr}% de acerto</b>.\n\n` +
        "Não prometemos lucro — mostramos <b>processo real</b>. Entra nos grupos e acompanha ao vivo. 👇",
      buttons: [[CTA_FOREX, CTA_SENSEI], [CTA_DM]],
    },
    {
      text:
        "🛰️ <b>O que tens dentro da MoreThanMoney</b>\n\n" +
        "• <b>Scanner</b> — as melhores oportunidades em tempo real\n" +
        "• <b>Trading Alerts</b> — entrada, SL e alvos em cada sinal\n" +
        "• <b>Tap to Trade</b> — copia com 1 toque · <b>MTM Copy</b> — automático\n\n" +
        "Testa tudo grátis 3 dias, sem cartão. 👇",
      buttons: [[CTA_TRIAL], [CTA_DM]],
    },
    {
      text:
        "💬 <b>Da nossa comunidade:</b>\n\n" +
        "<i>“O melhor resultado não é o saldo das contas… é o poder de saber proteger capital.”</i>\n\n" +
        "356 membros a aprender e a partilhar todos os dias. Queres sinais para copiar à mão, " +
        "Tap to Trade ou algo automático? Fala comigo e digo-te o melhor caminho. 👇",
      buttons: [[CTA_DM], [CTA_TRIAL]],
    },
  ]
  return posts[idx % posts.length]
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

  const wr = await recentWinRate(supabase)
  // Roda o post pelo dia do ano (determinístico, sem repetir seguidos)
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 864e5)
  const post = buildPost(dayOfYear, wr)

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: post.text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: post.buttons },
    }),
  })
  const j = await res.json().catch(() => ({}))
  return NextResponse.json({ ok: res.ok, posted: res.ok, day: dayOfYear, winRate: wr, detail: j?.description ?? null })
}
