/**
 * MESTRES NOSSAS — tipos partilhados pelo serviço do VPS (mtm-copia-contas), pelos scripts de corte e
 * pelos testes. Puro. Tabelas na migração 116.
 *
 * A mestre de cada estratégia é uma conta SIMULADA da casa (MTM Funded, motor `sim`). As posições dela
 * saem para a outbox da cópia (trigger 078/083) e o motor envia cada facto — abrir, parcial, mover
 * SL/BE/trailing, fechar — directamente para as contas dos clientes (MT4/MT5 por REST, TradeLocker por
 * API). Nada passa pela CopyFactory.
 */

export type ModoEstrategia = 'desligado' | 'sombra' | 'live'
export type ModoConta = 'sombra' | 'live'
export type ModoDecidido = 'parado' | 'sombra' | 'live'

/** site_settings.mestres_motor */
export interface ConfigGlobalMestres {
  ligado: boolean
  kill: boolean
  liveDesbloqueado: boolean
}

export const CONFIG_GLOBAL_FECHADA: ConfigGlobalMestres = { ligado: false, kill: false, liveDesbloqueado: false }

/** Uma linha de mestres_estrategias, normalizada. */
export interface EstrategiaMestre {
  providerId: string
  slug: string
  contaMestreId: string
  modo: ModoEstrategia
  sinalModo: ModoEstrategia
  t2tModo: ModoEstrategia
  incluirMtmauto: boolean
  mtmautoCortadoEm: string | null
  copyfactoryIds: string[]
  copyfactoryCortadoEm: string | null
  maxAtrasoAberturaS: number
}

/** Uma linha de mestres_contas, normalizada (conta sem linha = valores por omissão, modo sombra). */
export interface ContaMestres {
  contaChave: string
  contaRef: string
  modo: ModoConta
  loteFixoForcado: number | null
  maxPosicoes: number
  maxRiscoTotalPct: number
  maxLoteTotal: number | null
  falhasSeguidas: number
  bloqueada: boolean
  bloqueioMotivo: string | null
}

export const LIMITES_POR_OMISSAO = { maxPosicoes: 10, maxRiscoTotalPct: 6, maxLoteTotal: null as number | null }

export function contaPorOmissao(contaChave: string, contaRef: string): ContaMestres {
  return {
    contaChave, contaRef, modo: 'sombra', loteFixoForcado: null,
    maxPosicoes: LIMITES_POR_OMISSAO.maxPosicoes, maxRiscoTotalPct: LIMITES_POR_OMISSAO.maxRiscoTotalPct,
    maxLoteTotal: LIMITES_POR_OMISSAO.maxLoteTotal, falhasSeguidas: 0, bloqueada: false, bloqueioMotivo: null,
  }
}

const modoValido = <T extends string>(v: unknown, validos: readonly T[], omissao: T): T =>
  (validos as readonly string[]).includes(String(v)) ? (String(v) as T) : omissao

export function lerEstrategiaMestre(r: Record<string, unknown>): EstrategiaMestre {
  const modos = ['desligado', 'sombra', 'live'] as const
  return {
    providerId: String(r.provider_id),
    slug: String(r.slug),
    contaMestreId: String(r.conta_mestre_id),
    modo: modoValido(r.modo, modos, 'desligado'),
    sinalModo: modoValido(r.sinal_modo, modos, 'desligado'),
    t2tModo: modoValido(r.t2t_modo, modos, 'desligado'),
    incluirMtmauto: r.incluir_mtmauto === true,
    mtmautoCortadoEm: r.mtmauto_cortado_em ? String(r.mtmauto_cortado_em) : null,
    copyfactoryIds: Array.isArray(r.copyfactory_ids) ? (r.copyfactory_ids as unknown[]).map(String).filter(Boolean) : [],
    copyfactoryCortadoEm: r.copyfactory_cortado_em ? String(r.copyfactory_cortado_em) : null,
    maxAtrasoAberturaS: Number(r.max_atraso_abertura_s) > 0 ? Number(r.max_atraso_abertura_s) : 30,
  }
}

export function lerContaMestres(r: Record<string, unknown>): ContaMestres {
  const n = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  return {
    contaChave: String(r.conta_chave),
    contaRef: String(r.conta_ref),
    modo: r.modo === 'live' ? 'live' : 'sombra',
    loteFixoForcado: n(r.lote_fixo_forcado),
    maxPosicoes: n(r.max_posicoes) ?? LIMITES_POR_OMISSAO.maxPosicoes,
    maxRiscoTotalPct: n(r.max_risco_total_pct) ?? LIMITES_POR_OMISSAO.maxRiscoTotalPct,
    maxLoteTotal: n(r.max_lote_total),
    falhasSeguidas: n(r.falhas_seguidas) ?? 0,
    bloqueada: Boolean(r.bloqueada_em),
    bloqueioMotivo: r.bloqueio_motivo ? String(r.bloqueio_motivo) : null,
  }
}

export function lerConfigGlobal(v: unknown): ConfigGlobalMestres {
  // site_settings.value às vezes vem como STRING JSON (ver t2t-fontes-config-guardada)
  let o: unknown = v
  if (typeof v === 'string') {
    try { o = JSON.parse(v) } catch { o = null }
  }
  const x = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>
  return { ligado: x.ligado === true, kill: x.kill === true, liveDesbloqueado: x.live_desbloqueado === true }
}

export type TipoOrdem = 'abrir' | 'modificar' | 'parcial' | 'fechar' | 'nada'
export type EstadoOrdem = 'sombra' | 'enviando' | 'ok' | 'recusado' | 'erro' | 'bloqueado' | 'saltado'
