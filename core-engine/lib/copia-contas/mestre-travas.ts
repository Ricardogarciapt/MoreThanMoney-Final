/**
 * AS TRAVAS DA CONTA MESTRE — o que impede a mestre de EMITIR, na raiz da cadeia.
 *
 * ═══ PORQUE ISTO EXISTE NA MESTRE E NÃO EM CADA SEGUIDOR ════════════════════════════════════
 *
 * Uma ordem que sai da mestre chega a todas as contas que a seguem. Se a trava estiver em cada
 * seguidor, ela tem de estar certa N vezes e tem de correr N vezes; basta um seguidor com a
 * configuração velha para o prejuízo entrar por aí. Na mestre está UMA vez, e uma mestre travada
 * não emite — o que desliga a cadeia inteira sem escrever nada em conta nenhuma.
 *
 * É por isso que o «desligar temporariamente os seguidores» do drawdown NÃO escreve em
 * `mestres_contas.bloqueada_em`: cortar na origem já estanca. Escrever em N contas para depois ter
 * de as desbloquear é a operação que mais provavelmente fica a meio — e uma conta que ficasse
 * bloqueada por esquecimento deixava de receber as SAÍDAS das posições que já tinha abertas, que é
 * pior do que o prejuízo que se queria travar (ver lib/mestres/decisao.ts: as pausas nunca param
 * as saídas, exactamente por isto).
 *
 * ═══ O QUE ISTO É ═══════════════════════════════════════════════════════════════════════════
 *
 * Puro: recebe números e uma data, devolve o motivo de não abrir (ou null). Sem Supabase, sem Next.
 * Testado em `lib/copia-contas/__tests__/mestre-travas.check.ts`, e é isso que importa — uma trava
 * de segurança não pode depender de um ecrã estar aberto nem de alguém olhar para ele.
 *
 * Quem as aplica: `lib/mestres/servidor/sinal-mestre.ts`, no ÚNICO sítio por onde um sinal entra na
 * conta mestre simulada. As saídas (BE, trailing, parciais, fecho) não passam por aqui de propósito:
 * uma trava que fechasse a gestão de uma posição já aberta transformava uma regra de prudência num
 * abandono.
 *
 * ═══ FUSO: TUDO EM UTC ═════════════════════════════════════════════════════════════════════
 *
 * As janelas e o fecho de fim de semana são declarados e avaliados em UTC, como o CSV de notícias
 * das EA MT5 e como o relógio do Centro. Um «20:00» que dependesse do fuso de quem configurou era
 * uma hora diferente em Março e em Novembro — e a hora de fechar à sexta não pode andar sozinha.
 */

// ── a configuração, como vive em mtmauto_providers.sinais_config.travas ─────

/** `HH:MM` em UTC. */
export type HoraUtc = string

export interface JanelaHoraria {
  /** minuto do dia em que abre (inclusive) */
  de: HoraUtc
  /** minuto do dia em que fecha (exclusive). `ate` < `de` = janela que passa a meia-noite. */
  ate: HoraUtc
  /** dias da semana permitidos, 0 = domingo. Vazio = todos. */
  dias: number[]
}

export interface BloqueioNoticias {
  minutosAntes: number
  minutosDepois: number
  /** só eventos com este impacto (ou acima) travam */
  impacto: 'alto' | 'medio'
  /** símbolos/moedas a que se aplica. Vazio = a todos. */
  moedas: string[]
}

export interface FechoFimDeSemana {
  /** dia da semana do fecho, 0 = domingo. 5 = sexta. */
  dia: number
  /** a partir desta hora UTC não se abre mais nada até segunda. */
  hora: HoraUtc
}

export interface TravasMestre {
  janela: JanelaHoraria | null
  noticias: BloqueioNoticias | null
  fimDeSemana: FechoFimDeSemana | null
  /** perda máxima do dia, em % da equity do início do dia. Atingida, não se abre mais nada hoje. */
  maxDdDiarioPct: number | null
  /** margem livre mínima, em % da equity, para se poder abrir. */
  margemLivreMinPct: number | null
}

export const SEM_TRAVAS: TravasMestre = {
  janela: null, noticias: null, fimDeSemana: null, maxDdDiarioPct: null, margemLivreMinPct: null,
}

// ── leitura ─────────────────────────────────────────────────────────────────

const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/

/** `HH:MM` → minutos desde a meia-noite, ou null se não for uma hora. */
export function minutosDaHora(h: unknown): number | null {
  const m = RE_HORA.exec(String(h ?? ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

const pos = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

const naoNeg = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const dias = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : []

const moedas = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).toUpperCase().trim()).filter(Boolean))].slice(0, 20) : []

/**
 * O jsonb → as travas, sem nada por adivinhar. Uma trava mal escrita fica NULL (desligada) em vez de
 * assumir um valor: uma janela horária inventada travava a estratégia inteira sem ninguém a pedir,
 * e o lado seguro de uma configuração corrompida é não travar nada — o dono vê que está vazia.
 */
export function lerTravas(sinaisConfig: unknown): TravasMestre {
  const raiz = sinaisConfig && typeof sinaisConfig === 'object' ? (sinaisConfig as Record<string, unknown>) : {}
  const t = raiz.travas && typeof raiz.travas === 'object' ? (raiz.travas as Record<string, unknown>) : {}

  const j = t.janela && typeof t.janela === 'object' ? (t.janela as Record<string, unknown>) : null
  const deM = j ? minutosDaHora(j.de) : null
  const ateM = j ? minutosDaHora(j.ate) : null
  // Uma janela só existe com AS DUAS pontas e com pontas diferentes. `de === ate` seria um intervalo
  // de zero minutos, ou seja «nunca abrir» escrito por acidente.
  const janela: JanelaHoraria | null =
    j && deM != null && ateM != null && deM !== ateM
      ? { de: String(j.de), ate: String(j.ate), dias: dias(j.dias) }
      : null

  const n = t.noticias && typeof t.noticias === 'object' ? (t.noticias as Record<string, unknown>) : null
  const antes = n ? naoNeg(n.minutosAntes) : null
  const depois = n ? naoNeg(n.minutosDepois) : null
  const noticias: BloqueioNoticias | null =
    n && (antes ?? 0) + (depois ?? 0) > 0
      ? { minutosAntes: antes ?? 0, minutosDepois: depois ?? 0, impacto: n.impacto === 'medio' ? 'medio' : 'alto', moedas: moedas(n.moedas) }
      : null

  const f = t.fimDeSemana && typeof t.fimDeSemana === 'object' ? (t.fimDeSemana as Record<string, unknown>) : null
  const horaF = f ? minutosDaHora(f.hora) : null
  const diaF = f && Number.isInteger(Number(f.dia)) && Number(f.dia) >= 0 && Number(f.dia) <= 6 ? Number(f.dia) : null
  const fimDeSemana: FechoFimDeSemana | null = horaF != null && diaF != null ? { dia: diaF, hora: String(f!.hora) } : null

  return {
    janela,
    noticias,
    fimDeSemana,
    maxDdDiarioPct: pos(t.maxDdDiarioPct),
    margemLivreMinPct: pos(t.margemLivreMinPct),
  }
}

/** As travas → o jsonb a gravar (só o que está ligado; desligado não deixa lixo). */
export function escreverTravas(t: TravasMestre): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  if (t.janela) o.janela = { de: t.janela.de, ate: t.janela.ate, dias: t.janela.dias }
  if (t.noticias) o.noticias = { ...t.noticias }
  if (t.fimDeSemana) o.fimDeSemana = { ...t.fimDeSemana }
  if (t.maxDdDiarioPct != null) o.maxDdDiarioPct = t.maxDdDiarioPct
  if (t.margemLivreMinPct != null) o.margemLivreMinPct = t.margemLivreMinPct
  return o
}

// ── cada trava, à parte ─────────────────────────────────────────────────────

/** Minuto do dia e dia da semana, em UTC. */
function utc(agora: Date): { minuto: number; dia: number } {
  return { minuto: agora.getUTCHours() * 60 + agora.getUTCMinutes(), dia: agora.getUTCDay() }
}

const hhmm = (minuto: number) => `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`

/**
 * Fora da janela em que a mestre pode emitir?
 *
 * A janela que PASSA A MEIA-NOITE (`22:00`→`06:00`) é a normal no ouro e nos índices asiáticos, por
 * isso não é um caso de erro: quando `ate < de`, o que está DENTRO é o complemento.
 */
export function foraDaJanela(j: JanelaHoraria | null, agora: Date): string | null {
  if (!j) return null
  const de = minutosDaHora(j.de)
  const ate = minutosDaHora(j.ate)
  if (de == null || ate == null) return null
  const { minuto, dia } = utc(agora)
  if (j.dias.length && !j.dias.includes(dia)) {
    return `fora dos dias em que a mestre emite (hoje é dia ${dia}; permitidos: ${j.dias.join(', ')})`
  }
  const dentro = de < ate ? minuto >= de && minuto < ate : minuto >= de || minuto < ate
  return dentro ? null : `fora da janela horária da mestre (${j.de}–${j.ate} UTC; agora são ${hhmm(minuto)} UTC)`
}

/** Um evento económico, como o CSV das EA MT5 o descreve (instantes em UTC). */
export interface EventoEconomico {
  /** ISO, em UTC */
  em: string
  titulo: string
  impacto: 'alto' | 'medio' | 'baixo'
  /** moeda do evento (USD, EUR…) */
  moeda: string
}

/**
 * Estamos na sombra de uma notícia de alto impacto?
 *
 * O `impacto: 'medio'` da configuração significa «médio OU acima» — quem baixa a fasquia quer mais
 * eventos a travar, não só os médios. A lista de eventos vem de fora (esta função é pura): quem a
 * chama é responsável por a ter em UTC, que é como o CSV das EA a declara no cabeçalho.
 *
 * O símbolo entra porque uma decisão do BCE não tem de travar o ouro se o dono só quis travar EUR —
 * mas com `moedas` vazio trava tudo, que é o lado seguro por omissão.
 */
export function emSombraDeNoticia(
  cfg: BloqueioNoticias | null,
  eventos: EventoEconomico[],
  symbol: string,
  agora: Date,
): string | null {
  if (!cfg) return null
  const nivel = { alto: 3, medio: 2, baixo: 1 }
  const minimo = nivel[cfg.impacto]
  const s = String(symbol ?? '').toUpperCase()
  const t = agora.getTime()
  for (const e of eventos) {
    if (nivel[e.impacto] < minimo) continue
    const em = Date.parse(e.em)
    if (!Number.isFinite(em)) continue
    // A moeda do evento tem de aparecer no símbolo (EURUSD ↔ EUR e USD). Com filtro de moedas
    // declarado, ainda tem de estar nele — senão a trava aplica-se a tudo.
    if (cfg.moedas.length && !cfg.moedas.includes(e.moeda.toUpperCase())) continue
    if (cfg.moedas.length && !s.includes(e.moeda.toUpperCase())) continue
    if (t >= em - cfg.minutosAntes * 60_000 && t <= em + cfg.minutosDepois * 60_000) {
      return `bloqueio de notícias: «${e.titulo}» (${e.moeda}, impacto ${e.impacto}) às ${e.em} — janela de −${cfg.minutosAntes}/+${cfg.minutosDepois} min`
    }
  }
  return null
}

/**
 * Fecho de fim de semana: a partir da hora de sexta não se abre mais nada até o mercado reabrir.
 *
 * O que se evita é o GAP de domingo. Uma posição aberta à sexta às 21:00 fica exposta ao salto da
 * abertura sem SL possível — o preço reaparece já do outro lado do stop. Não é um risco que se
 * meça em pips, por isso não se gere: não se entra.
 *
 * Sábado e domingo contam como «depois do fecho», mesmo que o mercado esteja fechado e nada chegue:
 * um relay atrasado a entregar um sinal de sexta às 23:50 no sábado de manhã é exactamente o caso
 * que esta trava existe para apanhar.
 */
export function depoisDoFechoSemanal(f: FechoFimDeSemana | null, agora: Date): string | null {
  if (!f) return null
  const hora = minutosDaHora(f.hora)
  if (hora == null) return null
  const { minuto, dia } = utc(agora)
  // Da hora de fecha do dia `f.dia` até ao fim da semana (sábado=6, domingo=0 tratado abaixo).
  const fechado = (dia === f.dia && minuto >= hora) || dia > f.dia || dia === 0
  if (!fechado) return null
  return `fecho de fim de semana: a partir de ${f.hora} UTC do dia ${f.dia} não se abrem posições novas (gap de domingo)`
}

/**
 * Drawdown diário da mestre. A referência é a equity do INÍCIO DO DIA, não o saldo inicial da conta:
 * medir contra o saldo inicial fazia uma mestre em lucro acumulado nunca travar, e uma mestre em
 * prejuízo acumulado travar todos os dias de manhã sem ter perdido nada hoje.
 */
export function drawdownDiarioExcedido(
  maxPct: number | null,
  x: { equity: number | null; equityInicioDoDia: number | null },
): string | null {
  if (maxPct == null) return null
  const { equity, equityInicioDoDia: base } = x
  // Sem uma das duas pontas NÃO se trava. Uma trava que dispara por falta de dados é uma avaria que
  // parece prudência: pára a estratégia inteira e ninguém sabe porquê.
  if (equity == null || base == null || !(base > 0) || !Number.isFinite(equity)) return null
  const perdaPct = ((base - equity) / base) * 100
  if (perdaPct < maxPct) return null
  return `drawdown diário da mestre em ${perdaPct.toFixed(2)}% (limite ${maxPct}%): não se abrem entradas novas, e por isso a cadeia de seguidores também pára de receber`
}

/**
 * Margem livre. Não se abre com a conta já apertada: a ordem seguinte é a que faz a corretora
 * liquidar as anteriores ao pior preço do dia.
 */
export function margemInsuficiente(
  minPct: number | null,
  x: { margemLivre: number | null; equity: number | null },
): string | null {
  if (minPct == null) return null
  const { margemLivre, equity } = x
  if (margemLivre == null || equity == null || !(equity > 0) || !Number.isFinite(margemLivre)) return null
  const pct = (margemLivre / equity) * 100
  if (pct >= minPct) return null
  return `margem livre em ${pct.toFixed(1)}% da equity (mínimo ${minPct}%): não se abre mais nada`
}

// ── as cinco juntas ─────────────────────────────────────────────────────────

export interface ContextoTravas {
  agora: Date
  symbol: string
  eventos: EventoEconomico[]
  equity: number | null
  equityInicioDoDia: number | null
  margemLivre: number | null
}

export interface VeredictoTravas {
  podeAbrir: boolean
  /** TODOS os motivos, não só o primeiro: o dono quer saber se falha uma coisa ou cinco. */
  motivos: string[]
  /** o texto para `mestres_sinais.resultado.naoExecutado` e para o registo do sinal */
  motivo: string | null
}

/**
 * As travas da mestre, todas. Só decide ABRIR — as saídas não passam por aqui (ver o cabeçalho).
 *
 * A ordem é a da leitura humana: primeiro o tempo (quando é que se pode), depois o dinheiro (quanto
 * é que já se perdeu e quanto é que sobra). Nenhuma delas trava por falta de dados.
 */
export function travasDaMestre(t: TravasMestre, c: ContextoTravas): VeredictoTravas {
  const motivos = [
    foraDaJanela(t.janela, c.agora),
    depoisDoFechoSemanal(t.fimDeSemana, c.agora),
    emSombraDeNoticia(t.noticias, c.eventos, c.symbol, c.agora),
    drawdownDiarioExcedido(t.maxDdDiarioPct, c),
    margemInsuficiente(t.margemLivreMinPct, c),
  ].filter((m): m is string => m != null)
  return { podeAbrir: motivos.length === 0, motivos, motivo: motivos.length ? motivos.join(' · ') : null }
}

/** Alguma trava está configurada? (o ecrã usa isto para não prometer protecção que não existe) */
export function temTravas(t: TravasMestre): boolean {
  return Boolean(t.janela || t.noticias || t.fimDeSemana || t.maxDdDiarioPct != null || t.margemLivreMinPct != null)
}
