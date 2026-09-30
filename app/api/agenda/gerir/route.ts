import { NextResponse, type NextRequest } from 'next/server'
import { cancelarPorToken } from '@/lib/agenda/servidor'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * A CHAMADA DE QUEM TEM O LINK — ver e cancelar.
 *
 * O `token` é a única prova de quem marcou, e chega: é um uuid aleatório que só existe no email
 * dele. O que NÃO se faz é aceitar o `id` da marcação — esse anda em registos e em painéis, e uma
 * chave que serve para cancelar não pode ser a mesma que se usa para tudo o resto.
 *
 * A resposta traz o mínimo: quando, com quem e onde. Não traz o email nem o telefone de ninguém,
 * nem as respostas do formulário — quem tem o link já sabe o que escreveu, e um token que aparece
 * num histórico de browser não devia devolver uma ficha de contacto.
 */
export async function GET(request: NextRequest) {
  const token = String(request.nextUrl.searchParams.get('t') ?? '')
  if (!token) return NextResponse.json({ error: 'falta o token' }, { status: 400 })

  const { data } = await getSupabaseAdmin()
    .from('agenda_marcacoes')
    .select('inicio, fim, estado, local, join_url, agenda_tipos(nome), agenda_anfitrioes(nome)')
    .eq('token', token)
    .maybeSingle()

  if (!data) return NextResponse.json({ error: 'não encontrámos essa marcação' }, { status: 404 })

  const tipo = data.agenda_tipos as unknown as { nome?: string } | null
  const anf = data.agenda_anfitrioes as unknown as { nome?: string } | null
  return NextResponse.json({
    marcacao: {
      inicio: data.inicio, fim: data.fim, estado: data.estado, local: data.local,
      joinUrl: data.join_url, tipo: tipo?.nome ?? null, anfitriao: anf?.nome ?? null,
    },
  })
}

export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const token = String(corpo.token ?? '')
  if (!token) return NextResponse.json({ error: 'falta o token' }, { status: 400 })
  const r = await cancelarPorToken(token, String(corpo.motivo ?? '').slice(0, 400))
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
