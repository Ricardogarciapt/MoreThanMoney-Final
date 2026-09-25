/**
 * AS TAREFAS DA EQUIPA — criar, riscar, reabrir, cancelar e mudar o prazo.
 *
 * QUEM MEXE NAS DE QUEM
 * Uma pessoa mexe nas SUAS; quem responde por uma equipa mexe nas dos liderados. E isso não se
 * escreve como `.eq('responsavel_id', ctx.userId)` (que fecharia o responsável fora da sua própria
 * equipa) nem como `if (é responsável) lê tudo` (que abriria a casa inteira): escreve-se
 * `.in('responsavel_id', ambito.ids)`, com a LISTA que vem de `ambitoDaEquipa`. Uma consulta
 * filtrada por lista não tem como esquecer-se do filtro; um `if` antes dela tem.
 *
 * A LISTA ENTRA NA CONSULTA, não num `if` depois de ler. Assim não existe o caminho em que alguém
 * manda o id de uma tarefa que não é dele e a rota o acredita: a base não encontra linha e a
 * resposta é 404. E 404 e não 403, porque 403 confirmava que a tarefa existe — quem pergunta pelo
 * id de outra pessoa não tem nada a saber sobre ela.
 *
 * CANCELAR NÃO É APAGAR. Nada aqui faz `delete`: uma tarefa cancelada sai da lista de trabalho e
 * fica na base. Uma lista de trabalho com histórico dentro deixa de se conseguir usar como lista
 * de trabalho, mas apagar o histórico deixa de responder a «isto ficou por fazer ou foi anulado?».
 *
 * Só se escreve em `vendas_tarefas`. Nem venda, nem comissão: uma tarefa feita não é dinheiro.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ambitoDaEquipa } from '@/lib/backoffice-equipas'
import { pode } from '@/lib/backoffice-papeis'
import { COLUNAS_DE_PARTICIPACAO, ehUuid } from '@/lib/backoffice-negocios'
import { podeMexerNoNegocio, validarMudancaDeTarefa, validarTarefaNova } from '@/lib/backoffice-escrita'
import type { AtribuicoesDoNegocio } from '@/lib/backoffice-escrita'

/**
 * CRIAR uma tarefa. Por defeito é para quem a cria; para outra pessoa só com âmbito de equipa e só
 * para alguém dentro da lista (`validarTarefaNova`).
 */
export async function POST(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.tarefas_proprias')
  if (ctx instanceof NextResponse) return ctx

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const ambito = await ambitoDaEquipa(supabase, ctx, 'tarefas')

  const validada = validarTarefaNova({
    corpo: body,
    autorId: ctx.userId,
    ambitoTarefas: ambito,
    temAmbitoEquipa: pode(ctx.capacidades, 'bo.tarefas_equipa'),
  })
  if (!validada.ok) return NextResponse.json({ error: validada.erro }, { status: 400 })

  // LIGAR A TAREFA A UM NEGÓCIO obriga a provar que o negócio é do âmbito de quem cria. Sem isto,
  // qualquer pessoa pendurava tarefas em negócios alheios — e uma tarefa num negócio é uma coisa
  // que aparece no ecrã de quem o trabalha.
  const negocioId = validada.valor.negocio_id
  if (typeof negocioId === 'string') {
    const ambitoPipeline = await ambitoDaEquipa(supabase, ctx, 'pipeline')
    const { data } = await supabase
      .from('vendas_negocios')
      .select(`id, ${COLUNAS_DE_PARTICIPACAO.join(', ')}`)
      .eq('id', negocioId)
      .maybeSingle()
    const negocio = (data ?? null) as (AtribuicoesDoNegocio & { id: string }) | null
    if (!negocio || !podeMexerNoNegocio(negocio, ambitoPipeline)) {
      return NextResponse.json(
        { error: 'Negócio não encontrado', detalhe: 'Ou não existe, ou não participas nele.' },
        { status: 404 },
      )
    }
  }

  const { data, error } = await supabase
    .from('vendas_tarefas')
    .insert(validada.valor)
    .select('id, titulo, estado, prazo, responsavel_id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tarefa: data })
}

/**
 * MEXER numa tarefa que já existe: riscar, reabrir, cancelar, mudar o prazo.
 *
 * Lê-se primeiro COM O FILTRO do âmbito (é a leitura que decide se a pessoa pode), porque a
 * validação precisa do estado actual — uma cancelada não se reabre daqui. Depois escreve-se com o
 * mesmo filtro: nem a leitura nem a escrita confiam no id que veio no corpo.
 */
export async function PATCH(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.tarefas_proprias')
  if (ctx instanceof NextResponse) return ctx

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const id = String(body.id ?? '').trim()
  if (!ehUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const ambito = await ambitoDaEquipa(supabase, ctx, 'tarefas')
  // Sem âmbito nenhum não se pergunta nada à base. Um `.in(..., [])` devolveria vazio, mas confiar
  // nisso deixava ao PostgREST a decisão que é nossa.
  const ids = ambito.ids.filter(ehUuid)
  if (!ambito.todos && ids.length === 0) {
    return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })
  }

  let leitura = supabase.from('vendas_tarefas').select('id, estado, responsavel_id').eq('id', id)
  if (!ambito.todos) leitura = leitura.in('responsavel_id', ids)
  const { data: tarefa, error: erroLeitura } = await leitura.maybeSingle()

  if (erroLeitura) return NextResponse.json({ error: erroLeitura.message }, { status: 500 })
  if (!tarefa) {
    return NextResponse.json(
      { error: 'Tarefa não encontrada', detalhe: 'Ou não existe, ou não é tua nem da tua equipa.' },
      { status: 404 },
    )
  }

  const mudanca = validarMudancaDeTarefa({ corpo: body, estadoActual: String(tarefa.estado) })
  if (!mudanca.ok) return NextResponse.json({ error: mudanca.erro }, { status: 400 })

  let escrita = supabase.from('vendas_tarefas').update(mudanca.valor).eq('id', id)
  if (!ambito.todos) escrita = escrita.in('responsavel_id', ids)
  const { data, error } = await escrita.select('id, estado, feita_em, prazo').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })

  return NextResponse.json({ ok: true, tarefa: data })
}
