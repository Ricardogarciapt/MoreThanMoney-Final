/**
 * LER negócios e tarefas pelo ÂMBITO da pessoa — e mais nada.
 *
 * Isto existe separado das páginas por uma razão de segurança e não de arrumação: o filtro de
 * «quem vê o quê» é escrito UMA vez, aqui, e provado em `lib/backoffice-negocios.check.ts`. Numa
 * página, o filtro é uma linha no meio de trinta de JSX — e é a linha que desaparece numa
 * refactorização sem que nada no ecrã mude, porque o ecrã fica MAIS cheio, não vazio.
 *
 * O ÂMBITO É UMA LISTA DE IDS, sempre. Vem de `ambitoDeLeitura` e entra nos filtros. Não há aqui
 * nenhum `if (é responsável de equipa)`: um `if` esquece-se, uma lista não.
 *
 * UM NEGÓCIO TEM CINCO DONOS POSSÍVEIS
 * `vendas_negocios` guarda cinco atribuições (prospector, setter, closer, team leader, afiliado) e
 * nenhuma é obrigatória. «Os negócios em que participo» é, literalmente, aqueles em que o meu id
 * está em QUALQUER uma delas. Filtrar só por `closer_id` — que é o que parece natural — escondia do
 * setter os negócios que ele marcou.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AmbitoLeitura } from '@/lib/backoffice-papeis'

/** As colunas de atribuição. É por estas cinco que se responde «participo neste negócio?». */
export const COLUNAS_DE_PARTICIPACAO = [
  'prospector_id',
  'setter_id',
  'closer_id',
  'team_leader_id',
  'afiliado_id',
] as const

/**
 * Um id é um uuid, ou não é um id.
 *
 * O filtro do PostgREST monta-se por texto (`or=(col.in.(…))`), e texto montado com valores é o
 * caminho normal para uma injecção. Os ids vêm da nossa própria sessão, o que torna o risco baixo —
 * e é exactamente por ser baixo que a verificação tem de estar escrita: um dia o âmbito passa a vir
 * de outro sítio, e nessa altura ninguém volta aqui.
 */
export function ehUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

/**
 * O filtro «o meu id está em alguma das cinco atribuições», na linguagem do PostgREST.
 *
 * Devolve `null` quando não há nenhum id válido para filtrar — e `null` significa NÃO LER, nunca
 * «ler tudo». Um filtro vazio que o chamador ignorasse devolvia a casa inteira.
 */
export function filtroDeParticipacao(ids: readonly string[]): string | null {
  const limpos = [...new Set(ids.filter(ehUuid))]
  if (limpos.length === 0) return null
  const lista = limpos.join(',')
  return COLUNAS_DE_PARTICIPACAO.map((c) => `${c}.in.(${lista})`).join(',')
}

export interface NegocioLinha {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  pack_previsto: string | null
  origem: string | null
  estado: string
  motivo_perda: string | null
  nota: string | null
  prospector_id: string | null
  setter_id: string | null
  closer_id: string | null
  team_leader_id: string | null
  afiliado_id: string | null
  criado_em: string
  atualizado_em: string
  fechado_em: string | null
}

const COLUNAS_NEGOCIO =
  'id, nome, email, telefone, pack_previsto, origem, estado, motivo_perda, nota, ' +
  'prospector_id, setter_id, closer_id, team_leader_id, afiliado_id, criado_em, atualizado_em, fechado_em'

/**
 * Os negócios que esta pessoa pode ver.
 *
 * `todos` (só o dono) é o único caminho sem filtro, e é explícito. Não existe combinação de listas
 * vazias que dê no mesmo — é essa a diferença entre uma falha que fecha e uma que abre a casa.
 */
export async function negociosDoAmbito(
  supabase: SupabaseClient,
  ambito: AmbitoLeitura,
): Promise<NegocioLinha[]> {
  // O filtro resolve-se ANTES de se tocar na base: quem não tem âmbito não faz pergunta nenhuma.
  // Montar a consulta primeiro e só depois decidir deixava um caminho em que a consulta existe sem
  // filtro — e esse caminho, um dia, é executado.
  const filtro = ambito.todos ? null : filtroDeParticipacao(ambito.ids)
  if (!ambito.todos && !filtro) return []

  let query = supabase
    .from('vendas_negocios')
    .select(COLUNAS_NEGOCIO)
    .order('atualizado_em', { ascending: false })
    .limit(500)
  if (filtro) query = query.or(filtro)

  const { data, error } = await query
  if (error) throw new Error(`Não foi possível ler o pipeline: ${error.message}`)
  return (data ?? []) as unknown as NegocioLinha[]
}

export interface TarefaLinha {
  id: string
  titulo: string
  descricao: string | null
  responsavel_id: string
  negocio_id: string | null
  papel: string | null
  prazo: string | null
  estado: string
  feita_em: string | null
  criado_em: string
}

/**
 * As tarefas que esta pessoa pode ver.
 *
 * Aqui o dono da linha é UM campo (`responsavel_id`), e por isso o filtro é um `.in(...)` simples.
 * As canceladas ficam de fora: uma tarefa cancelada não é trabalho, é histórico, e uma lista de
 * trabalho com histórico dentro deixa de se conseguir usar como lista de trabalho.
 */
export async function tarefasDoAmbito(
  supabase: SupabaseClient,
  ambito: AmbitoLeitura,
): Promise<TarefaLinha[]> {
  // Mesma ordem do que nos negócios, e pela mesma razão.
  const ids = ambito.todos ? [] : ambito.ids.filter(ehUuid)
  if (!ambito.todos && ids.length === 0) return []

  let query = supabase
    .from('vendas_tarefas')
    .select('id, titulo, descricao, responsavel_id, negocio_id, papel, prazo, estado, feita_em, criado_em')
    .in('estado', ['aberta', 'feita'])
    .order('prazo', { ascending: true, nullsFirst: false })
    .limit(500)
  if (ids.length > 0) query = query.in('responsavel_id', ids)

  const { data, error } = await query
  if (error) throw new Error(`Não foi possível ler as tarefas: ${error.message}`)
  return (data ?? []) as unknown as TarefaLinha[]
}

/**
 * Que papéis é que esta pessoa tem NESTE negócio. É o que lhe diz porque é que o negócio aparece
 * na lista dela — e, quando é um responsável a olhar, de quem é o negócio.
 */
export function papeisNoNegocio(negocio: NegocioLinha, pessoaId: string): string[] {
  const mapa: Array<[keyof NegocioLinha, string]> = [
    ['prospector_id', 'Prospector'],
    ['setter_id', 'Setter'],
    ['closer_id', 'Closer'],
    ['team_leader_id', 'Team Leader'],
    ['afiliado_id', 'Afiliado'],
  ]
  return mapa.filter(([c]) => negocio[c] === pessoaId).map(([, nome]) => nome)
}
