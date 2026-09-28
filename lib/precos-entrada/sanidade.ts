/**
 * QUE TICK É QUE SE DEIXA ENTRAR — a tranca entre um POST vindo de fora e um stop real.
 *
 * Um preço injectado por alguém não é um número errado num painel: é um SL que se mexe. Por isso a
 * entrada de preços de um terminal REMOTO (o MT5 do Mac do Ricardo, a reserva do terminal do VPS)
 * passa por três filtros, e nenhum deles é opcional:
 *
 *  1. FORMA — símbolo com cara de símbolo, bid/ask finitos e positivos, ask ≥ bid, spread humano.
 *     Um spread de 30 % não é uma cotação, é lixo (ou um ataque a tentar arrastar o médio).
 *  2. HORA — o `time_msc` da corretora não pode vir do futuro nem ser um tick velho. Um lote
 *     reenviado meia hora depois não vale nada, e o carimbo é o que os motores usam para provar
 *     frescura (`services/motor-real/precos-nossos.ts`).
 *  3. MOVIMENTO POSSÍVEL — um salto absurdo face ao último preço aceite da MESMA fonte, dentro de
 *     uma janela curta, é recusado. Mercado mexe; mercado não triplica em 300 ms. Fora da janela
 *     (fim de semana, terminal que esteve fechado) não se recusa: aí o salto pode ser verdade e
 *     não há como distinguir — mas então também já não havia preço nenhum para mexer um stop.
 *
 * E há um quarto filtro que só existe quando a fonte principal está viva: a REFERÊNCIA. Se o
 * terminal do VPS tem preço fresco para o símbolo, o preço que chega de fora tem de estar perto
 * dele. É o filtro mais forte de todos — quem injecta não consegue mover a fonte principal — e é
 * também o que naturalmente não existe no caso que interessa (VPS em baixo), e é por isso que os
 * outros três têm de bastar sozinhos.
 *
 * Tudo aqui é decisão pura, sem rede e sem ficheiros: é o que permite ter guardas
 * (`sanidade.check.ts`) em vez de confiança.
 */

/** Um tick como o EA o publica (o mesmo formato de `ticks.json`). */
export interface TickEntrada {
  /** símbolo como a corretora o escreve (`XAUUSD.s`) — canoniza-se depois, na leitura */
  s: string
  b: number
  a: number
  /** `time_msc` do tick na corretora, em ms */
  t: number
}

/** Um preço já conhecido, para comparar: o último aceite desta fonte, ou o da fonte principal. */
export interface Referencia {
  /** (bid+ask)/2 */
  medio: number
  /** hora de mercado desse preço, em ms */
  em: number
}

export interface LimitesSanidade {
  /** acima disto o tick já não serve para decidir nada (os motores recusariam-no de qualquer forma) */
  idadeMaxMs: number
  /** tolerância para o relógio da corretora estar à frente do nosso */
  futuroMaxMs: number
  /** spread máximo em fracção do médio */
  spreadMaxFracao: number
  /** salto máximo face ao último aceite, em fracção do preço */
  saltoMaxFracao: number
  /** dentro desta janela um salto grande é recusado; fora dela pode ser um fim de semana */
  janelaSaltoMs: number
  /** discordância máxima face à fonte principal, quando ela tem o símbolo fresco */
  divergenciaMaxFracao: number
  /** idade máxima da referência para ela ainda valer como referência */
  referenciaMaxMs: number
  /** forma aceitável de um nome de símbolo */
  simbolo: RegExp
}

export const LIMITES: LimitesSanidade = {
  idadeMaxMs: 60_000,
  futuroMaxMs: 5_000,
  // 3 %: largo para o ouro num minuto de notícias e para índices em abertura, apertado para lixo.
  spreadMaxFracao: 0.03,
  saltoMaxFracao: 0.05,
  janelaSaltoMs: 120_000,
  // 1,5 %: duas contas da mesma corretora andam a décimas de por cento; 1,5 % já é outro planeta.
  divergenciaMaxFracao: 0.015,
  referenciaMaxMs: 10_000,
  simbolo: /^[A-Z][A-Z0-9]{2,15}(?:[.\-_+][A-Z0-9]{1,6})?$/,
}

export type Veredicto = { ok: true } | { ok: false; razao: string }

export function medio(t: TickEntrada): number {
  return (t.b + t.a) / 2
}

function finitoPositivo(x: unknown): boolean {
  return typeof x === 'number' && Number.isFinite(x) && x > 0
}

/**
 * Este tick entra?
 *
 * `anterior` = o último aceite desta MESMA fonte para este símbolo (null na primeira vez).
 * `referencia` = o que a fonte principal (terminal do VPS) diz agora, quando diz alguma coisa.
 */
export function avaliarTick(
  t: TickEntrada,
  agora: number,
  anterior: Referencia | null,
  referencia: Referencia | null,
  lim: LimitesSanidade = LIMITES,
): Veredicto {
  const s = typeof t?.s === 'string' ? t.s.trim().toUpperCase() : ''
  if (!lim.simbolo.test(s)) return { ok: false, razao: 'simbolo' }
  if (!finitoPositivo(t.b) || !finitoPositivo(t.a)) return { ok: false, razao: 'preco' }
  if (t.a < t.b) return { ok: false, razao: 'ask<bid' }
  const m = medio(t)
  if ((t.a - t.b) / m > lim.spreadMaxFracao) return { ok: false, razao: 'spread' }
  if (!Number.isFinite(t.t) || t.t <= 0) return { ok: false, razao: 'hora' }
  if (t.t - agora > lim.futuroMaxMs) return { ok: false, razao: 'futuro' }
  if (agora - t.t > lim.idadeMaxMs) return { ok: false, razao: 'velho' }

  // Um tick mais antigo do que o que já temos não é notícia — e aceitá-lo seria deixar alguém
  // empurrar o preço para trás com um lote reenviado.
  if (anterior && t.t < anterior.em) return { ok: false, razao: 'recuado' }

  if (anterior && t.t - anterior.em <= lim.janelaSaltoMs) {
    const salto = Math.abs(m - anterior.medio) / anterior.medio
    if (salto > lim.saltoMaxFracao) return { ok: false, razao: `salto ${(salto * 100).toFixed(2)}%` }
  }

  if (referencia && agora - referencia.em <= lim.referenciaMaxMs) {
    const desvio = Math.abs(m - referencia.medio) / referencia.medio
    if (desvio > lim.divergenciaMaxFracao) {
      return { ok: false, razao: `divergencia ${(desvio * 100).toFixed(2)}%` }
    }
  }

  return { ok: true }
}
