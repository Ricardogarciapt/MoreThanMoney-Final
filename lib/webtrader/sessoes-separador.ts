/**
 * SESSÕES DESTE SEPARADOR — contas abertas com login+password no WebTrader (MTM Funded e
 * TradeLocker). Ficam no sessionStorage: fechar o separador = sair. Nunca guardam a password.
 *
 * Havia duas cópias iguais (components/funded/api.ts e components/webtrader/api-corretoras.ts),
 * só com outra chave. Uma implementação, duas instâncias.
 */

/** As sessões ainda válidas (uma sessão expirada que depois dá 401 é pior do que não a mostrar). Puro. */
export function sessoesValidas<T extends { expira: string }>(raw: unknown, agora = Date.now()): Record<string, T> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, T>).filter(([, s]) => s && typeof s === 'object' && new Date(s.expira).getTime() > agora),
  )
}

export function armazemDeSessoes<T extends { expira: string }>(chave: string, idDe: (s: T) => string) {
  const ler = (): Record<string, T> => {
    try {
      return sessoesValidas<T>(JSON.parse(sessionStorage.getItem(chave) || '{}'))
    } catch {
      return {}
    }
  }
  const guardar = (s: T) => {
    try {
      const todas = ler()
      todas[idDe(s)] = s
      sessionStorage.setItem(chave, JSON.stringify(todas))
    } catch { /* modo privado: fica só em memória */ }
  }
  const apagar = (id: string) => {
    try {
      const todas = ler()
      delete todas[id]
      sessionStorage.setItem(chave, JSON.stringify(todas))
    } catch { /* nada */ }
  }
  return { ler, guardar, apagar }
}
