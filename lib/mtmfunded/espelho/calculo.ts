/**
 * O ESPELHO DAS ESTRATÉGIAS — as decisões, puras.
 *
 * Uma conta simulada que «segue» uma estratégia do MTM Auto copia as posições REAIS da
 * conta-mestre dessa estratégia (a conta provider na MetaApi). O motor do VPS lê a mestre de 3 em
 * 3 segundos e pergunta a este ficheiro: o que mudou, e o que faço na seguidora?
 *
 *   · posição nova na mestre         → abrir na seguidora, em proporção ao saldo;
 *   · SL/TP mudou na mestre          → mudar na seguidora (níveis absolutos: é o BE e o trailing);
 *   · volume da mestre desceu        → parcial proporcional na seguidora;
 *   · posição desapareceu da mestre  → fechar na seguidora (só depois de 2 leituras seguidas).
 *
 * Porque é que a verdade é a conta-mestre e não os sinais: a gestão de cada estratégia (parciais,
 * break-even, trailing, saídas antecipadas) já está TODA nas posições dela. Reimplementá-la a
 * partir das mensagens seria ter duas estratégias com o mesmo nome a fazer coisas diferentes.
 *
 * Sem imports do Next nem da Supabase: o motor empacota-o e o teste corre-o com números à mão
 * (lib/mtmfunded/__tests__/espelho.check.ts).
 *
 * ── O QUE NUNCA SE FAZ ────────────────────────────────────────────────────────
 * Uma leitura da mestre que falhou (`null`) NÃO é «a mestre não tem posições». Com `null` não se
 * fecha nada — o erro que custou 21 de 37 trades de ouro no MTM Copy (lib/mtmcopy/metaapi.ts,
 * readOpenPositions) não se repete aqui.
 */
import type { Simbolo } from '../simulado/matematica'
import { candidatosDeTicker } from '../simulado/ordens'

export type Direcao = 'buy' | 'sell'

export interface PosicaoMestre {
  id: string
  symbol: string
  direcao: Direcao
  volume: number
  openPrice: number
  sl: number | null
  tp: number | null
  /** Hora de abertura (ISO) — sem ela não se sabe se é anterior à conta seguidora. */
  time: string | null
}

/** Uma posição da MetaApi → a forma de cá. Tipos que não sejam compra/venda saem (null). */
export function posicaoMestreDaMetaApi(p: Record<string, unknown>): PosicaoMestre | null {
  const tipo = String(p.type ?? '')
  const direcao: Direcao | null = tipo === 'POSITION_TYPE_BUY' ? 'buy' : tipo === 'POSITION_TYPE_SELL' ? 'sell' : null
  const volume = Number(p.volume)
  if (!direcao || !p.id || !p.symbol || !(volume > 0)) return null
  const nivel = (v: unknown) => (v == null || !(Number(v) > 0) ? null : Number(v))
  return {
    id: String(p.id),
    symbol: String(p.symbol),
    direcao,
    volume,
    openPrice: Number(p.openPrice ?? 0),
    sl: nivel(p.stopLoss),
    tp: nivel(p.takeProfit),
    time: p.time ? new Date(p.time as string).toISOString() : null,
  }
}

// ── símbolo ──────────────────────────────────────────────────────────────────

/**
 * Símbolo da corretora da mestre (XAUUSD, XAUUSD.x, DJ30…) → símbolo do nosso catálogo. O MESMO
 * mapeamento do webhook do TradingView e dos links do WebTrader (`candidatosDeTicker`): o primeiro
 * candidato que exista no catálogo ganha.
 */
export function simboloDoCatalogo(simboloMestre: string, catalogo: { has(s: string): boolean }): string | null {
  for (const c of candidatosDeTicker(simboloMestre)) if (catalogo.has(c)) return c
  return null
}

// ── comentário à MT5 ────────────────────────────────────────────────────────

const COMENTARIOS: Record<string, string> = {
  'premium-ouro': 'MTM Auto Premium',
  goldkiller: 'MTM Auto GoldKiller',
  sensei: 'MTM Auto Sensei',
  'aurum-flow': 'MTM Auto Aurum Flow',
  'mtm-scanner': 'MTM Auto Scanner',
}

/** O comentário da posição, como apareceria no MetaTrader (31 caracteres, o limite do MT5). */
export function comentarioEstrategia(slug: string, nome?: string | null): string {
  const fixo = COMENTARIOS[slug.toLowerCase()]
  if (fixo) return fixo
  const n = String(nome ?? slug).trim()
  return (/^mtm auto/i.test(n) ? n : `MTM Auto ${n}`).slice(0, 31)
}

export function comentarioT2T(fonte: string | null | undefined): string {
  return `T2T ${String(fonte ?? 'MTM').trim() || 'MTM'}`.slice(0, 31)
}

// ── tamanho ──────────────────────────────────────────────────────────────────

export type TamanhoEspelho =
  | { ok: true; volume: number; ideal: number; escala: number }
  | { ok: false; motivo: string }

/**
 * O lote na seguidora: o da mestre × (equity da seguidora ÷ equity da mestre), corrigido pelo
 * tamanho do contrato das duas corretoras (1 lote de ETHUSD não é o mesmo em todo o lado).
 *
 * Abaixo do mínimo do símbolo abre-se o MÍNIMO e regista-se a `escala` (aplicado ÷ ideal): a
 * análise precisa de ver a trade, e as métricas dizem quanto a seguidora arriscou a mais. É o
 * contrário da cópia para contas reais (lib/mtmfunded/copia/dimensionar.ts), que RECUSA — ali é
 * dinheiro, aqui é medição.
 */
export function volumeEspelho(e: {
  volumeMestre: number
  equityMestre: number | null
  equitySeguidora: number
  simbolo: Pick<Simbolo, 'volume_min' | 'volume_step' | 'volume_max' | 'contract_size'>
  contratoMestre?: number | null
}): TamanhoEspelho {
  if (!(e.volumeMestre > 0)) return { ok: false, motivo: 'volume da mestre inválido' }
  if (!(e.equityMestre != null && e.equityMestre > 0)) return { ok: false, motivo: 'equity da mestre desconhecida' }
  if (!(e.equitySeguidora > 0)) return { ok: false, motivo: 'conta seguidora sem saldo' }
  const s = e.simbolo
  const contrato = e.contratoMestre && e.contratoMestre > 0 && s.contract_size > 0 ? e.contratoMestre / s.contract_size : 1
  const ideal = e.volumeMestre * (e.equitySeguidora / e.equityMestre) * contrato
  if (!Number.isFinite(ideal) || ideal <= 0) return { ok: false, motivo: 'lote calculado inválido' }
  const step = s.volume_step > 0 ? s.volume_step : 0.01
  let volume = Math.round(ideal / step) * step
  volume = Math.min(s.volume_max > 0 ? s.volume_max : volume, Math.max(s.volume_min, volume))
  volume = arred2(volume)
  return { ok: true, volume, ideal: Math.round(ideal * 1e6) / 1e6, escala: Math.round((volume / ideal) * 1000) / 1000 }
}

const arred2 = (x: number) => Math.round(x * 100) / 100

/**
 * Quanto fechar na seguidora quando a mestre reduziu. O alvo é a seguidora ficar com a MESMA
 * fracção do lote inicial que a mestre ainda tem; fecha-se a diferença para o que está aberto.
 * Um parcial que não cabe no passo do símbolo não se perde: o seguinte apanha-o.
 *
 * Nunca deixa a seguidora abaixo do lote mínimo enquanto a mestre continua aberta — o fecho total
 * é só quando a posição desaparece da mestre.
 */
export function planoParcialEspelho(e: {
  volumeMestreAbertura: number
  volumeMestreAtual: number
  volumeSeguidoraAbertura: number
  volumeSeguidoraAtual: number
  simbolo: Pick<Simbolo, 'volume_min' | 'volume_step'>
}): { volume: number; fechadoPct: number } | null {
  if (!(e.volumeMestreAbertura > 0) || e.volumeMestreAtual >= e.volumeMestreAbertura - 1e-9) return null
  const fechadoPct = Math.min(1, Math.max(0, 1 - e.volumeMestreAtual / e.volumeMestreAbertura))
  const step = e.simbolo.volume_step > 0 ? e.simbolo.volume_step : 0.01
  const alvo = Math.max(e.simbolo.volume_min, e.volumeSeguidoraAbertura * (1 - fechadoPct))
  const bruto = e.volumeSeguidoraAtual - alvo
  const volume = arred2(Math.floor(bruto / step + 1e-6) * step)
  if (volume < step - 1e-9) return null
  if (e.volumeSeguidoraAtual - volume < e.simbolo.volume_min - 1e-9) return null
  return { volume, fechadoPct: Math.round(fechadoPct * 10000) / 10000 }
}

// ── o diff ──────────────────────────────────────────────────────────────────

export interface Ponte {
  id: string
  master_position_id: string
  funded_position_id: string | null
  volume_master_abertura: number
  volume_seguidora_abertura: number | null
  estado: 'aberta' | 'fechada' | 'recusada' | 'fechada_local'
}

export interface PosicaoSeguidora {
  id: string
  symbol: string
  volume: number
  sl: number | null
  tp: number | null
  estado: 'aberta' | 'fechada'
}

export type AccaoEspelho =
  | { tipo: 'abrir'; mestre: PosicaoMestre }
  | { tipo: 'ignorar_antiga'; mestre: PosicaoMestre; motivo: string }
  | { tipo: 'modificar'; ponteId: string; positionId: string; sl: number | null; tp: number | null }
  | { tipo: 'parcial'; ponteId: string; positionId: string; volume: number; fechadoPct: number; volumeMestreAtual: number }
  | { tipo: 'fechar'; ponteId: string; positionId: string }
  | { tipo: 'marcar'; ponteId: string; estado: 'fechada' | 'fechada_local' | 'recusada'; motivo: string }

export interface EntradaDiff {
  /** Posições da mestre agora; `null` = a leitura falhou. */
  mestre: PosicaoMestre[] | null
  /** Todas as pontes desta seguidora com esta mestre (qualquer estado). */
  pontes: Ponte[]
  /** As posições simuladas das pontes, por id. */
  seguidoras: Map<string, PosicaoSeguidora>
  simbolos: Record<string, Pick<Simbolo, 'volume_min' | 'volume_step'>>
  /** Quantas leituras seguidas cada posição-mestre esteve ausente (o motor guarda e devolve). */
  ausencias: Map<string, number>
  /** Criação da conta seguidora: posições-mestre abertas ANTES não se copiam. */
  seguidoraCriadaEm: string
  agora: Date
  /** Posição-mestre mais velha do que isto não se abre (motor parado, ligação caída). */
  atrasoMaxMs: number
}

/** Leituras seguidas sem a posição antes de a dar por fechada na mestre. */
export const AUSENCIAS_PARA_FECHAR = 2

const igualNivel = (a: number | null, b: number | null) =>
  (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-9))

export function diffEspelho(e: EntradaDiff): { accoes: AccaoEspelho[]; ausencias: Map<string, number> } {
  const accoes: AccaoEspelho[] = []
  // Leitura falhada: nada muda, nem os contadores de ausência.
  if (e.mestre == null) return { accoes, ausencias: new Map(e.ausencias) }

  const ausencias = new Map<string, number>()
  const mestrePorId = new Map(e.mestre.map((m) => [m.id, m]))
  const pontePorMestre = new Map(e.pontes.map((p) => [p.master_position_id, p]))
  const criada = new Date(e.seguidoraCriadaEm).getTime()

  // 1. novas
  for (const m of e.mestre) {
    if (pontePorMestre.has(m.id)) continue
    const t = m.time ? new Date(m.time).getTime() : NaN
    if (!Number.isFinite(t) || t < criada) {
      accoes.push({ tipo: 'ignorar_antiga', mestre: m, motivo: 'aberta na mestre antes de a conta existir' })
      continue
    }
    if (e.agora.getTime() - t > e.atrasoMaxMs) {
      accoes.push({ tipo: 'ignorar_antiga', mestre: m, motivo: `detectada ${Math.round((e.agora.getTime() - t) / 60000)} min depois de abrir na mestre` })
      continue
    }
    accoes.push({ tipo: 'abrir', mestre: m })
  }

  // 2. as que já estão espelhadas
  for (const p of e.pontes) {
    if (p.estado !== 'aberta') continue
    if (!p.funded_position_id) {
      // Ponte sem posição: o motor morreu entre gravar a ponte e abrir. Não se adivinha.
      accoes.push({ tipo: 'marcar', ponteId: p.id, estado: 'recusada', motivo: 'abertura interrompida' })
      continue
    }
    const seg = e.seguidoras.get(p.funded_position_id)
    const m = mestrePorId.get(p.master_position_id)
    if (!seg || seg.estado === 'fechada') {
      // Fechou na simulada antes da mestre (SL simulado, stop-out, ou à mão). Não se reabre.
      accoes.push({ tipo: 'marcar', ponteId: p.id, estado: m ? 'fechada_local' : 'fechada', motivo: 'posição simulada já fechada' })
      continue
    }
    if (!m) {
      const n = (e.ausencias.get(p.master_position_id) ?? 0) + 1
      // O contador fica mesmo ao pedir o fecho: se o fecho falhar (sem preço), a próxima leitura
      // volta a pedi-lo logo, em vez de recomeçar a contagem.
      ausencias.set(p.master_position_id, n)
      if (n >= AUSENCIAS_PARA_FECHAR) accoes.push({ tipo: 'fechar', ponteId: p.id, positionId: seg.id })
      continue
    }
    const s = e.simbolos[seg.symbol]
    if (s && p.volume_seguidora_abertura) {
      const plano = planoParcialEspelho({
        volumeMestreAbertura: p.volume_master_abertura, volumeMestreAtual: m.volume,
        volumeSeguidoraAbertura: p.volume_seguidora_abertura, volumeSeguidoraAtual: seg.volume, simbolo: s,
      })
      if (plano) accoes.push({ tipo: 'parcial', ponteId: p.id, positionId: seg.id, volume: plano.volume, fechadoPct: plano.fechadoPct, volumeMestreAtual: m.volume })
    }
    if (!igualNivel(seg.sl, m.sl) || !igualNivel(seg.tp, m.tp)) {
      accoes.push({ tipo: 'modificar', ponteId: p.id, positionId: seg.id, sl: m.sl, tp: m.tp })
    }
  }
  return { accoes, ausencias }
}
