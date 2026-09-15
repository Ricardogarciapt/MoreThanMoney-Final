import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { acaoConta, listarContasAdmin, type AcaoConta } from '@/lib/copia-contas/servidor/contas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACOES: AcaoConta[] = ['sincronizar', 'pausar', 'retomar', 'deploy', 'undeploy', 'remover']

/**
 *   GET ?userId=                          → todas as contas ligadas (4 plataformas), com plano/quota
 *   POST { ref, acao, confirmacao? }      → sincronizar | pausar | retomar | deploy | undeploy
 *                                           («CONFIRMAR») | remover («REMOVER»)
 */
export const GET = soAdmin(async (_a: string, req: NextRequest) => {
  const userId = new URL(req.url).searchParams.get('userId')
  return NextResponse.json(await listarContasAdmin({ userId: userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null }))
})

export const POST = soAdmin(async (_a: string, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const acao = String(corpo.acao ?? '') as AcaoConta
  if (!ACOES.includes(acao)) return NextResponse.json({ error: 'acção inválida' }, { status: 400 })
  const r = await acaoConta(String(corpo.ref ?? ''), acao, { confirmacao: corpo.confirmacao as string | undefined })
  return NextResponse.json({ ok: r.ok, message: r.mensagem, detalhe: r.detalhe ?? null, ...(r.ok ? {} : { error: r.mensagem }) }, { status: r.ok ? 200 : r.status ?? 400 })
})
