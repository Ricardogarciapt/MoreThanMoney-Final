/**
 * A LINHA DE ÁGUA DE UMA CONTA — saldo actual contra `saldo_inicial`, em percentagem e com sinal.
 *
 * ═══ PORQUE ISTO EXISTE, E PORQUE É UM FICHEIRO SÓ ══════════════════════════════════════════
 *
 * O painel mostrava o saldo e mais nada. «10 250» não diz se a conta está a ganhar: a mestre do
 * Sensei parte de 10 000 e a conta de medição do dono parte de 1 000 — o mesmo número quer dizer
 * coisas opostas nas duas. O que se lê de relance é a distância à linha de partida.
 *
 * A conta é sempre a mesma — `(saldo − inicial) / inicial` — e por isso vive AQUI e em mais sítio
 * nenhum: o azulejo do cockpit, a tabela de `?s=contas` e o topo das estratégias na cadeia chamam
 * esta função. O agregado das contas da casa continua a ser `lib/equidade-casa.ts`
 * (`agregarEquidadeCasa.resultadoPct`), que soma muitas contas com factores de contribuição; esta
 * é a leitura de UMA conta, sem factores.
 *
 * ═══ REAL vs SIMULADO: A MENTIRA POR OMISSÃO ════════════════════════════════════════════════
 *
 * `mtm_trading_accounts.motor = 'sim'` é uma conta SIMULADA: o preço de entrada dela é o do sinal,
 * não o que a corretora deu. Já se mediu nesta casa que esse viés vale ~56% do lucro das
 * simuladas (memória «preço de entrada viciado»). Um +18% simulado ao lado de um +4% real, sem
 * dizer qual é qual, faz o simulado passar por prova.
 *
 * Por isso `proveniencia` NUNCA é opcional: quem quiser uma linha de água tem de declarar se o
 * número é real ou simulado, e quem desenha tem de o marcar. É o mesmo princípio da regra «prova
 * em pips, nunca em euros» — não se apresenta um número sem dizer de onde vem.
 *
 * Puro: sem Supabase, sem React. Guardas em `lib/admin-centro/__tests__/linha-de-agua.check.ts`.
 */

/** De onde vem o dinheiro deste saldo. Nunca se soma um com o outro. */
export type Proveniencia = 'real' | 'simulado'

export interface LinhaDeAgua {
  /** % com sinal (2 casas). null = não há `saldo_inicial` ou não há saldo: não se inventa 0%. */
  pct: number | null
  /** o mesmo em valor absoluto, na moeda da conta. null pelas mesmas razões. */
  delta: number | null
  /** true acima da linha, false abaixo, null quando não se sabe. `0%` é `false`? não: é `true`. */
  acima: boolean | null
  proveniencia: Proveniencia
}

export const AVISO_SIMULADO =
  'Contas simuladas entram ao preço do sinal, não ao que a corretora deu — esse viés já foi medido ' +
  'nesta casa como ~56% do lucro. Não se somam às reais nem se publicam.'

/** «real» sempre que a conta não é `motor='sim'` — a dúvida cai para o lado que não exagera. */
export function provenienciaDoMotor(motor: string | null | undefined): Proveniencia {
  return String(motor ?? '').toLowerCase() === 'sim' ? 'simulado' : 'real'
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * A linha de água de uma conta. Sem `inicial` (ou com `inicial <= 0`) devolve `null` em vez de 0%:
 * uma conta sem linha de partida não está «em cima da linha», está sem linha — e dizer 0% seria
 * afirmar que não ganhou nem perdeu.
 */
export function linhaDeAgua(
  saldo: number | null | undefined,
  inicial: number | null | undefined,
  proveniencia: Proveniencia,
): LinhaDeAgua {
  const s = saldo == null ? null : Number(saldo)
  const i = inicial == null ? null : Number(inicial)
  if (s == null || i == null || !Number.isFinite(s) || !Number.isFinite(i) || i <= 0) {
    return { pct: null, delta: null, acima: null, proveniencia }
  }
  const delta = r2(s - i)
  return { pct: r2((delta / i) * 100), delta, acima: delta >= 0, proveniencia }
}

/**
 * «+2,50 %», «−13,00 %», «—» — para uma percentagem solta (o agregado do cockpit, que não é de uma
 * conta). Vive aqui para não haver duas maneiras de escrever o mesmo número em dois ecrãs.
 */
export function textoPct(pct: number | null): string {
  if (pct == null) return '—'
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2).replace('.', ',')} %`
}

/** O mesmo para uma conta. Com `sufixo`, «+2,50 % (sim)» — para o ecrã não perder a origem. */
export function textoLinhaDeAgua(l: LinhaDeAgua, sufixo = false): string {
  const n = textoPct(l.pct)
  return sufixo && l.pct != null && l.proveniencia === 'simulado' ? `${n} (sim)` : n
}

// ── o resumo para o cockpit ─────────────────────────────────────────────────

export interface ResumoSaldos {
  /** contas com saldo conhecido */
  contas: number
  /** soma dos saldos — só dentro da mesma proveniência */
  saldo: number
  /** soma das linhas de partida das contas que declaram uma */
  inicial: number
  /** contas que declaram linha de partida (as outras não entram em `pct`) */
  comLinha: number
  /** a linha de água do conjunto: (saldo − inicial) / inicial, só sobre as que têm linha */
  pct: number | null
}

/**
 * Dois totais, nunca um. Somar um saldo simulado a um real dá um número que não existe em conta
 * nenhuma — e serviria de prova a quem o lesse. Por isso a chave do resumo é a proveniência e não
 * há campo «total».
 */
export function resumirSaldos(
  linhas: Array<{ saldo: number | null; saldoInicial: number | null; proveniencia: Proveniencia }>,
): Record<Proveniencia, ResumoSaldos> {
  const vazio = (): ResumoSaldos => ({ contas: 0, saldo: 0, inicial: 0, comLinha: 0, pct: null })
  const out: Record<Proveniencia, ResumoSaldos> = { real: vazio(), simulado: vazio() }
  // Só as contas COM linha de partida entram na soma da percentagem: juntar o saldo de uma conta
  // sem linha ao numerador (e nada ao denominador) inflacionava a percentagem do conjunto.
  const saldoComLinha: Record<Proveniencia, number> = { real: 0, simulado: 0 }
  for (const l of linhas) {
    if (l.saldo == null) continue
    const g = out[l.proveniencia]
    g.contas++
    g.saldo += Number(l.saldo)
    if (l.saldoInicial != null && Number(l.saldoInicial) > 0) {
      g.comLinha++
      g.inicial += Number(l.saldoInicial)
      saldoComLinha[l.proveniencia] += Number(l.saldo)
    }
  }
  for (const k of ['real', 'simulado'] as const) {
    const g = out[k]
    g.saldo = r2(g.saldo)
    g.inicial = r2(g.inicial)
    g.pct = g.inicial > 0 ? r2(((saldoComLinha[k] - g.inicial) / g.inicial) * 100) : null
  }
  return out
}
