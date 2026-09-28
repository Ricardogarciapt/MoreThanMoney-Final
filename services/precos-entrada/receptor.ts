/**
 * RECEPTOR DE PREÇOS DE UM TERMINAL REMOTO — a redundância do terminal do conector.
 *
 * ═══ O PROBLEMA ══════════════════════════════════════════════════════════════════════════════
 *
 * Os preços rápidos da casa (p50 94 ms) vêm de UM terminal MT5 no VPS com o EA `MTMConector`: o EA
 * publica a fotografia do Market Watch de 50 em 50 ms em `ticks.json` e os motores lêem o ficheiro
 * de 25 em 25 ms. Um terminal, um ponto único de falha — e ele falhou: 28/09/2026, o MetaTrader
 * entrou em ciclo de auto-actualização, o último tick real ficou em sexta 21:59:59 UTC e os motores
 * caíram nas fontes REST (2–4 s) com o mercado aberto. Meio dia de preços lentos.
 *
 * ═══ O QUE ISTO É ════════════════════════════════════════════════════════════════════════════
 *
 * O outro lado de um caminho que deixa um terminal MT5 QUALQUER, em qualquer máquina — começando
 * pelo Mac do Ricardo, com o MESMO EA sem uma linha alterada — alimentar os mesmos motores:
 *
 *     MT5 do Mac (EA MTMConector) → ticks.json local
 *       → agente (services/precos-entrada/agente-remoto.ts): só o que mudou, assinado
 *         → ESTE receptor, no VPS: autentica, valida, aplica ao retrato
 *           → escreve `<raiz>/<fonte>/MQL5/Files/mtm-conector/ticks.json`
 *             → os motores lêem-no como lêem o do terminal local (CONECTOR_TICKS_RAIZES)
 *
 * ═══ PORQUE ASSIM E NÃO DE OUTRA MANEIRA ═════════════════════════════════════════════════════
 *
 * · **Escrever o ficheiro que já se lê** em vez de ensinar aos motores uma fonte nova: a regra de
 *   frescura, o tecto de idade, a prova do movimento e a preferência pela hora de mercado já estão
 *   escritas em `services/motor-real/precos-nossos.ts` e não se duplicam. O Mac entra como mais uma
 *   raiz e ganha quando o seu tick for mais fresco — nada mais.
 * · **Um agente em Node e não WebRequest dentro do EA**: o `WebRequest` do MQL5 é síncrono e corre
 *   na mesma linha de execução que o trailing (que vive dentro do terminal, é a vantagem toda do
 *   conector); 40 ms de ida e volta a cada 50 ms era arriscar a gestão para ganhar transporte. E
 *   exige lista branca de URLs nas definições do terminal, que é precisamente o que o EA já evita
 *   para os sockets. Com o agente de fora, o EA do Mac é o MESMO ficheiro do VPS — uma variante a
 *   menos para divergir.
 * · **HTTP e não uma pasta montada** (sshfs/rsync): um `readFile` sobre uma montagem pendurada
 *   BLOQUEIA, e quem ia bloquear era o relógio de 25 ms do motor — a fonte principal a pagar pela
 *   reserva. Inaceitável. Aqui o ficheiro que o motor lê é sempre local.
 *
 * ═══ A TRANCA ════════════════════════════════════════════════════════════════════════════════
 *
 * Preço falso é dinheiro real: quem consiga injectar um preço mexe um stop. Por isso nada entra sem
 * HMAC por fonte + janela de tempo + sequência a subir (lib/precos-entrada/assinatura.ts) e sem
 * passar a sanidade — forma, hora, salto possível e, quando o terminal do VPS está vivo, proximidade
 * ao que ELE diz (lib/precos-entrada/sanidade.ts). Sem fontes configuradas o receptor não arranca:
 * um receptor de preços aberto é pior do que não haver reserva.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { aceitarLote, conferirAssinatura, lerFontes, type Lote } from '../../lib/precos-entrada/assinatura'
import { avaliarTick, medio, type Referencia, type TickEntrada } from '../../lib/precos-entrada/sanidade'
import { desvioPlausivel } from '../../lib/precos-entrada/desvio'
import { canonizar, lerFotografia, lerMapa } from '../funded-motor/fonte-conector-mt5'

/** 256 KB: uma fotografia de um Market Watch inteiro cabe muitas vezes aqui. */
const CORPO_MAX = 256 * 1024

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

interface EstadoFonte {
  ultimoSeq: number
  /** a hora do último lote ACEITE: é ela que manda na protecção contra reenvios */
  ultimoEmLote: number
  /**
   * Símbolo CANÓNICO → último tick aceite (com o nome da corretora lá dentro, intacto).
   *
   * A chave é o canónico e não o nome cru por uma razão de segurança, não de arrumação: com a chave
   * crua, `XAUUSD` e `XAUUSD.s` eram dois instrumentos diferentes aqui dentro — e então bastava
   * inventar um sufixo para escapar à guarda do salto (não havia «anterior» para comparar) e para
   * pôr no ficheiro uma segunda linha do MESMO instrumento, mais fresca do que a verdadeira. Medido
   * no ensaio da cadeia: um preço 133 % acima do mercado entrou por aí. Com o canónico, o impostor
   * cai na mesma casa do tick real e é recusado pelo salto.
   */
  retrato: Map<string, TickEntrada>
  aceites: number
  recusados: number
  razoes: Map<string, number>
  lotes: number
  ultimoLoteEm: number
  ultimaEscritaEm: number
  porEscrever: boolean
  /** o desvio da corretora que a fonte DECLAROU no último lote aceite (ms) */
  desvioMs: number
  /** quantas medições o agente diz que o sustentam */
  desvioMedicoes: number
}

const CFG = {
  porta: Number(process.env.PRECOS_ENTRADA_PORTA ?? 8791),
  /** base onde cada fonte ganha a sua árvore `<fonte>/MQL5/Files/<trabalho>/ticks.json` */
  raiz: process.env.PRECOS_ENTRADA_RAIZ ?? '/var/lib/mtm-precos-entrada',
  trabalho: process.env.CONECTOR_TICKS_TRABALHO ?? 'mtm-conector',
  /** o `ticks.json` do terminal LOCAL do VPS, para servir de referência enquanto ele estiver vivo */
  referencia: process.env.PRECOS_ENTRADA_REFERENCIA ?? '',
  /** escrita coalescida: nunca mais do que um ficheiro por este intervalo */
  escritaMinMs: Number(process.env.PRECOS_ENTRADA_ESCRITA_MS ?? 20),
  vigia: process.env.PRECOS_ENTRADA_SEGREDO_VIGIA ?? '',
}

const FONTES = lerFontes(process.env.PRECOS_ENTRADA_FONTES)
const MAPA = lerMapa(process.env.CONECTOR_TICKS_MAPA)
const estados = new Map<string, EstadoFonte>()

function estadoDe(fonte: string): EstadoFonte {
  let e = estados.get(fonte)
  if (!e) {
    e = { ultimoSeq: 0, ultimoEmLote: 0, retrato: new Map(), aceites: 0, recusados: 0, razoes: new Map(), lotes: 0, ultimoLoteEm: 0, ultimaEscritaEm: 0, porEscrever: false, desvioMs: 0, desvioMedicoes: 0 }
    estados.set(fonte, e)
  }
  return e
}

function ficheiroDe(fonte: string): string {
  return path.join(CFG.raiz, fonte, 'MQL5', 'Files', CFG.trabalho, 'ticks.json')
}

// ── A referência: o que o terminal LOCAL do VPS diz agora ────────────────────────────────────
// Relê-se no máximo a cada 200 ms (o ficheiro muda a cada 50; ler mais não traz nada). Quando o
// terminal local está em baixo — o caso que motivou tudo isto — não há referência, e a validação
// continua a correr sem ela: é o desenho, não uma falha.
let refPrecos = new Map<string, Referencia>()
let refEm = 0
async function referencias(agora: number): Promise<Map<string, Referencia>> {
  if (!CFG.referencia || agora - refEm < 200) return refPrecos
  refEm = agora
  try {
    const bruto = await fs.readFile(CFG.referencia, 'utf8')
    const nova = new Map<string, Referencia>()
    for (const t of lerFotografia(bruto, MAPA)) nova.set(t.sym, { medio: (t.bid + t.ask) / 2, em: t.em })
    refPrecos = nova
  } catch {
    // terminal local fechado/a reiniciar: sem referência, e é exactamente quando a reserva serve.
    refPrecos = new Map()
  }
  return refPrecos
}

/** Escrita atómica, como o EA faz: `.tmp` + rename. Quem lê nunca vê meia fotografia. */
async function escrever(fonte: string, e: EstadoFonte, agora: number): Promise<void> {
  e.porEscrever = false
  e.ultimaEscritaEm = agora
  const f = ficheiroDe(fonte)
  const p = [...e.retrato.values()].map((t) => `{"s":"${t.s}","b":${t.b},"a":${t.a},"t":${t.t}}`).join(',')
  const corpo = `{"em":${agora},"p":[${p}]}`
  try {
    await fs.mkdir(path.dirname(f), { recursive: true })
    await fs.writeFile(`${f}.tmp`, corpo, 'utf8')
    await fs.rename(`${f}.tmp`, f)
  } catch (err) {
    log(`[precos-entrada] escrita falhou (${fonte}):`, err instanceof Error ? err.message : err)
  }
}

function razao(e: EstadoFonte, r: string): void {
  e.recusados++
  e.razoes.set(r, (e.razoes.get(r) ?? 0) + 1)
}

function responder(res: ServerResponse, codigo: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo)
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(texto)
}

function lerCorpo(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let total = 0
    const pedacos: Buffer[] = []
    req.on('data', (d: Buffer) => {
      total += d.length
      if (total > CORPO_MAX) { resolve(null); req.destroy(); return }
      pedacos.push(d)
    })
    req.on('end', () => resolve(Buffer.concat(pedacos).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}

async function atenderLote(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const fonte = String(req.headers['x-mtm-fonte'] ?? '').trim()
  const assinatura = String(req.headers['x-mtm-assinatura'] ?? '')
  const segredo = FONTES.get(fonte)
  const corpo = await lerCorpo(req)
  if (corpo == null) { responder(res, 413, { ok: false, erro: 'corpo grande' }); return }
  // Fonte desconhecida e assinatura errada respondem o MESMO: não se diz a ninguém quais os nomes
  // de fonte que existem.
  if (!segredo || !conferirAssinatura(segredo, corpo, assinatura)) {
    log(`[precos-entrada] recusado: assinatura (fonte=${fonte || '?'})`)
    responder(res, 401, { ok: false, erro: 'assinatura' })
    return
  }

  let lote: Lote
  try { lote = JSON.parse(corpo) as Lote } catch { responder(res, 400, { ok: false, erro: 'json' }); return }
  if (lote.fonte !== fonte) { responder(res, 400, { ok: false, erro: 'fonte' }); return }

  const agora = Date.now()
  const e = estadoDe(fonte)
  const veredicto = aceitarLote(lote, agora, e.ultimoSeq, undefined, e.ultimoEmLote)
  if (!veredicto.ok) { razao(e, veredicto.razao); responder(res, 409, { ok: false, erro: veredicto.razao, seq: e.ultimoSeq, em: e.ultimoEmLote }); return }
  e.ultimoSeq = lote.seq
  e.ultimoEmLote = lote.em
  e.lotes++
  e.ultimoLoteEm = agora

  /**
   * O DESVIO DECLARADO — a hora da corretora da fonte, trazida dentro do corpo assinado.
   *
   * Quem mede é o agente (só ele tem a âncora: o `em` que o EA escreve com o relógio da MESMA
   * máquina). Quem APLICA e quem pode recusar é este lado, e é essa a diferença que interessa: o
   * desvio é uma DECLARAÇÃO, não uma instrução. Aqui confere-se que é um múltiplo de 15 minutos
   * dentro de ±14 h, aplica-se, e depois são as guardas de sempre — futuro, velho, recuado, salto,
   * divergência — a julgar o RESULTADO. Um desvio mentiroso só consegue fazer com que os ticks da
   * própria fonte sejam recusados: não há valor de desvio que faça passar um preço implausível.
   *
   * Ausente = 0, para uma fonte cuja corretora já esteja à hora de Greenwich (o terminal do VPS)
   * não ter de declarar nada.
   */
  const desvioMs = lote.desvioMs ?? 0
  if (!desvioPlausivel(desvioMs)) {
    razao(e, 'desvio')
    log(`[precos-entrada] recusado: desvio declarado ${desvioMs} (fonte=${fonte})`)
    responder(res, 400, { ok: false, erro: 'desvio' })
    return
  }
  const ref = await referencias(agora)
  const aceitos: TickEntrada[] = []
  const chaves = new Map<TickEntrada, string>()
  for (const bruto of lote.p as TickEntrada[]) {
    // `t` passa a UTC aqui e só aqui: o ficheiro que se escreve fica indistinguível do do terminal
    // local, e os motores continuam a ler `time_msc` como sempre leram, sem saber de fusos.
    const t: TickEntrada = { s: String(bruto?.s ?? '').trim().toUpperCase(), b: Number(bruto?.b), a: Number(bruto?.a), t: Number(bruto?.t) - desvioMs }
    const chave = canonizar(t.s, MAPA)
    const anteriorTick = e.retrato.get(chave)
    const anterior: Referencia | null = anteriorTick ? { medio: medio(anteriorTick), em: anteriorTick.t } : null
    const v = avaliarTick(t, agora, anterior, ref.get(chave) ?? null)
    if (!v.ok) { razao(e, v.razao); continue }
    aceitos.push(t)
    chaves.set(t, chave)
  }

  if (lote.cheio && aceitos.length) {
    // Fotografia completa: o retrato passa a ser exactamente o que chegou. Um símbolo que saiu do
    // Market Watch tem de desaparecer daqui também — senão ficava eternamente com o último preço.
    e.retrato = new Map(aceitos.map((t) => [chaves.get(t) as string, t]))
  } else {
    for (const t of aceitos) e.retrato.set(chaves.get(t) as string, t)
  }
  e.aceites += aceitos.length
  // O desvio que se MOSTRA é o do último lote que produziu preços, não o último declarado: um lote
  // cujos ticks foram todos recusados não deve mudar o número que o operador lê no estado — senão
  // um lote mentiroso, recusado até ao fim, ficava a pintar o painel.
  if (aceitos.length) {
    if (desvioMs !== e.desvioMs) {
      log(`[precos-entrada] ${fonte}: desvio da corretora ${e.desvioMs / 3_600_000}h → ${desvioMs / 3_600_000}h (${lote.desvioMedicoes ?? 0} medições)`)
    }
    e.desvioMs = desvioMs
    e.desvioMedicoes = Number(lote.desvioMedicoes ?? 0)
  }

  if (aceitos.length) {
    if (agora - e.ultimaEscritaEm >= CFG.escritaMinMs) await escrever(fonte, e, agora)
    else e.porEscrever = true
  }
  responder(res, 200, { ok: true, aceites: aceitos.length, recusados: (lote.p as unknown[]).length - aceitos.length, simbolos: e.retrato.size })
}

/** Idade mediana dos ticks do retrato (já em UTC) — a medida de «a reserva está viva». */
function idadeP50(e: EstadoFonte, agora: number): number | null {
  const idades = [...e.retrato.values()].map((t) => agora - t.t).sort((x, y) => x - y)
  return idades.length ? idades[Math.floor(idades.length / 2)] : null
}

function estadoPublico(agora: number) {
  return {
    ok: true,
    agora,
    fontes: [...estados.entries()].map(([fonte, e]) => ({
      fonte,
      simbolos: e.retrato.size,
      aceites: e.aceites,
      recusados: e.recusados,
      razoes: Object.fromEntries(e.razoes),
      lotes: e.lotes,
      desvioH: e.desvioMs / 3_600_000,
      desvioMedicoes: e.desvioMedicoes,
      idadeLoteS: e.ultimoLoteEm ? Math.round((agora - e.ultimoLoteEm) / 1000) : null,
      // A idade do tick mais fresco do retrato, JÁ em UTC: é isto que diz se a reserva está viva.
      idadeTickMsP50: idadeP50(e, agora),
      ficheiro: ficheiroDe(fonte),
    })),
    referencia: { ficheiro: CFG.referencia || null, simbolos: refPrecos.size },
  }
}

const servidor = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  if (req.method === 'POST' && (url === '/precos-entrada/lote' || url === '/lote')) { void atenderLote(req, res); return }
  if (req.method === 'GET' && (url === '/precos-entrada/estado' || url === '/estado')) {
    if (!CFG.vigia || req.headers['x-mtm-vigia'] !== CFG.vigia) { responder(res, 401, { ok: false }); return }
    responder(res, 200, estadoPublico(Date.now()))
    return
  }
  if (req.method === 'GET' && (url === '/precos-entrada/saude' || url === '/saude')) { responder(res, 200, { ok: true, fontes: estados.size }); return }
  responder(res, 404, { ok: false })
})

// A escrita coalescida precisa de alguém que a feche: um lote isolado dentro da janela de 20 ms
// escrevia só no lote seguinte, e o seguinte pode vir minutos depois (mercado calmo).
const relogio = setInterval(() => {
  const agora = Date.now()
  for (const [fonte, e] of estados) {
    if (e.porEscrever && agora - e.ultimaEscritaEm >= CFG.escritaMinMs) void escrever(fonte, e, agora)
  }
}, Math.max(10, CFG.escritaMinMs))
relogio.unref?.()

if (!FONTES.size) {
  console.error('[precos-entrada] PRECOS_ENTRADA_FONTES vazio: um receptor de preços sem fontes autenticadas não arranca.')
  process.exit(1)
}

servidor.listen(CFG.porta, '127.0.0.1', () => {
  log(`[precos-entrada] a ouvir em 127.0.0.1:${CFG.porta} · fontes: ${[...FONTES.keys()].join(', ')} · raiz ${CFG.raiz}` +
    (CFG.referencia ? ` · referência ${CFG.referencia}` : ' · SEM referência local'))
})

for (const sinal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sinal, () => { servidor.close(); clearInterval(relogio); process.exit(0) })
}
