/**
 * SOMBRA DO MOTOR EM TEMPO REAL — o que registar e como comparar com o monitor actual. Puro.
 *
 * O motor decide a cada tick com as MESMAS funções dos monitores (premium.ts, t2t.ts, mtmauto.ts),
 * mas em sombra não envia nada: guarda a INTENÇÃO («SL para 2003,5 por tranca de lucro, às
 * 10:02:03.250»). O monitor actual continua a gerir a conta e, quando age, o streaming vê a
 * posição mudar (SL novo, volume menor, posição fechada). Casar as duas dá a latência (quanto mais
 * cedo o motor teria agido) e a divergência (a que distância ficou do que o monitor fez).
 *
 * Carga na base (Supabase frágil): uma linha por DECISÃO, nunca por tick. Intenções repetidas da
 * mesma regra na mesma posição dentro de `janelaMs` fundem-se (fica a última). As linhas só saem
 * quando casam ou quando o monitor não agiu em `esperaMs`; o chamador grava-as em lote.
 */

export type TipoItem = 'premium' | 't2t' | 'mtmauto' | 'subscritor'
export type AcaoIntencao = 'sl' | 'fecho' | 'espelho' | 'encerrar'
export type EstadoLinha = 'casada' | 'sem_monitor' | 'monitor_sem_sombra' | 'posicao_fechada' | 'espelho' | 'live_ok' | 'live_falhou'

export interface Intencao {
  conta: string
  tipo: TipoItem
  /** id da linha de origem (premium_active / signal_log / executions) */
  ref: string
  posicao: string
  simbolo: string
  lado: 'buy' | 'sell'
  regra: string
  acao: AcaoIntencao
  sl?: number | null
  tp?: number | null
  /** volume a fechar; null = fecho total */
  volume?: number | null
  preco: number | null
  /** hora do tick que levou à decisão (ms) */
  tickEm: number
  detalhe?: string | null
}

export interface Observacao {
  conta: string
  posicao: string
  simbolo: string
  tipo: 'sl' | 'tp' | 'volume' | 'fechada'
  de: number | null
  para: number | null
  em: number
}

export interface LinhaSombra {
  conta: string
  tipo: TipoItem | null
  ref: string | null
  posicao: string
  simbolo: string
  lado: string | null
  regra: string
  acao: string
  sl: number | null
  tp: number | null
  volume: number | null
  preco: number | null
  tick_em: string | null
  decidido_em: string
  monitor_em: string | null
  monitor_valor: number | null
  latencia_ms: number | null
  divergencia_pips: number | null
  divergencia_volume: number | null
  estado: EstadoLinha
  modo: 'sombra' | 'live'
  detalhe: string | null
}

export interface PosicaoVista {
  id: string
  symbol: string
  volume?: number | null
  stopLoss?: number | null
  takeProfit?: number | null
}

const iso = (ms: number) => new Date(ms).toISOString()
const igual = (a: number | null | undefined, b: number | null | undefined) =>
  (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-9))

/**
 * O que mudou nas posições da conta desde a última vista. `antes = null` é a LINHA DE BASE (acabou
 * de ligar ou de ressincronizar): não gera nada — senão cada reconexão parecia uma rajada de fechos.
 */
export function diferencasPosicoes(
  conta: string,
  antes: Map<string, PosicaoVista> | null,
  agora: PosicaoVista[],
  em: number,
): { observacoes: Observacao[]; vista: Map<string, PosicaoVista> } {
  const vista = new Map(agora.map((p) => [String(p.id), { ...p, id: String(p.id) }]))
  if (!antes) return { observacoes: [], vista }
  const obs: Observacao[] = []
  for (const [id, a] of antes) {
    const b = vista.get(id)
    if (!b) {
      obs.push({ conta, posicao: id, simbolo: a.symbol, tipo: 'fechada', de: a.volume ?? null, para: 0, em })
      continue
    }
    if (!igual(a.stopLoss, b.stopLoss) && b.stopLoss != null && b.stopLoss > 0) {
      obs.push({ conta, posicao: id, simbolo: b.symbol, tipo: 'sl', de: a.stopLoss ?? null, para: b.stopLoss, em })
    }
    if (!igual(a.takeProfit, b.takeProfit) && b.takeProfit != null && b.takeProfit > 0) {
      obs.push({ conta, posicao: id, simbolo: b.symbol, tipo: 'tp', de: a.takeProfit ?? null, para: b.takeProfit, em })
    }
    if (a.volume != null && b.volume != null && b.volume < a.volume - 1e-9) {
      obs.push({ conta, posicao: id, simbolo: b.symbol, tipo: 'volume', de: a.volume, para: b.volume, em })
    }
  }
  return { observacoes: obs, vista }
}

/** Rótulo da regra a partir da nota que o monitor escreve logo a seguir à acção. */
export function regraDaNota(nota: string | null | undefined, acao: AcaoIntencao): string {
  const n = String(nota ?? '')
  const tabela: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
    [/lucro trancado/, 'tranca_lucro'],
    [/trailing pós-TP1/, 'trailing_pos_tp1'],
    [/BE protetor/, 'be_cedo'],
    [/zona larga/, 'zona_larga'],
    [/conta pequena/, 'conta_pequena_exit1'],
    [/Exit (\d) subs|subs Exit (\d)|BE\+trailing em|subs fechados/, 'espelho_subscritores'],
    [/Exit (\d) → fecha tudo/, (m) => `exit${m[1]}_total`],
    [/Exit (\d) → fecha/, (m) => `exit${m[1]}_parcial`],
    [/BE \(\+\d+(\.\d+)?p\) \+ trailing/, 'be_trailing_exit1'],
    [/trailing → stop/, 'perfil_trailing'],
    [/^early_be/, 'be_cedo'],
    [/^be_trail|^be /, 'be_exit1'],
    [/^trail /, 'trailing'],
    [/^exit(\d)/, (m) => `exit${m[1]}`],
    [/alvo final/, 'alvo_final'],
    [/alvo (\d) · fecha/, (m) => `alvo${m[1]}_parcial`],
    [/alvo (\d) sem lote/, (m) => `alvo${m[1]}_sem_lote`],
    [/stop →/, 'protecao'],
    [/educador fechou/, 'espelho_educador'],
  ]
  for (const [re, r] of tabela) {
    const m = n.match(re)
    if (m) return typeof r === 'string' ? r : r(m)
  }
  return acao === 'fecho' ? 'fecho' : acao === 'espelho' ? 'espelho_subscritores' : acao === 'encerrar' ? 'encerrar' : 'sl'
}

interface Pendente {
  i: Intencao
  primeiro: number
  obs: Observacao | null
}

export interface ConfigSombra {
  /** Intenções da mesma regra na mesma posição dentro disto fundem-se. */
  janelaMs: number
  /** Quanto se espera pelo monitor antes de sair a linha sem ele. */
  esperaMs: number
}

export const CONFIG_SOMBRA_PADRAO: ConfigSombra = { janelaMs: 5_000, esperaMs: 120_000 }

export class RegistoSombra {
  private pendentes: Pendente[] = []
  private obsSoltas: Array<{ o: Observacao; pip: number }> = []
  private saidas: LinhaSombra[] = []

  constructor(private cfg: ConfigSombra = CONFIG_SOMBRA_PADRAO, private pipDe: (simbolo: string) => number = () => 1) {}

  get emEspera(): number {
    return this.pendentes.length + this.obsSoltas.length
  }

  /** Uma intenção nova. Espelhos saem logo (não há posição do mestre que os confirme). */
  decidir(i: Intencao, agora: number): void {
    if (i.acao === 'espelho') {
      this.saidas.push(this.linha(i, agora, null, 'espelho'))
      return
    }
    const mesma = this.pendentes.find(
      (p) => !p.obs && p.i.conta === i.conta && p.i.posicao === i.posicao && p.i.regra === i.regra && p.i.acao === i.acao && agora - p.primeiro <= this.cfg.janelaMs,
    )
    if (mesma) {
      mesma.i = i
    } else {
      this.pendentes.push({ i, primeiro: agora, obs: null })
    }
    this.casarSoltas(agora)
  }

  /** Uma mudança vista na posição real. */
  observar(o: Observacao, agora: number): void {
    const c = this.candidata(o)
    if (c) {
      c.obs = o
      return
    }
    if (o.tipo === 'fechada') {
      // Sem intenção de fecho à espera: fechou na corretora (SL/TP/manual). Fica registado uma vez.
      this.saidas.push({
        conta: o.conta, tipo: null, ref: null, posicao: o.posicao, simbolo: o.simbolo, lado: null,
        regra: 'posicao_fechada', acao: 'fecho', sl: null, tp: null, volume: o.de, preco: null,
        tick_em: null, decidido_em: iso(o.em), monitor_em: iso(o.em), monitor_valor: o.de,
        latencia_ms: null, divergencia_pips: null, divergencia_volume: null, estado: 'posicao_fechada', modo: 'sombra', detalhe: null,
      })
      return
    }
    this.obsSoltas.push({ o, pip: this.pipDe(o.simbolo) })
    void agora
  }

  private compativel(p: Pendente, o: Observacao): boolean {
    if (p.obs || p.i.conta !== o.conta || p.i.posicao !== o.posicao) return false
    if (o.tipo === 'sl') return p.i.acao === 'sl' && p.i.sl != null
    if (o.tipo === 'tp') return p.i.acao === 'sl' && p.i.sl == null && p.i.tp != null
    if (o.tipo === 'volume') return p.i.acao === 'fecho' && p.i.volume != null
    return p.i.acao === 'fecho' || p.i.acao === 'encerrar'
  }

  private candidata(o: Observacao): Pendente | null {
    const cs = this.pendentes.filter((p) => this.compativel(p, o) && Math.abs(o.em - p.i.tickEm) <= this.cfg.esperaMs)
    if (!cs.length) return null
    const dist = (p: Pendente) =>
      o.tipo === 'sl' ? Math.abs((p.i.sl ?? 0) - (o.para ?? 0))
        : o.tipo === 'tp' ? Math.abs((p.i.tp ?? 0) - (o.para ?? 0))
          : o.tipo === 'volume' ? Math.abs((p.i.volume ?? 0) - ((o.de ?? 0) - (o.para ?? 0)))
            : Math.abs(o.em - p.i.tickEm)
    return cs.sort((a, b) => dist(a) - dist(b) || a.i.tickEm - b.i.tickEm)[0]!
  }

  private casarSoltas(agora: number): void {
    for (const s of [...this.obsSoltas]) {
      const c = this.candidata(s.o)
      if (c) {
        c.obs = s.o
        this.obsSoltas.splice(this.obsSoltas.indexOf(s), 1)
      }
    }
    void agora
  }

  private linha(i: Intencao, agora: number, o: Observacao | null, estado: EstadoLinha): LinhaSombra {
    const pip = this.pipDe(i.simbolo) || 1
    let divPips: number | null = null
    let divVol: number | null = null
    let valor: number | null = null
    if (o) {
      if (o.tipo === 'sl') { valor = o.para; divPips = i.sl != null && o.para != null ? Math.round((Math.abs(o.para - i.sl) / pip) * 10) / 10 : null }
      else if (o.tipo === 'tp') { valor = o.para; divPips = i.tp != null && o.para != null ? Math.round((Math.abs(o.para - i.tp) / pip) * 10) / 10 : null }
      else if (o.tipo === 'volume') { valor = (o.de ?? 0) - (o.para ?? 0); divVol = i.volume != null ? Math.round(Math.abs(valor - i.volume) * 100) / 100 : null }
      else { valor = o.de; divVol = i.volume != null && o.de != null ? Math.round(Math.abs(o.de - i.volume) * 100) / 100 : 0 }
    }
    return {
      conta: i.conta, tipo: i.tipo, ref: i.ref, posicao: i.posicao, simbolo: i.simbolo, lado: i.lado,
      regra: i.regra, acao: i.acao, sl: i.sl ?? null, tp: i.tp ?? null, volume: i.volume ?? null, preco: i.preco,
      tick_em: iso(i.tickEm), decidido_em: iso(agora), monitor_em: o ? iso(o.em) : null, monitor_valor: valor,
      latencia_ms: o ? Math.round(o.em - i.tickEm) : null, divergencia_pips: divPips, divergencia_volume: divVol,
      estado, modo: 'sombra', detalhe: i.detalhe ?? null,
    }
  }

  /** Linha de uma decisão executada em LIVE (sem comparação). */
  live(i: Intencao, agora: number, ok: boolean, erro?: string | null): void {
    this.saidas.push({ ...this.linha(i, agora, null, ok ? 'live_ok' : 'live_falhou'), modo: 'live', detalhe: erro ?? i.detalhe ?? null })
  }

  /** Esquece o que estava pendente numa conta (ressincronização): sai como está. */
  largarConta(conta: string, agora: number): void {
    for (const p of this.pendentes.filter((x) => x.i.conta === conta)) {
      this.saidas.push(this.linha(p.i, agora, p.obs, p.obs ? 'casada' : 'sem_monitor'))
    }
    this.pendentes = this.pendentes.filter((x) => x.i.conta !== conta)
    this.obsSoltas = this.obsSoltas.filter((x) => x.o.conta !== conta)
  }

  /** Linhas prontas a gravar (e saem da memória). */
  recolher(agora: number): LinhaSombra[] {
    const ficam: Pendente[] = []
    for (const p of this.pendentes) {
      if (p.obs) this.saidas.push(this.linha(p.i, p.primeiro, p.obs, 'casada'))
      else if (agora - p.i.tickEm > this.cfg.esperaMs) this.saidas.push(this.linha(p.i, p.primeiro, null, 'sem_monitor'))
      else ficam.push(p)
    }
    this.pendentes = ficam
    const soltas: typeof this.obsSoltas = []
    for (const s of this.obsSoltas) {
      if (agora - s.o.em > this.cfg.esperaMs) {
        this.saidas.push({
          conta: s.o.conta, tipo: null, ref: null, posicao: s.o.posicao, simbolo: s.o.simbolo, lado: null,
          regra: 'monitor_sem_sombra', acao: s.o.tipo === 'volume' ? 'fecho' : 'sl',
          sl: s.o.tipo === 'sl' ? s.o.para : null, tp: s.o.tipo === 'tp' ? s.o.para : null,
          volume: s.o.tipo === 'volume' ? Math.round(((s.o.de ?? 0) - (s.o.para ?? 0)) * 100) / 100 : null,
          preco: null, tick_em: null, decidido_em: iso(s.o.em), monitor_em: iso(s.o.em), monitor_valor: s.o.para,
          latencia_ms: null, divergencia_pips: null, divergencia_volume: null, estado: 'monitor_sem_sombra', modo: 'sombra', detalhe: `de ${s.o.de ?? '—'}`,
        })
      } else {
        soltas.push(s)
      }
    }
    this.obsSoltas = soltas
    const out = this.saidas
    this.saidas = []
    return out
  }
}

/** Percentil simples (para o painel). */
export function percentil(valores: number[], p: number): number | null {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))
  return v[i]!
}
