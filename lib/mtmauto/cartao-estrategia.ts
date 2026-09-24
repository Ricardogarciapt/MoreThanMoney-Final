/**
 * O CARTÃO DE UMA ESTRATÉGIA — o modelo partilhado pelos dois ecrãs que o desenham.
 *
 * Há dois sítios a mostrar a mesma lista de estratégias: o separador Estratégias da app-mobile
 * (`components/mobile/mtm-auto-estrategias.tsx`, neste repositório) e o ecrã Estratégias da MTM
 * Auto (`app/(app)/estrategias/page.tsx`, no repositório mtm-auto). Os dois lêem a MESMA rota
 * (`/api/auto/providers` da MTM Auto — aqui por reencaminhamento) e, até hoje, cada um decidia
 * por sua conta como agrupar, como chamar o estado e como escrever o risco. O resultado era a
 * mesma estratégia chamar-se «Automático» de um lado e «Cópia automática ligada» do outro, e
 * aparecer em sítios diferentes da lista.
 *
 * Este ficheiro é o modelo do cartão: agrupamento, estado, risco, alvos e iniciais. As PALAVRAS
 * não estão aqui — estão as chaves do dicionário, porque a MTM Auto traduz para seis idiomas e a
 * app-mobile não. `TEXTO_PT` é o mesmo dicionário em português, para quem não tem i18n.
 *
 * ── Cópia entre repositórios ────────────────────────────────────────────────────────────────
 * Este ficheiro (e o `desempenho-do-catalogo.ts` ao lado) existe IGUAL nos dois repositórios.
 * Não há pacote partilhado entre eles; mudar um obriga a copiar para o outro, senão volta a
 * haver duas versões da mesma regra — que é exactamente o que isto veio resolver.
 */
import { SEM_HISTORICO, resumoDoCartao, temHistorico, type ProvedorMtmAuto } from './desempenho-do-catalogo'

export { SEM_HISTORICO, resumoDoCartao, temHistorico }
export type { ProvedorMtmAuto }

// ── estado: seguir e copiar automaticamente são coisas diferentes ────────────────────────────

/**
 * `automatico` abre sozinho na conta; `manual` mostra os sinais para a pessoa aceitar um a um;
 * `parado` não mostra nada. Juntar os dois primeiros num só interruptor punha alguém a executar
 * por engano só por querer espreitar uma estratégia.
 */
export type EstadoSeguir = 'automatico' | 'manual' | 'parado'

export interface Seguimento {
  segue?: boolean | null
  autoAceitar?: boolean | null
}

export function estadoDeSeguir(s: Seguimento): EstadoSeguir {
  if (s.autoAceitar === true) return 'automatico'
  return s.segue === true ? 'manual' : 'parado'
}

export const CHAVE_ESTADO: Record<EstadoSeguir, string> = {
  automatico: 'estrategias.autoLigada',
  manual: 'estrategias.manual',
  parado: 'estrategias.naoSegue',
}

// ── agrupamento da lista ─────────────────────────────────────────────────────────────────────

/**
 * Três grupos, pela ordem em que interessam: o que abre sozinho, o que se segue à mão, e o resto.
 * Antes eram dois de um lado (auto / resto) e nenhum do outro (só ordenação) — a mesma estratégia
 * aparecia em sítios diferentes conforme o ecrã.
 */
export type GrupoEstrategia = 'automaticas' | 'aSeguir' | 'disponiveis'

export const GRUPOS: GrupoEstrategia[] = ['automaticas', 'aSeguir', 'disponiveis']

export const CHAVE_GRUPO: Record<GrupoEstrategia, string> = {
  automaticas: 'estrategias.autoAtivo',
  aSeguir: 'estrategias.aSeguir',
  disponiveis: 'estrategias.disponiveis',
}

export const grupoDoEstado = (e: EstadoSeguir): GrupoEstrategia =>
  e === 'automatico' ? 'automaticas' : e === 'manual' ? 'aSeguir' : 'disponiveis'

/** A lista repartida pelos três grupos, cada um pela ordem em que veio da rota. */
export function agruparEstrategias<T extends Seguimento>(xs: readonly T[]): Record<GrupoEstrategia, T[]> {
  const r: Record<GrupoEstrategia, T[]> = { automaticas: [], aSeguir: [], disponiveis: [] }
  for (const x of xs) r[grupoDoEstado(estadoDeSeguir(x))].push(x)
  return r
}

// ── risco por estratégia ─────────────────────────────────────────────────────────────────────

/** A configuração de risco da subscrição, tal como `/api/auto/providers` a devolve. */
export interface ConfigRisco {
  modoRisco?: string | null
  riscoPct?: number | null
}

export type ModoRisco = 'conta' | 'percent' | 'lote' | 'multiplicador'

export const MODOS_RISCO: ModoRisco[] = ['conta', 'percent', 'lote']

export const CHAVE_MODO_RISCO: Record<ModoRisco, string> = {
  conta: 'risco.conta',
  percent: 'risco.percent',
  lote: 'risco.lote',
  multiplicador: 'risco.multiplicador',
}

/** Percentagem por sinal aceite pela MTM Auto. Fora disto, a rota recusa. */
export const RISCO_PCT_MIN = 0.1
export const RISCO_PCT_MAX = 5

export function riscoPctValido(v: unknown): boolean {
  const n = Number(v)
  return Number.isFinite(n) && n >= RISCO_PCT_MIN && n <= RISCO_PCT_MAX
}

export function modoDeRisco(c: ConfigRisco | null | undefined): ModoRisco {
  const m = String(c?.modoRisco ?? 'conta')
  return m === 'percent' || m === 'lote' || m === 'multiplicador' ? m : 'conta'
}

/**
 * A etiqueta do risco — «Risco 1% por sinal» ou o nome do modo. Devolve a chave e o número, para
 * o ecrã escrever na língua dele sem voltar a decidir o que é que conta como percentagem.
 */
export function etiquetaRisco(c: ConfigRisco | null | undefined): { chave: string; pct: number | null } {
  const modo = modoDeRisco(c)
  const pct = modo === 'percent' && c?.riscoPct != null && Number.isFinite(Number(c.riscoPct)) ? Number(c.riscoPct) : null
  return { chave: modo === 'percent' && pct == null ? CHAVE_MODO_RISCO.conta : CHAVE_MODO_RISCO[modo], pct }
}

// ── alvos batidos ────────────────────────────────────────────────────────────────────────────

export interface AlvoCartao {
  /** TP1 · TP2 · TP3 · SL */
  rotulo: string
  n: number
  perda: boolean
}

/**
 * As contagens por alvo do catálogo. É o que distingue uma estratégia que chega ao TP3 de uma que
 * vive do TP1 — e não se lê em lado nenhum a partir da taxa de acerto sozinha. Sem histórico
 * medido, não há alvos: contagens por cima de «sem histórico» eram um número inventado.
 */
export function alvosDoCartao(p: ProvedorMtmAuto | null | undefined): AlvoCartao[] {
  if (!temHistorico(p)) return []
  const l = p as unknown as Record<string, unknown>
  const n = (k: string) => (Number.isFinite(Number(l[k])) ? Number(l[k]) : 0)
  const alvos: AlvoCartao[] = [
    { rotulo: 'TP1', n: n('tp1'), perda: false },
    { rotulo: 'TP2', n: n('tp2'), perda: false },
    { rotulo: 'TP3', n: n('tp3'), perda: false },
    { rotulo: 'SL', n: n('sl'), perda: true },
  ]
  return alvos.filter((a) => a.n > 0)
}

// ── contas MTM Funded que seguem a estratégia ────────────────────────────────────────────────

export interface ContaFundedCartao { id: string; rotulo: string | null }

/**
 * As contas MTM Funded atribuídas a esta estratégia. É o fio que leva do cartão às contas que a
 * seguem — a mesma ligação que o admin tem, mas do lado de quem a segue.
 */
export function contasFundedDoCartao(p: ProvedorMtmAuto | null | undefined): ContaFundedCartao[] {
  const l = (p as unknown as Record<string, unknown> | null | undefined)?.contasMtmFunded
  if (!Array.isArray(l)) return []
  return l
    .map((c) => {
      const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
      return { id: String(o.id ?? ''), rotulo: o.rotulo == null ? null : String(o.rotulo) }
    })
    .filter((c) => c.id !== '')
}

// ── identidade ───────────────────────────────────────────────────────────────────────────────

/** Iniciais para o avatar, quando não há logótipo da estratégia. */
export function iniciais(nome: string | null | undefined): string {
  const p = String(nome ?? '').replace(/[^A-Za-zÀ-ú0-9 ]/g, '').split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? p[0]?.[1] ?? '')).toUpperCase()
}

// ── as palavras, em português ────────────────────────────────────────────────────────────────

/**
 * O mesmo dicionário da MTM Auto (`lib/i18n/dicionario.ts`, coluna `pt`), para os ecrãs que não
 * têm i18n. Ter aqui o texto garante que os dois ecrãs dizem a MESMA coisa; a MTM Auto continua a
 * traduzi-lo para as outras línguas.
 */
export const TEXTO_PT: Record<string, string> = {
  'estrategias.autoAtivo': 'Cópia automática ativa',
  'estrategias.aSeguir': 'A seguir',
  'estrategias.disponiveis': 'Disponíveis',
  'estrategias.autoLigada': 'Cópia automática ligada',
  'estrategias.manual': 'A seguir · manual',
  'estrategias.naoSegue': 'Não segues',
  'estrategias.semHistorico': SEM_HISTORICO,
  'risco.conta': 'Risco da conta',
  'risco.percent': 'Risco %',
  'risco.lote': 'Lote fixo',
  'risco.multiplicador': 'Múltiplo da mestre',
}

/** O texto em português de uma chave; a própria chave se ainda não estiver traduzida. */
export const pt = (chave: string): string => TEXTO_PT[chave] ?? chave
