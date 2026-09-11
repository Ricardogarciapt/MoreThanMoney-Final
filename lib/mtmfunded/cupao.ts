import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Cupões de desconto nos desafios do MTM Funded.
 *
 * Reutiliza a tabela `coupons` que já existe — a mesma que o `/admin/coupons` gere — em vez de
 * criar um sistema paralelo. Dois sistemas de cupões acabam sempre com um código que funciona
 * num sítio e não no outro, e com ninguém a saber qual é o verdadeiro.
 *
 * O ÂMBITO vem do `plan_override`: `mtmfunded` vale só para desafios, `any` vale para tudo.
 * Um cupão de 50% feito para uma subscrição não pode desatar a dar metade de um desafio sem
 * que alguém o tenha decidido.
 */

export interface CupaoAplicado {
  ok: boolean
  codigo?: string
  descontoPct?: number
  centsFinais?: number
  erro?: string
}

/** Âmbitos que um cupão pode ter para valer num desafio. */
const AMBITOS_VALIDOS = new Set(['mtmfunded', 'any', 'both'])

export async function validarCupao(
  codigo: string,
  precoCents: number,
  /**
   * As regras do programa que está a ser comprado.
   *
   * Servem para uma coisa só: um programa que JÁ É uma promoção não aceita outra por cima. O
   * 10K de duas fases a 10 € do lançamento com mais 30% ficava a 7 € — e ninguém decidiu isso.
   * São duas ofertas paralelas, não uma em cima da outra.
   */
  regrasDoPrograma?: Record<string, unknown> | null,
): Promise<CupaoAplicado> {
  const limpo = String(codigo ?? '').trim().toUpperCase()
  if (!limpo) return { ok: false, erro: 'Escreve o código' }

  // Uma promoção de cada vez. A mensagem diz PORQUÊ — «cupão inválido» aqui faria a pessoa
  // pensar que o código estava errado e tentar outra vez, em vez de perceber que já tem o
  // melhor preço.
  if (regrasDoPrograma?.campanha) {
    return {
      ok: false,
      erro: 'Este desafio já é uma promoção de lançamento — os cupões aplicam-se aos restantes.',
    }
  }

  const db = getSupabaseAdmin()
  const { data: cupao } = await db
    .from('coupons')
    .select('id, code, type, discount_value, plan_override, max_uses, used_count, valid_from, valid_until, is_active')
    .ilike('code', limpo)
    .maybeSingle()

  // Código inexistente e código inválido dão a MESMA resposta: distingui-los deixava
  // adivinhar que códigos existem, escrevendo-os um a um.
  const invalido = { ok: false as const, erro: 'Cupão inválido ou expirado' }
  if (!cupao || !cupao.is_active) return invalido

  const ambito = String(cupao.plan_override ?? 'any').toLowerCase()
  if (!AMBITOS_VALIDOS.has(ambito)) return invalido

  const agora = Date.now()
  if (cupao.valid_from && new Date(cupao.valid_from as string).getTime() > agora) return invalido
  if (cupao.valid_until && new Date(cupao.valid_until as string).getTime() < agora) return invalido
  if (cupao.max_uses != null && Number(cupao.used_count ?? 0) >= Number(cupao.max_uses)) {
    return { ok: false, erro: 'Este cupão já foi todo usado' }
  }

  // Só descontos percentuais. Um cupão de «subscrição grátis» aplicado a um desafio dava uma
  // conta de avaliação de graça a quem tivesse um código de outro produto.
  if (cupao.type !== 'discount_pct') return invalido

  const pct = Number(cupao.discount_value ?? 0)
  if (!(pct > 0 && pct <= 100)) return invalido

  const finais = Math.max(0, Math.round(precoCents * (1 - pct / 100)))
  return { ok: true, codigo: cupao.code as string, descontoPct: pct, centsFinais: finais }
}

/**
 * Regista o uso, depois de o pagamento estar feito.
 *
 * Contar o uso na validação deixava um contador a subir com cada pessoa que escrevesse o
 * código para «ver quanto fica» — e um cupão de 10 usos gastava-se sem ninguém comprar nada.
 */
export async function registarUsoDoCupao(codigo: string, userId: string): Promise<void> {
  const db = getSupabaseAdmin()
  const { data: cupao } = await db
    .from('coupons').select('id, used_count').ilike('code', codigo).maybeSingle()
  if (!cupao) return

  await db
    .from('coupons')
    .update({ used_count: Number(cupao.used_count ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', cupao.id)

  await db.from('coupon_usages').insert({
    coupon_id: cupao.id,
    user_id: userId,
    context: 'mtmfunded_desafio',
  })
}
