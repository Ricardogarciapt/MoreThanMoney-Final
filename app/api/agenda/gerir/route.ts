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
    .select('inicio, fim, estado, local, join_url, inicio_anterior, agenda_tipos(nome), agenda_anfitrioes(nome)')
    .eq('token', token)
    .maybeSingle()

  if (!data) return NextResponse.json({ error: 'não encontrámos essa marcação' }, { status: 404 })

  const tipo = data.agenda_tipos as unknown as { nome?: string } | null
  const anf = data.agenda_anfitrioes as unknown as { nome?: string } | null
  return NextResponse.json({
    marcacao: {
      inicio: data.inicio, fim: data.fim, estado: data.estado, local: data.local,
      joinUrl: data.join_url, tipo: tipo?.nome ?? null, anfitriao: anf?.nome ?? null,
      // Só em «a_confirmar»: a hora que a chamada tinha antes de nós a mudarmos. Sem ela, quem tem
      // duas chamadas connosco não sabe qual é que mexeu.
      inicioAnterior: data.inicio_anterior,
    },
  })
}

export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const token = String(corpo.token ?? '')
  if (!token) return NextResponse.json({ error: 'falta o token' }, { status: 400 })

  /**
   * CONFIRMAR A HORA NOVA. É o outro lado da remarcação feita por dentro: até este clique, a
   * chamada está em «a_confirmar» e quem vai ligar sabe que ainda não há acordo.
   *
   * Só sai de «a_confirmar» — confirmar uma chamada que já estava marcada não muda nada, e
   * confirmar uma cancelada não a ressuscita.
   */
  if (corpo.accao === 'confirmar') {
    const db = getSupabaseAdmin()
    const { data: m } = await db.from('agenda_marcacoes')
      .select('id, estado, inicio, fim, token, nome, email, telefone, local, join_url, agenda_tipos(nome), agenda_anfitrioes(nome)')
      .eq('token', token).maybeSingle()
    if (!m) return NextResponse.json({ ok: false, mensagem: 'Não encontrámos essa marcação.' }, { status: 404 })
    if (m.estado !== 'a_confirmar') {
      return NextResponse.json({ ok: true, mensagem: 'Esta chamada já não estava à espera de confirmação.' })
    }

    const { error } = await db.from('agenda_marcacoes').update({
      estado: 'marcada', confirmada_em: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', m.id)
    if (error) return NextResponse.json({ ok: false, mensagem: 'Não foi possível confirmar.' }, { status: 400 })

    const { avisarConvidado } = await import('@/lib/agenda/avisos')
    void avisarConvidado('confirmada', {
      id: String(m.id), token: String(m.token),
      tipoNome: (m.agenda_tipos as unknown as { nome?: string })?.nome ?? 'Chamada',
      anfitriao: (m.agenda_anfitrioes as unknown as { nome?: string })?.nome ?? 'MoreThanMoney',
      nome: String(m.nome), email: String(m.email), telefone: (m.telefone as string) ?? null,
      inicio: new Date(String(m.inicio)), fim: new Date(String(m.fim)),
      local: String(m.local), joinUrl: (m.join_url as string) ?? null,
    }).catch(() => { /* o aviso é conforto; a confirmação já está escrita */ })

    return NextResponse.json({ ok: true, mensagem: 'Confirmado. Fica assim.' })
  }

  const r = await cancelarPorToken(token, String(corpo.motivo ?? '').slice(0, 400))
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
