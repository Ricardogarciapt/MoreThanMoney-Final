import { ehTradeLocker, sessaoDaLigacao, type LigacaoTL } from './ligacao'

/**
 * Preenche account_balance/account_equity das ligações TradeLocker (o attachConnectionBalances
 * só conhece a MetaApi e deixava-as a null). Uma conta lenta não segura a listagem: 8s e segue.
 */
export async function juntarSaldosTradeLocker<T extends LigacaoTL & { mt5_status?: string | null; account_balance?: number | null; account_equity?: number | null }>(
  ligacoes: T[],
): Promise<T[]> {
  return Promise.all(
    ligacoes.map(async (c) => {
      if (!ehTradeLocker(c) || c.mt5_status !== 'connected') return c
      const leitura = (async () => {
        const { sessao } = await sessaoDaLigacao(c)
        return sessao ? sessao.estado() : null
      })().catch(() => null)
      const estado = await Promise.race([leitura, new Promise<null>((r) => setTimeout(() => r(null), 8000))])
      return estado ? { ...c, account_balance: estado.balance, account_equity: estado.equity } : c
    }),
  )
}
