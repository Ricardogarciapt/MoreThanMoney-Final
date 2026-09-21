/**
 * WS DE PREÇOS — a distribuição de ticks aos browsers SEM passar pela Supabase.
 *
 * O poll do WebTrader (1,5 s × cada cliente × leitura à base) foi o que esgotou o egress a
 * 2026-09-19. Aqui o caminho é: MetaApi (1 ligação streaming) → motor (memória) → este WS →
 * todos os clientes. O custo é largura de banda da EC2 — ticks são dezenas de bytes — e não
 * cresce por aluno. A Supabase fica só como snapshot (fills serverless, vigia, auditoria).
 *
 * Protocolo (JSON, uma linha por mensagem):
 *   cliente → servidor:  {"sub":["XAUUSD","BTCUSD",…]}   substitui a lista (máx. 60)
 *   servidor → cliente:  {"tipo":"snap","precos":[{"s","b","a","t"},…]}  ao subscrever
 *                        {"s":"XAUUSD","b":4377.4,"a":4377.8,"t":1758400000000}  por tick
 *
 * Sem autenticação: preços de mercado não são segredo, e o nginx (stream.morethanmoney.pt)
 * já faz o TLS. Proteções: limite de ligações, limite de símbolos, ping/pong de 30 s.
 * Desligar: WS_PRECOS_PORTA=0.
 */
type Qualquer = any // eslint-disable-line @typescript-eslint/no-explicit-any

const MAX_LIGACOES = 800
const MAX_SIMBOLOS = 60

export interface WsPrecos {
  publicar(symbol: string, bid: number, ask: number, em: number): void
  clientes(): number
  parar(): void
}

export function iniciarWsPrecos(porta: number, log: (...a: unknown[]) => void): WsPrecos | null {
  if (!porta) return null
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WebSocketServer } = require('ws')
  const wss = new WebSocketServer({ port: porta, path: '/precos' })
  /** último preço por símbolo — para o snapshot de quem chega a meio */
  const ultimo = new Map<string, { s: string; b: number; a: number; t: number }>()
  const subsDe = new WeakMap<object, Set<string>>()

  wss.on('connection', (ws: Qualquer) => {
    if (wss.clients.size > MAX_LIGACOES) { ws.close(1013, 'cheio'); return }
    ;(ws as Qualquer).vivo = true
    ws.on('pong', () => { (ws as Qualquer).vivo = true })
    ws.on('error', () => undefined)
    ws.on('message', (raw: Qualquer) => {
      try {
        const m = JSON.parse(String(raw))
        if (!Array.isArray(m?.sub)) return
        const set = new Set<string>(m.sub.slice(0, MAX_SIMBOLOS).map((s: unknown) => String(s).toUpperCase()))
        subsDe.set(ws, set)
        const precos = [...set].map((s) => ultimo.get(s)).filter(Boolean)
        ws.send(JSON.stringify({ tipo: 'snap', precos }))
      } catch {
        // mensagem malformada não derruba a ligação
      }
    })
  })

  // Ligações mortas (rede móvel, separador fechado sem FIN) saem ao fim de 2 pings falhados.
  const batimento = setInterval(() => {
    for (const ws of wss.clients as Set<Qualquer>) {
      if (ws.vivo === false) { ws.terminate(); continue }
      ws.vivo = false
      try { ws.ping() } catch { /* a terminate apanha-a no próximo ciclo */ }
    }
  }, 30_000)

  log(`[ws-precos] a ouvir na porta ${porta} (/precos)`)
  return {
    publicar(symbol, bid, ask, em) {
      const t = { s: symbol, b: bid, a: ask, t: em }
      ultimo.set(symbol, t)
      if (!wss.clients.size) return
      const msg = JSON.stringify(t)
      for (const ws of wss.clients as Set<Qualquer>) {
        if (ws.readyState !== 1) continue
        const subs = subsDe.get(ws)
        if (subs?.has(symbol)) { try { ws.send(msg) } catch { /* fecho a meio do send */ } }
      }
    },
    clientes: () => wss.clients.size,
    parar() {
      clearInterval(batimento)
      try { wss.close() } catch { /* já fechado */ }
    },
  }
}
