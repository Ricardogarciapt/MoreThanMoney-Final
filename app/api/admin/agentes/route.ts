import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { JANELA_HORAS, julgar } from '@/lib/agentes/vida'
import { acaoManual, montarAgente, somarJanela, type EventoLido, type LinhaAgente } from '@/lib/agentes/motor'
import { atribuirEGravar } from '@/lib/agentes/receita'

/**
 * O PAINEL DA EQUIPA DE AGENTES — leitura, e os três botões.
 *
 * O juízo que aparece no ecrã é calculado com a MESMA função que o cron usa (`julgar`), sobre os
 * mesmos factos. Uma segunda cópia da regra no servidor do painel discordaria da do cron
 * exactamente no caso difícil, que é o único em que a regra importa — e o dono veria «em risco»
 * num ecrã e «parado» noutro.
 *
 * `parar` NÃO apaga. É um limite do dono.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const db = getSupabaseAdmin()
  const agora = new Date()

  const { data: linhas, error } = await db
    .from('agentes_equipa')
    .select(
      'id, nome, papel, pilar, pai_id, estado, pausado, instrucoes, orcamento, gasto, receita, chave_receita, avaliado_em, parado_em, parado_porque, criado_em',
    )
    .order('pilar', { ascending: true })
    .order('criado_em', { ascending: true })
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  const equipa = (linhas ?? []) as LinhaAgente[]

  /**
   * Os eventos da janela, para o painel mostrar o MESMO resultado que a regra usa. Sem isto o ecrã
   * mostrava o acumulado e o cron julgava pela janela — dois números diferentes com o mesmo nome.
   */
  const desde = new Date(agora.getTime() - (JANELA_HORAS + 1) * 3_600_000).toISOString()
  const { data: eventos } = await db
    .from('agentes_eventos')
    .select('agente_id, tipo, valor, criado_em')
    .gte('criado_em', desde)
    .in('tipo', ['receita', 'gastou'])
  const somas = somarJanela((eventos ?? []) as EventoLido[], agora)

  // As últimas linhas do livro, para o painel poder mostrar o historial sem uma segunda chamada.
  const { data: ultimos } = await db
    .from('agentes_eventos')
    .select('agente_id, tipo, valor, detalhe, criado_em')
    .order('criado_em', { ascending: false })
    .limit(120)

  const agentes = equipa.map((l) => {
    const montado = montarAgente(l, somas.get(String(l.id)))
    const juizo = montado.ilegivel.length
      ? {
          decisao: 'espera' as const,
          estado: montado.agente.estado,
          resultado: 0,
          porque: `Não julgado: campos ilegíveis na base (${montado.ilegivel.join(', ')}).`,
        }
      : julgar(montado.agente, agora)

    return {
      id: montado.agente.id,
      nome: montado.agente.nome,
      papel: l.papel ?? null,
      pilar: montado.agente.pilar,
      pai_id: l.pai_id ?? null,
      estado: montado.agente.estado,
      pausado: l.pausado === true,
      instrucoes: l.instrucoes ?? null,
      chave_receita: l.chave_receita ?? null,
      orcamento: Number(l.orcamento ?? 0),
      gasto: montado.agente.gasto,
      receita: montado.agente.receita,
      saldo: montado.agente.saldo,
      receita_janela: montado.agente.receita_janela ?? 0,
      gasto_janela: montado.agente.gasto_janela ?? 0,
      /** Receita menos gasto NA JANELA — é este o número por que o agente vive. */
      resultado: juizo.resultado,
      criado_em: l.criado_em ?? null,
      avaliado_em: l.avaliado_em ?? null,
      parado_em: l.parado_em ?? null,
      parado_porque: l.parado_porque ?? null,
      /** O motivo escrito do juízo, que é o que o dono tem de poder ler. */
      juizo: { decisao: juizo.decisao, porque: juizo.porque },
      ilegivel: montado.ilegivel,
    }
  })

  /**
   * A receita, em ENSAIO: o painel mostra o que está atribuído e o que não está, sem escrever
   * nada. Quem escreve é o cron — um ecrã que grava ao ser aberto grava quando alguém faz F5.
   */
  const receita = await atribuirEGravar(db, { ensaio: true })

  return NextResponse.json({
    ok: true,
    janelaHoras: JANELA_HORAS,
    agentes,
    eventos: ultimos ?? [],
    receita: {
      moeda: 'EUR',
      liquidoCents: receita.atribuicao.liquidoCents,
      atribuidoCents: receita.atribuicao.atribuidoCents,
      naoAtribuidoCents: receita.atribuicao.naoAtribuidoCents,
      porAtribuir: receita.atribuicao.porAtribuir,
    },
  })
}

export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const body = (await request.json().catch(() => ({}))) as {
    acao?: 'pausar' | 'retomar' | 'parar'
    id?: string
    porque?: string
  }

  const acao = body.acao
  if (acao !== 'pausar' && acao !== 'retomar' && acao !== 'parar') {
    return NextResponse.json({ ok: false, erro: 'acção inválida' }, { status: 400 })
  }
  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ ok: false, erro: 'falta o agente' }, { status: 400 })

  const db = getSupabaseAdmin()
  const r = await acaoManual(db, id, acao, String(body.porque ?? ''))
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro ?? 'não foi possível' }, { status: 500 })

  return NextResponse.json({
    ok: true,
    porque:
      acao === 'parar'
        ? 'Agente parado. A linha fica — parar não apaga, e volta com um clique em Retomar.'
        : acao === 'pausar'
          ? 'Agente pausado. A regra das 48 horas não corre em agentes pausados.'
          : 'Agente retomado.',
  })
}
