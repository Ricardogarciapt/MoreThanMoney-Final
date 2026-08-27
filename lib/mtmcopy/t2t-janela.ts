import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * Ainda dá para aceitar este sinal?
 *
 * A regra base são cinco minutos: passado esse tempo, uma entrada a mercado já não é a entrada
 * que estava escrita — quem aceita entra num preço que não é o do sinal, com o stop calculado
 * para o preço antigo. O risco deixa de ser o que a pessoa julga estar a correr.
 *
 * A exceção são os SETUPS PENDENTES: uma entrada por zona ou por limite continua válida enquanto
 * o preço não lá chegou, porque o que se coloca é uma ordem pendente e o preço vem ter com ela.
 *
 * O que faltava — e é o que isto acrescenta — é a outra metade dessa exceção: **um setup deixa de
 * estar pendente no instante em que a trade sai da zona**. Se o Exit 1 já foi, a entrada já
 * aconteceu e já foi paga; aceitar agora é entrar a meio de um movimento com o stop do início,
 * a arriscar várias vezes o que estava previsto — e a apanhar só a parte que sobra do alvo.
 *
 * A fonte da verdade é o acompanhamento do próprio sinal (`mtmcopy_signal_tracking`), não a
 * leitura das mensagens de seguimento: as mensagens variam de fonte para fonte e de humor para
 * humor ("Exit 1 hit", "TP1 ✅", "+40 pips first layer"), e uma expressão nova a mais fazia a
 * guarda falhar em silêncio.
 */
export interface EstadoDaJanela {
  aceitavel: boolean
  /** Porquê, em linguagem que se possa mostrar a quem tocou no botão. */
  motivo?: string
  code?: 'expired' | 'out_of_zone' | 'closed'
}

export const JANELA_MERCADO_MS = 5 * 60 * 1000

/**
 * O sinal já saiu da zona de entrada?
 *
 * `entry_hit_at` diz que o preço tocou a entrada; `exits_done > 0` diz que já saiu um parcial;
 * um `status` fechado diz que acabou. Qualquer um dos três significa a mesma coisa para quem
 * está a pensar aceitar agora: o barco partiu.
 */
export async function sinalJaSaiuDaZona(chatMessageId: string): Promise<{ saiu: boolean; fechado: boolean }> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('mtmcopy_signal_tracking')
      .select('status, entry_hit_at, exits_done, closed_at')
      .eq('chat_message_id', chatMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return { saiu: false, fechado: false }
    const t = data as { status?: string | null; entry_hit_at?: string | null; exits_done?: number | null; closed_at?: string | null }
    const fechado = t.status === 'closed' || Boolean(t.closed_at)
    const saiu = fechado || Number(t.exits_done ?? 0) > 0 || Boolean(t.entry_hit_at)
    return { saiu, fechado }
  } catch {
    // Em dúvida NÃO se bloqueia por aqui: a regra dos 5 minutos continua a valer e é ela que
    // apanha o caso comum. Bloquear por uma falha de leitura seria recusar sinais bons.
    return { saiu: false, fechado: false }
  }
}
