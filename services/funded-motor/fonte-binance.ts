/**
 * CRIPTO SEM METAAPI — bookTicker da Binance por WebSocket público (grátis, sem chave, 24/7).
 *
 * Existe para o sistema interno viver sem créditos MetaApi (ordem de 2026-09-21): BTC/ETH são o
 * pulso do feed (o BASE do motor) e o cripto é o único mercado que nunca fecha. Um tick por
 * mudança de melhor bid/ask — mais fino do que o streaming MetaApi.
 *
 * Só INJETA quando o preço do feed principal está velho (>5 s), pela mesma regra do recurso
 * TradeLocker: com a MetaApi viva não há duas fontes a lutar pelo mesmo símbolo; com ela morta,
 * a Binance assume sozinha. Reconexão com recuo exponencial; BINANCE_FEED=0 desliga.
 *
 * Pares: BINANCE_PARES="BTCUSD:btcusdt,ETHUSD:ethusdt" (canónico nosso : stream da Binance).
 *
 * REFERÊNCIAS ANCORADAS (21/09): BINANCE_ANCORADOS="XAUUSD:paxgusdt" — o PAXG tica ao segundo mas não
 * é o spot; cada tick vai para `referencia()` e o motor converte-o ao nível da âncora à vista
 * (gold-api, ~45 s entre actualizações). Assim o ouro tem preço ao segundo ao nível certo.
 */
type Qualquer = any // eslint-disable-line @typescript-eslint/no-explicit-any

export interface OpcoesBinance {
  /** o preço do principal para este símbolo está velho? (só então se injeta) */
  precisa: (sym: string) => boolean
  /**
   * SEM HORA DE MERCADO, de propósito. Medido a 24/09/2026 no stream combinado: o payload do
   * `@bookTicker` traz `u/s/b/B/a/A` e mais nada — nem `E` nem `T`. Como é um stream de EMPURRO,
   * o instante da chegada anda perto do do mercado, mas «perto» não é «declarado»: passa-se
   * `emMercado` a NULO e quem lê cai no caminho pessimista, que é a verdade.
   */
  injetar: (sym: string, bid: number, ask: number, em: number, emMercado: number | null, origem: string) => void
  /** tick bruto de uma referência ancorada (o motor decide se e como injeta) */
  referencia?: (sym: string, bid: number, ask: number) => void
  log: (...a: unknown[]) => void
}

export interface FonteBinance { parar(): void; resumo(): { ticks: number; ligada: boolean } }

const PARES_DEFEITO = 'BTCUSD:btcusdt,ETHUSD:ethusdt'

export function iniciarFonteBinance(o: OpcoesBinance): FonteBinance | null {
  if (process.env.BINANCE_FEED === '0') return null
  const pares = new Map<string, string>() // stream (minúsculo) → canónico
  for (const par of (process.env.BINANCE_PARES || PARES_DEFEITO).split(',')) {
    const [canon, stream] = par.split(':').map((s) => s.trim())
    if (canon && stream) pares.set(stream.toLowerCase(), canon.toUpperCase())
  }
  const ancorados = new Set<string>() // streams cujo tick vai para `referencia`
  if (o.referencia) {
    for (const par of (process.env.BINANCE_ANCORADOS ?? 'XAUUSD:paxgusdt').split(',')) {
      const [canon, stream] = par.split(':').map((s) => s.trim())
      if (canon && stream) { pares.set(stream.toLowerCase(), canon.toUpperCase()); ancorados.add(stream.toLowerCase()) }
    }
  }
  if (!pares.size) return null

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const WebSocket = require('ws')
  const url = `wss://stream.binance.com:9443/stream?streams=${[...pares.keys()].map((s) => `${s}@bookTicker`).join('/')}`

  let ws: Qualquer = null
  let parado = false
  let tentativas = 0
  let ticks = 0

  const ligar = () => {
    if (parado) return
    ws = new WebSocket(url)
    ws.on('open', () => { tentativas = 0; o.log('[binance] feed cripto ligado:', [...pares.values()].join(' ')) })
    ws.on('message', (raw: Qualquer) => {
      try {
        const m = JSON.parse(String(raw))
        const d = m?.data
        const stream = String(m?.stream ?? '').split('@')[0]
        const canon = pares.get(stream)
        if (!canon || !d) return
        const bid = Number(d.b), ask = Number(d.a)
        if (!(bid > 0) || !(ask > 0)) return
        if (ancorados.has(stream)) { ticks++; o.referencia?.(canon, bid, ask); return }
        if (!o.precisa(canon)) return
        ticks++
        o.injetar(canon, bid, ask, Date.now(), null, 'binance:bookticker')
      } catch {
        // uma mensagem má não derruba o feed
      }
    })
    const caiu = () => {
      if (parado) return
      try { ws?.terminate() } catch { /* já morta */ }
      ws = null
      const espera = Math.min(60_000, 1000 * 2 ** tentativas++)
      o.log(`[binance] ligação caiu — retry em ${Math.round(espera / 1000)}s`)
      setTimeout(ligar, espera)
    }
    ws.on('close', caiu)
    ws.on('error', caiu)
  }
  ligar()

  return {
    parar() { parado = true; try { ws?.close() } catch { /* já fechada */ } },
    resumo: () => ({ ticks, ligada: ws?.readyState === 1 }),
  }
}
