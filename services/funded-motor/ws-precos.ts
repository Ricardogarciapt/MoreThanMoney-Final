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
 *
 * ── E O PEDIDO SÍNCRONO: `GET /precos/tick` (2026-09-24) ──────────────────────────────────
 *
 * O WS resolve o BROWSER. Não resolvia quem ABRE ordens: essa parte corre em serverless, não
 * mantém ligações, e ia ler o retrato da Supabase — que por desenho tem até
 * `ESCRITA_PRECOS_MIN_MS` (5 s) de idade, exactamente o limite a que a execução recusa. Medido a
 * 24/09 com o mercado aberto: o retrato dos símbolos da execução tinha 3–4 s de idade mediana e
 * estava JÁ acima dos 5 s em 14 % a 59 % das leituras, conforme o símbolo.
 *
 * Aqui o mesmo tick que o WS publica serve-se também por HTTP, em memória, a quem o peça. O
 * nginx já encaminha todo o prefixo `/precos` para esta porta, por isso não há bloco novo nem
 * porta nova. E como nada disto toca na Supabase, a escrita — e o egress — ficam iguais.
 *
 *   GET /precos/tick?symbols=XAUUSD,EURUSD&esperaMs=700&idadeMaxMs=1500
 *   cabeçalho: x-caption-secret: <LMS_CAPTION_WORKER_SECRET>
 *
 * Símbolo já fresco responde no instante. Símbolo velho — ou que o motor nem segue — entra na
 * lista de pedidos e ESPERA-SE pelo tick até `esperaMs`. Não chegando, responde-se com o que há
 * e a sua IDADE VERDADEIRA: quem recebe é que decide (lib/mtmfunded/precos/preenchimento.ts
 * recusa acima de 5 s). Um preço nunca é re-carimbado aqui — re-carimbar foi a raiz do incidente
 * do ouro de 21-24/09, e não se repete por conveniência.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

type Qualquer = any // eslint-disable-line @typescript-eslint/no-explicit-any

const MAX_LIGACOES = 800
const MAX_SIMBOLOS = 60

/** Um pedido síncrono não pode pedir o catálogo inteiro nem segurar o socket indefinidamente. */
const TICK_MAX_SIMBOLOS = 20
const TICK_ESPERA_MAX_MS = 2_000
const TICK_ESPERA_OMISSAO_MS = 700
const TICK_IDADE_OMISSAO_MS = 1_500
/** Acima disto recusa-se (503): esperas são memória e sockets presos, e o motor tem trabalho. */
const TICK_MAX_EM_ESPERA = 200

export interface TickPublicado {
  s: string
  b: number
  a: number
  /** instante em que o MOTOR carimbou (ms) */
  t: number
  /** instante em que o MERCADO fez o preço (ms), quando a fonte o declara */
  m: number | null
  /** de onde veio (conector, binance, cruzado-fx, …) — para o log e a auditoria */
  f: string
}

export interface WsPrecos {
  publicar(symbol: string, bid: number, ask: number, em: number, emMercado?: number | null, fonte?: string): void
  clientes(): number
  /** quantos pedidos síncronos estão neste momento à espera de um tick */
  emEspera(): number
  parar(): void
}

export interface OpcoesWsPrecos {
  porta: number
  log: (...a: unknown[]) => void
  /**
   * Segredo exigido no `/precos/tick`. Vazio = endpoint desligado: é melhor não o ter do que
   * ter uma espera de 2 s aberta ao mundo.
   */
  segredo?: string
  /**
   * Avisa o motor de que alguém precisa deste símbolo AGORA. O motor mete-o nos desejados sem
   * esperar pela ronda de 5 s da tabela `funded_precos_pedidos` — que é o que tornava a ideia de
   * «pedir e esperar» pela base lenta de mais para servir uma abertura.
   */
  pedir?: (symbol: string) => void
}

interface EmEspera {
  querem: Set<string>
  idadeMaxMs: number
  resolver: () => void
}

const idade = (t: TickPublicado, agora: number) => agora - (t.m ?? t.t)

export function iniciarWsPrecos(opcoes: OpcoesWsPrecos): WsPrecos | null {
  const { porta, log } = opcoes
  if (!porta) return null
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WebSocketServer } = require('ws')
  /** último preço por símbolo — para o snapshot de quem chega a meio e para o `/precos/tick` */
  const ultimo = new Map<string, TickPublicado>()
  const esperas = new Set<EmEspera>()
  const subsDe = new WeakMap<object, Set<string>>()

  // Servidor HTTP próprio: o WS agarra o upgrade em `/precos` e o resto das rotas fica para nós.
  // (Com `{ porta }` o `ws` criava o servidor e respondia 426 a tudo o que não fosse upgrade.)
  const http = createServer((req, res) => responder(req, res))
  const wss = new WebSocketServer({ server: http, path: '/precos' })
  http.listen(porta)

  const servido = (symbol: string): TickPublicado | null => ultimo.get(symbol) ?? null

  function corpo(res: ServerResponse, status: number, dados: unknown) {
    const txt = JSON.stringify(dados)
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(txt)
  }

  async function responder(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://motor')
    if (url.pathname !== '/precos/tick') { corpo(res, 404, { ok: false, erro: 'rota desconhecida' }); return }
    if (req.method !== 'GET') { corpo(res, 405, { ok: false, erro: 'só GET' }); return }
    if (!opcoes.segredo) { corpo(res, 503, { ok: false, erro: 'pedido síncrono desligado (sem segredo)' }); return }
    if (req.headers['x-caption-secret'] !== opcoes.segredo) { corpo(res, 401, { ok: false, erro: 'segredo inválido' }); return }

    const symbols = [...new Set(String(url.searchParams.get('symbols') ?? '').split(',')
      .map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, TICK_MAX_SIMBOLOS)
    if (!symbols.length) { corpo(res, 400, { ok: false, erro: 'faltam símbolos' }); return }

    const nEspera = Math.min(TICK_ESPERA_MAX_MS, Math.max(0, Number(url.searchParams.get('esperaMs') ?? TICK_ESPERA_OMISSAO_MS) || 0))
    const idadeMaxMs = Math.max(100, Number(url.searchParams.get('idadeMaxMs') ?? TICK_IDADE_OMISSAO_MS) || TICK_IDADE_OMISSAO_MS)

    // Seguir já o que não se segue: um símbolo que o motor não subscreve nunca ficaria fresco
    // por muito que se esperasse.
    if (opcoes.pedir) for (const s of symbols) opcoes.pedir(s)

    const faltam = () => symbols.filter((s) => {
      const t = servido(s)
      return !t || idade(t, Date.now()) > idadeMaxMs
    })

    const t0 = Date.now()
    if (nEspera > 0 && faltam().length) {
      if (esperas.size >= TICK_MAX_EM_ESPERA) { corpo(res, 503, { ok: false, erro: 'demasiados pedidos em espera' }); return }
      await new Promise<void>((resolve) => {
        const espera: EmEspera = { querem: new Set(symbols), idadeMaxMs, resolver: () => { limpar(); resolve() } }
        const relogio = setTimeout(() => { limpar(); resolve() }, nEspera)
        const limpar = () => { clearTimeout(relogio); esperas.delete(espera) }
        esperas.add(espera)
        // Fechar o socket a meio não pode deixar a espera pendurada.
        req.on('close', () => { limpar(); resolve() })
      })
    }
    if (res.writableEnded || res.destroyed) return

    const agora = Date.now()
    const precos = symbols.map((s) => servido(s)).filter((t): t is TickPublicado => Boolean(t))
      .map((t) => ({ ...t, idadeMs: idade(t, agora) }))
    corpo(res, 200, { ok: true, agora, esperouMs: agora - t0, precos, faltam: faltam() })
  }

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

  log(`[ws-precos] a ouvir na porta ${porta} (/precos${opcoes.segredo ? ' + /precos/tick' : ''})`)
  return {
    publicar(symbol, bid, ask, em, emMercado = null, fonte = '') {
      const t: TickPublicado = { s: symbol, b: bid, a: ask, t: em, m: emMercado, f: fonte }
      ultimo.set(symbol, t)
      // Acordar quem esperava por este símbolo — só se o tick chega MESMO fresco ao critério dele.
      if (esperas.size) {
        const agora = Date.now()
        for (const e of esperas) {
          if (!e.querem.has(symbol)) continue
          const pronto = [...e.querem].every((s) => {
            const u = ultimo.get(s)
            return u && idade(u, agora) <= e.idadeMaxMs
          })
          if (pronto) e.resolver()
        }
      }
      if (!wss.clients.size) return
      const msg = JSON.stringify({ s: t.s, b: t.b, a: t.a, t: t.t })
      for (const ws of wss.clients as Set<Qualquer>) {
        if (ws.readyState !== 1) continue
        const subs = subsDe.get(ws)
        if (subs?.has(symbol)) { try { ws.send(msg) } catch { /* fecho a meio do send */ } }
      }
    },
    clientes: () => wss.clients.size,
    emEspera: () => esperas.size,
    parar() {
      clearInterval(batimento)
      for (const e of [...esperas]) e.resolver()
      try { wss.close() } catch { /* já fechado */ }
      try { http.close() } catch { /* já fechado */ }
    },
  }
}
