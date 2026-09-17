import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * O EMAIL DA VÉSPERA — as credenciais do torneio, a toda a gente ao mesmo tempo.
 *
 * As contas são emitidas ao longo de semanas, uma a uma. Os emails saem todos no dia anterior
 * ao arranque: assim ninguém treina na conta do torneio antes dos outros, e a prova começa
 * igual para quem se inscreveu no primeiro dia e para quem se inscreveu no último.
 *
 * Corre uma vez por dia. É IDEMPOTENTE: marca cada conta como enviada, e uma segunda passagem
 * no mesmo dia não manda o email duas vezes a ninguém.
 */
function autorizado(request: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET
  if (!esperado) return false
  const dado =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ??
    request.nextUrl.searchParams.get('secret')
  const a = Buffer.from(String(dado ?? ''))
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]
  return d === 0
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  const db = getSupabaseAdmin()
  const agora = Date.now()

  // Torneios que começam nas próximas 48 horas. A janela é maior do que 24h de propósito: se
  // o cron falhar num dia, o do dia seguinte ainda apanha o torneio em vez de o deixar passar.
  const { data: torneios } = await db
    .from('mtm_tournaments')
    .select('id, nome, comeca_em, regras')
    .eq('publicado', true)
    .gte('comeca_em', new Date(agora).toISOString())
    .lte('comeca_em', new Date(agora + 48 * 3600 * 1000).toISOString())

  const resultado: Array<Record<string, unknown>> = []

  for (const t of torneios ?? []) {
    const { data: contas } = await db
      .from('mtm_trading_accounts')
      .select('id, user_id, mt5_login, servidor, saldo_inicial, alavancagem, qrcode_url, metricas')
      .eq('tournament_id', t.id)
      .eq('tipo', 'torneio')
      .eq('estado', 'ativa')
      .not('mt5_login', 'is', null)

    let enviados = 0
    let jaTinham = 0
    let falhados = 0

    for (const c of contas ?? []) {
      const m = (c.metricas ?? {}) as Record<string, unknown>
      // A marca do envio vive nas métricas da conta: uma coluna nova para isto seria uma
      // coluna a mais numa tabela que já tem muitas.
      if (m.emailVespera) { jaTinham++; continue }

      const { data: perfil } = c.user_id
        ? await db.from('profiles').select('full_name, email').eq('id', c.user_id).maybeSingle()
        : { data: null }
      const destino = perfil?.email as string | undefined
      if (!destino) { falhados++; continue }

      try {
        const { enviarEmailDaConta } = await import('@/lib/mtmfunded/email-conta')
        const { dadosDeEntrega } = await import('@/lib/mtmfunded/entrega-conta-dados')
        const { getSiteUrl } = await import('@/lib/mail-transport')
        const dados = await dadosDeEntrega(db, c.id as string)
        if (!dados) { falhados++; continue }
        const r = await enviarEmailDaConta({
          para: destino,
          nome: String(perfil?.full_name ?? '').split(/\s+/)[0] || destino.split('@')[0],
          conta: dados.conta,
          idioma: dados.idioma,
          login: c.mt5_login as string,
          servidor: (c.servidor as string) || 'TheTradingMaster-Live',
          alavancagem: Number(c.alavancagem ?? 100),
          urlPainel: `${getSiteUrl()}/mtmfunded/tradingtournament/dashboard?conta=${c.id}&credenciais=1`,
          regras: (t.regras ?? null) as Record<string, number | string> | null,
          qrMetaTrader: (c.qrcode_url as string) ?? null,
        })
        if (r.success) {
          enviados++
          // Marca-se DEPOIS de enviar: marcar antes e falhar o envio deixava o participante
          // sem credenciais e o sistema convencido de que as tinha mandado.
          await db
            .from('mtm_trading_accounts')
            .update({ metricas: { ...m, emailVespera: new Date().toISOString() } })
            .eq('id', c.id)
        } else {
          falhados++
        }
      } catch {
        falhados++
      }
    }

    resultado.push({ torneio: t.nome, comeca: t.comeca_em, enviados, jaTinham, falhados })
  }

  return NextResponse.json({ ok: true, torneios: resultado })
}
