import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import { avisoEmFalta } from '@/lib/member-activation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * VIGIA DO PORTÃO DE ACTIVAÇÃO — bloquear é legítimo, bloquear em silêncio não é.
 *
 * 2026-09-25: fomos ver quem estava bloqueado por activação pendente e encontrámos 48 pessoas,
 * todas desde 19/08, e NENHUMA com registo de ter sido avisada. Dezassete não tinham recebido
 * comunicação nenhuma — nem do bloqueio, nem do fim da subscrição. Só cinco voltaram a tentar
 * entrar em 30 dias; as outras 43 desapareceram sem saber porquê.
 *
 * O pior não foi o corte: foi ninguém ter dado por ele. Um membro bloqueado sem aviso é
 * indistinguível de um bug — e passaram cinco semanas até alguém reparar, por acaso, porque um
 * deles voltou a tentar entrar.
 *
 * Este cron torna isso impossível: conta quem está bloqueado sem aviso e avisa o admin. Não toca
 * em ninguém nem envia nada aos membros — a decisão de escrever, e o que escrever, é de quem manda.
 */
const ADMIN_CHAT = () => process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '1446687230'
/** Abaixo disto ainda pode ser uma campanha a meio de ser enviada. */
const HORAS_TOLERADAS = 24

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getSupabaseAdmin()
  try {
    const { data, error } = await db.from('profiles')
      .select('id, email, full_name, profile_data, is_active')
      .eq('is_active', false)
      .limit(2000)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    const semAviso: Array<{ email: string; horas: number }> = []
    for (const p of data ?? []) {
      const horas = avisoEmFalta(p)
      if (horas != null && horas >= HORAS_TOLERADAS) semAviso.push({ email: String(p.email ?? p.id), horas })
    }
    semAviso.sort((a, b) => b.horas - a.horas)

    if (!semAviso.length) return NextResponse.json({ ok: true, semAviso: 0 })

    const dias = (h: number) => Math.round(h / 24)
    const amostra = semAviso.slice(0, 10).map((x) => `· ${x.email} (há ${dias(x.horas)} d)`).join('\n')
    await sendTelegramChannelMessage(
      ADMIN_CHAT(),
      `⚠️ Activação: ${semAviso.length} membro(s) BLOQUEADO(S) sem nunca terem sido avisados.\n` +
        `O mais antigo está assim há ${dias(semAviso[0].horas)} dias.\n\n${amostra}` +
        (semAviso.length > 10 ? `\n… e mais ${semAviso.length - 10}.` : '') +
        `\n\nBloquear é uma decisão; bloquear em silêncio é uma pessoa a bater à porta sem resposta.`,
    ).catch(() => undefined)

    return NextResponse.json({ ok: true, semAviso: semAviso.length, maisAntigoDias: dias(semAviso[0].horas) })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'erro' }, { status: 500 })
  }
}
