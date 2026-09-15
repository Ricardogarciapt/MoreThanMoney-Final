import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ErroOrdem, autorizarConta } from '@/lib/mtmfunded/simulado/execucao'
import { estatisticasDaConta, type LinhaTrade, type Snapshot } from '@/lib/mtmfunded/simulado/estatisticas'

export const dynamic = 'force-dynamic'

/**
 * ESTATÍSTICAS DA CONTA — o separador «Estatísticas» do WebTrader.
 *
 * GET ?accountId=&equity= → KPIs, curva de saldo/equity com drawdown, e os agrupamentos (símbolo,
 * origem, estratégia, hora e dia UTC). As contas são de lib/mtmfunded/simulado/estatisticas.ts
 * (pura, com teste). `equity` é a do ecrã (com os preços ao vivo); sem ela usa-se a última do motor.
 *
 * Leitura: dono (sessão MTM) ou sessão da conta — master OU investor (ver estatísticas é ler).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const { conta } = await autorizarConta(request, sp.get('accountId') ?? '')
    const db = getSupabaseAdmin()
    const [{ data: fechadas }, { data: abertas }, { data: fotos }] = await Promise.all([
      db.from('funded_positions')
        .select('id, mae_id, symbol, direcao, volume, pnl, comissao, swap, aberta_em, fechada_em, origem, comentario, motivo_fecho, risco_inicial')
        .eq('account_id', conta.id).eq('estado', 'fechada').order('fechada_em', { ascending: true }).limit(10000),
      db.from('funded_positions').select('id').eq('account_id', conta.id).eq('estado', 'aberta'),
      db.from('funded_equity_snapshots').select('em, saldo, equity').eq('account_id', conta.id)
        .order('em', { ascending: false }).limit(2000),
    ])
    const eq = Number(sp.get('equity'))
    const equity = Number.isFinite(eq) && eq > 0 ? eq : Number(conta.sim_equity ?? conta.sim_saldo ?? 0)
    const est = estatisticasDaConta({
      saldoInicial: Number(conta.saldo_inicial ?? 0),
      equity,
      fechadas: (fechadas ?? []) as unknown as LinhaTrade[],
      abertasIds: new Set((abertas ?? []).map((a) => String(a.id))),
      snapshots: ((fotos ?? []) as unknown as Snapshot[]).reverse(),
    })
    // A curva pode ter milhares de pontos: para o gráfico chegam ~600 (o primeiro, o último e os extremos ficam).
    return NextResponse.json({ ...est, curva: reduzir(est.curva, 600) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof ErroOrdem) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[funded/estatisticas]', e)
    return NextResponse.json({ error: 'erro interno' }, { status: 500 })
  }
}

/** Reduz a curva por baldes, guardando em cada balde o ponto de maior drawdown (o que importa ver). */
function reduzir<T extends { ddPct: number }>(pts: T[], max: number): T[] {
  if (pts.length <= max) return pts
  const balde = Math.ceil(pts.length / max)
  const out: T[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i += balde) {
    const fatia = pts.slice(i, Math.min(i + balde, pts.length - 1))
    out.push(fatia.reduce((m, p) => (p.ddPct < m.ddPct ? p : m), fatia[0]))
  }
  out.push(pts[pts.length - 1])
  return out
}
