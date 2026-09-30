import { NextResponse, type NextRequest } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { minutosDoRelogio } from '@/lib/agenda/horas'
import { avisarConvidado } from '@/lib/agenda/avisos'

export const dynamic = 'force-dynamic'

/**
 * O PAINEL DA AGENDA.
 *
 *   GET                                  → anfitriões, tipos e as próximas chamadas
 *   POST { accao: 'anfitriao', ... }      → criar/editar quem atende
 *   POST { accao: 'tipo', ... }           → ligar/desligar e afinar um assunto
 *   POST { accao: 'bloquear', ... }       → tapar um intervalo (férias, uma manhã)
 *   POST { accao: 'estado', id, estado }  → compareceu / faltou / cancelada
 *
 * O `google_refresh_token` NUNCA sai daqui. O painel só precisa de saber SE está ligado e de que
 * conta — o token em si é a chave da agenda de uma pessoa, e uma chave dessas não anda num JSON que
 * o browser guarda em cache.
 */
export const GET = soAdmin(async () => {
  const db = getSupabaseAdmin()
  const [{ data: anfitrioes }, { data: tipos }, { data: marcacoes }] = await Promise.all([
    db.from('agenda_anfitrioes')
      .select('id, nome, email, telefone, fuso, zoom_url, janelas, intervalo_min, antecedencia_horas, horizonte_dias, max_por_dia, ativo, ordem, google_email, google_ligado_em, google_refresh_token')
      .order('ordem'),
    db.from('agenda_tipos').select('*').order('ordem'),
    db.from('agenda_marcacoes')
      .select('id, tipo_id, anfitriao_id, nome, email, telefone, inicio, fim, estado, local, join_url, respostas, negocio_id, fuso_convidado, inicio_anterior, confirmada_em, notas_internas, avisos, agenda_tipos(nome), agenda_anfitrioes(nome)')
      .gte('inicio', new Date(Date.now() - 7 * 86_400_000).toISOString())
      .order('inicio')
      .limit(200),
  ])

  return NextResponse.json({
    anfitrioes: (anfitrioes ?? []).map((a) => {
      const { google_refresh_token, ...resto } = a as Record<string, unknown>
      return { ...resto, google_ligado: Boolean(google_refresh_token) }
    }),
    tipos: tipos ?? [],
    marcacoes: marcacoes ?? [],
  })
})

/** As janelas, validadas antes de tocarem na base. Uma janela ao contrário é uma agenda sem horas. */
function janelasValidas(v: unknown): Array<{ dia: number; inicio: string; fim: string }> | { erro: string } {
  if (!Array.isArray(v)) return { erro: 'as janelas têm de ser uma lista' }
  const out: Array<{ dia: number; inicio: string; fim: string }> = []
  for (const j of v.slice(0, 40)) {
    const dia = Number((j as { dia?: unknown }).dia)
    const inicio = String((j as { inicio?: unknown }).inicio ?? '')
    const fim = String((j as { fim?: unknown }).fim ?? '')
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) return { erro: `dia da semana inválido: ${dia}` }
    const a = minutosDoRelogio(inicio)
    const b = minutosDoRelogio(fim)
    if (a == null || b == null) return { erro: `hora inválida em «${inicio}–${fim}» (usa HH:MM)` }
    if (b <= a) return { erro: `«${inicio}–${fim}» acaba antes de começar` }
    out.push({ dia, inicio, fim })
  }
  return out
}

export const POST = soAdmin(async (_adminId: string, request: NextRequest) => {
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const db = getSupabaseAdmin()

  switch (String(b.accao ?? '')) {
    case 'anfitriao': {
      const linha: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if ('nome' in b) linha.nome = String(b.nome ?? '').slice(0, 120)
      if ('email' in b) linha.email = String(b.email ?? '').toLowerCase().slice(0, 200)
      if ('telefone' in b) linha.telefone = String(b.telefone ?? '').slice(0, 40) || null
      if ('fuso' in b) linha.fuso = String(b.fuso ?? 'Europe/Lisbon').slice(0, 64)
      if ('zoom_url' in b) linha.zoom_url = String(b.zoom_url ?? '').slice(0, 400) || null
      if ('ativo' in b) linha.ativo = b.ativo === true
      for (const n of ['intervalo_min', 'antecedencia_horas', 'horizonte_dias', 'max_por_dia', 'ordem']) {
        if (n in b) linha[n] = Math.max(0, Math.round(Number(b[n]) || 0))
      }
      if ('janelas' in b) {
        const j = janelasValidas(b.janelas)
        if ('erro' in j) return NextResponse.json({ error: j.erro }, { status: 400 })
        linha.janelas = j
      }

      const id = String(b.id ?? '')
      const r = id
        ? await db.from('agenda_anfitrioes').update(linha).eq('id', id).select().maybeSingle()
        : await db.from('agenda_anfitrioes').insert({ nome: 'Novo anfitrião', email: 'muda@isto.pt', ...linha }).select().maybeSingle()
      if (r.error) return NextResponse.json({ error: r.error.message.slice(0, 300) }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    case 'tipo': {
      const id = String(b.id ?? '')
      if (!id) return NextResponse.json({ error: 'falta o id' }, { status: 400 })
      const linha: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if ('ativo' in b) linha.ativo = b.ativo === true
      if ('nome' in b) linha.nome = String(b.nome ?? '').slice(0, 120)
      if ('descricao' in b) linha.descricao = String(b.descricao ?? '').slice(0, 1000) || null
      if ('para_quem' in b) linha.para_quem = String(b.para_quem ?? '').slice(0, 300) || null
      if ('duracao_min' in b) linha.duracao_min = Math.min(180, Math.max(10, Math.round(Number(b.duracao_min) || 30)))
      if ('local' in b) linha.local = ['whatsapp', 'zoom', 'meet', 'presencial'].includes(String(b.local)) ? String(b.local) : 'whatsapp'
      if ('ordem' in b) linha.ordem = Math.max(0, Math.round(Number(b.ordem) || 0))
      if ('anfitrioes' in b) linha.anfitrioes = Array.isArray(b.anfitrioes) ? b.anfitrioes.map(String).slice(0, 20) : []
      const { error } = await db.from('agenda_tipos').update(linha).eq('id', id)
      if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    case 'bloquear': {
      const inicio = new Date(String(b.inicio ?? ''))
      const fim = new Date(String(b.fim ?? ''))
      if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime()) || fim <= inicio) {
        return NextResponse.json({ error: 'o intervalo não faz sentido' }, { status: 400 })
      }
      const { error } = await db.from('agenda_bloqueios').insert({
        anfitriao_id: String(b.anfitriao_id ?? ''),
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        motivo: String(b.motivo ?? '').slice(0, 200) || null,
      })
      if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    /**
     * COMPARECEU OU FALTOU. Não é burocracia: é o número que diz se as chamadas marcadas valem
     * alguma coisa. Uma agenda com 40% de faltas resolve-se com um lembrete, mas só depois de
     * alguém saber que são 40%.
     */
    case 'estado': {
      const estado = String(b.estado ?? '')
      if (!['marcada', 'a_confirmar', 'cancelada', 'compareceu', 'faltou'].includes(estado)) {
        return NextResponse.json({ error: 'estado inválido' }, { status: 400 })
      }
      const { error } = await db.from('agenda_marcacoes')
        .update({ estado, updated_at: new Date().toISOString(), ...(estado === 'cancelada' ? { cancelada_em: new Date().toISOString() } : {}) })
        .eq('id', String(b.id ?? ''))
      if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    /**
     * REMARCAR POR DENTRO — e PEDIR CONFIRMAÇÃO.
     *
     * Mudar a hora de uma chamada não é a mesma coisa que marcá-la: do outro lado está uma pessoa
     * que já arrumou o dia à volta daquela hora. Por isso a marcação não passa a «marcada» — passa
     * a «a_confirmar», e só volta a contar como firme quando ela disser que sim.
     *
     * A hora fica tomada na mesma enquanto espera (o índice único conta as duas), senão a mesma
     * hora era proposta a duas pessoas ao mesmo tempo.
     */
    case 'remarcar': {
      const id = String(b.id ?? '')
      const novoInicio = new Date(String(b.inicio ?? ''))
      if (!id || !Number.isFinite(novoInicio.getTime())) {
        return NextResponse.json({ error: 'falta a marcação ou a hora nova' }, { status: 400 })
      }

      const { data: m } = await db.from('agenda_marcacoes')
        .select('id, inicio, fim, token, nome, email, telefone, local, join_url, anfitriao_id, agenda_tipos(nome), agenda_anfitrioes(nome)')
        .eq('id', id).maybeSingle()
      if (!m) return NextResponse.json({ error: 'marcação não encontrada' }, { status: 404 })

      const duracaoMs = new Date(String(m.fim)).getTime() - new Date(String(m.inicio)).getTime()
      const novoFim = new Date(novoInicio.getTime() + duracaoMs)
      // Trocar de anfitrião no mesmo gesto: é o caso normal de «este não pode, passa ao outro».
      const anfitriaoId = String(b.anfitriao_id ?? m.anfitriao_id)

      const { error } = await db.from('agenda_marcacoes').update({
        inicio: novoInicio.toISOString(),
        fim: novoFim.toISOString(),
        anfitriao_id: anfitriaoId,
        inicio_anterior: m.inicio,
        estado: 'a_confirmar',
        confirmada_em: null,
        remarcada_em: new Date().toISOString(),
        remarcada_por: _adminId,
        updated_at: new Date().toISOString(),
      }).eq('id', id)

      if (error) {
        // 23505 = o índice único: essa hora já está tomada nesse anfitrião.
        const ocupada = String((error as { code?: string }).code) === '23505'
        return NextResponse.json(
          { error: ocupada ? 'Essa hora já está ocupada para esse anfitrião.' : error.message.slice(0, 300) },
          { status: ocupada ? 409 : 400 },
        )
      }

      const { data: anf } = await db.from('agenda_anfitrioes').select('nome').eq('id', anfitriaoId).maybeSingle()
      const aviso = await avisarConvidado('remarcada', {
        id, token: String(m.token),
        tipoNome: (m.agenda_tipos as unknown as { nome?: string })?.nome ?? 'Chamada',
        anfitriao: String(anf?.nome ?? (m.agenda_anfitrioes as unknown as { nome?: string })?.nome ?? 'MoreThanMoney'),
        nome: String(m.nome), email: String(m.email), telefone: (m.telefone as string) ?? null,
        inicio: novoInicio, fim: novoFim,
        local: String(m.local), joinUrl: (m.join_url as string) ?? null,
        inicioAnterior: new Date(String(m.inicio)),
      })
      return NextResponse.json({ ok: true, aviso })
    }

    /**
     * DISTRIBUIR — passar a chamada a quem a vai fazer, sem mexer na hora.
     *
     * É o gesto do setter: ele marca e entrega. Não avisa o convidado, de propósito: para quem
     * está do outro lado, a chamada não mudou. Avisar «passou para outra pessoa» só levanta uma
     * dúvida que não existia.
     */
    case 'distribuir': {
      const id = String(b.id ?? '')
      const anfitriaoId = String(b.anfitriao_id ?? '')
      if (!id || !anfitriaoId) return NextResponse.json({ error: 'falta a marcação ou o anfitrião' }, { status: 400 })
      const { error } = await db.from('agenda_marcacoes')
        .update({ anfitriao_id: anfitriaoId, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) {
        const ocupada = String((error as { code?: string }).code) === '23505'
        return NextResponse.json(
          { error: ocupada ? 'Essa pessoa já tem uma chamada a essa hora.' : error.message.slice(0, 300) },
          { status: ocupada ? 409 : 400 },
        )
      }
      return NextResponse.json({ ok: true })
    }

    /** O que aconteceu na chamada, escrito por quem a fez. */
    case 'notas': {
      const { error } = await db.from('agenda_marcacoes')
        .update({ notas_internas: String(b.notas ?? '').slice(0, 4000) || null, updated_at: new Date().toISOString() })
        .eq('id', String(b.id ?? ''))
      if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: 'acção desconhecida' }, { status: 400 })
  }
})
