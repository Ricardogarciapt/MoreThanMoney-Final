import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getMtmcopyBotToken, MTMCOPY_BOT_USERNAME } from "@/lib/mtmcopy/telegram-bot"
import { CANONICAL_TELEGRAM_CHANNELS } from "@/lib/telegram-channel-ids"
import { escadaEmLinhas } from "@/lib/escada-precos"
import { MIN_DEPOSIT } from "@/lib/broker/deposito-minimo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * CONVERSÃO NO FOREX SWINGS — o grupo de entrada livre (decisão do dono, 27/10/2026).
 *
 * Um post por dia útil, a rodar entre três ângulos: os packs, a rota da corretora (educação
 * gratuita + grupos com o depósito validado) e os grupos fechados para quem já é membro. Os botões
 * levam ao bot, que faz o resto (funil, validação, «Entra aqui»).
 *
 * Estas mensagens NÃO vão para o chat da app: o espelho do `ideias-e-sinais` só deixa passar sinais,
 * seguimentos e charts (lib/telegram-espelho-filtro). Sem números de desempenho e sem promessas.
 */

const DISCLAIMER = "<i>Conteúdo educativo, não constitui consultoria financeira. Resultados não garantidos.</i>"

function grupoSwings(): string {
  const c = CANONICAL_TELEGRAM_CHANNELS.forexSwings
  for (const k of c.envVars) {
    const v = process.env[k]?.trim()
    if (v) return v
  }
  return c.chatId
}

function posts(bot: string): { texto: string; botoes: { text: string; url: string }[][] }[] {
  return [
    {
      texto:
        `🌊 <b>Gostas dos swings?</b> Isto é só a porta de entrada.\n\n` +
        `Na MTM tens mais estratégias, cada uma com o seu grupo, gestão e educação por trás:\n` +
        `${escadaEmLinhas()}\n\n` +
        `Escolhe o teu degrau e entra. 👇\n\n${DISCLAIMER}`,
      botoes: [
        [{ text: "👑 Ver os packs", url: "https://www.morethanmoney.pt/upgrade" }],
        [{ text: "💬 Falar com o assistente MTM", url: `https://t.me/${bot}?start=lead` }],
      ],
    },
    {
      texto:
        `🏦 <b>Sem mensalidade?</b> Também dá.\n\n` +
        `Abre conta na corretora parceira com o nosso link, deposita ≥ ${MIN_DEPOSIT}$ e valida no bot. ` +
        `Ficas com a educação gratuita, os nossos produtos e parceiros educativos, e entras nos grupos de sinais. ` +
        `O dinheiro fica sempre na TUA conta.\n\n${DISCLAIMER}`,
      botoes: [[{ text: "✅ Validar a minha conta", url: `https://t.me/${bot}?start=broker` }]],
    },
    {
      texto:
        `🔐 <b>Os outros grupos de sinais</b> (Premium, Sensei, GoldKiller, TrendShot, Ideias de Forex, Cripto) ` +
        `são para quem está connosco.\n\n` +
        `Já és membro? Escreve <code>/membro o-teu-email</code> ao bot e recebes os botões para entrar.\n` +
        `Ainda não? O bot mostra-te os dois caminhos. 👇\n\n${DISCLAIMER}`,
      botoes: [[{ text: "🚪 Entrar nos grupos", url: `https://t.me/${bot}?start=grupos` }]],
    },
  ]
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const token = getMtmcopyBotToken()
  if (!token) return NextResponse.json({ ok: false, error: "sem token do bot" })

  const db = getSupabaseAdmin()
  const hoje = new Date().toISOString().slice(0, 10)
  const CHAVE = "telegram_swings_conversao"
  const { data: feito } = await db.from("site_settings").select("value").eq("key", CHAVE).maybeSingle()
  if ((feito?.value as { dia?: string } | null)?.dia === hoje) return NextResponse.json({ ok: true, repetido: true })

  const lista = posts(MTMCOPY_BOT_USERNAME())
  const dia = Math.floor(Date.now() / 864e5)
  const post = lista[dia % lista.length]
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: grupoSwings(),
      text: post.texto,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: post.botoes },
    }),
  })
  const j = (await r.json().catch(() => null)) as { ok?: boolean; description?: string } | null
  if (j?.ok) await db.from("site_settings").upsert({ key: CHAVE, value: { dia: hoje } }, { onConflict: "key" })
  return NextResponse.json({ ok: j?.ok === true, angulo: dia % lista.length, erro: j?.description ?? null })
}
