import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * A rotação dos links de recomendação de corretora.
 *
 * O problema que isto resolve é de repartição, não de tecnologia: a corretora paga a quem
 * recomenda, e com um link fixo no site TODOS os clientes contavam sempre para a mesma pessoa.
 * Quem também trouxe gente ficava a ver.
 *
 * A rotação é POR DIA e é determinística — não é um sorteio a cada visita. Duas razões concretas:
 * um dia inteiro pertence a um IB, o que torna a conta verificável (ele conta os registos do dia
 * dele e o número bate certo); e a mesma pessoa que abre o site de manhã, hesita, e volta à noite
 * cai no mesmo link, em vez de abrir conta por um IB e ter falado com outro.
 *
 * O peso multiplica os dias: peso 2 aparece o dobro das vezes de peso 1 dentro de cada ciclo.
 */
export const LINK_DA_CASA = 'https://www.puprime.com/campaign?cs=morethanmoney'

export interface LinkCorretora {
  id: string
  etiqueta: string
  url: string
  peso: number
  ativo: boolean
  cliques: number
  ultimo_uso: string | null
  notas: string | null
}

/** O número do dia desde a época — é o que faz a roda andar exatamente uma vez por dia. */
export function diaAbsoluto(agora = new Date()): number {
  return Math.floor(agora.getTime() / 86_400_000)
}

/**
 * Escolhe o link de HOJE a partir de uma lista já ordenada.
 *
 * Exportada à parte da base de dados de propósito: assim a regra de rotação pode ser verificada
 * sem uma base de dados à frente, que é o que separa "acho que roda" de "roda".
 */
export function escolherDoDia<T extends { peso?: number }>(lista: T[], dia = diaAbsoluto()): T | null {
  if (!lista.length) return null
  // O peso vira repetições: peso 3 ocupa três lugares na roda.
  const roda: T[] = []
  for (const item of lista) {
    const n = Math.max(1, Math.min(20, Math.floor(Number(item.peso ?? 1)) || 1))
    for (let i = 0; i < n; i++) roda.push(item)
  }
  return roda[dia % roda.length] ?? null
}

/** Todos os links, para o painel e para o VPS de vendas. */
export async function listarLinks(): Promise<LinkCorretora[]> {
  const { data } = await getSupabaseAdmin()
    .from('broker_referral_links')
    .select('id, etiqueta, url, peso, ativo, cliques, ultimo_uso, notas')
    .order('created_at', { ascending: true })
  return (data ?? []) as LinkCorretora[]
}

/**
 * O link de hoje. Nunca devolve vazio: sem pool configurada, é o da casa — um botão "abrir conta"
 * que não leva a lado nenhum é pior do que um botão que leva ao link de sempre.
 */
export async function linkDoDia(): Promise<{ url: string; id: string | null; etiqueta: string }> {
  try {
    const ativos = (await listarLinks()).filter((l) => l.ativo && /^https?:\/\//i.test(l.url))
    const escolhido = escolherDoDia(ativos)
    if (!escolhido) return { url: LINK_DA_CASA, id: null, etiqueta: 'Casa' }
    return { url: escolhido.url, id: escolhido.id, etiqueta: escolhido.etiqueta }
  } catch {
    return { url: LINK_DA_CASA, id: null, etiqueta: 'Casa' }
  }
}

/** Regista o encaminhamento. Falhar aqui não pode impedir a pessoa de chegar à corretora. */
export async function contarClique(id: string | null): Promise<void> {
  if (!id) return
  try {
    const db = getSupabaseAdmin()
    const { data } = await db.from('broker_referral_links').select('cliques').eq('id', id).maybeSingle()
    await db
      .from('broker_referral_links')
      .update({ cliques: Number(data?.cliques ?? 0) + 1, ultimo_uso: new Date().toISOString() })
      .eq('id', id)
  } catch {
    /* a contagem é para nós; o cliente segue na mesma */
  }
}
