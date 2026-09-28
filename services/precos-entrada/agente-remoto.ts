/**
 * AGENTE DE PREÇOS DE UM TERMINAL REMOTO — corre na máquina do terminal (o Mac do Ricardo).
 *
 * Lê o `ticks.json` que o EA `MTMConector` já publica ali ao lado (o MESMO EA do VPS, sem uma linha
 * alterada), e entrega ao receptor do VPS o que mudou — assinado. O receptor escreve o ficheiro que
 * os motores já lêem, e a partir daí o Mac é apenas mais uma raiz de ticks: ganha quando o seu tick
 * for o mais fresco, perde quando não for. Ver o cabeçalho de `receptor.ts` para o desenho todo.
 *
 * O que este processo NUNCA faz: negociar, ler contas, ou tocar no terminal. Lê um ficheiro e faz
 * um POST. Se morrer, o VPS continua exactamente como estava — isto é reserva, não dependência.
 *
 * ── DUAS COISAS QUE SE APRENDERAM NA PRIMEIRA LIGAÇÃO REAL (28/09/2026) ──────────────────────
 *
 * 1. **A hora da corretora do Mac está 3 h à frente** (GMT+3; a do VPS calha estar em Greenwich).
 *    Os primeiros 5741 ticks foram todos recusados por «futuro» — e bem: a guarda não se afrouxa.
 *    Mede-se o desvio aqui, nos ticks que MUDARAM (esses são de agora, por construção), declara-se
 *    no lote assinado, e é o receptor que o confere e aplica. Ver `lib/precos-entrada/desvio.ts`.
 *
 *    Porque a medição vive AQUI e a aplicação vive LÁ: a âncora (`em`, a hora UTC da máquina do
 *    terminal) só existe neste lado, e a detecção de «este tick mudou» exige comparar leituras
 *    consecutivas do ficheiro — coisas que o receptor nunca vê. Mas quem mede não deve ser quem se
 *    acredita: o desvio viaja como DECLARAÇÃO dentro do corpo assinado, o receptor recusa-o se não
 *    for um múltiplo de 15 min dentro de ±14 h, e depois são as guardas de sempre a julgar o
 *    resultado. Um desvio errado só consegue que os nossos próprios ticks sejam recusados.
 *
 * 2. **O ficheiro desaparece entre escritas.** O EA escreve `.tmp`, APAGA o destino e só depois
 *    renomeia (`EscreverAtomico`), por isso a cada 50 ms há uma janela em que `ticks.json` não
 *    existe. Uma leitura única falhava nessa janela muitas vezes por segundo. Relê-se algumas vezes
 *    com uma pausa mínima — a janela dura menos de um milissegundo.
 *
 * Variáveis (ver o README do deploy):
 *   PRECOS_AGENTE_URL      https://stream.morethanmoney.pt/precos-entrada/lote
 *   PRECOS_AGENTE_FONTE    mac-ricardo
 *   PRECOS_AGENTE_SEGREDO  (o mesmo que está em PRECOS_ENTRADA_FONTES no VPS)
 *   PRECOS_AGENTE_TICKS    caminho do ticks.json do terminal
 *   PRECOS_AGENTE_RITMO_MS 50   · PRECOS_AGENTE_REENVIO_MS 5000
 */
import { promises as fs } from 'node:fs'
import { assinar } from '../../lib/precos-entrada/assinatura'
import { Desvio, ancoraValida } from '../../lib/precos-entrada/desvio'
import { lerFicheiroEa, montarLote, OPCOES_LOTE } from '../../lib/precos-entrada/lote'

const CFG = {
  url: process.env.PRECOS_AGENTE_URL ?? '',
  fonte: process.env.PRECOS_AGENTE_FONTE ?? '',
  segredo: process.env.PRECOS_AGENTE_SEGREDO ?? '',
  ticks: process.env.PRECOS_AGENTE_TICKS ?? '',
  ritmoMs: Math.max(20, Number(process.env.PRECOS_AGENTE_RITMO_MS ?? 50)),
  reenvioMs: Math.max(1_000, Number(process.env.PRECOS_AGENTE_REENVIO_MS ?? OPCOES_LOTE.reenvioMs)),
  tempoLimiteMs: Math.max(500, Number(process.env.PRECOS_AGENTE_TEMPO_LIMITE_MS ?? 2_000)),
  /** tentativas de leitura antes de dar o ficheiro por ilegível (janela do rename do EA) */
  tentativas: Math.max(1, Number(process.env.PRECOS_AGENTE_TENTATIVAS ?? 4)),
}

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

if (!CFG.url || !CFG.fonte || CFG.segredo.length < 32 || !CFG.ticks) {
  console.error('[precos-agente] falta URL, fonte, segredo (≥32 caracteres) ou caminho dos ticks.')
  process.exit(1)
}

const enviados = new Map<string, number>()
/** O que se VIU na leitura anterior — separado de `enviados`: é isto que diz «este tick mudou». */
const vistos = new Map<string, number>()
const desvio = new Desvio()
let ultimoCheioEm = 0
// A sequência tem de SUBIR mesmo entre arranques do agente: um agente reiniciado a começar em 1
// ficava para sempre abaixo do último `seq` que o receptor viu, e nada dele entrava. Ancorar no
// relógio resolve-o sem guardar estado em disco.
let seq = Date.now()
let esperaErroMs = 0
const avisos = new Map<string, number>()
let lotes = 0
let ticksEnviados = 0
let falhas = 0
let leiturasFalhadas = 0
let rotacoes = 0

/**
 * Ler o ficheiro do EA, contando com ele não existir por um instante.
 *
 * A janela entre o `FileDelete` e o `FileMove` do EA é sub-milissegundo, mas acontece 20 vezes por
 * segundo: sem retentativas perdia-se uma boa parte das leituras (medido em produção: centenas de
 * «não se lê» entre envios bons). Um `.tmp` a meio de escrita NUNCA se lê — só o destino, que é
 * sempre um ficheiro completo.
 */
async function lerTicks(): Promise<string | null> {
  for (let i = 0; i < CFG.tentativas; i++) {
    try {
      const bruto = await fs.readFile(CFG.ticks, 'utf8')
      if (bruto) {
        if (i > 0) rotacoes++
        return bruto
      }
    } catch {
      /* apanhado na rotação, ou mesmo em falta: tenta outra vez */
    }
    await new Promise((r) => setTimeout(r, 2))
  }
  leiturasFalhadas++
  return null
}

async function umaVolta(): Promise<void> {
  const bruto = await lerTicks()
  if (bruto == null) { avisar('ficheiro', 'ticks.json não se lê nem após retentativas (terminal fechado ou EA parado?)'); return }
  const { em: ancora, ticks: foto } = lerFicheiroEa(bruto)
  if (!foto.length) { avisar('vazio', 'ticks.json sem cotações (Market Watch vazio?)'); return }

  const agora = Date.now()

  // ── A medição do desvio: só nos ticks que MUDARAM desde a leitura anterior ─────────────────
  // Um tick que mudou foi escrito há milissegundos, por isso `t − em` é o desvio e mais nada. Um
  // tick parado não diz nada sobre o desvio — diz sobre a idade dele, e confundir as duas coisas
  // era o caminho que ressuscitava a cotação do fecho de sexta (ver desvio.ts).
  const podeMedir = ancoraValida(ancora, agora)
  if (!podeMedir && ancora != null) {
    avisar('ancora', `o «em» do ficheiro está a ${Math.round((agora - (ancora ?? 0)) / 1000)} s do nosso relógio: o EA parou de escrever ou o campo é lixo`)
  }
  for (const t of foto) {
    const anterior = vistos.get(t.s)
    vistos.set(t.s, t.t)
    if (anterior === t.t) continue
    if (podeMedir && ancora != null) desvio.medir(t.t, ancora)
  }

  const desvioMs = desvio.valor
  if (desvioMs == null) {
    // Sem uma única medição não se manda nada: seria mandar uma suposição sobre a hora, e é a hora
    // que decide se um preço pode mexer um stop. Em mercado aberto isto resolve-se no primeiro tick.
    avisar('semdesvio', 'à espera do primeiro tick que mude para medir o desvio da corretora (mercado fechado?)')
    return
  }

  const envio = montarLote(foto, enviados, agora, ultimoCheioEm, { ...OPCOES_LOTE, reenvioMs: CFG.reenvioMs })
  if (!envio) return

  seq = Math.max(seq + 1, agora)
  const corpo = JSON.stringify({
    fonte: CFG.fonte,
    seq,
    em: agora,
    cheio: envio.cheio,
    desvioMs,
    desvioMedicoes: desvio.quantas,
    p: envio.ticks,
  })
  try {
    const r = await fetch(CFG.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mtm-fonte': CFG.fonte,
        'x-mtm-assinatura': assinar(CFG.segredo, corpo),
      },
      body: corpo,
      signal: AbortSignal.timeout(CFG.tempoLimiteMs),
    })
    if (!r.ok) {
      falhas++
      avisar('resposta', `receptor respondeu ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
      recuar()
      return
    }
    // Só depois de o pedido correr bem é que estes ticks contam como entregues: um lote perdido
    // tem de voltar no seguinte, e não voltava se marcássemos antes.
    for (const t of envio.ticks) enviados.set(t.s, t.t)
    if (envio.cheio) ultimoCheioEm = agora
    lotes++
    ticksEnviados += envio.ticks.length
    esperaErroMs = 0
  } catch (e) {
    falhas++
    avisar('post', `POST falhou: ${e instanceof Error ? e.message : e}`)
    recuar()
  }
}

/** Rede em baixo não se martela: espera a dobrar até 5 s, e volta ao ritmo assim que passar. */
function recuar(): void {
  esperaErroMs = Math.min(5_000, esperaErroMs ? esperaErroMs * 2 : 250)
}

/** Um aviso de cada tipo por 30 s: o mercado tem 20 leituras por segundo e um log cheio não se lê. */
function avisar(tipo: string, m: string): void {
  const agora = Date.now()
  if (agora - (avisos.get(tipo) ?? 0) < 30_000) return
  avisos.set(tipo, agora)
  log('[precos-agente]', m)
}

async function correr(): Promise<void> {
  log(`[precos-agente] fonte ${CFG.fonte} → ${CFG.url} · ${CFG.ticks} a cada ${CFG.ritmoMs} ms (cheio a cada ${CFG.reenvioMs} ms)`)
  for (;;) {
    const inicio = Date.now()
    await umaVolta()
    const gasto = Date.now() - inicio
    await new Promise((r) => setTimeout(r, Math.max(5, CFG.ritmoMs - gasto) + esperaErroMs))
  }
}

setInterval(() => {
  const d = desvio.valor
  log(
    `[precos-agente] ${lotes} lotes, ${ticksEnviados} ticks, ${falhas} falhas de envio, ` +
      `${leiturasFalhadas} leituras perdidas, ${rotacoes} apanhadas na rotação, ${enviados.size} símbolos, ` +
      `desvio ${d == null ? 'sem medição' : `${d / 3_600_000}h`} (${desvio.quantas} medições)`,
  )
}, 300_000).unref?.()

void correr()
