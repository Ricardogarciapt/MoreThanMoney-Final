/**
 * Validar o que o ecrã manda para criar/alterar um copiador. Pura (o servidor e o teste usam-na).
 * Devolve só os campos presentes — um PATCH que muda o lote máximo não apaga a lista de símbolos.
 */

export type ModoLoteCfg = 'proporcional_saldo' | 'multiplicador' | 'fixo' | 'risco_pct'
const MODOS: ModoLoteCfg[] = ['proporcional_saldo', 'multiplicador', 'fixo', 'risco_pct']

export interface ConfigCopiador {
  modo_lote?: ModoLoteCfg
  valor?: number | null
  lote_max?: number | null
  max_posicoes?: number | null
  perda_diaria_max?: number | null
  copiar_sl?: boolean
  copiar_tp?: boolean
  simbolos?: string[]
}

const positivoOuNull = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : NaN
}

export function validarConfig(b: Record<string, unknown>): { ok: true; config: ConfigCopiador } | { ok: false; erro: string } {
  const c: ConfigCopiador = {}
  if (b.modoLote !== undefined) {
    if (!MODOS.includes(b.modoLote as ModoLoteCfg)) return { ok: false, erro: 'modo de lote inválido' }
    c.modo_lote = b.modoLote as ModoLoteCfg
  }
  for (const [k, col] of [['valor', 'valor'], ['loteMax', 'lote_max'], ['perdaDiariaMax', 'perda_diaria_max']] as const) {
    const v = positivoOuNull(b[k])
    if (Number.isNaN(v)) return { ok: false, erro: `${k} tem de ser um número positivo` }
    if (v !== undefined) c[col] = v
  }
  const mp = positivoOuNull(b.maxPosicoes)
  if (Number.isNaN(mp) || (mp != null && !Number.isInteger(mp))) return { ok: false, erro: 'maxPosicoes tem de ser um inteiro positivo' }
  if (mp !== undefined) c.max_posicoes = mp
  if (c.perda_diaria_max != null && c.perda_diaria_max > 100) return { ok: false, erro: 'perda diária máxima é uma percentagem (até 100)' }
  if (c.lote_max != null && c.lote_max > 100) return { ok: false, erro: 'lote máximo acima de 100' }

  const modo = c.modo_lote
  if (modo === 'multiplicador' && !(c.valor && c.valor <= 20)) return { ok: false, erro: 'multiplicador entre 0 e 20' }
  if (modo === 'fixo' && !(c.valor && c.valor <= 100)) return { ok: false, erro: 'lote fixo inválido' }
  if (modo === 'risco_pct' && !(c.valor && c.valor <= 10)) return { ok: false, erro: 'risco por trade entre 0 e 10%' }
  if (modo === 'proporcional_saldo' && c.valor != null && c.valor > 10) return { ok: false, erro: 'factor proporcional até 10' }

  if (b.copiarSl !== undefined) c.copiar_sl = Boolean(b.copiarSl)
  if (b.copiarTp !== undefined) c.copiar_tp = Boolean(b.copiarTp)
  if (b.simbolos !== undefined) {
    if (!Array.isArray(b.simbolos)) return { ok: false, erro: 'simbolos tem de ser uma lista' }
    const lista = [...new Set(b.simbolos.map((s) => String(s).toUpperCase().trim()).filter((s) => /^[A-Z0-9._#-]{2,20}$/.test(s)))]
    if (lista.length > 100) return { ok: false, erro: 'no máximo 100 símbolos' }
    c.simbolos = lista
  }
  return { ok: true, config: c }
}
