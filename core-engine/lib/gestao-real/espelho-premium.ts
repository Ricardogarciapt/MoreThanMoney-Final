/**
 * ESPELHO DAS SAÍDAS PREMIUM NOS SUBSCRITORES — a decisão por conta, sem IO.
 *
 * Fonte única de `mirrorPremiumExit` (lib/mtmcopy/premium-subscriber-exits.ts) e do motor em tempo
 * real do VPS (que em sombra regista, por subscritor, o que o espelho faria). Tirado do código de
 * 2026-09-15 (8a81044) sem mudar regras; prova em `__tests__/paridade-espelho-premium.check.ts`.
 *
 *  · só contas que copiam a estratégia Premium por CopyFactory (`copy_method='strategy'`);
 *  · a posição casa por SÍMBOLO (tolerante a sufixos; ouro por XAU/GOLD) + DIREÇÃO;
 *  · mais de uma posição a casar = ambíguo → não mexe (não arrisca a posição errada de alguém);
 *  · close_frac: fração da posição ACTUAL, arredondada para baixo a 0,01; <0,01 → segura;
 *    o que sobra <0,01 → fecha tudo (evita pó).
 */
import type { AcaoEspelhoPremium, PosicaoGestao } from './premium'
import { CANONICAL_PREMIUM_STRATEGY_ID } from '../mtmcopy/provider-constants'

export interface LigacaoSubscritor {
  metaapi_account_id?: string | null
  copy_method?: string | null
  copyfactory_strategy_id?: string | null
  copyfactory_strategy_pick?: string | null
  strategy_lots?: Record<string, number> | null
}

/** Quem copia o Premium (o pick guarda o ID da estratégia; 'premium' e strategy_lots por compatibilidade). */
export function copiaPremium(r: LigacaoSubscritor): boolean {
  return (
    r.copyfactory_strategy_id === CANONICAL_PREMIUM_STRATEGY_ID ||
    r.copyfactory_strategy_pick === CANONICAL_PREMIUM_STRATEGY_ID ||
    r.copyfactory_strategy_pick === 'premium' ||
    (r.strategy_lots != null && (CANONICAL_PREMIUM_STRATEGY_ID in r.strategy_lots || 'premium' in r.strategy_lots))
  )
}

/** Ids MetaApi dos subscritores do Premium (sem repetidos), das ligações activas e ligadas. */
export function contasSubscritoras(rows: LigacaoSubscritor[]): string[] {
  const ids = rows
    .filter((r) => r.copy_method === 'strategy' && r.metaapi_account_id?.trim() && copiaPremium(r))
    .map((r) => r.metaapi_account_id!.trim())
  return [...new Set(ids)]
}

export function direcaoDaPosicao(p: Pick<PosicaoGestao, 'type'>): 'buy' | 'sell' {
  return /buy/i.test(p.type) ? 'buy' : 'sell'
}

function cleanSym(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Match tolerante a sufixos de corretora; ouro reconhecido por XAU/GOLD. */
export function simboloCasa(posSym: string, target: string): boolean {
  const a = cleanSym(posSym)
  const b = cleanSym(target)
  if (!a || !b) return false
  const gold = (x: string) => /XAU|GOLD/.test(x)
  if (gold(a) && gold(b)) return true
  return a === b || a.startsWith(b) || b.startsWith(a)
}

export function floorLot(n: number): number {
  return Math.floor((n + 1e-9) * 100) / 100
}

export type DecisaoSubscritor<P extends PosicaoGestao = PosicaoGestao> =
  | { tipo: 'sem_posicao' }
  | { tipo: 'ambiguo'; n: number }
  | { tipo: 'sem_volume'; pos: P }
  | { tipo: 'fechar_tudo'; pos: P; vol: number }
  | { tipo: 'fechar_resto'; pos: P; vol: number }
  | { tipo: 'segura'; pos: P; vol: number }
  | { tipo: 'parcial'; pos: P; vol: number; volume: number }
  | { tipo: 'be_trailing'; pos: P; vol: number }

/** O que o espelho faz nesta conta, dadas as posições abertas dela. */
export function decidirSubscritor<P extends PosicaoGestao>(
  positions: P[],
  symbol: string,
  direction: 'buy' | 'sell',
  action: AcaoEspelhoPremium,
): DecisaoSubscritor<P> {
  const matches = positions.filter((p) => simboloCasa(p.symbol, symbol) && direcaoDaPosicao(p) === direction)
  if (matches.length === 0) return { tipo: 'sem_posicao' }
  if (matches.length > 1) return { tipo: 'ambiguo', n: matches.length }
  const pos = matches[0]!
  const vol = pos.volume ?? 0
  if (vol <= 0) return { tipo: 'sem_volume', pos }
  if (action.kind === 'close_all') return { tipo: 'fechar_tudo', pos, vol }
  if (action.kind === 'be_trailing') return { tipo: 'be_trailing', pos, vol }
  const wanted = floorLot(vol * action.frac)
  if (wanted < 0.01) return { tipo: 'segura', pos, vol }
  if (vol - wanted < 0.01) return { tipo: 'fechar_resto', pos, vol }
  return { tipo: 'parcial', pos, vol, volume: wanted }
}
