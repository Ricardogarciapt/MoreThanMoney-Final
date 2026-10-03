/**
 * As REGRAS de comissão: ler as que existem, e mudá-las sem apagar o passado.
 *
 * A tabela é imutável por desenho (migração 127): mudar uma percentagem fecha a linha em vigor
 * (`valido_ate = agora`) e insere outra. É isto que garante que o livro de comissões continua a
 * poder explicar, um ano depois, com que número foi feita cada conta — se se fizesse UPDATE, a
 * comissão de Agosto passava a ser «explicada» pela percentagem de Setembro, que é a forma mais
 * rápida de ter uma discussão com alguém da equipa sem ter argumentos.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { PAPEIS_VENDAS, PLANO_PADRAO, type AplicaA, type PapelVendas, type RegraComissao, type RegraRank } from './calculo'

const TABELA = 'vendas_regras_comissao'

/** Uma linha da tabela, como vem da base (inclui o que o cálculo não precisa de ver). */
export type RegraComissaoLinha = RegraComissao & {
  nota: string | null
  criado_por: string | null
  criado_em: string
}

const COLUNAS = 'id, plano, papel, pack, pct, aplica_a, valido_de, valido_ate, nota, criado_por, criado_em'

function normalizar(linha: Record<string, unknown>): RegraComissaoLinha {
  return {
    id: String(linha.id),
    plano: linha.plano ? String(linha.plano) : PLANO_PADRAO,
    papel: linha.papel as PapelVendas,
    pack: String(linha.pack),
    // `numeric` chega como string do PostgREST. Converter aqui, uma vez: um Number() esquecido
    // lá à frente faz `"10" * 0.01` calar-se e dar o valor errado sem erro nenhum.
    pct: Number(linha.pct),
    aplica_a: linha.aplica_a as AplicaA,
    valido_de: String(linha.valido_de),
    valido_ate: linha.valido_ate ? String(linha.valido_ate) : null,
    nota: (linha.nota as string) ?? null,
    criado_por: (linha.criado_por as string) ?? null,
    criado_em: String(linha.criado_em),
  }
}

/**
 * TODAS as regras, vivas e mortas.
 *
 * O cálculo precisa do histórico completo, não só do que está em vigor: uma venda de Agosto
 * resolve-se com a regra de Agosto (ver `regraEmVigor`). Carregar tudo é barato — são umas
 * dezenas de linhas — e evita a classe de bugs em que se filtra pela data errada.
 */
export async function carregarRegras(supabase: SupabaseClient): Promise<RegraComissaoLinha[]> {
  const { data, error } = await supabase.from(TABELA).select(COLUNAS).order('valido_de', { ascending: false })
  if (error) throw new Error(`Não foi possível ler as regras de comissão: ${error.message}`)
  return (data ?? []).map(normalizar)
}

/** Só as que estão em vigor agora — é isto que o admin mostra como «tabela actual». */
export async function regrasEmVigor(supabase: SupabaseClient): Promise<RegraComissaoLinha[]> {
  const { data, error } = await supabase
    .from(TABELA)
    .select(COLUNAS)
    .is('valido_ate', null)
    .order('papel')
    .order('pack')
  if (error) throw new Error(`Não foi possível ler as regras em vigor: ${error.message}`)
  return (data ?? []).map(normalizar)
}

export type NovaRegra = {
  /** O plano a que a regra pertence. Omitido = a tabela geral ({@link PLANO_PADRAO}). */
  plano?: string
  papel: PapelVendas
  pack: string
  pct: number
  aplica_a?: AplicaA
  nota?: string | null
  /** Quem a definiu. Fica gravado: uma percentagem sem autor é uma decisão sem dono. */
  criado_por?: string | null
}

/**
 * Define (ou muda) a percentagem de um (papel, pack, aplica_a).
 *
 * Duas escritas, nesta ordem: fecha a que estava em vigor e abre a nova. A partir do instante em
 * que isto corre, as vendas NOVAS usam a nova; as antigas continuam a explicar-se pela antiga.
 *
 * Não valida se o `pack` existe na escada de propósito — o dono pode querer uma regra para um
 * pack que ainda vai criar, e recusar-lha aqui era mandá-lo esperar por um deploy.
 */
export async function definirRegra(
  supabase: SupabaseClient,
  nova: NovaRegra,
): Promise<{ regra: RegraComissaoLinha; substituiu: string | null }> {
  if (!PAPEIS_VENDAS.includes(nova.papel)) {
    throw new Error(`Papel desconhecido: ${nova.papel}`)
  }
  const pct = Number(nova.pct)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error('A percentagem tem de ser um número entre 0 e 100.')
  }
  const pack = String(nova.pack || '').trim()
  if (!pack) throw new Error('Falta o pack (ou "*" para todos).')

  const aplica_a: AplicaA = nova.aplica_a ?? 'ambos'
  const plano = String(nova.plano || PLANO_PADRAO).trim() || PLANO_PADRAO
  const agora = new Date().toISOString()

  const { data: emVigor } = await supabase
    .from(TABELA)
    .select('id, pct')
    .eq('plano', plano)
    .eq('papel', nova.papel)
    .eq('pack', pack)
    .eq('aplica_a', aplica_a)
    .is('valido_ate', null)
    .maybeSingle()

  if (emVigor) {
    // Fecha-se ANTES de inserir: o índice único só deixa uma linha viva por caso, e é ele que
    // impede duas regras vivas para o mesmo (papel, pack) — uma ambiguidade que se pagaria a
    // dobrar ou a metade, sem se saber qual.
    const { error: fecharErro } = await supabase
      .from(TABELA)
      .update({ valido_ate: agora })
      .eq('id', emVigor.id)
    if (fecharErro) throw new Error(`Não foi possível fechar a regra anterior: ${fecharErro.message}`)
  }

  const { data, error } = await supabase
    .from(TABELA)
    .insert({
      plano,
      papel: nova.papel,
      pack,
      pct,
      aplica_a,
      valido_de: agora,
      nota: nova.nota ?? null,
      criado_por: nova.criado_por ?? null,
    })
    .select(COLUNAS)
    .single()

  if (error) throw new Error(`Não foi possível gravar a regra: ${error.message}`)
  return { regra: normalizar(data), substituiu: emVigor?.id ?? null }
}

/**
 * Revoga uma regra sem a substituir: a partir de agora, este (papel, pack) deixa de pagar.
 *
 * Fica como revogação e não como apagar, pelo mesmo motivo de sempre — as comissões que ela já
 * fez continuam a ter de poder apontar para ela.
 */
export async function revogarRegra(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from(TABELA)
    .update({ valido_ate: new Date().toISOString() })
    .eq('id', id)
    .is('valido_ate', null)
  if (error) throw new Error(`Não foi possível revogar a regra: ${error.message}`)
}

// ───────────────────────────── os degraus de rank ─────────────────────────────

/** Um degrau, como vem da base (a percentagem chega como string do PostgREST). */
export type RegraRankLinha = RegraRank & { nota: string | null; criado_em: string }

const COLUNAS_RANK = 'id, papel, min_vendas, pct, valido_de, valido_ate, nota, criado_em'

function normalizarRank(linha: Record<string, unknown>): RegraRankLinha {
  return {
    id: String(linha.id),
    papel: linha.papel as PapelVendas,
    min_vendas: Number(linha.min_vendas),
    pct: Number(linha.pct),
    valido_de: String(linha.valido_de),
    valido_ate: linha.valido_ate ? String(linha.valido_ate) : null,
    nota: (linha.nota as string) ?? null,
    criado_em: String(linha.criado_em),
  }
}

/**
 * TODOS os degraus, vivos e mortos — pelo mesmo motivo das regras: uma venda de Agosto resolve-se
 * com o degrau que estava em vigor em Agosto.
 */
export async function carregarRegrasRank(supabase: SupabaseClient): Promise<RegraRankLinha[]> {
  const { data, error } = await supabase
    .from('vendas_regras_rank')
    .select(COLUNAS_RANK)
    .order('papel')
    .order('min_vendas')
  if (error) throw new Error(`Não foi possível ler os degraus de rank: ${error.message}`)
  return (data ?? []).map(normalizarRank)
}

/**
 * Define um degrau (limiar × percentagem). Imutável como as regras: fecha o que estava em vigor
 * para o mesmo (papel, limiar) e abre outro.
 */
export async function definirDegrauRank(
  supabase: SupabaseClient,
  degrau: { papel: PapelVendas; min_vendas: number; pct: number; nota?: string | null; criado_por?: string | null },
): Promise<RegraRankLinha> {
  if (!PAPEIS_VENDAS.includes(degrau.papel)) throw new Error(`Papel desconhecido: ${degrau.papel}`)
  const pct = Number(degrau.pct)
  const min = Math.round(Number(degrau.min_vendas))
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('A percentagem do degrau tem de estar entre 0 e 100.')
  if (!Number.isFinite(min) || min < 0) throw new Error('O limiar de vendas tem de ser um número não negativo.')

  const agora = new Date().toISOString()
  await supabase
    .from('vendas_regras_rank')
    .update({ valido_ate: agora })
    .eq('papel', degrau.papel)
    .eq('min_vendas', min)
    .is('valido_ate', null)

  const { data, error } = await supabase
    .from('vendas_regras_rank')
    .insert({
      papel: degrau.papel,
      min_vendas: min,
      pct,
      valido_de: agora,
      nota: degrau.nota ?? null,
      criado_por: degrau.criado_por ?? null,
    })
    .select(COLUNAS_RANK)
    .single()
  if (error) throw new Error(`Não foi possível gravar o degrau: ${error.message}`)
  return normalizarRank(data)
}

// ───────────────────────────── o plano de cada pessoa ─────────────────────────────

/**
 * O plano de comissão de uma lista de pessoas (id → plano).
 *
 * Quem não tem linha usa o plano geral. É isto que preserva os 50 % de quem já era afiliado sem
 * uma única data escrita no código — ver a migração 128, secção 4.
 */
export async function planosDasPessoas(
  supabase: SupabaseClient,
  pessoas: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(pessoas.filter(Boolean))]
  if (ids.length === 0) return {}
  const { data, error } = await supabase.from('vendas_pessoa_plano').select('pessoa_id, plano').in('pessoa_id', ids)
  // Sem tabela ou com erro, todos caem no plano geral. Não se inventa plano a ninguém.
  if (error || !data) return {}
  const mapa: Record<string, string> = {}
  for (const linha of data) mapa[String(linha.pessoa_id)] = String(linha.plano)
  return mapa
}

/** Põe (ou muda) uma pessoa num plano. Mexe no rendimento dela: fica com autor e nota. */
export async function definirPlanoDaPessoa(
  supabase: SupabaseClient,
  params: { pessoaId: string; plano: string; definidoPor?: string | null; nota?: string | null },
): Promise<void> {
  const plano = String(params.plano || '').trim()
  if (!plano) throw new Error('Falta o plano.')
  const { error } = await supabase.from('vendas_pessoa_plano').upsert(
    {
      pessoa_id: params.pessoaId,
      plano,
      definido_por: params.definidoPor ?? null,
      nota: params.nota ?? null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'pessoa_id' },
  )
  if (error) throw new Error(`Não foi possível gravar o plano da pessoa: ${error.message}`)
}
