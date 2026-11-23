/**
 * TODO O PEDIDO DE CONTACTO ENTRA NO PIPELINE (23/11/2026).
 *
 * Até aqui só o e-book grátis e o íman da app escreviam em `vendas_negocios`; os formulários das
 * landings (/f/*, /ricardogarcia, contacto rápido) e o Meta Lead Ads ficavam em `pedidos_contacto` e
 * o back-office, o funil das 7 fases e o executor do pipeline nunca os viam.
 *
 * Regra: procura-se um negócio pelo mesmo telefone (todas as escritas, `variantesDoNumero`) ou pelo
 * mesmo email. Se existe, junta-se a etiqueta e a nota e fica contactável; se não, nasce em «lead»
 * com o funil tirado do interesse. Nunca rebenta o registo do pedido: devolve `null` e regista.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizarE164, variantesDoNumero } from '@/lib/whatsapp-envio'
import { INTERESSES, type PedidoValido } from '@/lib/pedido-contacto'

const FUNIL_DO_INTERESSE: Record<string, 'educacao' | 'corretora' | 'funded'> = {
  formacao: 'educacao',
  sinais_copy: 'educacao',
  ea_sensei: 'educacao',
  outro: 'educacao',
  rota_corretora: 'corretora',
  mtm_funded: 'funded',
}

export function funilDoInteresse(interesse: string | null | undefined): 'educacao' | 'corretora' | 'funded' {
  return FUNIL_DO_INTERESSE[String(interesse ?? '')] ?? 'educacao'
}

export function origemDoPedido(fonte: string, origem: string | null): string {
  if (fonte === 'meta_lead_ads') return 'meta_lead_ads'
  if (fonte === 'telegram') return 'telegram'
  return origem?.startsWith('ebook:') ? origem : 'formulario'
}

export async function ligarPedidoAoNegocio(
  db: SupabaseClient,
  p: { pedidoId: string; pedido: PedidoValido; fonte: string; etiquetas?: string[]; origem?: string; nota?: string },
): Promise<{ id: string; novo: boolean } | null> {
  const { pedido } = p
  const etiquetas = ['pedido-contacto', `fonte-${p.fonte}`, ...(p.etiquetas ?? [])]
  const nota =
    p.nota ??
    `Pedido de contacto (${p.fonte}) · ${INTERESSES[pedido.interesse] ?? pedido.interesse} · canais ${pedido.canais.join(', ')}` +
      (pedido.origem ? ` · origem ${pedido.origem}` : '')
  try {
    const e164 = normalizarE164(pedido.telefone).e164
    type Existente = { id: string; etiquetas: string[] | null; nota: string | null }
    let existente: Existente | null = null
    if (e164) {
      const { data } = await db.from('vendas_negocios').select('id, etiquetas, nota').in('telefone', variantesDoNumero(e164)).order('criado_em', { ascending: false }).limit(1)
      existente = (data?.[0] as Existente | undefined) ?? null
    }
    if (!existente && pedido.email) {
      const { data } = await db.from('vendas_negocios').select('id, etiquetas, nota').ilike('email', pedido.email).order('criado_em', { ascending: false }).limit(1)
      existente = (data?.[0] as Existente | undefined) ?? null
    }

    if (existente) {
      const juntas = [...new Set([...(existente.etiquetas ?? []), ...etiquetas])]
      await db
        .from('vendas_negocios')
        .update({
          etiquetas: juntas,
          contactavel: true,
          nota: [existente.nota, `${new Date().toISOString().slice(0, 10)}: ${nota}`].filter(Boolean).join('\n'),
          email: pedido.email || undefined,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', existente.id)
      return { id: existente.id, novo: false }
    }

    const { data, error } = await db
      .from('vendas_negocios')
      .insert({
        nome: pedido.nome,
        email: pedido.email || null,
        telefone: e164 ?? (pedido.telefone || null),
        origem: p.origem ?? origemDoPedido(p.fonte, pedido.origem),
        chave_origem: `pedido:${p.pedidoId}`,
        funil: funilDoInteresse(pedido.interesse),
        estado: 'lead',
        interesse: pedido.interesse,
        contactavel: true,
        etiquetas,
        nota,
      })
      .select('id')
      .single()
    if (error) {
      // Corrida com outro pedido igual (chave_origem única): já lá está.
      console.warn('[negocio-do-pedido] não entrou no pipeline:', error.message)
      return null
    }
    return { id: (data as { id: string }).id, novo: true }
  } catch (e) {
    console.warn('[negocio-do-pedido] falhou:', e instanceof Error ? e.message : e)
    return null
  }
}
