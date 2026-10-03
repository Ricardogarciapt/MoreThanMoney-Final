/**
 * FONTES PARTILHADAS — uma leitura por conta FÍSICA (e por chave MetaApi), para todas as rotas que a
 * usam como origem: contas de clientes (site/auto/wt) e contas de estratégia (prov:). Sem isto, a mesma
 * conta ligada no T2T, no MTM Auto e como provider abria três ligações de streaming (três vezes os
 * créditos) e três sondagens TradeLocker.
 *
 *   MT4/MT5     → `<chave token>|<chave física>`   (a mesma conta em duas chaves são duas contas MetaApi)
 *   TradeLocker → `tl|<chave física>`             (a API TL não tem chave da casa/equipa)
 *   MTM Funded  → sem fonte: o trigger da base emite para todas as rotas da chave física (083)
 *
 * Puro e testado (lib/copia-contas/__tests__/copia-equipas.check.ts).
 */
import type { ChaveToken } from './tokens'
import type { PlataformaCopia, RotaCopia } from './tipos'

export interface ContaDaFonte {
  ref: string
  plataforma: PlataformaCopia
  metaapiAccountId: string | null
  /** null = sem chave utilizável (a fonte não liga) */
  chaveToken: ChaveToken | null
}

export interface FonteAgrupada {
  chave: string
  tipo: 'mt' | 'tl'
  /** a referência usada para ler a conta (a primeira por ordem estável) */
  ref: string
  metaapiAccountId: string | null
  chaveToken: ChaveToken | null
  rotas: RotaCopia[]
}

export interface ResultadoAgrupar {
  fontes: Map<string, FonteAgrupada>
  /** rotas que não conseguem ter fonte, com o motivo (vão para o log, não param as outras) */
  semFonte: { rotaId: string; motivo: string }[]
}

export function chaveDaFonte(plataforma: PlataformaCopia, origemChave: string, chaveToken: ChaveToken | null): string | null {
  if (plataforma === 'mtmfunded') return null
  if (plataforma === 'tradelocker') return `tl|${origemChave}`
  return chaveToken ? `${chaveToken}|${origemChave}` : null
}

export function agruparFontes(rotas: RotaCopia[], contas: Map<string, ContaDaFonte | null>): ResultadoAgrupar {
  const fontes = new Map<string, FonteAgrupada>()
  const semFonte: ResultadoAgrupar['semFonte'] = []
  const ordenadas = [...rotas].sort((a, b) => a.origem_ref.localeCompare(b.origem_ref) || a.id.localeCompare(b.id))
  for (const r of ordenadas) {
    if (r.origem_tipo === 'mtmfunded') continue
    const c = contas.get(r.origem_ref)
    if (!c) { semFonte.push({ rotaId: r.id, motivo: 'conta de origem não encontrada' }); continue }
    if ((c.plataforma === 'mt4' || c.plataforma === 'mt5') && !c.metaapiAccountId) { semFonte.push({ rotaId: r.id, motivo: 'origem MT sem conta MetaApi' }); continue }
    const chave = chaveDaFonte(c.plataforma, r.origem_chave, c.chaveToken)
    if (!chave) { semFonte.push({ rotaId: r.id, motivo: 'origem sem chave MetaApi utilizável' }); continue }
    const f = fontes.get(chave)
    if (f) f.rotas.push(r)
    else fontes.set(chave, { chave, tipo: c.plataforma === 'tradelocker' ? 'tl' : 'mt', ref: c.ref, metaapiAccountId: c.metaapiAccountId, chaveToken: c.chaveToken, rotas: [r] })
  }
  return { fontes, semFonte }
}

/** Desde quando uma fonte copia aberturas: a aprovação mais antiga das suas rotas. */
export function desdeDaFonte(rotas: Pick<RotaCopia, 'aprovada_em'>[], agora = Date.now()): number | null {
  const t = Math.min(...rotas.map((r) => (r.aprovada_em ? Date.parse(r.aprovada_em) : agora)))
  return Number.isFinite(t) ? t : null
}
