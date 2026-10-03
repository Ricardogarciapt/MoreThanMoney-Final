import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { alterarRota, apagarRota, criarRota, lerConfig, listarRotas, type AcaoRota } from '@/lib/copia-contas/servidor/rotas'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ACOES: AcaoRota[] = ['editar', 'aprovar', 'recusar', 'ativar', 'pausar', 'modo']
const uuid = (v: unknown) => /^[0-9a-f-]{36}$/i.test(String(v ?? ''))

/**
 * CÓPIA ENTRE CONTAS — rotas.
 *   GET ?userId=&estado=                                  → { rotas, legado (funded_copiers 068) }
 *   POST { origem_ref, destino_ref, ...config }           → cria já aprovada, INACTIVA e em sombra
 *   PATCH { id, acao, ... }                               → editar | aprovar | recusar | ativar | pausar |
 *                                                           modo { modo, confirmacao «LIGAR» } (live → 423)
 *   DELETE ?id=                                           → só sem cópias abertas no destino
 */
export const GET = soAdmin(async (_a: string, req: NextRequest) => {
  const p = new URL(req.url).searchParams
  const userId = p.get('userId')
  return NextResponse.json(await listarRotas({ userId: uuid(userId) ? userId : null, estado: p.get('estado') }))
})

export const POST = soAdmin(async (adminId: string, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const c = lerConfig(corpo)
  if (!c.ok) return NextResponse.json({ error: c.erro }, { status: c.status })
  const r = await criarRota({ origemRef: String(corpo.origem_ref ?? ''), destinoRef: String(corpo.destino_ref ?? ''), config: c.config, criadoPor: adminId, pedidoPeloCliente: false })
  return r.ok ? NextResponse.json({ rota: r.rota }) : NextResponse.json({ error: r.erro }, { status: r.status })
})

export const PATCH = soAdmin(async (adminId: string, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (!uuid(corpo.id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const acao = String(corpo.acao ?? '') as AcaoRota
  if (!ACOES.includes(acao)) return NextResponse.json({ error: 'acção inválida' }, { status: 400 })
  const r = await alterarRota(String(corpo.id), acao, corpo, adminId)
  return r.ok ? NextResponse.json({ rota: r.rota }) : NextResponse.json({ error: r.erro }, { status: r.status })
})

export const DELETE = soAdmin(async (_a: string, req: NextRequest) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!uuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const r = await apagarRota(String(id))
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.erro }, { status: r.status })
})
