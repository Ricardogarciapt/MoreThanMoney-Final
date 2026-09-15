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
 * Lê-se à parte, pela chave primária, e não no `CAMPOS_CONTA` de execucao.ts: enquanto a 079 não
 * estiver aplicada a coluna não existe, e pô-la no select partilhado partia TODAS as ordens. Sem
 * coluna, não há pausas possíveis — deixa passar. Qualquer outro erro de leitura fecha a porta.
 */
export class ContaEmPausa extends Error {
  status = 409
}

export async function exigirSemPausa(accountId: string): Promise<void> {
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
