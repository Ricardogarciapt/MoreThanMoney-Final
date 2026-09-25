import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import { correrDia } from '@/lib/backoffice-dia-motor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O MOTOR DO DIA — uma passagem por manhã, dias úteis.
 *
 * Ingere leads das fontes, mede as cadências pelo histórico, decide o que cada pessoa da equipa
 * tem de fazer hoje, escreve as tarefas no backoffice e manda a cada uma o seu resumo. Ver
 * `lib/backoffice-dia-motor.ts` para o porquê de cada passo.
 *
 * NASCE DESLIGADO, e isso não é timidez. Este motor cria trabalho para pessoas reais e escreve-lhes
 * ao princípio do dia. Ligar-se sozinho num deploy seria a pior forma possível de o apresentar à
 * equipa — alguém receberia às 7h da manhã uma lista que ninguém lhe explicou. Liga-se em
 * `site_settings.backoffice_motor_dia_ligado`, sem deploy.
 *
 * `?ensaio=1` mostra o que ACONTECERIA sem escrever nada nem avisar ninguém. É por aí que se
 * começa: vê-se o número de tarefas que sairia, confirma-se que faz sentido, e só depois se liga.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getSupabaseAdmin()
  const ensaio = req.nextUrl.searchParams.get('ensaio') === '1'

  // O interruptor não trava o ensaio: quem está a decidir se liga isto precisa justamente de ver
  // o que sairia, e ver não mexe em nada.
  if (!ensaio) {
    const { data } = await db
      .from('site_settings')
      .select('value')
      .eq('key', 'backoffice_motor_dia_ligado')
      .maybeSingle()
    const ligado = (data as { value?: unknown } | null)?.value === true
    if (!ligado) {
      const ensaioCego = await correrDia(db, { ensaio: true })
      return NextResponse.json({
        ok: true,
        ligado: false,
        nota: 'motor desligado — site_settings.backoffice_motor_dia_ligado',
        // Dizer quantas tarefas ESTARIAM à espera evita a armadilha de um motor desligado parecer
        // um motor sem trabalho. Se este número for alto e ninguém souber, o silêncio é caro.
        estariamPreparadas: ensaioCego.tarefasCriadas,
      })
    }
  }

  const r = await correrDia(db, {
    ensaio,
    avisar: ensaio
      ? undefined
      : async (chatId, texto) => {
          const envio = await sendTelegramChannelMessage(chatId, texto, { parseMode: 'HTML' })
          if (!envio.ok) throw new Error(envio.error || 'envio falhou')
        },
  })

  if (r.avisos.length) console.log('[backoffice-dia]', r.avisos.join(' · '))

  return NextResponse.json({ ok: true, ...r })
}
