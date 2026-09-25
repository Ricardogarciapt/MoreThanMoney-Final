/**
 * QUEM ESTÁ A PEDIR, E O QUE PODE — do lado do servidor.
 *
 * `lib/backoffice-papeis.ts` decide; este ficheiro é o único que vai à base buscar os factos.
 * A separação existe para o modelo de permissões poder ser testado sem sessão e sem rede.
 *
 * DUAS FORMAS DE LER OS PAPÉIS, e a diferença importa:
 *
 *  · No MIDDLEWARE, com o cliente da sessão (chave anon). A RLS da migração 127 diz «cada um vê os
 *    seus» — e é exactamente isso que o middleware precisa de saber. Não há service role no edge,
 *    e não é preciso: a pessoa está a perguntar por si mesma.
 *  · Nas ROTAS, com service role, pela id que o Supabase já verificou (token ou cookie, via
 *    `userIdDoPedido`). Pelo caminho do Bearer o cliente não tem cookies e a leitura sob RLS vinha
 *    vazia — o que se lia como «não tem papéis», ou seja, negar a quem tinha direito. É o mesmo
 *    raciocínio que o `verifyAdminAccess` já faz, e pela mesma razão: a id não vem do cliente.
 */

import { NextResponse } from 'next/server'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { capacidadesDe, pode, type Capacidade, type Papel } from '@/lib/backoffice-papeis'
import type { AreaSite } from '@/lib/backoffice-acessos-site'
import {
  areasRestritasDe,
  papeisActivosDe,
  type ClienteLeitura,
  type PapelAtribuido,
} from '@/lib/backoffice-papeis-leitura'

// Reexportadas para quem já só precisa do contexto não ter de conhecer dois ficheiros.
export { areasRestritasDe, papeisActivosDe }
export type { ClienteLeitura, PapelAtribuido }

export interface ContextoBackoffice {
  userId: string
  admin: boolean
  papeis: Papel[]
  atribuicoes: PapelAtribuido[]
  capacidades: Set<Capacidade>
  /** Restrição de áreas do site. Vazio = sem restrição (ver `lib/backoffice-acessos-site.ts`). */
  areasRestritas: AreaSite[]
}

/**
 * O contexto completo para uma ROTA. `null` quando não há sessão — e quem não tem sessão não tem
 * contexto nenhum, nem sequer um vazio: um objecto com `papeis: []` convidava a distinguir mal
 * «não entrou» de «entrou e não pode».
 */
export async function contextoBackoffice(request?: Request): Promise<ContextoBackoffice | null> {
  const userId = await userIdDoPedido(request)
  if (!userId) return null

  const supabase = getSupabaseAdmin()

  const [perfilRes, atribuicoes, areasRestritas] = await Promise.all([
    supabase.from('profiles').select('user_type, is_active').eq('id', userId).maybeSingle(),
    papeisActivosDe(supabase as unknown as ClienteLeitura, userId),
    areasRestritasDe(supabase as unknown as ClienteLeitura, userId),
  ])

  const perfil = perfilRes.data as { user_type?: string; is_active?: boolean } | null
  // Admin desactivado não é admin — é a mesma regra do `verifyAdminAccess`, escrita no mesmo sítio
  // para não haver duas definições de «é o dono» a divergir com o tempo.
  const admin = perfil?.user_type === 'admin' && perfil?.is_active === true

  const papeis = atribuicoes.map((a) => a.papel)
  return {
    userId,
    admin,
    papeis,
    atribuicoes,
    capacidades: capacidadesDe(papeis, { admin }),
    areasRestritas,
  }
}

/**
 * O portão das rotas do backoffice, em uma linha:
 *
 *   const ctx = await exigirCapacidade(request, 'bo.extracto_proprio')
 *   if (ctx instanceof NextResponse) return ctx
 *
 * Devolve a resposta de recusa OU o contexto. Fazê-lo assim — e não um booleano — obriga quem
 * escreve a rota a ficar com o contexto na mão, que é onde está o âmbito de leitura. Uma rota que
 * só pergunta «pode?» e depois consulta a base sem filtro passa a autorização e falha a mesma.
 *
 * 401 quando não há sessão, 403 quando há sessão e falta a capacidade. A distinção não é cosmética:
 * o cliente precisa de saber se deve mandar o utilizador entrar ou dizer-lhe que não tem acesso.
 */
export async function exigirCapacidade(
  request: Request | undefined,
  capacidade: Capacidade,
): Promise<ContextoBackoffice | NextResponse> {
  const ctx = await contextoBackoffice(request)

  if (!ctx) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  // Entrar é a condição de base de TODAS as capacidades: sem papéis activos (e sem ser o dono) não
  // se abre nenhuma porta do backoffice, mesmo que um dia alguém dê uma capacidade sem `bo.entrar`.
  if (!pode(ctx.capacidades, 'bo.entrar') || !pode(ctx.capacidades, capacidade)) {
    return NextResponse.json(
      { error: 'Sem acesso', detalhe: 'Esta conta não tem o papel necessário para esta operação.' },
      { status: 403 },
    )
  }

  return ctx
}
