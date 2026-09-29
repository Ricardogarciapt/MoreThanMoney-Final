/**
 * AS TRAVAS DA CONTA QUE RECEBE — por TIPO DE CONTA, não por estratégia.
 *
 * ═══ PORQUE ISTO NÃO É lib/copia-contas/mestre-travas.ts ════════════════════════════════════
 *
 * `mestre-travas.ts` trava o EMISSOR: a mestre não emite fora de horas, em cima de uma notícia ou
 * já a perder o dia, e a cadeia inteira pára na origem. É uma trava da ESTRATÉGIA.
 *
 * Esta é a trava de quem RECEBE, e o limite depende do tipo de dinheiro que está na conta:
 *
 *  · CONTA FINANCIADA (prop firm, nossa ou de terceiros) — perda diária 3 %, perda global 6 %.
 *    Não é prudência nossa: é a regra de quem põe o dinheiro. Passar a linha não custa uma perda,
 *    custa a conta toda. Por isso a financiada tem drawdown global E margem livre mínima.
 *
 *  · CONTA REAL (dinheiro do cliente) — perda diária 30 % e o SL nunca acima de 95 % da banca.
 *    NÃO tem drawdown global nem margem livre mínima: essas duas são regra de prop firm, e aplicá-las
 *    a dinheiro próprio era inventar um dono que não existe (decisão do dono, 2026-09-29).
 *
 *  · DESAFIO e TORNEIO — nada aqui. Quem os governa é o programa (`mtm_funded_programs.regras` →
 *    `lib/mtmfunded/regras.ts:avaliarConta`), que já mede perda diária, perda máxima e consistência.
 *    Duas travas sobre o mesmo número davam dois limites diferentes para a mesma conta.
 *
 *  · PROVIDER — é uma mestre: as travas dela são as de `mestre-travas.ts`.
 *
 * ═══ A REGRA QUE MANDA: BLOQUEIA ENTRADAS, NUNCA SAÍDAS ═════════════════════════════════════
 *
 * Tudo o que está aqui devolve «podes ABRIR?». Nenhuma destas funções é chamada nos caminhos de
 * fecho, parcial, BE, trailing ou cancelamento — e é de propósito. Uma conta travada que deixasse
 * de receber o fecho do que já tem aberto ficava exposta sem gestão: pior do que o prejuízo que se
 * queria travar. É o mesmo princípio de `lib/mestres/decisao.ts` e de
 * `lib/mtmfunded/simulado/pausa.ts`, e está provado em `lib/__tests__/travas-por-tipo-de-conta.check.ts`.
 *
 * ═══ CONFIGURÁVEL, NÃO CONSTANTE SOLTA ══════════════════════════════════════════════════════
 *
 * Os limiares vivem em `site_settings.travas_por_tipo_de_conta` (migração 156) e lêem-se com
 * `lerLimitesPorTipo`. Os valores deste ficheiro são o que vale enquanto a chave não existir — e
 * são os que o dono ditou. Uma configuração corrompida cai nestes valores em vez de desligar a
 * trava: ao contrário das travas da mestre (onde o lado seguro é não travar uma estratégia inteira),
 * aqui o lado seguro é continuar a travar a conta.
 *
 * Puro: sem Supabase, sem React. Quem o lê está listado em `lib/copia-contas/mestre-controlos.ts`.
 */
import { linhaDeAgua, provenienciaDoMotor, type LinhaDeAgua } from './admin-centro/linha-de-agua'

export type TipoDeConta = 'financiada' | 'real' | 'desafio' | 'torneio' | 'provider' | 'desconhecido'

export interface LimitesDoTipo {
  /** perda máxima do dia, em % da referência do dia (equity com que o dia abriu). null = sem regra. */
  perdaDiariaPct: number | null
  /** perda máxima acumulada, em % do saldo inicial. null = sem regra (é regra de prop firm). */
  perdaGlobalPct: number | null
  /** o risco de UMA entrada nunca passa esta % da banca. null = sem regra. */
  slMaxPctDaBanca: number | null
  /** margem livre mínima, em % da equity, para se poder abrir. null = sem regra (prop firm). */
  margemLivreMinPct: number | null
}

const SEM_LIMITES: LimitesDoTipo = {
  perdaDiariaPct: null, perdaGlobalPct: null, slMaxPctDaBanca: null, margemLivreMinPct: null,
}

/**
 * Os limiares por omissão, ditados pelo dono a 2026-09-29.
 *
 * `margemLivreMinPct` fica NULL até alguém dar um número: a margem mínima é regra de prop firm, mas
 * a percentagem não me foi dada, e inventar uma era recusar entradas por uma regra imaginada (o
 * mesmo raciocínio da consistência da FXIFY em lib/mtmcopy/prop-firm-guard.ts).
 */
export const LIMITES_POR_TIPO: Record<TipoDeConta, LimitesDoTipo> = {
  financiada: { perdaDiariaPct: 3, perdaGlobalPct: 6, slMaxPctDaBanca: null, margemLivreMinPct: null },
  real: { perdaDiariaPct: 30, perdaGlobalPct: null, slMaxPctDaBanca: 95, margemLivreMinPct: null },
  // Governadas pelo programa (mtm_funded_programs.regras → avaliarConta). Ver o cabeçalho.
  desafio: SEM_LIMITES,
  torneio: SEM_LIMITES,
  // É uma mestre: as travas dela são as de lib/copia-contas/mestre-travas.ts.
  provider: SEM_LIMITES,
  // Um tipo que não se reconhece não recebe limites inventados — aparece «sem trava» no ecrã.
  desconhecido: SEM_LIMITES,
}

export const TIPOS: TipoDeConta[] = ['financiada', 'real', 'desafio', 'torneio', 'provider', 'desconhecido']

/** Uma conta financiada (prop firm) é a única que tem drawdown global e margem mínima. */
export function ehPropFirm(t: TipoDeConta): boolean {
  return t === 'financiada'
}

/**
 * O `tipo` da linha → um tipo conhecido. `conta_real_casa` e `conta_casa` não entram aqui: são
 * contas da casa, e quem decide se têm regras é `lib/mtmfunded/conta-real-casa.ts`.
 */
export function tipoDeConta(v: unknown): TipoDeConta {
  const s = String(v ?? '').toLowerCase().trim()
  return (TIPOS as string[]).includes(s) && s !== 'desconhecido' ? (s as TipoDeConta) : 'desconhecido'
}

// ── configuração ────────────────────────────────────────────────────────────

const pct = (v: unknown, omissao: number | null): number | null => {
  if (v === null) return null
  const n = Number(v)
  // 0 não é «sem regra», é «trava sempre» — e ninguém quer isso por acidente. Fora de ]0,100]
  // cai no valor por omissão, que é o que o dono ditou.
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : omissao
}

/**
 * `site_settings.travas_por_tipo_de_conta` → os limiares. O que faltar fica com o valor por
 * omissão deste ficheiro; `null` explícito desliga essa regra nesse tipo.
 *
 * O valor pode vir como STRING JSON (já aconteceu nesta casa — ver a memória «t2t fontes config
 * guardada»), por isso trata-se os dois casos.
 */
export function lerLimitesPorTipo(valor: unknown): Record<TipoDeConta, LimitesDoTipo> {
  let o: unknown = valor
  if (typeof valor === 'string') {
    try { o = JSON.parse(valor) } catch { o = null }
  }
  const raiz = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>
  const out = {} as Record<TipoDeConta, LimitesDoTipo>
  for (const t of TIPOS) {
    const base = LIMITES_POR_TIPO[t]
    const x = (raiz[t] && typeof raiz[t] === 'object' ? raiz[t] : {}) as Record<string, unknown>
    out[t] = {
      perdaDiariaPct: 'perdaDiariaPct' in x ? pct(x.perdaDiariaPct, base.perdaDiariaPct) : base.perdaDiariaPct,
      perdaGlobalPct: 'perdaGlobalPct' in x ? pct(x.perdaGlobalPct, base.perdaGlobalPct) : base.perdaGlobalPct,
      slMaxPctDaBanca: 'slMaxPctDaBanca' in x ? pct(x.slMaxPctDaBanca, base.slMaxPctDaBanca) : base.slMaxPctDaBanca,
      margemLivreMinPct: 'margemLivreMinPct' in x ? pct(x.margemLivreMinPct, base.margemLivreMinPct) : base.margemLivreMinPct,
    }
  }
  return out
}

// ── a medida de cada trava ──────────────────────────────────────────────────

export interface Medida {
  /** o limite configurado, em % */
  limitePct: number
  /** a base contra que se mede (referência do dia ou saldo inicial), na moeda da conta */
  base: number
  /** quanto já se perdeu contra essa base (nunca negativo: em lucro é 0) */
  usado: number
  /** quanto é que o limite permite perder */
  permitido: number
  /** o que sobra até à linha (0 quando já se passou) */
  restante: number
  /** a percentagem já usada da própria base (2,9 % de 3 %) */
  usadoPct: number
  excedido: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100

function medir(limitePct: number | null, base: number, equity: number): Medida | null {
  // Sem base ou sem equity NÃO se mede — e uma medida que não existe não trava. Uma trava que
  // dispara por falta de dados pára a conta e parece prudência (ver mestre-travas.ts).
  if (limitePct == null || !(base > 0) || !Number.isFinite(equity)) return null
  const permitido = (base * limitePct) / 100
  const usado = Math.max(0, base - equity)
  return {
    limitePct, base: r2(base), usado: r2(usado), permitido: r2(permitido),
    restante: r2(Math.max(0, permitido - usado)),
    usadoPct: r2((usado / base) * 100),
    // `>=` e não `>`: a 3,00 % exactos já se atingiu o limite — é como `avaliarConta` mede, e ter
    // duas noções de «atingido» na mesma casa dava um ecrã a dizer verde e um motor a recusar.
    excedido: usado >= permitido,
  }
}

export interface EstadoDaBanca {
  /** saldo fechado */
  saldo: number | null
  /** saldo + flutuante. É o que manda: medir a saldo deixa passar quem está a −40 % em aberto. */
  equity: number | null
  /** a linha de partida da conta (`mtm_trading_accounts.saldo_inicial`) */
  saldoInicial: number | null
  /** a equity com que o dia abriu (`sim_ancora_dia`). Sem ela, a diária mede-se ao saldo inicial. */
  ancoraDia: number | null
  /**
   * A base da perda GLOBAL (`mtm_trading_accounts.travas_base_global`, migração 156). Sem ela é o
   * `saldoInicial`.
   *
   * Existe por uma razão só: uma reposição tem de poder mover esta base SEM tocar no `saldo_inicial`.
   * O `saldo_inicial` é a linha de partida da conta e é ele que `lib/admin-centro/linha-de-agua.ts`
   * usa em todos os ecrãs e na prova publicada — mexer nele para repor um contador falsificava o
   * resultado da conta em todos os sítios onde ele aparece.
   */
  baseGlobal?: number | null
  /** margem livre, quando se sabe */
  margemLivre?: number | null
  /** `motor` da conta — só para declarar a proveniência da linha de água, nunca para travar */
  motor?: string | null
}

export interface VeredictoTipo {
  tipo: TipoDeConta
  /** false = não se abrem entradas novas. As saídas NUNCA passam por aqui. */
  podeAbrir: boolean
  /** todos os motivos, não só o primeiro: o dono quer saber se falha um ou três */
  motivos: string[]
  motivo: string | null
  diaria: Medida | null
  global: Medida | null
  /** a linha de água da conta, com a proveniência declarada (lib/admin-centro/linha-de-agua.ts) */
  linha: LinhaDeAgua
  limites: LimitesDoTipo
  /** este tipo tem alguma trava configurada? false = o ecrã tem de dizer «sem trava deste tipo» */
  temTrava: boolean
}

/**
 * A trava do tipo de conta. Só responde «podes ABRIR?».
 *
 * A diária mede-se contra a REFERÊNCIA DO DIA e a global contra o SALDO INICIAL — as duas bases são
 * diferentes de propósito: medir a diária ao saldo inicial fazia uma conta em lucro nunca travar no
 * dia, e uma conta em prejuízo travar de manhã sem ter perdido nada hoje.
 */
export function travaDoTipo(limites: LimitesDoTipo, e: EstadoDaBanca): VeredictoTipo {
  const equity = e.equity ?? e.saldo
  const eq = equity == null ? NaN : Number(equity)
  const inicial = e.saldoInicial == null ? 0 : Number(e.saldoInicial)
  const baseDia = e.ancoraDia != null && Number(e.ancoraDia) > 0 ? Number(e.ancoraDia) : inicial
  const baseGlobal = e.baseGlobal != null && Number(e.baseGlobal) > 0 ? Number(e.baseGlobal) : inicial

  const diaria = medir(limites.perdaDiariaPct, baseDia, eq)
  const global = medir(limites.perdaGlobalPct, baseGlobal, eq)

  const motivos: string[] = []
  if (diaria?.excedido) {
    motivos.push(
      `perda do dia em ${diaria.usadoPct.toFixed(2)} % (limite ${diaria.limitePct} %): não se abrem entradas novas hoje — ` +
      'as saídas e a gestão do que já está aberto continuam',
    )
  }
  if (global?.excedido) {
    motivos.push(
      `perda acumulada em ${global.usadoPct.toFixed(2)} % da base da conta (limite ${global.limitePct} %): ` +
      'a conta não abre mais nada — as saídas continuam',
    )
  }
  if (limites.margemLivreMinPct != null && e.margemLivre != null && Number.isFinite(eq) && eq > 0) {
    const p = (Number(e.margemLivre) / eq) * 100
    if (p < limites.margemLivreMinPct) {
      motivos.push(`margem livre em ${p.toFixed(1)} % da equity (mínimo ${limites.margemLivreMinPct} %): não se abre mais nada`)
    }
  }

  return {
    tipo: 'desconhecido', // preenchido por `travaDaConta`; aqui não se sabe o tipo
    podeAbrir: motivos.length === 0,
    motivos,
    motivo: motivos.length ? motivos.join(' · ') : null,
    diaria,
    global,
    linha: linhaDeAgua(equity, e.saldoInicial, provenienciaDoMotor(e.motor)),
    limites,
    temTrava: limites.perdaDiariaPct != null || limites.perdaGlobalPct != null
      || limites.slMaxPctDaBanca != null || limites.margemLivreMinPct != null,
  }
}

/** O mesmo, a partir do `tipo` da conta e da tabela de limiares. É esta que os motores chamam. */
export function travaDaConta(
  tipo: unknown,
  porTipo: Record<TipoDeConta, LimitesDoTipo>,
  e: EstadoDaBanca,
): VeredictoTipo {
  const t = tipoDeConta(tipo)
  return { ...travaDoTipo(porTipo[t], e), tipo: t }
}

/**
 * O SL de UMA entrada contra a banca. `95 %` significa: uma só entrada nunca pode arriscar mais do
 * que 95 % da banca — o que resta é o que permite fechar a posição seguinte sem a corretora liquidar
 * tudo ao pior preço do dia.
 *
 * Sem SL não se mede (devolve null, não trava): uma posição sem stop é um problema de outra trava
 * (max_risco_total_pct, que conta o desconhecido pelo pior caso), não desta.
 */
export function slAcimaDaBanca(
  slMaxPctDaBanca: number | null,
  x: { riscoUsd: number | null; banca: number | null },
): string | null {
  if (slMaxPctDaBanca == null) return null
  const { riscoUsd, banca } = x
  if (riscoUsd == null || banca == null || !(banca > 0) || !Number.isFinite(riscoUsd) || riscoUsd <= 0) return null
  const pctDaBanca = (riscoUsd / banca) * 100
  if (pctDaBanca <= slMaxPctDaBanca) return null
  return `o stop desta entrada arrisca ${pctDaBanca.toFixed(1)} % da banca (máximo ${slMaxPctDaBanca} %) — aproxima o SL ou reduz o volume`
}

// ── o que o ecrã mostra ─────────────────────────────────────────────────────

export const ROTULO_TIPO: Record<TipoDeConta, string> = {
  financiada: 'conta financiada',
  real: 'conta real',
  desafio: 'desafio',
  torneio: 'torneio',
  provider: 'conta de estratégia',
  desconhecido: 'conta',
}

/**
 * «Faltam 210,00 USD para os 3 %» — a frase que o modal mostra. Sem medida, «—»: não se inventa
 * uma folga que não se sabe calcular.
 */
export function textoDaFolga(m: Medida | null, moeda = 'USD'): string {
  if (!m) return '—'
  if (m.excedido) return `limite de ${m.limitePct} % atingido (${m.usado.toFixed(2)} ${moeda} de ${m.permitido.toFixed(2)})`
  return `${m.restante.toFixed(2)} ${moeda} até ao limite de ${m.limitePct} % (${m.usado.toFixed(2)} usados de ${m.permitido.toFixed(2)})`
}
