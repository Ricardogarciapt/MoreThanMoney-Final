/**
 * O PERCURSO DE CADA PESSOA: as minhas tarefas, os meus negócios, o meu extracto.
 *
 * Esta rota não tem nada que ver com papéis nem permissões — o `userId` vem SEMPRE da sessão
 * (`getAuthenticatedUser`), nunca do corpo do pedido nem da query. É a lição do IDOR das rotas de
 * perfil: aceitar um id do cliente é dar a qualquer pessoa autenticada o extracto de outra.
 *
 * Por isso também não precisa de saber se quem pede é setter, closer ou team leader: cada um vê o
 * que é seu, e quem quiser ver o de outro tem de passar pelo admin.
 */
import { NextResponse } from 'next/server'
import { getAuthenticatedUser, getSupabaseAdmin } from '@/lib/admin-api-helpers'
import { PAPEIS_VENDAS } from '@/lib/vendas/calculo'
import { extractoDaPessoa } from '@/lib/vendas/extracto'

const supabase = getSupabaseAdmin()

const COLUNA_DO_PAPEL: Record<string, string> = {
  prospector: 'prospector_id',
  setter: 'setter_id',
  closer: 'closer_id',
  team_leader: 'team_leader_id',
  afiliado: 'afiliado_id',
}

export async function GET() {
  const { userId, error } = await getAuthenticatedUser()
  if (!userId) return NextResponse.json({ error: error || 'Não autenticado' }, { status: 401 })

  const orDosPapeis = PAPEIS_VENDAS.map((p) => `${COLUNA_DO_PAPEL[p]}.eq.${userId}`).join(',')

  const [tarefas, negocios, extracto] = await Promise.all([
    supabase
      .from('vendas_tarefas')
      .select('id, titulo, descricao, negocio_id, papel, prazo, estado, feita_em')
      .eq('responsavel_id', userId)
      .neq('estado', 'cancelada')
      .order('prazo', { nullsFirst: false })
      .limit(200),
    supabase
      .from('vendas_negocios')
      .select('id, nome, estado, pack_previsto, origem, atualizado_em, prospector_id, setter_id, closer_id, team_leader_id, afiliado_id')
      .or(orDosPapeis)
      .order('atualizado_em', { ascending: false })
      .limit(200),
    extractoDaPessoa(supabase, userId).catch(() => null),
  ])

  const hoje = new Date().toISOString().slice(0, 10)
  const minhasTarefas = (tarefas.data ?? []).map((t) => ({
    ...t,
    atrasada: t.estado === 'aberta' && !!t.prazo && String(t.prazo) < hoje,
  }))

  // Os meus papéis em cada negócio: é o que faz o percurso dela ser legível («aqui marquei, aqui
  // fechei»), em vez de uma lista de nomes sem contexto.
  const meusNegocios = (negocios.data ?? []).map((n) => {
    const linha = n as unknown as Record<string, unknown>
    return {
      id: linha.id,
      nome: linha.nome,
      estado: linha.estado,
      pack_previsto: linha.pack_previsto,
      origem: linha.origem,
      atualizado_em: linha.atualizado_em,
      meus_papeis: PAPEIS_VENDAS.filter((p) => linha[COLUNA_DO_PAPEL[p]] === userId),
    }
  })

  return NextResponse.json({
    tarefas: minhasTarefas,
    negocios: meusNegocios,
    extracto,
  })
}
