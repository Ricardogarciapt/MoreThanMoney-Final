/**
 * CRIAR UM NEGÓCIO — a entrada do funil, feita por quem vende e não pelo admin.
 *
 * Até aqui um lead só entrava no pipeline se o Ricardo o lançasse à mão. Quem anda a prospectar
 * trabalhava numa lista paralela (no telemóvel, no caderno) e o sistema só sabia dos que fechavam —
 * ou seja, sabia exactamente dos negócios de que não precisava de ajuda.
 *
 * QUEM CRIA FICA DENTRO. O papel escolhido põe o criador numa das cinco colunas de atribuição, e
 * isso não é opcional: o pipeline filtra por participação, portanto um negócio criado sem ninguém
 * atribuído desaparecia no momento em que era criado — e ninguém lhe conseguia mexer depois. O
 * papel tem de ser um dos papéis ACTIVOS de quem cria (`validarNegocioNovo`), senão um setter
 * criava negócios já com o lugar de closer ocupado por ele, e a comissão de fecho ia atrás.
 *
 * O PRIMEIRO EVENTO ESCREVE-SE AQUI. Um negócio cujo histórico começa no segundo movimento não
 * consegue responder a «quem é que trouxe este nome».
 *
 * O que esta rota NÃO faz: nada em `vendas_vendas` nem em `vendas_comissoes`. Um negócio é uma
 * previsão; a venda nasce do pagamento confirmado.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { validarNegocioNovo } from '@/lib/backoffice-escrita'

export async function POST(request: NextRequest) {
  const ctx = await exigirCapacidade(request, 'bo.pipeline_proprio')
  if (ctx instanceof NextResponse) return ctx

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const validado = validarNegocioNovo({
    corpo: body,
    autorId: ctx.userId,
    papeisDoAutor: ctx.papeis,
    ehDono: ctx.admin,
  })
  if (!validado.ok) return NextResponse.json({ error: validado.erro }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('vendas_negocios')
    .insert(validado.valor.linha)
    .select('id, nome, estado')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Não consegui criar o negócio.' }, { status: 500 })

  // O evento de nascimento. `de` é nulo porque não veio de lado nenhum — é a primeira linha do
  // percurso, e é ela que diz quem trouxe este nome.
  const { error: erroEvento } = await supabase.from('vendas_negocio_eventos').insert({
    negocio_id: data.id,
    de: null,
    para: String(data.estado),
    por: ctx.userId,
    nota: `Criado como ${validado.valor.papel}.`,
  })

  return NextResponse.json({
    ok: true,
    negocio: data,
    // Se o evento falhar, o negócio já existe e não se apaga por isso — mas diz-se, porque um
    // histórico com um buraco é uma discussão futura sobre quem fez o quê.
    aviso_historico: erroEvento ? 'O negócio foi criado, mas o primeiro evento do histórico não ficou gravado.' : undefined,
  })
}
