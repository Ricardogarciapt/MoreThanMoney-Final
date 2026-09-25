/**
 * QUEM LIDERA QUEM — a leitura que abre (ou fecha) o acesso ao dinheiro dos outros.
 *
 * É ISTO que as páginas de `backoffice.morethanmoney.pt` consomem. A função é
 * {@link lideradosDe}: dá-lhe o id de um líder e devolve a lista de ids que ele pode ler. Para o
 * caso completo — «dá-me o âmbito já resolvido para esta família» — usa-se {@link ambitoDaEquipa},
 * que junta as capacidades, o próprio e os liderados numa chamada só.
 *
 * O padrão nas rotas do backoffice é sempre o mesmo, e a última linha é a que importa:
 *
 *   const ctx = await exigirCapacidade(request, 'bo.extracto_proprio')
 *   if (ctx instanceof NextResponse) return ctx
 *   const ambito = await ambitoDaEquipa(ctx, 'extracto')
 *   ...query.in('beneficiario_id', ambito.ids)   // ← o filtro vem do âmbito, nunca de um `if`
 *
 * REGRA DA CASA, e é a razão de este ficheiro existir em vez de um `join` espalhado por cada rota:
 * **na dúvida, a lista vem vazia**. Erro de base, tabela em falta, id estranho, resposta com um
 * formato que não se esperava — tudo isso devolve `[]`, e `[]` significa «esta pessoa só se vê a
 * si». Nunca lança. Um `throw` aqui dava 500 numa página de extracto; um `[]` dá uma página sem
 * linhas de terceiros, que é o comportamento correcto quando não se sabe.
 *
 * NÃO HÁ RECURSÃO (migração 131, decisão 2): devolvem-se os membros DIRECTOS das equipas que a
 * pessoa lidera. Se um membro for ele próprio líder, a equipa dele não sobe. Expandir em cadeia
 * escreve-se em cinco linhas e não se audita à vista — e um engano dá acesso a linhas de gente que
 * o líder de cima nunca conheceu.
 */

import type { AmbitoLeitura, Capacidade } from '@/lib/backoffice-papeis'
import { ambitoDeLeitura, pode } from '@/lib/backoffice-papeis'

/**
 * O mínimo de um cliente Supabase que estas leituras usam — igual em espírito ao
 * `ClienteLeitura` de `lib/backoffice-papeis-leitura.ts`: serve o do servidor (service role) e o da
 * sessão, e deixa os testes passarem um duplo de três linhas sem rede nenhuma.
 */
export type ClienteEquipas = {
  from: (tabela: string) => any
}

/** Uma equipa, como o admin a mostra. */
export interface EquipaLinha {
  id: string
  nome: string
  liderId: string
  criadaEm: string | null
  arquivadaEm: string | null
  nota: string | null
}

/** Uma pertença activa (ou histórica) a uma equipa. */
export interface MembroLinha {
  id: string
  equipaId: string
  membroId: string
  desde: string | null
  ate: string | null
  nota: string | null
}

const T_EQUIPAS = 'backoffice_equipas'
const T_MEMBROS = 'backoffice_equipa_membros'

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length > 0 ? valor : null
}

/**
 * AS EQUIPAS QUE ESTA PESSOA LIDERA (só as activas).
 *
 * Separada de {@link lideradosDe} porque o admin precisa das equipas em si (nome, para desenhar o
 * ecrã) e o backoffice precisa só dos ids dos membros.
 */
export async function equipasQueLidera(
  supabase: ClienteEquipas,
  liderId: string,
): Promise<EquipaLinha[]> {
  if (!liderId) return []
  try {
    const { data, error } = await supabase
      .from(T_EQUIPAS)
      .select('id, nome, lider_id, criada_em, arquivada_em, nota')
      .eq('lider_id', liderId)
      .is('arquivada_em', null)

    if (error || !Array.isArray(data)) return []
    return (data as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      nome: String(r.nome ?? ''),
      liderId: String(r.lider_id ?? ''),
      criadaEm: texto(r.criada_em),
      arquivadaEm: texto(r.arquivada_em),
      nota: texto(r.nota),
    }))
  } catch {
    return []
  }
}

/**
 * ⭐ A FUNÇÃO. Os ids que um team leader pode ler — os membros activos das equipas que lidera.
 *
 * O que ela NÃO faz, e é deliberado:
 *  · não inclui o próprio líder (isso é o âmbito próprio, e junta-se em {@link ambitoDaEquipa});
 *  · não verifica se a pessoa TEM a capacidade de equipa. Quem decide isso é
 *    `lib/backoffice-papeis.ts`, e é lá que a decisão tem de viver para ser testável sem base de
 *    dados. Uma lista de liderados entregue a quem não tem `bo.*_equipa` é ignorada por
 *    `ambitoDeLeitura` — verificado em `lib/backoffice-papeis.check.ts`. Ainda assim, quem chama
 *    directamente deve preferir {@link ambitoDaEquipa}, que faz as duas coisas na ordem certa.
 *
 * Devolve sempre uma lista sem repetições e sem o próprio. Em qualquer falha: `[]`.
 */
export async function lideradosDe(supabase: ClienteEquipas, liderId: string): Promise<string[]> {
  if (!liderId) return []
  try {
    const equipas = await equipasQueLidera(supabase, liderId)
    if (equipas.length === 0) return []

    const { data, error } = await supabase
      .from(T_MEMBROS)
      .select('membro_id, ate')
      .in(
        'equipa_id',
        equipas.map((e) => e.id),
      )
      .is('ate', null)

    if (error || !Array.isArray(data)) return []

    const ids = new Set<string>()
    for (const linha of data as Array<Record<string, unknown>>) {
      const id = texto(linha.membro_id)
      // O próprio nunca entra na lista de liderados: o trigger da migração 131 já o impede na base,
      // e filtrá-lo aqui também faz com que uma linha antiga (de antes do trigger) não confunda
      // «vejo-me a mim» com «lidero-me a mim».
      if (id && id !== liderId) ids.add(id)
    }
    return [...ids]
  } catch {
    return []
  }
}

/**
 * A EQUIPA DE UMA PESSOA — a quem é que ela responde. Serve o ecrã dela («o teu responsável é…») e
 * serve o admin, que precisa de saber se já está noutra equipa antes de a mover.
 *
 * `null` quando não está em nenhuma, e `null` também quando a leitura falha: não se inventa
 * responsável a ninguém.
 */
export async function equipaDoMembro(
  supabase: ClienteEquipas,
  membroId: string,
): Promise<{ equipa: EquipaLinha; membro: MembroLinha } | null> {
  if (!membroId) return null
  try {
    const { data, error } = await supabase
      .from(T_MEMBROS)
      .select('id, equipa_id, membro_id, desde, ate, nota')
      .eq('membro_id', membroId)
      .is('ate', null)
      .maybeSingle()

    if (error || !data) return null
    const m = data as Record<string, unknown>

    const { data: eq } = await supabase
      .from(T_EQUIPAS)
      .select('id, nome, lider_id, criada_em, arquivada_em, nota')
      .eq('id', String(m.equipa_id))
      .maybeSingle()

    if (!eq) return null
    const e = eq as Record<string, unknown>
    // Equipa arquivada não é equipa: deixou de dar acesso no momento em que foi arquivada, e
    // mostrá-la como actual dizia à pessoa que tem um responsável que já não tem.
    if (texto(e.arquivada_em)) return null

    return {
      equipa: {
        id: String(e.id),
        nome: String(e.nome ?? ''),
        liderId: String(e.lider_id ?? ''),
        criadaEm: texto(e.criada_em),
        arquivadaEm: null,
        nota: texto(e.nota),
      },
      membro: {
        id: String(m.id),
        equipaId: String(m.equipa_id),
        membroId: String(m.membro_id),
        desde: texto(m.desde),
        ate: null,
        nota: texto(m.nota),
      },
    }
  } catch {
    return null
  }
}

/** O mínimo do contexto do backoffice que o âmbito precisa — evita importar a sessão aqui. */
export interface ContextoParaAmbito {
  userId: string
  capacidades: ReadonlySet<Capacidade>
}

const CAPACIDADE_EQUIPA: Record<'extracto' | 'leads' | 'pipeline' | 'tarefas', Capacidade> = {
  extracto: 'bo.extracto_equipa',
  leads: 'bo.leads_equipa',
  pipeline: 'bo.pipeline_equipa',
  tarefas: 'bo.tarefas_equipa',
}

/**
 * O ÂMBITO JÁ RESOLVIDO — é esta que as rotas do backoffice devem chamar.
 *
 * Faz as três coisas na ordem que protege o dinheiro:
 *  1. só vai à base buscar liderados se a pessoa TIVER a capacidade de equipa desta família (sem
 *     isso é uma consulta inútil que, num engano de leitura futuro, podia passar a ser usada);
 *  2. entrega-os a `ambitoDeLeitura`, que é quem decide;
 *  3. em qualquer falha, a lista vem vazia — e a pessoa só se vê a si.
 *
 * O `supabase` é injectado de propósito: quem chama de uma rota passa o service role (a id já foi
 * verificada pelo servidor); quem chamar de outro sítio passa o cliente que tiver. Este ficheiro
 * não cria clientes nem importa `next/*`, para poder ser testado com `npx tsx`.
 */
export async function ambitoDaEquipa(
  supabase: ClienteEquipas,
  ctx: ContextoParaAmbito,
  familia: 'extracto' | 'leads' | 'pipeline' | 'tarefas',
): Promise<AmbitoLeitura> {
  const liderados = pode(ctx.capacidades, CAPACIDADE_EQUIPA[familia])
    ? await lideradosDe(supabase, ctx.userId)
    : []
  return ambitoDeLeitura(ctx.capacidades, ctx.userId, familia, liderados)
}
