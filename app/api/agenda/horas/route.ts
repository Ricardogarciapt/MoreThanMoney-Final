import { NextResponse, type NextRequest } from 'next/server'
import { horasDoTipo, tipoPorSlug } from '@/lib/agenda/servidor'

export const dynamic = 'force-dynamic'

/** Quantos dias se podem pedir de uma vez. Um pedido de um ano abria a agenda toda numa consulta. */
const DIAS_MAX = 35

/**
 * GET /api/agenda/horas?tipo=onboarding&de=2026-10-06
 *
 * As horas LIVRES, já em UTC. Quem desenha converte para o fuso de quem está a olhar — o servidor
 * não adivinha o fuso do visitante a partir do IP, que é como se mostra a agenda errada a quem
 * viaja.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const tipo = await tipoPorSlug(String(p.get('tipo') ?? ''))
  if (!tipo) return NextResponse.json({ error: 'tipo desconhecido' }, { status: 404 })

  const de = p.get('de') ? new Date(String(p.get('de'))) : new Date()
  if (!Number.isFinite(de.getTime())) return NextResponse.json({ error: 'data inválida' }, { status: 400 })
  const dias = Math.min(DIAS_MAX, Math.max(1, Number(p.get('dias') ?? 14)))
  const ate = new Date(de.getTime() + dias * 86_400_000)

  try {
    return NextResponse.json({
      tipo: { slug: tipo.slug, nome: tipo.nome, duracao_min: tipo.duracao_min, local: tipo.local },
      anfitrioes: await horasDoTipo(tipo, de, ate),
    })
  } catch (e) {
    console.error('[agenda] horas:', e)
    return NextResponse.json({ error: 'não foi possível ler a agenda' }, { status: 500 })
  }
}
