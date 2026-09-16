/**
 * A MEDIÇÃO DA SOMBRA, com a entrada e a saída injectadas — o mesmo código corre no estudo do
 * histórico (scripts/estudos/sombra-mtm-scanner.ts, velas em cache no Mac) e no serviço diário da
 * VPS (services/sombra-estrategias, velas pedidas ao TradingView na hora). Nada aqui escreve.
 */
import type { ConfigSinais } from '../../mtmfunded/estrategias-sinais/calculo'
import type { SignalRules } from '../../mtmcopy/signal-rules'
import type { Vela } from '../../estudos/replay-velas'
import {
  candidatosTvScanner, diaUtc, mediraSinal, motivoAgrupado, sinalDaLinha, teriaExecutado,
  type Interruptores, type LinhaSinal, type TradeSombra,
} from './scanner'

export interface Dependencias {
  /** entradas do Scanner com received_at em [desde, ate[ (ISO), por ordem cronológica */
  lerSinais(desde: string, ate: string): Promise<LinhaSinal[]>
  /** velas M15 de um símbolo (tenta os candidatos por ordem), cobrindo pelo menos desde `desdeMs` */
  velas(ticker: string, candidatos: string[], desdeMs: number): Promise<{ velas: Vela[] | null; tv: string | null; erro?: string }>
}

export interface OpcoesMedicao {
  desde: string
  ate: string
  regras: SignalRules
  interruptores: Interruptores
  cfg: ConfigSinais
  slMinimo?: boolean
}

export interface ContagemDia { total: number; passaram: number; foraPorMotivo: Record<string, number>; semVelas: number }

export interface Medicao {
  ideias: number
  passaram: number
  foraDoGate: Record<string, number>
  naoMedidos: Record<string, number>
  trades: TradeSombra[]
  sinaisPorDia: Map<string, ContagemDia>
  fonteVelas: Record<string, string | null>
  primeiroSinal: number | null
  ultimoSinal: number | null
}

const soma = (o: Record<string, number>, k: string) => { o[k] = (o[k] ?? 0) + 1 }

export async function medirSombra(deps: Dependencias, op: OpcoesMedicao): Promise<Medicao> {
  const linhas = await deps.lerSinais(op.desde, op.ate)
  const out: Medicao = {
    ideias: linhas.length, passaram: 0, foraDoGate: {}, naoMedidos: {}, trades: [],
    sinaisPorDia: new Map(), fonteVelas: {}, primeiroSinal: null, ultimoSinal: null,
  }
  const velasPorTicker = new Map<string, Vela[] | null>()
  for (const l of linhas) {
    const dia = diaUtc(new Date(l.received_at).getTime())
    let c = out.sinaisPorDia.get(dia)
    if (!c) { c = { total: 0, passaram: 0, foraPorMotivo: {}, semVelas: 0 }; out.sinaisPorDia.set(dia, c) }
    c.total++
    const v = teriaExecutado(l, op.regras, op.interruptores)
    if (!v.ok) {
      const m = motivoAgrupado(v.motivo)
      soma(out.foraDoGate, m)
      soma(c.foraPorMotivo, m)
      continue
    }
    out.passaram++
    c.passaram++
    const s = sinalDaLinha(l, { slMinimo: op.slMinimo !== false })
    if ('erro' in s) { soma(out.naoMedidos, s.erro); continue }
    if (!velasPorTicker.has(s.ticker)) {
      const r = await deps.velas(s.ticker, candidatosTvScanner(s.ticker), Date.parse(op.desde))
      velasPorTicker.set(s.ticker, r.velas)
      out.fonteVelas[s.ticker] = r.tv ?? (r.erro ? `sem velas: ${r.erro}` : null)
    }
    const velas = velasPorTicker.get(s.ticker)
    if (!velas) { soma(out.naoMedidos, 'símbolo sem velas no TradingView'); c.semVelas++; continue }
    const t = mediraSinal(s, velas, op.cfg)
    if ('erro' in t) { soma(out.naoMedidos, t.erro); if (/velas/.test(t.erro)) c.semVelas++; continue }
    out.trades.push(t)
    out.primeiroSinal = out.primeiroSinal == null ? t.em : Math.min(out.primeiroSinal, t.em)
    out.ultimoSinal = out.ultimoSinal == null ? t.em : Math.max(out.ultimoSinal, t.em)
  }
  out.trades.sort((a, b) => a.em - b.em)
  return out
}
