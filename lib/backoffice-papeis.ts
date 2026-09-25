/**
 * QUEM É QUEM NO BACKOFFICE — papéis, capacidades e o âmbito de cada uma.
 *
 * PORQUÊ ISTO EXISTE
 * O Ricardo passa a ter uma equipa a vender por ele: gente que marca reuniões (setter), gente que
 * fecha (closer), gente que traz nomes (prospector), afiliados que só divulgam, e responsáveis de
 * equipa. Cada uma dessas pessoas entra no MESMO backoffice, e cada uma tem de ver apenas o SEU
 * percurso e o SEU dinheiro. Um setter não pode ver o que outro setter ganhou — não é uma
 * preferência de interface, é a condição para haver equipa.
 *
 * O ficheiro é PURO de propósito: sem base de dados, sem rede, sem `next/*`. A decisão de deixar
 * entrar tem de ser testável num `npx tsx` de dois segundos, e não dependente de uma sessão viva.
 * Quem lê a base é `lib/backoffice-sessao.ts`; quem decide é isto.
 *
 * REGRA DA CASA: negar por omissão. Uma capacidade que não esteja escrita aqui NÃO existe, e uma
 * pessoa sem papéis activos não entra — mesmo que seja membro pagante do site há três anos. Ser
 * cliente e ser da equipa são duas coisas diferentes, e só se confundem quando alguém baralha os
 * dois portões (ver `lib/backoffice-acessos-site.ts`).
 */

/** Os cinco papéis. Uma pessoa pode acumular vários — um team leader normalmente também fecha. */
export const PAPEIS = ['afiliado', 'setter', 'closer', 'prospector', 'team_leader'] as const
export type Papel = (typeof PAPEIS)[number]

export function ehPapel(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor)
}

/** Nome apresentável — o backoffice fala português, não fala `snake_case`. */
export const PAPEL_NOME: Record<Papel, string> = {
  afiliado: 'Afiliado',
  setter: 'Setter',
  closer: 'Closer',
  prospector: 'Prospector',
  team_leader: 'Team Leader',
}

/**
 * CAPACIDADES — o que se pode fazer, não o que se é.
 *
 * As rotas e o middleware perguntam sempre por capacidade («pode ver o extracto?») e nunca por
 * papel («é setter?»). Se perguntassem por papel, cada porta nova teria de conhecer os cinco
 * papéis e o dia em que aparecesse o sexto ficavam todas erradas em silêncio.
 *
 * Os nomes com sufixo dizem o ÂMBITO, que é a parte que protege o dinheiro:
 *   · `_proprio`  → só as linhas onde a pessoa é a protagonista
 *   · `_equipa`   → as linhas dos liderados, ver `ambitoDeLeitura`
 *   · `_todos`    → tudo, e isto é só do dono
 */
export const CAPACIDADES = [
  /** Entrar no backoffice. Sem isto não há sequer página — é o portão da porta da rua. */
  'bo.entrar',
  /** Ver o SEU extracto: um só, somando MLM binário e comissões por papel. */
  'bo.extracto_proprio',
  /** Ver o extracto dos liderados. Hoje só o team_leader, e com o âmbito por decidir (ver README do lote). */
  'bo.extracto_equipa',
  /** Ver tudo o que se paga a todos. Só o dono. */
  'bo.extracto_todos',
  /** Materiais, links de divulgação e código de afiliado próprio. */
  'bo.material',
  /** Os seus contactos/leads. */
  'bo.leads_proprias',
  'bo.leads_equipa',
  /** O pipeline de vendas (construído pelo outro lado da casa — aqui só se define quem lá entra). */
  'bo.pipeline_proprio',
  'bo.pipeline_equipa',
  /** Tarefas atribuídas. */
  'bo.tarefas_proprias',
  'bo.tarefas_equipa',
  /** Ver a composição da equipa (quem lidera quem). */
  'bo.equipa_ver',
  /** Dar e tirar papéis, criar afiliados, escolher acessos ao site. Só o dono. */
  'bo.papeis_gerir',
] as const
export type Capacidade = (typeof CAPACIDADES)[number]

/**
 * O MAPA. É a única lista que responde «quem vê o quê», e por isso vive num sítio só.
 *
 * Nota sobre o afiliado: ele divulga e recebe: não marca reuniões nem fecha, por isso não tem
 * pipeline nem tarefas. Dar-lhe o pipeline «porque não custa nada» custa exactamente isto — ele
 * passaria a ver os contactos que outra pessoa trabalhou.
 */
const MAPA: Record<Papel, readonly Capacidade[]> = {
  afiliado: ['bo.entrar', 'bo.extracto_proprio', 'bo.material'],
  prospector: ['bo.entrar', 'bo.extracto_proprio', 'bo.material', 'bo.leads_proprias', 'bo.tarefas_proprias'],
  setter: [
    'bo.entrar',
    'bo.extracto_proprio',
    'bo.material',
    'bo.leads_proprias',
    'bo.pipeline_proprio',
    'bo.tarefas_proprias',
  ],
  closer: [
    'bo.entrar',
    'bo.extracto_proprio',
    'bo.material',
    'bo.leads_proprias',
    'bo.pipeline_proprio',
    'bo.tarefas_proprias',
  ],
  team_leader: [
    'bo.entrar',
    'bo.extracto_proprio',
    'bo.extracto_equipa',
    'bo.material',
    'bo.leads_proprias',
    'bo.leads_equipa',
    'bo.pipeline_proprio',
    'bo.pipeline_equipa',
    'bo.tarefas_proprias',
    'bo.tarefas_equipa',
    'bo.equipa_ver',
  ],
}

/** O que um papel dá, sozinho. Útil para explicar no admin antes de atribuir. */
export function capacidadesDoPapel(papel: Papel): readonly Capacidade[] {
  return MAPA[papel] ?? []
}

/**
 * A união dos papéis activos, mais o que o dono acumula por ser dono.
 *
 * O admin NÃO é um atalho espalhado por cada rota (`if (isAdmin) return true`) — é uma linha só,
 * aqui, que lhe dá todas as capacidades. Assim a autorização de quem manda passa pelo mesmo
 * caminho de código que a de todos os outros, e um engano num `if` distraído não abre uma porta
 * a quem não é dono.
 */
export function capacidadesDe(papeis: readonly Papel[], opts?: { admin?: boolean }): Set<Capacidade> {
  if (opts?.admin) return new Set(CAPACIDADES)
  const out = new Set<Capacidade>()
  for (const p of papeis) {
    for (const c of capacidadesDoPapel(p)) out.add(c)
  }
  return out
}

/** A pergunta que as rotas fazem. Sem capacidade → falso. Sempre. */
export function pode(capacidades: ReadonlySet<Capacidade>, capacidade: Capacidade): boolean {
  return capacidades.has(capacidade)
}

/**
 * ÂMBITO DE LEITURA — de quem é que esta pessoa pode ver linhas.
 *
 * Isto é o coração da separação entre colegas. Devolve a lista de ids cujas linhas podem ser
 * lidas, e o chamador filtra por ela. Devolver uma lista (em vez de um booleano «vê a equipa»)
 * é deliberado: uma consulta com `.in('dono_id', ambito)` não tem como esquecer-se do filtro,
 * enquanto um `if` antes da consulta tem.
 *
 * `todos: true` só acontece com `bo.extracto_todos`, ou seja, só ao dono. Nesse caso `ids` vem
 * vazio e o chamador não filtra nada.
 *
 * O caso que importa: um team_leader SEM equipa carregada só se vê a si. Se a lista dos liderados
 * não chegar (ainda não há modelo de equipa, ou a leitura falhou), o resultado fecha em vez de
 * abrir. É a diferença entre uma falha que não mostra nada e uma falha que mostra tudo.
 */
export interface AmbitoLeitura {
  proprioId: string
  ids: string[]
  todos: boolean
}

/**
 * AS QUATRO FAMÍLIAS de leitura do backoffice — uma por página. Tem nome porque é repetida em cinco
 * ficheiros (aqui, nas equipas, na vista, nas páginas) e uma união escrita à mão em cinco sítios é
 * uma união que um dia deixa de ser a mesma nos cinco.
 */
export type FamiliaAmbito = 'extracto' | 'leads' | 'pipeline' | 'tarefas'

export function ambitoDeLeitura(
  capacidades: ReadonlySet<Capacidade>,
  proprioId: string,
  familia: FamiliaAmbito,
  liderados: readonly string[] = [],
): AmbitoLeitura {
  if (familia === 'extracto' && pode(capacidades, 'bo.extracto_todos')) {
    return { proprioId, ids: [], todos: true }
  }

  const proprias: Record<FamiliaAmbito, Capacidade> = {
    extracto: 'bo.extracto_proprio',
    leads: 'bo.leads_proprias',
    pipeline: 'bo.pipeline_proprio',
    tarefas: 'bo.tarefas_proprias',
  }
  const equipa: Record<FamiliaAmbito, Capacidade> = {
    extracto: 'bo.extracto_equipa',
    leads: 'bo.leads_equipa',
    pipeline: 'bo.pipeline_equipa',
    tarefas: 'bo.tarefas_equipa',
  }

  // Nem o âmbito próprio? Então não lê nada — nem a sua própria linha.
  if (!pode(capacidades, proprias[familia])) {
    return { proprioId, ids: [], todos: false }
  }

  const ids = new Set<string>([proprioId])
  if (pode(capacidades, equipa[familia])) {
    for (const id of liderados) if (id) ids.add(id)
  }
  return { proprioId, ids: [...ids], todos: false }
}

/** Atalho honesto: esta pessoa pode ver as linhas desta outra? */
export function podeVerLinhaDe(ambito: AmbitoLeitura, donoId: string): boolean {
  if (ambito.todos) return true
  return ambito.ids.includes(donoId)
}
