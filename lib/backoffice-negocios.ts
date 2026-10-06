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
import { fatiar, lerPagina, type Pagina } from '@/lib/backoffice-paginacao'
import { ESTADOS_PIPELINE, type EstadoPipeline } from '@/lib/backoffice-vista'
import { FILTRO_SEM_DONO } from '@/lib/backoffice-bolsa'

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
export function filtroDeParticipacao(
  ids: readonly string[],
  opcoes: { incluirSemDono?: boolean } = {},
): string | null {
  const limpos = [...new Set(ids.filter(ehUuid))]
  if (limpos.length === 0) return null
  const lista = limpos.join(',')
  const meus = COLUNAS_DE_PARTICIPACAO.map((c) => `${c}.in.(${lista})`)
  /**
   * A BOLSA entra DENTRO deste mesmo `or`, e nunca num `or` à parte.
   *
   * A razão está escrita em `negociosDoAmbito` e é séria: dois `or` no mesmo pedido juntam-se com
   * E mas cada um perde o parêntesis do outro, e o filtro de segurança deixa de ser garantido. Um
   * `and(...)` aninhado mantém tudo num só — ver `FILTRO_SEM_DONO`.
   *
   * O que isto abre, e só isto: negócios em que NINGUÉM está inscrito. Um negócio que já tem dono
   * continua invisível a quem não participa nele.
   */
  if (opcoes.incluirSemDono) meus.push(FILTRO_SEM_DONO)
  return meus.join(',')
}

export interface NegocioLinha {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  /**
   * Os outros canais. Entraram a 01/10/2026 porque sem eles os botões de contacto do pipeline
   * ficavam cegos justamente para quem veio do Instagram e do Telegram — e esses respondem lá e
   * não no email.
   */
  telegram_username: string | null
  telegram_id: string | number | null
  instagram_handle: string | null
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
  /**
   * 06/10/2026 — o AGENTE IA responsável (`agentes_equipa.id`), quando um agente de vendas trabalha
   * este negócio. Não é uma das cinco colunas humanas: um agente não é pessoa nem recebe comissão.
   * Ver `lib/agentes/pipeline-agentes.ts`.
   */
  agente_id?: string | null
  agente_pontuacao?: number | null
  agente_qualificacao?: string | null
}

const COLUNAS_NEGOCIO =
  'id, nome, email, telefone, telegram_username, telegram_id, instagram_handle, ' +
  'pack_previsto, origem, estado, motivo_perda, nota, ' +
  'prospector_id, setter_id, closer_id, team_leader_id, afiliado_id, criado_em, atualizado_em, fechado_em, ' +
  'agente_id, agente_pontuacao, agente_qualificacao'

/**
 * Os negócios que esta pessoa pode ver.
 *
 * `todos` (só o dono) é o único caminho sem filtro, e é explícito. Não existe combinação de listas
 * vazias que dê no mesmo — é essa a diferença entre uma falha que fecha e uma que abre a casa.
 */
export interface Listagem<T> {
  linhas: T[]
  pagina: Pagina
  /** Há linhas para além desta página? Vem da linha extra que se pede sempre. */
  haMais: boolean
}

/** Os filtros que o pipeline aceita do endereço. O que não vier fica de fora da consulta. */
export interface FiltrosNegocios {
  /**
   * Mostrar também os negócios em que ninguém está inscrito — a BOLSA DE LEADS.
   *
   * Decisão do dono a 26/09, depois de se medir que havia 97 negócios e ZERO com vendedor: quem
   * não tem dono fica à vista de quem trabalha o pipeline, e quem quiser pega. Sem isto havia um
   * impasse — um lead sem dono não aparecia a ninguém, logo ninguém se podia atribuir a ele.
   */
  incluirSemDono?: boolean
  estado?: EstadoPipeline | null
  /** Procura no nome do contacto. Já limpa por `lerProcura` — nunca texto cru do endereço. */
  procura?: string | null
  pagina?: Pagina
}

export async function negociosDoAmbito(
  supabase: SupabaseClient,
  ambito: AmbitoLeitura,
  filtros: FiltrosNegocios = {},
): Promise<Listagem<NegocioLinha>> {
  const pagina = filtros.pagina ?? lerPagina(undefined)

  // O filtro resolve-se ANTES de se tocar na base: quem não tem âmbito não faz pergunta nenhuma.
  // Montar a consulta primeiro e só depois decidir deixava um caminho em que a consulta existe sem
  // filtro — e esse caminho, um dia, é executado.
  const filtro = ambito.todos
    ? null
    : filtroDeParticipacao(ambito.ids, { incluirSemDono: filtros.incluirSemDono })
  if (!ambito.todos && !filtro) return { linhas: [], pagina, haMais: false }

  let query = supabase
    .from('vendas_negocios')
    .select(COLUNAS_NEGOCIO)
    .order('atualizado_em', { ascending: false })
    // `range` em vez de `limit`: um limite sem paginação esconde as linhas seguintes com o mesmo
    // aspecto de estar completo. A linha extra (`ate`) é a que responde «há mais?».
    .range(pagina.desde, pagina.ate)
  if (filtro) query = query.or(filtro)
  // O estado vem de um catálogo fechado (`ESTADOS_PIPELINE`), por isso entra directo.
  if (filtros.estado && (ESTADOS_PIPELINE as readonly string[]).includes(filtros.estado)) {
    query = query.eq('estado', filtros.estado)
  }
  // A procura é só pelo NOME. Fazê-la também por email obrigava a montar um `or` por texto — e já
  // existe um `or` nesta consulta (o da participação); dois `or` no mesmo pedido juntam-se com E,
  // mas cada um perde o parêntesis do outro e o filtro de segurança deixava de ser garantido.
  if (filtros.procura) query = query.ilike('nome', `%${filtros.procura}%`)

  const { data, error } = await query
  if (error) throw new Error(`Não foi possível ler o pipeline: ${error.message}`)
  const { linhas, haMais } = fatiar((data ?? []) as unknown as NegocioLinha[], pagina)
  return { linhas, pagina, haMais }
}

export interface TarefaLinha {
  id: string
  titulo: string
  descricao: string | null
  /** Uma pessoa OU um agente (`agente_id`) — desde 06/10 uma tarefa pode ser de um agente IA. */
  responsavel_id: string | null
  agente_id?: string | null
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
export interface FiltrosTarefas {
  /** Que estados entram. Por omissão as abertas e as feitas — as canceladas são histórico. */
  estados?: readonly string[]
  pagina?: Pagina
}

export async function tarefasDoAmbito(
  supabase: SupabaseClient,
  ambito: AmbitoLeitura,
  filtros: FiltrosTarefas = {},
): Promise<Listagem<TarefaLinha>> {
  const pagina = filtros.pagina ?? lerPagina(undefined)

  // Mesma ordem do que nos negócios, e pela mesma razão.
  const ids = ambito.todos ? [] : ambito.ids.filter(ehUuid)
  if (!ambito.todos && ids.length === 0) return { linhas: [], pagina, haMais: false }

  const estados = (filtros.estados ?? ['aberta', 'feita']).filter((e) =>
    ['aberta', 'feita', 'cancelada'].includes(e),
  )
  // Uma lista de estados vazia não é «todos»: é um pedido impossível, e responde-se vazio.
  if (estados.length === 0) return { linhas: [], pagina, haMais: false }

  let query = supabase
    .from('vendas_tarefas')
    .select('id, titulo, descricao, responsavel_id, agente_id, negocio_id, papel, prazo, estado, feita_em, criado_em')
    .in('estado', estados)
    .order('prazo', { ascending: true, nullsFirst: false })
    .range(pagina.desde, pagina.ate)
  if (ids.length > 0) query = query.in('responsavel_id', ids)

  const { data, error } = await query
  if (error) throw new Error(`Não foi possível ler as tarefas: ${error.message}`)
  const { linhas, haMais } = fatiar((data ?? []) as unknown as TarefaLinha[], pagina)
  return { linhas, pagina, haMais }
}

/**
 * ESTE NEGÓCIO É DESTA PESSOA? — o id dela em qualquer uma das cinco atribuições.
 *
 * É a mesma pergunta que `filtroDeParticipacao` faz à base, só que em memória. Existe porque as
 * páginas precisam dela para dizer DE QUEM é cada linha quando um responsável está a ver a equipa,
 * e escrevê-la duas vezes (uma por página) garantia que um dia as duas deixavam de concordar.
 */
export function participaNoNegocio(negocio: NegocioLinha, pessoaId: string): boolean {
  return COLUNAS_DE_PARTICIPACAO.some((c) => negocio[c] === pessoaId)
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
