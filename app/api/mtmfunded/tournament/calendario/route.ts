import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getSiteUrl } from '@/lib/mail-transport'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

/**
 * O TORNEIO, para o calendário de quem se inscreve.
 *
 * Um email que diz «começa segunda» obriga a pessoa a ir escrever isso algures. A maioria não
 * escreve, e no dia esquece-se — sobretudo quando entre a inscrição e o arranque passam dias.
 *
 * Devolve DOIS acontecimentos, porque são duas coisas diferentes a lembrar:
 *
 * · O torneio, do arranque ao fim. Dia inteiro, porque é um período e não um compromisso a uma
 *   hora certa — marcá-lo com hora ocupava a agenda de Setembro a Dezembro.
 * · A véspera, que é quando as credenciais chegam. É o dia em que há mesmo alguma coisa a fazer:
 *   instalar o MetaTrader e entrar na conta antes de o relógio começar.
 *
 * Não é autenticado de propósito. Um ficheiro de calendário abre-se a partir do email, muitas
 * vezes noutro dispositivo onde a sessão não existe; exigir login aqui era garantir que metade
 * das pessoas carregava no link e via um ecrã de entrada. E não há aqui nada de pessoal — são as
 * datas públicas do torneio, iguais para toda a gente.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('t')?.trim()

  const db = getSupabaseAdmin()
  const { data: t } = await db
    .from('mtm_tournaments')
    .select('slug, nome, comeca_em, acaba_em, saldo_inicial, publicado')
    .eq(slug ? 'slug' : 'publicado', slug || true)
    .order('comeca_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!t || !t.publicado) {
    return NextResponse.json({ error: 'Torneio não encontrado' }, { status: 404 })
  }

  const site = getSiteUrl()
  const comeca = new Date(t.comeca_em as string)
  const acaba = new Date(t.acaba_em as string)
  const vespera = new Date(comeca.getTime() - 24 * 3600 * 1000)

  /** `20260915` — o formato de dia inteiro do iCalendar. */
  const dia = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  /** `20260914T230000Z` — instante, sempre em UTC. */
  const instante = (d: Date) => `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`

  // O DTEND de um evento de dia inteiro é EXCLUSIVO: para o último dia aparecer, soma-se um.
  const fim = new Date(acaba.getTime() + 24 * 3600 * 1000)

  /**
   * Linhas com mais de 75 octetos partem-se, com um espaço a abrir a continuação. Sem isto, o
   * Outlook trunca a descrição a meio da frase.
   */
  const dobrar = (linha: string): string => {
    const bytes = Buffer.from(linha, 'utf8')
    if (bytes.length <= 75) return linha
    const partes: string[] = []
    let i = 0
    while (i < bytes.length) {
      const fatia = bytes.subarray(i, i + (i === 0 ? 75 : 74))
      partes.push((i === 0 ? '' : ' ') + fatia.toString('utf8'))
      i += fatia.length
    }
    return partes.join('\r\n')
  }

  const escapar = (s: string) => s.replace(/\\/g, '\\\\').replace(/[;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n')
  const url = `${site}/mtmfunded/tradingtournament`

  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//More Than Money//MTM Funded//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',

    'BEGIN:VEVENT',
    `UID:torneio-${t.slug}@morethanmoney.pt`,
    `DTSTAMP:${instante(new Date())}`,
    `DTSTART;VALUE=DATE:${dia(comeca)}`,
    `DTEND;VALUE=DATE:${dia(fim)}`,
    dobrar(`SUMMARY:${escapar(t.nome as string)}`),
    dobrar(
      `DESCRIPTION:${escapar(
        `Conta simulada de ${Number(t.saldo_inicial).toLocaleString('pt-PT')} USD. ` +
          `A classificação é pública e actualiza de hora a hora.\n\nRegras e classificação: ${url}`,
      )}`,
    ),
    dobrar(`URL:${url}`),
    'TRANSP:TRANSPARENT',
    'END:VEVENT',

    'BEGIN:VEVENT',
    `UID:torneio-${t.slug}-credenciais@morethanmoney.pt`,
    `DTSTAMP:${instante(new Date())}`,
    `DTSTART;VALUE=DATE:${dia(vespera)}`,
    `DTEND;VALUE=DATE:${dia(comeca)}`,
    dobrar(`SUMMARY:${escapar(`Credenciais do ${t.nome}`)}`),
    dobrar(
      `DESCRIPTION:${escapar(
        'Hoje chegam por email o login, o servidor e o código QR da tua conta. ' +
          'Instala o MetaTrader 5 e entra na conta antes de o torneio começar.',
      )}`,
    ),
    dobrar(`URL:${site}/mtmfunded/tradingtournament/dashboard`),
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:As credenciais do torneio chegam hoje',
    'END:VALARM',
    'END:VEVENT',

    'END:VCALENDAR',
  ]

  return new NextResponse(linhas.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${t.slug}.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
