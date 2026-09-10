import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { avaliarConta, ordenarClassificacao, type RegrasConta } from '@/lib/mtmfunded/regras'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * LEITURA DAS CONTAS E CLASSIFICAÇÃO — de 60 em 60 minutos.
 *
 * Lê a equity de cada conta viva, aplica as regras, e reordena. O que decide o desfecho de
 * uma conta é este ciclo: quem quebrou fica CONGELADO no instante em que quebrou e sai da
 * MetaApi. Congelar não é castigo — é o que faz a classificação mostrar onde a pessoa estava
 * quando quebrou, e não o que a conta fez a andar à deriva depois disso.
 *
 * Uma conta que não responde NÃO se dá por quebrada. Um timeout da MetaApi não é uma perda:
 * dar por quebrada uma conta viva por causa de uma leitura falhada é o erro caro deste
 * ficheiro, e por isso a leitura falhada apenas se regista e passa à frente.
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

interface Snapshot {
  equity: number
  saldo: number
}

/** Lê equity e saldo de uma conta MetaApi. `null` quando não responde — não é perda. */
async function lerConta(metaapiId: string): Promise<Snapshot | null> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return null
  try {
    const r = await fetch(
      `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${metaapiId}/account-information`,
      { headers: { 'auth-token': token }, cache: 'no-store', signal: AbortSignal.timeout(20_000) },
    )
    if (!r.ok) return null
    const d = (await r.json()) as { equity?: number; balance?: number }
    if (typeof d.equity !== 'number' || typeof d.balance !== 'number') return null
    return { equity: d.equity, saldo: d.balance }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  const db = getSupabaseAdmin()
  const notas: string[] = []
  let lidas = 0
  let quebradas = 0
  let semResposta = 0

  const { data: torneios } = await db
    .from('mtm_tournaments')
    .select('id, slug, regras, saldo_inicial, comeca_em')
    .in('estado', ['inscricoes', 'a_decorrer'])

  for (const torneio of torneios ?? []) {
    const regras = (torneio.regras ?? {}) as RegrasConta
    const { data: participantes } = await db
      .from('mtm_tournament_participants')
      .select('id, user_id, account_id, estado, metricas')
      .eq('tournament_id', torneio.id)
      .in('estado', ['inscrito', 'ativo'])

    if (!participantes?.length) continue

    const contas = new Map<string, Record<string, unknown>>()
    const ids = participantes.map((p) => p.account_id).filter(Boolean) as string[]
    if (ids.length) {
      const { data } = await db
        .from('mtm_trading_accounts')
        .select('id, metaapi_account_id, saldo_inicial, estado, metricas')
        .in('id', ids)
      for (const c of data ?? []) contas.set(c.id as string, c)
    }

    const linhas: Array<{
      participanteId: string
      accountId: string | null
      resultadoPct: number
      elegivel: boolean
      quebrou: boolean
      drawdownPct?: number
      veredicto: ReturnType<typeof avaliarConta> | null
    }> = []

    for (const p of participantes) {
      const conta = p.account_id ? contas.get(p.account_id) : null
      const metaapiId = conta?.metaapi_account_id as string | undefined

      // Sem conta emitida ainda: fica no fundo, sem resultado. Não é quebra.
      if (!conta || !metaapiId || conta.estado !== 'ativa') {
        linhas.push({
          participanteId: p.id, accountId: p.account_id, resultadoPct: 0,
          elegivel: false, quebrou: false, veredicto: null,
        })
        continue
      }

      const snap = await lerConta(metaapiId)
      if (!snap) {
        semResposta++
        // Mantém-se o que se sabia da última leitura. Uma leitura falhada não é uma perda.
        const m = (conta.metricas ?? {}) as Record<string, unknown>
        linhas.push({
          participanteId: p.id, accountId: p.account_id,
          resultadoPct: Number(m.resultadoPct ?? 0),
          elegivel: m.elegivel === true, quebrou: false,
          drawdownPct: typeof m.drawdownPct === 'number' ? m.drawdownPct : undefined,
          veredicto: null,
        })
        continue
      }
      lidas++

      const anterior = (conta.metricas ?? {}) as Record<string, unknown>
      const saldoInicial = Number(conta.saldo_inicial ?? torneio.saldo_inicial ?? 0)
      // Âncora do dia: o saldo com que o dia abriu. Sem histórico ainda, usa-se o de agora.
      const refDia = Number(anterior.saldoReferenciaDia ?? snap.saldo)
      const pico = Math.max(Number(anterior.picoEquity ?? saldoInicial), snap.equity)
      const drawdownPct = pico > 0 ? Math.round(((pico - snap.equity) / pico) * 10000) / 100 : 0

      const veredicto = avaliarConta(regras, {
        saldoInicial,
        equity: snap.equity,
        saldoReferenciaDia: refDia,
        lucroPorDia: (anterior.lucroPorDia ?? {}) as Record<string, number>,
        diasNegociados: Number(anterior.diasNegociados ?? 0),
        diasDecorridos: torneio.comeca_em
          ? Math.floor((Date.now() - new Date(torneio.comeca_em).getTime()) / 86_400_000)
          : undefined,
      })

      const metricas = {
        ...anterior,
        equity: snap.equity,
        saldo: snap.saldo,
        saldoReferenciaDia: refDia,
        picoEquity: pico,
        drawdownPct,
        resultadoPct: veredicto.resultadoPct,
        elegivel: veredicto.elegivel,
        naoElegivelPorque: veredicto.naoElegivelPorque ?? null,
        margemDiaria: veredicto.margemDiaria,
        margemTotal: veredicto.margemTotal,
        lidoEm: new Date().toISOString(),
      }

      if (veredicto.quebrou) {
        quebradas++
        /**
         * CONGELA e SAI. As métricas ficam como estão neste instante, e a conta é retirada da
         * MetaApi — deixar de a ler poupa as leituras e, mais importante, impede que a
         * classificação continue a mexer numa conta que já não está em prova.
         */
        await db.from('mtm_trading_accounts').update({
          estado: 'quebrada',
          quebrou_regra: veredicto.motivo,
          quebrada_em: new Date().toISOString(),
          metricas: { ...metricas, congeladoEm: new Date().toISOString(), motivo: veredicto.detalhe },
          metricas_lidas_em: new Date().toISOString(),
        }).eq('id', conta.id as string)

        await db.from('mtm_tournament_participants')
          .update({ estado: 'quebrado', resultado_pct: veredicto.resultadoPct, metricas, updated_at: new Date().toISOString() })
          .eq('id', p.id)

        try {
          const token = process.env.METAAPI_TOKEN
          if (token) {
            await fetch(
              `https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${metaapiId}/undeploy`,
              { method: 'POST', headers: { 'auth-token': token }, signal: AbortSignal.timeout(20_000) },
            )
          }
        } catch {
          // Sair da MetaApi é limpeza, não é a decisão. A conta já está marcada como quebrada.
          notas.push(`conta ${String(conta.id).slice(0, 8)}: quebrou mas ficou na MetaApi`)
        }

        linhas.push({
          participanteId: p.id, accountId: p.account_id,
          resultadoPct: veredicto.resultadoPct, elegivel: false, quebrou: true, drawdownPct,
          veredicto,
        })
        continue
      }

      await db.from('mtm_trading_accounts')
        .update({ metricas, metricas_lidas_em: new Date().toISOString() })
        .eq('id', conta.id as string)

      linhas.push({
        participanteId: p.id, accountId: p.account_id,
        resultadoPct: veredicto.resultadoPct, elegivel: veredicto.elegivel,
        quebrou: false, drawdownPct, veredicto,
      })
    }

    // Ordena e grava as posições. Uma escrita por participante: são dezenas, não milhares.
    const ordenadas = ordenarClassificacao(linhas)
    for (let i = 0; i < ordenadas.length; i++) {
      const l = ordenadas[i]
      const patch: Record<string, unknown> = {
        posicao: i + 1,
        resultado_pct: l.resultadoPct,
        updated_at: new Date().toISOString(),
      }
      if (l.veredicto && !l.quebrou) {
        patch.estado = 'ativo'
        patch.metricas = {
          elegivel: l.elegivel,
          naoElegivelPorque: l.veredicto.naoElegivelPorque ?? null,
          resultadoPct: l.resultadoPct,
          drawdownPct: l.drawdownPct ?? null,
          margemDiaria: l.veredicto.margemDiaria,
          margemTotal: l.veredicto.margemTotal,
        }
      }
      await db.from('mtm_tournament_participants').update(patch).eq('id', l.participanteId)
    }

    notas.push(`${torneio.slug}: ${ordenadas.length} participantes ordenados`)
  }

  return NextResponse.json({ ok: true, lidas, quebradas, semResposta, notas })
}
