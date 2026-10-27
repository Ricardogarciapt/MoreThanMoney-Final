import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { actualizarSaldos, carregarContas } from '@/lib/admin-centro/servidor/contas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 *   GET            → todas as contas (estado guardado, sem MetaApi)
 *   GET ?ref=      → uma conta (para a gaveta); posições ao vivo continuam em /api/admin/mtmauto-copia/contas?vista=
 *   POST { acao: 'saldos', refs? } → lê e guarda saldo/equity das contas de corretora com leitura velha
 *                    (lote de 25, 3 de cada vez; com `refs`, só essas). A lista volta a ler da base.
 */
export const GET = soAdmin(async (_a: string, req: NextRequest) => {
  const ref = new URL(req.url).searchParams.get('ref')
  const r = await carregarContas()
  if (ref) {
    const conta = r.contas.find((c) => c.ref === ref) ?? null
    return NextResponse.json({ conta, mesmoDono: conta?.userId ? r.contas.filter((c) => c.userId === conta.userId && c.ref !== ref) : [] }, { status: conta ? 200 : 404 })
  }
  return NextResponse.json(r)
})

export const POST = soAdmin(async (_a: string, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as { acao?: string; refs?: unknown }
  if (corpo.acao !== 'saldos') return NextResponse.json({ error: 'acao desconhecida' }, { status: 400 })
  const refs = Array.isArray(corpo.refs) ? corpo.refs.filter((x): x is string => typeof x === 'string').slice(0, 25) : undefined
  return NextResponse.json(await actualizarSaldos(refs))
})
