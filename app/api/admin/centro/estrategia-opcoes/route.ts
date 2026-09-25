import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { CAMPOS_OPCOES } from '@/lib/estrategias-admin/opcoes'
import { CONFIRMACAO_OPCOES, gravarOpcoesEstrategia, lerOpcoesEstrategia } from '@/lib/admin-centro/servidor/opcoes-estrategia'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * AS OPÇÕES DE ADMIN DE UMA ESTRATÉGIA (`mtmauto_providers`) — as mesmas que o admin da MTM Auto
 * escreve em `/definicoes/admin`, agora também em `/admin/centro?s=estrategias`.
 *
 *   GET  ?id=<providerId>                          → a ficha e os campos a desenhar
 *   POST { providerId, confirmacao, ...opcoes }    → grava, relê e audita
 *
 * Os campos vêm da mesma descrição dos dois lados (`lib/estrategias-admin/opcoes.ts`): o ecrã não
 * escolhe o que mostra, só como o mostra.
 */
export const GET = soAdmin(async (_a: string, req: NextRequest) => {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta o id da estratégia.' }, { status: 400 })
  const ficha = await lerOpcoesEstrategia(id)
  if (!ficha) return NextResponse.json({ error: 'Estratégia não encontrada.' }, { status: 404 })
  return NextResponse.json({ ...ficha, campos: CAMPOS_OPCOES, confirmacao: CONFIRMACAO_OPCOES })
})

export const POST = soAdmin(async (adminId: string, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const { providerId, confirmacao, ...opcoes } = corpo
  if (!providerId) return NextResponse.json({ error: 'Falta o id da estratégia.' }, { status: 400 })
  const r = await gravarOpcoesEstrategia(adminId, String(providerId), opcoes, String(confirmacao ?? ''))
  return NextResponse.json(
    { ok: r.ok, message: r.mensagem, opcoes: r.opcoes ?? null, ...(r.ok ? {} : { error: r.mensagem }) },
    { status: r.status },
  )
})
