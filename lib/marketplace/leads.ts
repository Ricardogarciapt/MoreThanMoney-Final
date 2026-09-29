/**
 * O FUNIL POR DENTRO — quem passou por aqui, e até onde chegou.
 *
 * ── PORQUE É QUE ISTO EXISTE ──────────────────────────────────────────────────────────────
 *
 * Sem isto, a única coisa que fica escrita de uma montra é a venda que aconteceu. A pergunta que
 * o dono vai fazer no segundo mês — «quantos chegaram ao pagamento e não pagaram?» — não tem
 * resposta nenhuma, e a resposta a essa pergunta é o que diz se o problema é o preço, é a ficha do
 * produto, ou é o checkout.
 *
 * ── PORQUE É QUE NÃO USA `vendas_negocios` ────────────────────────────────────────────────
 *
 * `vendas_negocios` + `vendas_negocio_eventos` é o pipeline COMERCIAL da equipa: um negócio com
 * prospector, setter, closer e comissões, e um `estado` de
 * 'lead'→'contactado'→'qualificado'→…→'ganho'. Uma pessoa a olhar para um curso não é um negócio
 * atribuído a um closer, e escrever lá dentro enchia o pipeline de vendas da equipa com ruído de
 * montra — e o pipeline dela é de onde saem comissões.
 *
 * Isto é mais pequeno de propósito: um registo do que aconteceu, sem dono e sem estado.
 *
 * ── PORQUE É QUE NUNCA REBENTA ────────────────────────────────────────────────────────────
 *
 * Todas as funções aqui engolem o erro. Isto é MEDIÇÃO: falhar a escrever que alguém clicou não
 * pode, em circunstância nenhuma, impedir essa pessoa de comprar. Uma loja que deixa de vender
 * porque a analítica está em baixo é pior do que uma loja sem analítica.
 *
 * O `opinlyTrack` vai a par, como no checkout dos packs do site, que já manda `begin_checkout` e
 * `purchase`. Assim os passos do marketplace aparecem no mesmo sítio onde o dono já olha, em vez
 * de num quadro novo que ele tem de se lembrar de abrir.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { opinlyTrack } from '@/lib/opinly/track'

export type EtapaFunil = 'viu_montra' | 'viu_ficha' | 'iniciou_checkout' | 'pagou' | 'desistiu'

/** O nome do evento no Opinly. 'pagou' fica de fora: o `opinlyTrackPurchase` do webhook é que manda. */
const NOME_OPINLY: Partial<Record<EtapaFunil, string>> = {
  viu_montra: 'view_item_list',
  viu_ficha: 'view_item',
  iniciou_checkout: 'begin_checkout',
  desistiu: 'abandon_checkout',
}

export async function registarPasso(entrada: {
  etapa: EtapaFunil
  produtoId?: string | null
  userId?: string | null
  email?: string | null
  /** O id da sessão Stripe. É o que liga 'iniciou_checkout' a 'pagou'. */
  referencia?: string | null
  origem?: string | null
  contexto?: Record<string, unknown>
}): Promise<void> {
  try {
    await getSupabaseAdmin().from('marketplace_leads').insert({
      etapa: entrada.etapa,
      produto_id: entrada.produtoId ?? null,
      user_id: entrada.userId ?? null,
      email: entrada.email ?? null,
      referencia: entrada.referencia ?? null,
      origem: entrada.origem ?? null,
      contexto: entrada.contexto ?? {},
    })
  } catch {
    // De propósito. Ver o cabeçalho: medir não pode travar vender.
  }

  const nome = NOME_OPINLY[entrada.etapa]
  if (!nome) return
  try {
    await opinlyTrack(
      nome,
      { area: 'marketplace', produto_id: entrada.produtoId ?? null, ...(entrada.contexto ?? {}) },
      {
        email: entrada.email ?? undefined,
        // Dedup: o mesmo passo da mesma sessão não conta duas vezes se o pedido for repetido.
        externalEventId: entrada.referencia ? `mkt_${entrada.etapa}_${entrada.referencia}` : undefined,
      },
    )
  } catch {
    // Idem.
  }
}

/**
 * O quadro do funil, para o admin.
 *
 * Conta PESSOAS e não linhas: alguém que abriu a mesma ficha cinco vezes é uma pessoa interessada,
 * não cinco. Contar linhas fazia a taxa de conversão parecer cinco vezes pior do que é, e uma
 * métrica que mente para baixo faz o dono mexer no que não está estragado.
 */
export async function funilPorEtapa(desdeIso: string): Promise<Record<EtapaFunil, number>> {
  const vazio: Record<EtapaFunil, number> = {
    viu_montra: 0, viu_ficha: 0, iniciou_checkout: 0, pagou: 0, desistiu: 0,
  }
  try {
    const { data } = await getSupabaseAdmin()
      .from('marketplace_leads')
      .select('etapa, user_id, email, referencia')
      .gte('created_at', desdeIso)
      .limit(20000)

    const vistos = new Map<EtapaFunil, Set<string>>()
    for (const l of (data ?? []) as { etapa: EtapaFunil; user_id: string | null; email: string | null; referencia: string | null }[]) {
      if (!(l.etapa in vazio)) continue
      // Sem pessoa identificada, a referência serve; sem nenhuma das duas, conta como única.
      const chave = l.user_id ?? l.email ?? l.referencia ?? Math.random().toString(36)
      const s = vistos.get(l.etapa) ?? new Set<string>()
      s.add(chave)
      vistos.set(l.etapa, s)
    }
    for (const [etapa, s] of vistos) vazio[etapa] = s.size
    return vazio
  } catch {
    return vazio
  }
}
