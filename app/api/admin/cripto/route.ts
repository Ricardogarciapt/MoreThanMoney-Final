import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CHAVE_CONFIG, lerConfig } from '@/lib/cripto/ciclo'

/**
 * O DASHBOARD DO AGENTE CRIPTO (/admin/cripto) — ler tudo, e os poucos interruptores do dono.
 *
 * O que este ecrã pode mudar: ligar/desligar, papel/real, memecoins, capital base, pedir o fecho de
 * posições. O que NÃO pode: tectos do executor, destino dos lucros, chaves. Esses vivem só no env
 * da VPS. Passar a «real» aqui é a primeira de duas chaves; sem CRIPTO_REAL=1 na VPS não sai uma
 * ordem.
 */
export const dynamic = 'force-dynamic'
// A Bybit recusa pedidos de algumas regiões (EUA): o preço ao vivo das abertas lê-se de Frankfurt.
export const preferredRegion = 'fra1'

/** Preço de agora das abertas, para o PnL por realizar: Bybit (perps) e Jupiter (spot), públicos. */
async function precosAgora(abertas: { mercado: string; id_ativo: string }[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (!abertas.length) return out
  const sinal = AbortSignal.timeout(4000)
  const perps = [...new Set(abertas.filter((a) => a.mercado === 'perp').map((a) => a.id_ativo))]
  const mints = [...new Set(abertas.filter((a) => a.mercado === 'spot').map((a) => a.id_ativo))]
  await Promise.all([
    perps.length
      ? fetch('https://api.bybit.com/v5/market/tickers?category=linear', { signal: sinal, cache: 'no-store' })
          .then((r) => r.json())
          .then((j: { result?: { list?: { symbol: string; lastPrice: string }[] } }) => {
            for (const t of j.result?.list ?? []) if (perps.includes(t.symbol)) out[t.symbol] = Number(t.lastPrice)
          })
          .catch(() => undefined)
      : undefined,
    mints.length
      ? fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(',')}`, { signal: sinal, cache: 'no-store' })
          .then((r) => r.json())
          .then((j: Record<string, { usdPrice?: number }>) => {
            for (const m of mints) if (Number(j?.[m]?.usdPrice) > 0) out[m] = Number(j[m].usdPrice)
          })
          .catch(() => undefined)
      : undefined,
  ])
  return out
}

export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const desde90 = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const desde7 = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [cfg, carteiras, saldo, abertas, fechadas, decisoes, sessoes, vantagem, pulso, historico, saldos, funil] = await Promise.all([
    db.from('site_settings').select('value').eq('key', CHAVE_CONFIG).maybeSingle(),
    db.from('cripto_carteiras').select('*'),
    db.from('cripto_saldos').select('*').order('em', { ascending: false }).limit(1).maybeSingle(),
    db.from('cripto_posicoes').select('*').in('estado', ['pendente', 'aberta']).order('aberta_em', { ascending: false }),
    db.from('cripto_posicoes').select('*').in('estado', ['fechada', 'falhada']).order('fechada_em', { ascending: false }).limit(60),
    db.from('cripto_decisoes').select('id, em, modo, ativo, mercado, gatilho, pareceres, decisao_ia, fornecedor_ia, recusas, aprovada').order('em', { ascending: false }).limit(40),
    db.from('cripto_sessoes').select('*').order('inicio', { ascending: false }).limit(30),
    db.from('cripto_vantagem').select('*'),
    db.from('servicos_pulso').select('estado, em, versao').eq('servico', 'mtm-vigias').maybeSingle(),
    // Para os gráficos: as fechadas de 90 dias (curva, evolução, projecção), os saldos reais de 7
    // dias (a curva medida no exchange/carteira) e as decisões de 24 h, só as colunas do funil.
    db.from('cripto_posicoes').select('modo, ativo, mercado, id_ativo, lado, gatilho_tipo, nocional_usd, risco_usd, entrada, saida, motivo_fecho, pnl_usd, aberta_em, fechada_em').eq('estado', 'fechada').not('pnl_usd', 'is', null).gte('fechada_em', desde90).order('fechada_em', { ascending: true }).limit(3000),
    db.from('cripto_saldos').select('em, equity_usd').gte('em', desde7).order('em', { ascending: true }).limit(3000),
    db.from('cripto_decisoes').select('modo, pareceres, decisao_ia, aprovada').gte('em', new Date(Date.now() - 86_400_000).toISOString()).limit(5000),
  ])
  const erro = [carteiras, abertas, fechadas, decisoes, sessoes, vantagem].find((r) => r.error)?.error
  if (erro) return NextResponse.json({ ok: false, error: erro.message, dica: 'A migração 220 já foi aplicada?' }, { status: 500 })
  const precos = await precosAgora((abertas.data ?? []).filter((a) => a.estado === 'aberta'))
  const tarefa = (pulso.data?.estado as { tarefas?: Record<string, unknown> } | null)?.tarefas?.['agente-cripto'] ?? null
  return NextResponse.json({
    ok: true,
    config: lerConfig(cfg.data?.value),
    carteiras: carteiras.data,
    saldoReal: saldo.data,
    abertas: abertas.data,
    fechadas: fechadas.data,
    decisoes: decisoes.data,
    sessoes: sessoes.data,
    vantagem: vantagem.data,
    precos,
    historico: historico.data ?? [],
    saldos: saldos.data ?? [],
    funil: (funil.data ?? []).map((x) => ({
      modo: x.modo,
      veto: Array.isArray(x.pareceres) && x.pareceres.some((p: { veto?: boolean }) => p?.veto),
      acao: (x.decisao_ia as { action?: string } | null)?.action ?? null,
      aprovada: x.aprovada,
    })),
    vigia: { tarefa, pulsoEm: pulso.data?.em ?? null, versao: pulso.data?.versao ?? null },
  })
}

export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_CONFIG).maybeSingle()
  const actual = (data?.value && typeof data.value === 'object' ? data.value : {}) as Record<string, unknown>
  const novo = { ...actual }

  switch (b.acao) {
    case 'ligado':
      novo.ligado = b.valor === true
      break
    case 'memecoins':
      novo.memecoins = b.valor === true
      break
    case 'modo':
      if (b.valor === 'real' && b.confirmo !== 'REAL') return NextResponse.json({ ok: false, error: 'Para passar a real escreve REAL na confirmação.' }, { status: 400 })
      novo.modo = b.valor === 'real' ? 'real' : 'papel'
      break
    case 'realMercados': {
      const v = Array.isArray(b.valor) ? (['perp', 'spot'] as const).filter((m) => (b.valor as unknown[]).includes(m)) : null
      if (!v) return NextResponse.json({ ok: false, error: 'Lista de mercados inválida.' }, { status: 400 })
      novo.realMercados = v
      break
    }
    case 'capitalBaseReal': {
      const v = Number(b.valor)
      if (!(Number.isFinite(v) && v >= 0 && v <= 1_000_000)) return NextResponse.json({ ok: false, error: 'Valor inválido.' }, { status: 400 })
      novo.capitalBaseRealUsd = v
      break
    }
    case 'fechar': {
      // Pede o fecho; quem fecha é o vigia (papel) ou o executor (real), ao preço do momento.
      const q = db.from('cripto_posicoes').update({ fechar_pedido: 'manual' }).eq('estado', 'aberta').is('fechar_pedido', null)
      const { error } = typeof b.id === 'string' ? await q.eq('id', b.id) : await q
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    default:
      return NextResponse.json({ ok: false, error: 'Acção desconhecida.' }, { status: 400 })
  }
  // update e não upsert: a linha nasce na migração 220, e um upsert cego reescrevia outras colunas.
  const { error } = data
    ? await db.from('site_settings').update({ value: novo }).eq('key', CHAVE_CONFIG)
    : await db.from('site_settings').insert({ key: CHAVE_CONFIG, value: novo })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, config: lerConfig(novo) })
}
