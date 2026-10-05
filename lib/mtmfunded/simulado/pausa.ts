import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { motivoDePausa } from '@/lib/mtmfunded/admin-conta'

/**
 * A PORTA DAS ORDENS NOVAS numa conta em pausa pelo admin (migração 079, `pausada_em`).
 *
 * A pausa não muda o `estado` — a conta continua `ativa` para o motor do VPS continuar a gerir
 * SL/TP, trailing e stop-out das posições que já existem. Por isso não chega `exigirNegociavel`:
 * é aqui, chamada por `abrirPosicao` e `criarPendente` (as duas únicas formas de nascer uma
 * posição ou uma ordem no site — WebTrader, webhook, T2T, cópia, OCO, inverter), que se recusa.
 *
 * As colunas vêm como OPCIONAIS na leitura da conta (`lerConta` em execucao.ts, via
 * `selecionarComOpcionais`): enquanto a 079 não estiver aplicada a coluna não existe, e pô-la no
 * select obrigatório partia TODAS as ordens. Sem coluna, não há pausas possíveis — deixa passar.
 * Qualquer outro erro de leitura fecha a porta.
 */
export class ContaEmPausa extends Error {
  status = 409
}

/** A linha da conta com as colunas da pausa — ou só o id, quando quem chama não a tem. */
export type ContaParaPausa = string | { id: string; pausada_em?: unknown; pausa_motivo?: unknown }

export async function exigirSemPausa(conta: ContaParaPausa): Promise<void> {
  /**
   * A linha que `lerConta` devolve já traz `pausada_em` e `pausa_motivo` (colunas opcionais da
   * mesma leitura): decide-se por ela, sem voltar à base. A chave AUSENTE (não `null`) é o sinal de
   * que a 079 não está aplicada ou de que quem chamou só tinha o id — aí pergunta-se à base como antes.
   */
  if (typeof conta !== 'string' && 'pausada_em' in conta) {
    const m = motivoDePausa({ pausada_em: (conta.pausada_em as string | null) ?? null, pausa_motivo: (conta.pausa_motivo as string | null) ?? null })
    if (m) throw new ContaEmPausa(m)
    return
  }
  const accountId = typeof conta === 'string' ? conta : conta.id
  const { data, error } = await getSupabaseAdmin()
    .from('mtm_trading_accounts')
    .select('pausada_em, pausa_motivo')
    .eq('id', accountId)
    .maybeSingle()
  if (error) {
    if (/42703|PGRST204|pausada_em|column/i.test(`${error.code} ${error.message}`)) return
    throw Object.assign(new ContaEmPausa('não foi possível confirmar o estado da conta — tenta outra vez'), { status: 503 })
  }
  const m = motivoDePausa(data as { pausada_em?: string | null; pausa_motivo?: string | null } | null)
  if (m) throw new ContaEmPausa(m)
}
