import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { lerPedidoFicha } from '@/lib/copia-contas/ficha-copia-regras'
import { escreverFichaCopia, lerFichaCopia } from '@/lib/copia-contas/servidor/ficha-copia'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * A FICHA DE CÓPIA de uma conta de subscritor (gaveta da conta no Centro / backoffice Gestão › Contas).
 *
 *   GET  ?ref=site:<id>|auto:<id>                      → parâmetros da fonte, limites do motor, estratégias (segue? lote previsto, rota)
 *   POST { accao: 'parametros', ref, campos }           → risco/lote/SL/TP/símbolos/BE/trailing da CONTA (fonte) + ressincroniza
 *   POST { accao: 'subscricao', ref, slug, campos }     → MTM Auto: risco/lote/BE/trailing/auto-aceitar da subscrição + ressincroniza
 *   POST { accao: 'ligar', ref, slug, lote? }           → passa a seguir (site: strategy_lots; auto: subscrição) — ligarSubscritor do quadro
 *   POST { accao: 'desligar', ref, slug }               → deixa de seguir (rota pausada até fechar o que tem aberto)
 *   POST { accao: 'limites', ref, campos }              → mestres_contas: lote forçado, máx. posições, risco total, lote total
 *   POST { accao: 'retirar', ref, confirmacao }         → sai de TODAS as estratégias (palavra RETIRAR); a conta fica
 *
 * Nunca escreve em copia_rotas: escreve na fonte e corre sincronizarRotasDaEstrategia.
 */
export const GET = soAdmin(async (_a: string, req: NextRequest) => {
  const ref = String(new URL(req.url).searchParams.get('ref') ?? '').toLowerCase()
  if (!/^(site|auto):[0-9a-f-]{36}$/.test(ref)) return NextResponse.json({ error: 'ref inválida (site:<id> | auto:<id>)' }, { status: 400 })
  const ficha = await lerFichaCopia(ref)
  return ficha ? NextResponse.json(ficha, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'conta não encontrada' }, { status: 404 })
})

export const POST = soAdmin(async (adminId: string, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const p = lerPedidoFicha(corpo)
  if ('erro' in p) return NextResponse.json({ error: p.erro }, { status: 400 })
  const r = await escreverFichaCopia(adminId, p)
  return NextResponse.json({ ok: r.ok, message: r.mensagem, detalhe: r.detalhe ?? null, ...(r.ok ? {} : { error: r.mensagem }) }, { status: r.status })
})
