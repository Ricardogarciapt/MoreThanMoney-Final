/**
 * LER a base para decidir a quem pertence um pagamento — e colar a ligação quando a descobre.
 *
 * A decisão é de `lib/vendas/atribuicao.ts` (pura, testável). Isto é só o que tem de falar com o
 * Supabase: buscar os candidatos e, quando o negócio foi encontrado por um caminho indirecto
 * (chave de origem ou email), gravar o `comprador_id` na linha.
 *
 * PORQUE É QUE SE COLA A LIGAÇÃO
 * Sem isso, cada pagamento voltava a fazer a mesma descoberta por email, e — pior — o admin
 * continuava a ver o negócio sem comprador, sem forma de saber que o dinheiro dele já entrou. Uma
 * vez descoberta, a ligação é um facto: fica escrita. O `where comprador_id is null` garante que
 * nunca se reescreve uma ligação que outra pessoa já tinha feito à mão.
 *
 * ESTE FICHEIRO É O ÚNICO SÍTIO onde as duas portas do dinheiro (o livro, que paga a tabela de
 * papéis, e a exclusividade, que decide se o binário se cala) perguntam «qual é o negócio desta
 * pessoa». Tinham dois caminhos diferentes e podiam responder diferente — e quando respondiam
 * diferente, ou pagava duas vezes ou não pagava nada.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  escolherNegocio,
  type NegocioCandidato,
  type ResolucaoNegocio,
  type ViaDaAtribuicao,
} from './atribuicao'

/** Tudo o que a decisão precisa de ler, e nada mais. */
const COLUNAS_CANDIDATO = 'id, estado, comprador_id, email, chave_origem, atualizado_em'

export type NegocioResolvido = ResolucaoNegocio & {
  /** A linha escolhida, para quem precisa das colunas de atribuição sem uma segunda consulta. */
  negocio: Record<string, unknown> | null
}

/**
 * Os negócios que podem ser desta pessoa.
 *
 * Três consultas em paralelo em vez de um `or(...)`: o filtro `or` do PostgREST com um email por
 * interpolação é uma porta de injecção de filtros (um email com vírgula ou parêntesis muda a
 * consulta), e aqui o email vem de um perfil que o próprio utilizador escolheu.
 */
async function candidatos(
  supabase: SupabaseClient,
  compradorId: string | null,
  emails: string[],
): Promise<NegocioCandidato[]> {
  const consultas: Promise<{ data: unknown[] | null }>[] = []

  if (compradorId) {
    consultas.push(
      supabase.from('vendas_negocios').select(COLUNAS_CANDIDATO).eq('comprador_id', compradorId).limit(20) as never,
    )
    consultas.push(
      supabase.from('vendas_negocios').select(COLUNAS_CANDIDATO).eq('chave_origem', `perfil:${compradorId}`).limit(20) as never,
    )
  }
  for (const email of emails) {
    consultas.push(
      supabase.from('vendas_negocios').select(COLUNAS_CANDIDATO).ilike('email', email).limit(20) as never,
    )
  }
  if (consultas.length === 0) return []

  const respostas = await Promise.all(consultas)
  const porId = new Map<string, NegocioCandidato>()
  for (const r of respostas) {
    for (const linha of (r.data ?? []) as Record<string, unknown>[]) {
      const id = String(linha.id ?? '')
      if (id) porId.set(id, linha as unknown as NegocioCandidato)
    }
  }
  return [...porId.values()]
}

/**
 * Gravar a ligação descoberta. Nunca faz falhar o pagamento: o dinheiro já entrou, e uma coluna
 * que não se conseguiu escrever resolve-se na próxima vez (ou à mão).
 */
async function colarComprador(
  supabase: SupabaseClient,
  negocioId: string,
  compradorId: string,
  via: ViaDaAtribuicao,
): Promise<void> {
  try {
    await supabase
      .from('vendas_negocios')
      .update({ comprador_id: compradorId })
      .eq('id', negocioId)
      .is('comprador_id', null)
  } catch (err) {
    console.error('[VENDAS] não foi possível colar o comprador ao negócio', { negocioId, via, err })
  }
}

/**
 * O negócio desta pessoa, com as colunas que se pedirem por cima das da decisão.
 *
 * `colunasExtra` existe para quem precisa das atribuições (`closer_id` e companhia) sem ir buscar a
 * linha outra vez — o livro precisa delas para calcular, a exclusividade para saber se há alguém.
 */
export async function resolverNegocioDoComprador(
  supabase: SupabaseClient,
  opcoes: {
    compradorId?: string | null
    /**
     * Email conhecido por fora do perfil — o do checkout, tipicamente. Soma-se ao do perfil em vez
     * de o substituir: quem paga com um email e tem a conta noutro é conhecido pelos dois, e o lead
     * podia ter entrado por qualquer um deles.
     */
    email?: string | null
    negocioIdExplicito?: string | null
    colunasExtra?: string[]
  },
): Promise<NegocioResolvido> {
  const compradorId = opcoes.compradorId ? String(opcoes.compradorId) : null
  const colunas = [...new Set(['id', 'estado', 'comprador_id', 'email', 'chave_origem', 'atualizado_em', ...(opcoes.colunasExtra ?? [])])].join(', ')

  // Um negócio dito por um humano manda sobre qualquer descoberta automática: alguém assumiu a
  // escolha, e o código não tem autoridade para a corrigir.
  if (opcoes.negocioIdExplicito) {
    const { data } = await supabase.from('vendas_negocios').select(colunas).eq('id', opcoes.negocioIdExplicito).maybeSingle()
    if (data) {
      return {
        negocio: data as unknown as Record<string, unknown>,
        negocioId: String((data as unknown as Record<string, unknown>).id),
        via: 'comprador',
        ambiguo: false,
        motivo: 'Negócio indicado explicitamente.',
      }
    }
  }

  const emails = new Set<string>()
  if (opcoes.email) emails.add(String(opcoes.email).trim().toLowerCase())
  if (compradorId) {
    const { data: perfil } = await supabase.from('profiles').select('email').eq('id', compradorId).maybeSingle()
    const doPerfil = (perfil?.email as string | undefined)?.trim().toLowerCase()
    if (doPerfil) emails.add(doPerfil)
  }
  const listaEmails = [...emails].filter(Boolean)

  const lista = await candidatos(supabase, compradorId, listaEmails)
  const escolha = escolherNegocio(lista, compradorId, listaEmails)
  if (!escolha.negocioId) return { ...escolha, negocio: null }

  // A ligação passa a ser um facto gravado — ver o comentário do topo.
  if (compradorId && escolha.via !== 'comprador') {
    await colarComprador(supabase, escolha.negocioId, compradorId, escolha.via!)
  }

  const { data } = await supabase.from('vendas_negocios').select(colunas).eq('id', escolha.negocioId).maybeSingle()
  return { ...escolha, negocio: (data as unknown as Record<string, unknown>) ?? null }
}
