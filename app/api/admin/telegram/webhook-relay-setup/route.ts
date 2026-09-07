import { NextRequest, NextResponse } from 'next/server'
import { getSiteOrigin } from '@/lib/site-url'

/**
 * Aponta o webhook de um bot secundário para `/api/telegram/webhook-relay`.
 *
 * Existe para o TOKEN nunca sair do servidor: quem chama isto não precisa de o ter nem de o ver.
 * `GET` diz onde o webhook está agora; `POST` regista-o.
 *
 * Protegido pelo CRON_SECRET, que é também o `secret_token` que o Telegram devolve em cada
 * update — assim o webhook só aceita quem lhe demos a chave.
 */

export const dynamic = 'force-dynamic'

const BOTS: Record<string, string> = {
  wifimoney: 'TELEGRAM_WIFIMONEY_TOKEN',
}

function autorizado(req: NextRequest): boolean {
  const s = process.env.CRON_SECRET
  return Boolean(s) && (req.headers.get('authorization') || '') === `Bearer ${s}`
}

function token(bot: string): string | null {
  const env = BOTS[bot]
  return env ? (process.env[env]?.trim() || null) : null
}

async function tg(tk: string, metodo: string, body?: Record<string, unknown>) {
  const r = await fetch(`https://api.telegram.org/bot${tk}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return r.json() as Promise<any>
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bot = req.nextUrl.searchParams.get('bot') ?? 'wifimoney'
  const tk = token(bot)
  if (!tk) return NextResponse.json({ error: `token de ${bot} não configurado` }, { status: 503 })

  const me = await tg(tk, 'getMe')
  const wh = await tg(tk, 'getWebhookInfo')
  return NextResponse.json({
    bot: me?.result?.username ?? null,
    webhook: wh?.result?.url || null,
    pendentes: wh?.result?.pending_update_count ?? null,
    ultimoErro: wh?.result?.last_error_message ?? null,
    // O que o Telegram acha que lhe pedimos — a fonte da verdade, não o que está no código.
    recebe: wh?.result?.allowed_updates ?? '(tudo menos chat_member)',
  })
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bot = req.nextUrl.searchParams.get('bot') ?? 'wifimoney'
  const tk = token(bot)
  if (!tk) return NextResponse.json({ error: `token de ${bot} não configurado` }, { status: 503 })

  const url = `${getSiteOrigin().replace(/\/$/, '')}/api/telegram/webhook-relay`
  const r = await tg(tk, 'setWebhook', {
    url,
    secret_token: process.env.CRON_SECRET,
    // `message_reaction` é o que permite descobrir um grupo com uma REAÇÃO em vez de uma
    // mensagem — num grupo de terceiros, escrever "teste" é escrever à frente de toda a gente.
    // O Telegram só entrega reações a quem as pede pelo nome, e só a bots administradores.
    // Duas formas de reação, e faltava uma: num GRUPO o Telegram manda `message_reaction`
    // (diz quem reagiu); num CANAL de difusão manda `message_reaction_count` (só a contagem,
    // porque lá ninguém é atribuído). Pedir só a primeira era não receber nada num canal — e
    // era exatamente isso que estava a acontecer.
    allowed_updates: [
      'message', 'channel_post', 'edited_message',
      'message_reaction', 'message_reaction_count',
    ],
    drop_pending_updates: true,
  })
  const wh = await tg(tk, 'getWebhookInfo')
  const me = await tg(tk, 'getMe')
  return NextResponse.json({
    ok: r?.ok === true,
    bot: me?.result?.username ?? null,
    apontado_a: wh?.result?.url || null,
    descricao: r?.description ?? null,
  })
}
