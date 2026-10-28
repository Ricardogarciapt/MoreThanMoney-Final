import { NextRequest, NextResponse } from 'next/server'
import { getBybitInstrumentInfo, getBybitLastClosedPnl, getBybitPositions, getBybitWallet, placeBybitOrder, reduceBybitPosition, setBybitLeverage } from '@/lib/bybit'
import { inicioDaSessao } from '@/lib/cripto/papel'
import { equityBybitDoAgente, juntarPartes, parOcupadoNaMestre, tectosDaVercel, verificarPendente } from '@/lib/cripto/tectos'

/**
 * EXECUTOR REAL DOS PERPS DO AGENTE CRIPTO — na Vercel, na AURUM (mestre do Copy Trading).
 *
 * Escolha do Ricardo (28/10): operar na AURUM com a chave que já cá está (BYBIT_API_KEY), sem a
 * copiar para a VPS. Corre de minuto a minuto (vercel.json) em fra1, porque a Bybit bloqueia IPs
 * dos EUA. Só toca em dinheiro com DUAS chaves: `modo=real` no /admin/cripto E `CRIPTO_REAL=1` no
 * env da Vercel. Tectos do env (tectos.ts), nunca da Supabase.
 *
 * Modo mestre sempre: não entra em par onde a AURUM já tem posição (o Aurum, por sua vez, salta os
 * pares do agente em /api/bybit/place), fecha só a quantidade que abriu, mede-se pelo capital que
 * lhe foi atribuído e nunca levanta dinheiro: o lucro fica na AURUM. As memecoins (carteira
 * Solana via Jupiter/Pump.fun) são do executor da VPS (CRIPTO_SO_SPOT=1), que guarda a chave da
 * carteira; aqui só se recusa um pedido de spot que ninguém executou a tempo.
 */
export const runtime = 'edge'
export const preferredRegion = 'fra1'
export const dynamic = 'force-dynamic'

const VERSAO = 'cripto-executor-vercel-001'

interface Linha {
  id: string
  ativo: string
  mercado: 'perp' | 'spot'
  id_ativo: string
  lado: 'long' | 'short'
  nocional_usd: number
  alavancagem: number
  entrada: number
  sl: number
  tp: number
  estado: string
  fechar_pedido: string | null
  aberta_em: string
  execucao: Record<string, unknown>
}

const casas = (passo: number) => Math.max(0, -Math.floor(Math.log10(passo)))
const aoPasso = (x: number, passo: number) => (passo > 0 ? (Math.floor(x / passo) * passo).toFixed(casas(passo)) : String(x))
const aoTick = (x: number, tick: number) => (tick > 0 ? (Math.round(x / tick) * tick).toFixed(casas(tick)) : String(x))

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
  const db = getSupabaseAdmin()
  const tectos = tectosDaVercel(process.env)
  const agora = new Date()

  const { data: cfg } = await db.from('site_settings').select('value').eq('key', 'agente_cripto').maybeSingle()
  const v = (cfg?.value ?? {}) as { modo?: string; ligado?: boolean; horaFechoSessaoUtc?: number }
  const real = v.ligado === true && v.modo === 'real'
  if (!real) return NextResponse.json({ ok: true, real: false, porque: 'modo papel no /admin/cripto' })

  const { data: linhasRaw } = await db.from('cripto_posicoes').select('*').eq('modo', 'real').in('estado', ['pendente', 'aberta'])
  const linhas = (linhasRaw ?? []) as Linha[]
  const feito: string[] = []

  // Saldo do agente (capital atribuído + PnL realizado), de 4 em 4 min: a guarda do vigia só
  // dimensiona com um saldo com menos de 10 min.
  const { data: ultimo } = await db.from('cripto_saldos').select('em, detalhe').order('em', { ascending: false }).limit(1).maybeSingle()
  if (!ultimo || agora.getTime() - new Date(ultimo.em).getTime() > 4 * 60_000) {
    const [wallet, { data: perps }] = await Promise.all([
      getBybitWallet(),
      db.from('cripto_posicoes').select('estado, pnl_usd, nocional_usd, alavancagem').eq('modo', 'real').eq('mercado', 'perp').in('estado', ['aberta', 'fechada']),
    ])
    let pnl = 0
    let margem = 0
    for (const x of (perps ?? []) as { estado: string; pnl_usd: number | null; nocional_usd: number; alavancagem: number }[]) {
      if (x.estado === 'fechada') pnl += Number(x.pnl_usd) || 0
      else margem += Number(x.nocional_usd) / Math.max(1, Number(x.alavancagem) || 1)
    }
    const conta = wallet.equity != null ? { equity: wallet.equity, livre: wallet.available ?? 0 } : null
    const ag = equityBybitDoAgente(tectos, conta, pnl, margem)
    if (conta) {
      // A parte da carteira Solana vem da última linha do executor da VPS.
      const t = juntarPartes({ bybit: ag }, (ultimo?.detalhe as { partes?: unknown } | null)?.partes)
      await db.from('cripto_saldos').insert({
        equity_usd: Math.round(t.equity * 100) / 100, livre_usd: Math.round(t.livre * 100) / 100,
        detalhe: { partes: { solana: t.solana, bybit: t.bybit }, conta: 'AURUM (mestre)', capitalAtribuido: tectos.capitalBybitUsd, pnlRealizado: pnl, versao: VERSAO },
      })
      feito.push('saldo')
    }
  }

  // O lucro fica na AURUM: as sessões reais nunca enviam nada daqui.
  await db.from('cripto_sessoes').update({ varredura_estado: 'nada', varredura_usd: 0, porque: 'Lucro dos perps fica na AURUM (sem levantamentos).' })
    .eq('modo', 'real').eq('varredura_estado', 'pedida')

  if (!tectos.real) return NextResponse.json({ ok: true, real: false, porque: 'CRIPTO_REAL não está a 1 na Vercel', feito })

  const posicoes = await getBybitPositions()
  const naConta = (symbol: string) => (posicoes.ok ? posicoes.positions.find((p) => p.symbol === symbol)?.size ?? 0 : null)

  const { data: hoje } = await db.from('cripto_posicoes').select('pnl_usd').eq('modo', 'real').eq('estado', 'fechada')
    .gte('fechada_em', inicioDaSessao(agora, v.horaFechoSessaoUtc ?? 0).toISOString())
  const perdaHoje = Math.max(0, -(hoje ?? []).reduce((s: number, x: { pnl_usd: number }) => s + (Number(x.pnl_usd) || 0), 0))
  let exposicao = linhas.filter((p) => p.estado === 'aberta').reduce((s, p) => s + Number(p.nocional_usd), 0)

  const falhar = async (p: Linha, motivo: string) => {
    await db.from('cripto_posicoes').update({ estado: 'falhada', motivo_fecho: `executor: ${motivo}`, fechada_em: new Date().toISOString() }).eq('id', p.id)
    feito.push(`recusa ${p.ativo}: ${motivo}`)
  }

  for (const p of linhas.filter((x) => x.estado === 'pendente')) {
    if (p.mercado !== 'perp') {
      // Memecoins: são da VPS. Só se fecha o pedido se ficou velho sem ninguém lhe pegar.
      const idade = agora.getTime() - new Date(p.aberta_em).getTime()
      if (idade > tectos.pendenteMaxIdadeMs + 120_000 && !p.execucao?.reservadaEm) await falhar(p, 'A carteira Solana (VPS) não executou a tempo.')
      continue
    }
    const motivo = verificarPendente(p, tectos, { exposicaoAbertaUsd: exposicao, perdaHojeUsd: perdaHoje, agora })
    if (motivo) { await falhar(p, motivo); continue }
    const { data: reservada } = await db.from('cripto_posicoes').update({ execucao: { reservadaEm: agora.toISOString(), versao: VERSAO } })
      .eq('id', p.id).eq('estado', 'pendente').is('execucao->>reservadaEm', null).select('id')
    if (!reservada?.length) continue
    const ocupado = parOcupadoNaMestre(tectos, naConta(p.id_ativo))
    if (ocupado) { await falhar(p, ocupado); continue }
    const inst = await getBybitInstrumentInfo(p.id_ativo)
    if (!inst) { await falhar(p, 'Instrumento desconhecido na Bybit.'); continue }
    const qty = aoPasso(Number(p.nocional_usd) / Number(p.entrada), inst.qtyStep)
    if (!(Number(qty) >= inst.minOrderQty && Number(qty) > 0)) { await falhar(p, `Quantidade ${qty} abaixo do mínimo ${inst.minOrderQty}.`); continue }
    const lev = await setBybitLeverage(p.id_ativo, p.alavancagem)
    if (!lev.ok) { await falhar(p, `Alavancagem: ${lev.retMsg}`); continue }
    const r = await placeBybitOrder({
      symbol: p.id_ativo, side: p.lado === 'long' ? 'buy' : 'sell', qty: Number(qty), orderType: 'market',
      stopLoss: Number(aoTick(Number(p.sl), inst.tickSize)), takeProfit: Number(aoTick(Number(p.tp), inst.tickSize)),
    })
    if (!r.ok) { await falhar(p, `Bybit: ${r.retMsg}`); continue }
    const orderId = (r.result as { orderId?: string } | null)?.orderId ?? null
    const depois = await getBybitPositions()
    const pos = depois.positions.find((x) => x.symbol === p.id_ativo)
    await db.from('cripto_posicoes').update({ estado: 'aberta', entrada: pos?.avgPrice || p.entrada, execucao: { reservadaEm: agora.toISOString(), versao: VERSAO, bybitOrderId: orderId, qty } }).eq('id', p.id)
    exposicao += Number(p.nocional_usd)
    feito.push(`aberta ${p.ativo} ${p.lado} ${qty}`)
  }

  for (const p of linhas.filter((x) => x.estado === 'aberta' && x.mercado === 'perp')) {
    const tamanho = naConta(p.id_ativo)
    if (tamanho == null) continue
    const qtyAgente = Number(p.execucao?.qty) || 0
    if (p.fechar_pedido && tamanho > 0) {
      const qty = qtyAgente > 0 ? String(Math.min(qtyAgente, tamanho)) : String(tamanho)
      const r = await reduceBybitPosition(p.id_ativo, p.lado, qty)
      if (!r.ok) { feito.push(`fecho falhou ${p.ativo}: ${r.retMsg}`); continue }
    } else if (tamanho > 0) {
      continue
    }
    const f = await getBybitLastClosedPnl(p.id_ativo, Math.max(60_000, agora.getTime() - new Date(p.aberta_em).getTime() + 60_000))
    await db.from('cripto_posicoes').update({
      estado: 'fechada', motivo_fecho: p.fechar_pedido ?? 'exchange (SL/TP)', saida: f?.exit ?? null, pnl_usd: f?.pnl ?? null, fechada_em: new Date().toISOString(),
    }).eq('id', p.id).eq('estado', 'aberta')
    feito.push(`fechada ${p.ativo} ${f?.pnl ?? '?'}`)
  }

  return NextResponse.json({ ok: true, real: true, versao: VERSAO, feito })
}
