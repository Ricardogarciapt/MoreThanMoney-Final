/**
 * MARCAR UMA TAREFA COMO FEITA — a única escrita que o backoffice da equipa faz.
 *
 * PORQUE É QUE SÓ ESTA
 * As páginas do backoffice mostram. Criar negócios, mover estados e aprovar comissões são actos com
 * consequências a jusante (uma venda ganha faz nascer comissões, uma comissão aprovada é dinheiro a
 * sair) e fazem-se no admin, por quem responde por eles. Riscar a própria tarefa não tem jusante
 * nenhum: é a pessoa a dizer que já fez o que lhe pediram.
 *
 * O DONO DA TAREFA É VERIFICADO NA CONSULTA, NÃO NO CÓDIGO
 * O `update` leva `.eq('responsavel_id', ctx.userId)` — e esse id vem da sessão que o Supabase já
 * verificou, nunca do corpo do pedido. Assim não existe o caminho em que alguém manda o id de uma
 * tarefa que não é dele e a rota o acredita: a base não encontra linha e a resposta é 404. Uma
 * verificação escrita como `if (tarefa.responsavel_id !== ctx.userId)` faria o mesmo — até ao dia em
 * que alguém reordenasse o código e o `if` ficasse depois da escrita.
 *
 * 404 E NÃO 403 quando a tarefa não é da pessoa: responder 403 confirmava que a tarefa existe, e
 * quem pergunta pelo id de outra pessoa não tem nada a saber sobre ela.
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }
  const feita = body.feita === true

  // Reabrir é tão legítimo como fechar: quem marca por engano tem de poder desfazer sem pedir
  // a ninguém. `feita_em` acompanha o estado para não ficar uma data de conclusão numa tarefa aberta.
  const { data, error } = await getSupabaseAdmin()
    .from('vendas_tarefas')
    .update({
      estado: feita ? 'feita' : 'aberta',
      feita_em: feita ? new Date().toISOString() : null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('responsavel_id', ctx.userId)
    // Cancelada é uma decisão de quem a criou: não se reabre daqui.
    .in('estado', ['aberta', 'feita'])
    .select('id, estado, feita_em')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json(
      { error: 'Tarefa não encontrada', detalhe: 'Ou não existe, ou não é tua.' },
      { status: 404 },
    )
  }

  return NextResponse.json({ ok: true, tarefa: data })
}
