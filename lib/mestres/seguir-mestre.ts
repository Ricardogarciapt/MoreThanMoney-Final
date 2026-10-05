/**
 * TAP TO TRADE SEGUE A MESTRE (F4, 05/10) — de que conta vem a posição que o cliente segue.
 *
 * Até aqui o T2T pelo motor só seguia a mestre SIM (funded_positions) e só para três canais fixos.
 * Agora, para QUALQUER provider (F1: o canal deriva-se dos providers), a origem é a conta que opera:
 *   · mtmfunded (e a mestre SIM de qualquer outro tipo)  → `fpos:<posição>`  · funded_positions
 *   · metaapi (conta MT4/MT5 do educador)                → `pos:<posição>`   · streaming do VPS
 *   · tradelocker                                        → `tlpos:<posição>` · sondagem TL do VPS
 * A ORIGEM da rota T2T passa a ser essa conta (origem_chave física), e a cadeia que já existe
 * (trigger 078/083 para SIM; diffPosicoes no streaming para MT/TL) produz os factos open / modify /
 * partial / close que o motor aplica na conta do cliente — SL/TP pela distância à entrada REAL,
 * parciais pela proporção, fecho com a mestre. Nenhuma leitura MetaApi nova: a fonte MT lê-se pelo
 * streaming que o serviço mtm-copia-contas já abre para as rotas activas dessa origem.
 *
 * Telegram e MT5 directo «por ligar» não operam conta nossa legível → seguem a mestre SIM, que o
 * sinal alimenta (sinal_modo).
 *
 * Puro — testado em __tests__/seguir-mestre.check.ts.
 */
import type { PlataformaCopia } from '../copia-contas/tipos'
import type { PosicaoMestreCandidata } from './t2t'

export interface ProviderParaSeguir {
  id: string
  tipo: string
  plataforma?: string | null
  login?: string | null
  servidor?: string | null
  metaapi_account_id?: string | null
  tl_env?: string | null
  tl_account_id?: string | null
  funded_account_id?: string | null
  fonte_execucao?: string | null
  espelho_funded_account_id?: string | null
}

export interface OrigemT2T {
  fonte: 'funded' | 'metaapi' | 'tradelocker'
  origem_tipo: PlataformaCopia
  origem_chave: string
  /** prefixo da referência da posição (pos: / fpos: / tlpos:) */
  prefixo: 'pos:' | 'fpos:' | 'tlpos:'
  /** conta SIM a ler em funded_positions (só fonte funded) */
  contaFunded: string | null
}

export function origemT2TDoProvider(p: ProviderParaSeguir, contaMestreId: string): OrigemT2T {
  const funded = (id: string): OrigemT2T => ({ fonte: 'funded', origem_tipo: 'mtmfunded', origem_chave: `mtmfunded:${id.toLowerCase()}`, prefixo: 'fpos:', contaFunded: id })
  if (p.fonte_execucao === 'espelho' && p.espelho_funded_account_id) return funded(String(p.espelho_funded_account_id))
  if (p.tipo === 'metaapi') {
    const login = String(p.login ?? '').replace(/\D/g, '')
    const servidor = String(p.servidor ?? '').trim().toLowerCase()
    const chave = login && servidor ? `mt:${login}@${servidor}` : p.metaapi_account_id ? `metaapi:${String(p.metaapi_account_id).toLowerCase()}` : null
    if (chave) return { fonte: 'metaapi', origem_tipo: p.plataforma === 'mt4' ? 'mt4' : 'mt5', origem_chave: chave, prefixo: 'pos:', contaFunded: null }
  }
  if (p.tipo === 'tradelocker' && p.tl_env && p.tl_account_id) {
    return { fonte: 'tradelocker', origem_tipo: 'tradelocker', origem_chave: `tl:${String(p.tl_env).toLowerCase()}:${p.tl_account_id}`, prefixo: 'tlpos:', contaFunded: null }
  }
  // mtmfunded ligado, telegram, mt5 «por ligar», mtm_t2t → a mestre SIM da estratégia
  return funded(String(p.tipo === 'mtmfunded' && p.funded_account_id ? p.funded_account_id : contaMestreId))
}

export const refDaPosicao = (o: Pick<OrigemT2T, 'prefixo'>, posicaoId: string) => `${o.prefixo}${posicaoId}`

/** Lê uma referência pos:/fpos:/tlpos: (null = outra coisa, ex. o id de uma mensagem do Telegram). */
export function lerRefPosicao(ref: string | null | undefined): { prefixo: OrigemT2T['prefixo']; id: string } | null {
  const m = /^(pos|fpos|tlpos):(.+)$/.exec(String(ref ?? ''))
  return m ? { prefixo: `${m[1]}:` as OrigemT2T['prefixo'], id: m[2] } : null
}

export interface FactoOrigem {
  origem_posicao_id: string
  tipo: 'open' | 'modify' | 'partial' | 'close'
  payload: Record<string, unknown>
  origem_em: string | null
  criado_em?: string | null
}

/**
 * As posições ABERTAS de uma origem MT/TL a partir dos factos que o streaming já publicou
 * (`copia_eventos` das rotas dessa origem): abriu e ainda não fechou. O último SL/TP conhecido vem
 * do modify mais recente. Sem leitura nova à MetaApi.
 */
export function candidatasDosFactos(factos: FactoOrigem[]): Array<PosicaoMestreCandidata & { volume: number; sl: number | null; tp: number | null }> {
  const porPos = new Map<string, FactoOrigem[]>()
  for (const f of factos) porPos.set(f.origem_posicao_id, [...(porPos.get(f.origem_posicao_id) ?? []), f])
  const out: Array<PosicaoMestreCandidata & { volume: number; sl: number | null; tp: number | null }> = []
  const t = (f: FactoOrigem) => Date.parse(f.origem_em ?? f.criado_em ?? '') || 0
  for (const [id, lista] of porPos) {
    const ord = [...lista].sort((a, b) => t(a) - t(b))
    const open = ord.find((f) => f.tipo === 'open')
    if (!open || ord.some((f) => f.tipo === 'close')) continue
    const ultimo = ord[ord.length - 1].payload
    const n = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
    const p = open.payload
    out.push({
      id, symbol: String(p.symbol ?? ''), direcao: p.direcao === 'sell' ? 'sell' : 'buy', preco_entrada: Number(p.preco ?? 0),
      aberta_em: String(p.aberta_em ?? open.origem_em ?? ''), estado: 'aberta',
      volume: n(ultimo.volume) ?? n(p.volume) ?? 0, sl: n(ultimo.sl), tp: n(ultimo.tp),
    })
  }
  return out
}
