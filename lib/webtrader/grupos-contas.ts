/**
 * Grupos do seletor de contas — como nas plataformas de corretora: um cabeçalho por corretora e
 * servidor («MTM FUNDED», «TRADELOCKER · HEROFX», «MT5 · ICMARKETS-LIVE»), com as contas por baixo.
 *
 * A ordem que a pessoa escolheu (estrela, «Organizar») manda: os grupos aparecem pela ordem da
 * primeira conta de cada um e, dentro do grupo, as contas mantêm a ordem dela. Puro; testes em
 * __tests__/grupos-contas.check.ts.
 */
export interface ContaAgrupavel {
  id: string
  /** Só nas contas de corretora (TradeLocker, MT4/MT5); ausente = MTM Funded. */
  real?: { plataforma: string; servidor: string | null; rotulo: string | null; versao?: 'mt4' | 'mt5' } | null
}

export interface GrupoContas<T> { chave: string; titulo: string; contas: T[] }

const NOMES: Record<string, string> = { mtmfunded: 'MTM Funded', tradelocker: 'TradeLocker', mt5: 'MT5' }

export function grupoDaConta(c: ContaAgrupavel): { chave: string; titulo: string } {
  if (!c.real) return { chave: 'mtmfunded', titulo: 'MTM Funded' }
  const plataforma = c.real.versao === 'mt4' ? 'MT4' : NOMES[c.real.plataforma] ?? c.real.plataforma
  const servidor = (c.real.servidor ?? c.real.rotulo ?? '').trim()
  return {
    chave: `${c.real.plataforma}:${c.real.versao ?? ''}:${servidor.toLowerCase()}`,
    titulo: servidor ? `${plataforma} · ${servidor}` : plataforma,
  }
}

export function agruparContas<T extends ContaAgrupavel>(contas: T[]): GrupoContas<T>[] {
  const grupos = new Map<string, GrupoContas<T>>()
  for (const c of contas) {
    const g = grupoDaConta(c)
    const existente = grupos.get(g.chave)
    if (existente) existente.contas.push(c)
    else grupos.set(g.chave, { ...g, contas: [c] })
  }
  return [...grupos.values()]
}
