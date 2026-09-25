/**
 * O ÂMBITO DE UMA PÁGINA do backoffice — a ponte entre o modelo de equipas e o que o ecrã desenha.
 *
 * ESTE FICHEIRO ERA UMA LISTA VAZIA. Até à migração 131 não havia modelo de «quem lidera quem», e
 * `lideradosDe` devolvia sempre `[]` de propósito: sem saber quem é a equipa, fechar no próprio era
 * a única resposta honesta. O modelo aterrou, e aterrou em `lib/backoffice-equipas.ts` — este
 * ficheiro passa a ser o que sempre prometeu ser: A FUNÇÃO QUE SE MUDA para as quatro páginas
 * passarem a ver a equipa sem se lhes tocar.
 *
 * O QUE ELE FAZ, E O QUE NÃO FAZ
 * Faz três coisas numa chamada: resolve o âmbito (via `ambitoDaEquipa`, que é quem decide), conta
 * quantos liderados entraram nele, e escolhe a frase que explica à pessoa de quem é o que ela vê.
 * NÃO decide nada sobre permissões — isso é `lib/backoffice-papeis.ts` — e não tem um único `if`
 * que alargue o âmbito. Alargar só acontece de uma maneira: a capacidade existe E a base devolveu
 * liderados. Qualquer outra coisa (falha, equipa arquivada, papel em falta) fecha no próprio,
 * porque é assim que `lib/backoffice-equipas.ts` está escrito e este ficheiro não o contorna.
 *
 * UM NÍVEL, SEM CADEIA. Os liderados são os membros DIRECTOS das equipas que a pessoa lidera. Se um
 * deles for ele próprio líder, a equipa dele NÃO sobe — decisão do dono, escrita na migração 131 e
 * garantida em `lideradosDe`. Este ficheiro não expande listas: recebe a que lhe dão e conta-a.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { AmbitoLeitura, FamiliaAmbito } from '@/lib/backoffice-papeis'
import { pode } from '@/lib/backoffice-papeis'
import { ambitoDaEquipa, lideradosDe as lideradosNaBase } from '@/lib/backoffice-equipas'
import { avisoDeEquipa, situacaoDaEquipa, type SituacaoEquipa } from '@/lib/backoffice-vista'
import type { ContextoBackoffice } from '@/lib/backoffice-sessao'

const CAPACIDADE_EQUIPA: Record<FamiliaAmbito, 'bo.extracto_equipa' | 'bo.leads_equipa' | 'bo.pipeline_equipa' | 'bo.tarefas_equipa'> = {
  extracto: 'bo.extracto_equipa',
  leads: 'bo.leads_equipa',
  pipeline: 'bo.pipeline_equipa',
  tarefas: 'bo.tarefas_equipa',
}

export interface AmbitoDaPagina {
  /** A lista de ids por que a consulta filtra. É isto que protege o dinheiro dos colegas. */
  ambito: AmbitoLeitura
  /** Os ids dos liderados que entraram no âmbito — sem o próprio. Vazio quando não há equipa. */
  liderados: string[]
  /** Tem o papel que abre a equipa nesta família? (Ter o papel não é ter equipa montada.) */
  veEquipa: boolean
  situacao: SituacaoEquipa
  /** A frase a mostrar, ou `null` quando não há nada a explicar. */
  aviso: string | null
}

/**
 * ⭐ O que as páginas chamam. Uma linha, e o âmbito vem resolvido e explicado.
 *
 *   const { ambito, aviso } = await ambitoDaPagina(ctx, 'extracto')
 *   const linhas = await extractoDoAmbito(getSupabaseAdmin(), ambito)
 *
 * O `liderados` é recontado a partir do âmbito (e não da leitura da base) porque é o âmbito que
 * manda: se a pessoa tiver liderados na base mas não tiver a capacidade, `ambitoDaEquipa` deixa-os
 * de fora — e a frase tem de contar o que a pessoa VÊ, não o que a tabela diz.
 */
export async function ambitoDaPagina(
  ctx: ContextoBackoffice,
  familia: FamiliaAmbito,
): Promise<AmbitoDaPagina> {
  const ambito = await ambitoDaEquipa(getSupabaseAdmin(), ctx, familia)
  const liderados = ambito.ids.filter((id) => id !== ctx.userId)
  const veEquipa = pode(ctx.capacidades, CAPACIDADE_EQUIPA[familia])
  const situacao = situacaoDaEquipa({ veEquipa, liderados: liderados.length, todos: ambito.todos })
  return { ambito, liderados, veEquipa, situacao, aviso: avisoDeEquipa(situacao, familia, liderados.length) }
}

/**
 * Os ids que esta pessoa lidera, sem passar pelo âmbito. Só para quem precisa da LISTA em si — a
 * página da equipa, que desenha as pessoas. Quem vai consultar linhas usa `ambitoDaPagina`: uma
 * lista sem âmbito é uma lista sem o filtro da capacidade, e esse é o filtro que separa colegas.
 */
export async function lideradosDe(ctx: ContextoBackoffice): Promise<string[]> {
  if (!pode(ctx.capacidades, 'bo.equipa_ver')) return []
  return lideradosNaBase(getSupabaseAdmin(), ctx.userId)
}
