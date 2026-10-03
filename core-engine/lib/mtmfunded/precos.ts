/**
 * PREÇO POR PLATAFORMA.
 *
 * A plataforma MTM Funded (motor simulado) é MAIS BARATA do que a MT5 (conta na corretora): a
 * conta MT5 custa-nos a fila do agente e horas de MetaApi, a nossa não custa nenhuma das duas.
 *
 *  · `preco_cents` / `stripe_price_id` — MT5. São os preços de sempre e não mudam.
 *  · `preco_cents_mtmfunded` / `stripe_price_id_mtmfunded` — MTM Funded (migração 098).
 *
 * SEM preço MTM Funded, a plataforma NÃO se vende (fica escondida no checkout e na página) e o
 * preço que se mostra é o do MT5. Mostrar o preço do MT5 e cobrar como MTM Funded — ou o
 * contrário — era a forma mais rápida de perder a confiança de quem está a decidir.
 *
 * Funções puras: é aqui que se escolhe o preço, e é isto que os testes verificam.
 */
import {
  plataformasAVenda, validarPlataformaDoCheckout,
  type ConfigPlataformas, type Plataforma, type ValidacaoPlataforma,
} from './plataforma'

export interface ProgramaPrecos {
  preco_cents: number | string | null
  preco_cents_mtmfunded?: number | string | null
  stripe_price_id?: string | null
  stripe_price_id_mtmfunded?: string | null
}

export interface PrecoDaPlataforma {
  plataforma: Plataforma
  cents: number
  stripePriceId: string | null
  /** O preço é mesmo desta plataforma, ou é o do MT5 a servir de recurso? */
  proprio: boolean
}

const cents = (v: unknown): number | null => {
  // `Number(null)` é 0 — e um 0 aqui seria «este programa é grátis» em vez de «não tem preço».
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

/** O programa tem preço próprio para a plataforma MTM Funded? */
export function temPrecoMtmFunded(p: ProgramaPrecos | null | undefined): boolean {
  return p != null && cents(p.preco_cents_mtmfunded) != null
}

export function precoDaPlataforma(p: ProgramaPrecos, plataforma: Plataforma): PrecoDaPlataforma {
  const mt5 = cents(p.preco_cents) ?? 0
  if (plataforma === 'mtmfunded') {
    const proprio = cents(p.preco_cents_mtmfunded)
    if (proprio != null) {
      return { plataforma, cents: proprio, stripePriceId: p.stripe_price_id_mtmfunded ?? null, proprio: true }
    }
    // Recurso: sem preço próprio cobra-se o do MT5 — e a plataforma nem sequer se oferece.
    return { plataforma, cents: mt5, stripePriceId: p.stripe_price_id ?? null, proprio: false }
  }
  return { plataforma: 'mt5', cents: mt5, stripePriceId: p.stripe_price_id ?? null, proprio: true }
}

/** O que está à venda para ESTE programa: o interruptor geral e o preço próprio. */
export function plataformasDoPrograma(cfg: ConfigPlataformas, p: ProgramaPrecos): Plataforma[] {
  return plataformasAVenda(cfg).filter((x) => x !== 'mtmfunded' || temPrecoMtmFunded(p))
}

/** Validação do checkout com o programa em cima da mesa (preço incluído). */
export function validarPlataformaDoPrograma(
  pedida: unknown,
  cfg: ConfigPlataformas,
  p: ProgramaPrecos,
): ValidacaoPlataforma {
  const r = validarPlataformaDoCheckout(pedida, cfg)
  if (!r.ok) return r
  if (r.plataforma === 'mtmfunded' && !temPrecoMtmFunded(p)) {
    const restantes = plataformasDoPrograma(cfg, p)
    if (!restantes.length) return { ok: false, erro: 'Este programa não está disponível para compra' }
    // Escolha explícita não se troca em silêncio; sem escolha, fica o que há.
    const explicita = pedida != null && String(pedida).trim() !== ''
    return explicita
      ? { ok: false, erro: 'Este programa ainda não está disponível na plataforma MTM Funded' }
      : { ok: true, plataforma: restantes[0] }
  }
  return r
}

/** Os dois preços, para os mostrar lado a lado. `mtmfunded` é null quando não há. */
export function precosLadoALado(p: ProgramaPrecos): { mt5: number; mtmfunded: number | null } {
  return { mt5: cents(p.preco_cents) ?? 0, mtmfunded: cents(p.preco_cents_mtmfunded) }
}

/** Colunas a pedir ao Supabase quando se vai falar de preços. */
export const COLUNAS_PRECOS = 'preco_cents, preco_cents_mtmfunded, stripe_price_id, stripe_price_id_mtmfunded'
