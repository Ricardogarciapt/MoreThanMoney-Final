/**
 * O TICK FRESCO, PEDIDO AO MOTOR — o atalho que tira a fotografia velha do caminho da abertura.
 *
 * O PROBLEMA (medido a 24/09/2026, mercado aberto)
 * A cadeia do preço é rápida até ao fim: conector MT5 → motor ~94 ms, motor → browser ~27 ms. O
 * que é lento é o RETRATO: `funded_precos` só aceita cada símbolo de `ESCRITA_PRECOS_MIN_MS`
 * (5 s) em 5 s, de propósito, para não multiplicar o egress por 193 símbolos. E a execução, que
 * corre em serverless e não tem ligação nenhuma ao motor, ia ler esse retrato — com o limite de
 * frescura a ser EXACTAMENTE os mesmos 5 s, sem folga. Amostra de 60 s, idade da linha na base:
 *
 *   XAUUSD p50 0,9 s · EURUSD p50 3,6 s (31 % das leituras JÁ acima de 5 s) · GBPJPY p50 3,3 s
 *   (14 %) · US30 p50 4,1 s (41 %) · USOIL p50 5,9 s (59 %)
 *
 * Ou seja: ou se abria sobre um preço de 3-4 s, ou se recusava. E abrir sobre um preço velho não
 * é neutro — um sinal de continuação nasce DEPOIS do movimento, por isso o preço velho cai
 * sempre do lado bom da casa (6 em 7 trades da mestre do Sensei, 21-24/09).
 *
 * A SOLUÇÃO
 * Perguntar ao motor, que tem o tick de 94 ms em MEMÓRIA: `GET /precos/tick` (services/funded-
 * motor/ws-precos.ts), no mesmo `/precos` que o nginx já encaminha. A Vercel corre em `arn1` e a
 * EC2 é `eu-north-1` — Estocolmo as duas, portanto a ida e volta é de milissegundos. Nada disto
 * escreve na base: o egress fica igual ao que era.
 *
 * O QUE ISTO **NÃO** FAZ
 * Não mexe na guarda. `../precos/preenchimento.ts` continua a mandar: pior-dos-dois com o preço
 * do sinal, recusa acima de 5 s, recusa se as fontes discordarem. O que muda é a QUALIDADE do
 * tick que lhe entregamos — nunca a regra. E quando o motor não responde a tempo, ou responde
 * com um tick mais velho do que o da base, fica o retrato: o pior caso é exactamente o de hoje.
 */

export interface TickDoMotor {
  symbol: string
  bid: number
  ask: number
  /** instante em que o MOTOR carimbou (ms) */
  em: number
  /** instante em que o MERCADO fez o preço (ms), quando a fonte o declara — senão nulo */
  emMercado: number | null
  fonte: string
  /** idade que o motor mediu no instante da resposta (`emMercado ?? em`) */
  idadeMs: number
}

interface RespostaTick {
  ok?: boolean
  agora?: number
  esperouMs?: number
  precos?: Array<{ s: string; b: number; a: number; t: number; m: number | null; f?: string; idadeMs?: number }>
  faltam?: string[]
}

const URL_OMISSAO = 'https://stream.morethanmoney.pt/precos/tick'

/** Quanto tempo a abertura aceita ESPERAR por um tick. Acima disto, a rapidez deixa de compensar. */
export const ESPERA_MS = Number(process.env.FUNDED_TICK_ESPERA_MS || 700)
/** Idade a que damos o símbolo por fresco e deixamos de esperar. */
export const IDADE_ALVO_MS = Number(process.env.FUNDED_TICK_IDADE_MS || 1_500)
/** Prazo total do pedido (espera + rede). Estourado, cai-se no retrato sem drama. */
const PRAZO_MS = ESPERA_MS + 600

/**
 * Memória curta por símbolo. Um sinal abre em VÁRIAS contas (fan-out) e cada conta pede o preço
 * duas vezes (uma para ancorar SL/TP, outra dentro de `abrirPosicao`): sem isto seriam 2N
 * pedidos ao motor pelo mesmo tick do mesmo instante. A idade que se devolve é sempre a
 * VERDADEIRA — recalculada, nunca a que veio na resposta — por isso guardar não rejuvenesce nada.
 */
const memo = new Map<string, { tick: TickDoMotor; em: number }>()
const MEMO_MS = Number(process.env.FUNDED_TICK_MEMO_MS || 300)

/**
 * Disjuntor: o motor em baixo (ou o nginx, ou a rede) não pode custar `PRAZO_MS` a CADA conta de
 * um fan-out. Três falhas seguidas e fica-se no retrato durante meio minuto.
 */
let falhasSeguidas = 0
let mudoAte = 0
const FALHAS_ATE_DESLIGAR = 3
const PAUSA_MS = 30_000

export function tickSincronoLigado(): boolean {
  if (process.env.FUNDED_TICK_SINCRONO === '0') return false
  return Boolean(process.env.LMS_CAPTION_WORKER_SECRET)
}

/** Só para os testes e para a vigia: repõe o disjuntor e a memória. */
export function reporTickMotor() {
  memo.clear()
  falhasSeguidas = 0
  mudoAte = 0
}

export interface ResumoTickMotor {
  pedidos: number
  falhas: number
  mudo: boolean
}

export function resumoTickMotor(): ResumoTickMotor {
  return { pedidos: memo.size, falhas: falhasSeguidas, mudo: Date.now() < mudoAte }
}

export interface LinhaRetrato {
  bid: number
  ask: number
  em: number
  emMercado: number | null
}

/**
 * Qual dos dois vale — o retrato da base ou o tick do motor. Decide-se pelo carimbo do MOTOR
 * (`em`), que é o mesmo relógio nos dois lados: a linha da base foi escrita por este motor.
 * Empate ou dúvida → fica a base, que é o comportamento de sempre.
 *
 * Nunca se escolhe um tick MAIS VELHO do que o que já se tinha. É a única regra aqui, e existe
 * porque o caminho rápido não pode, em nenhuma circunstância, piorar o preço de uma abertura.
 */
export function maisFresco(base: LinhaRetrato | null, motor: TickDoMotor | null): { escolha: LinhaRetrato; de: 'base' | 'motor' } | null {
  if (!motor) return base ? { escolha: base, de: 'base' } : null
  const doMotor: LinhaRetrato = { bid: motor.bid, ask: motor.ask, em: motor.em, emMercado: motor.emMercado }
  if (!base) return { escolha: doMotor, de: 'motor' }
  return motor.em > base.em ? { escolha: doMotor, de: 'motor' } : { escolha: base, de: 'base' }
}

/**
 * Os ticks em memória do motor para estes símbolos. Nunca lança: o que não vier fica de fora e
 * quem chamou usa o retrato da base para esses.
 */
export async function ticksDoMotor(
  symbols: string[],
  opcoes?: { esperaMs?: number; idadeAlvoMs?: number },
): Promise<Map<string, TickDoMotor>> {
  const out = new Map<string, TickDoMotor>()
  const lista = [...new Set(symbols.map((s) => String(s || '').toUpperCase()).filter(Boolean))]
  if (!lista.length || !tickSincronoLigado()) return out

  const agora = Date.now()
  const porPedir: string[] = []
  for (const s of lista) {
    const g = memo.get(s)
    if (g && agora - g.em <= MEMO_MS) out.set(s, g.tick)
    else porPedir.push(s)
  }
  if (!porPedir.length || agora < mudoAte) return out

  const espera = Math.max(0, opcoes?.esperaMs ?? ESPERA_MS)
  const idadeAlvo = Math.max(100, opcoes?.idadeAlvoMs ?? IDADE_ALVO_MS)
  const base = (process.env.FUNDED_TICK_URL || URL_OMISSAO).replace(/\/+$/, '')
  const url = `${base}?symbols=${encodeURIComponent(porPedir.join(','))}&esperaMs=${espera}&idadeMaxMs=${idadeAlvo}`

  try {
    const r = await fetch(url, {
      headers: { 'x-caption-secret': String(process.env.LMS_CAPTION_WORKER_SECRET) },
      signal: AbortSignal.timeout(espera + 600 > PRAZO_MS ? espera + 600 : PRAZO_MS),
      cache: 'no-store',
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const dados = (await r.json()) as RespostaTick
    const visto = Date.now()
    for (const p of dados.precos ?? []) {
      if (!(p.b > 0) || !(p.a > 0) || !(p.a >= p.b) || !Number.isFinite(p.t)) continue
      const tick: TickDoMotor = {
        symbol: String(p.s).toUpperCase(), bid: Number(p.b), ask: Number(p.a),
        em: Number(p.t), emMercado: p.m == null ? null : Number(p.m),
        fonte: String(p.f ?? ''), idadeMs: visto - (p.m == null ? Number(p.t) : Number(p.m)),
      }
      // Um relógio do motor adiantado daria um tick «do futuro» e uma idade negativa. Não se
      // corrige o carimbo (era inventar) — descarta-se, e fica o retrato.
      if (tick.em > visto + 2_000) continue
      out.set(tick.symbol, tick)
      memo.set(tick.symbol, { tick, em: visto })
    }
    falhasSeguidas = 0
  } catch {
    falhasSeguidas++
    if (falhasSeguidas >= FALHAS_ATE_DESLIGAR) { mudoAte = Date.now() + PAUSA_MS; falhasSeguidas = 0 }
  }
  return out
}
