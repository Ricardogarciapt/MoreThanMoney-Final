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
 * Variáveis (ficheiro `~/.mtm-precos-agente.env`, ver o README do deploy):
 *   PRECOS_AGENTE_URL      https://stream.morethanmoney.pt/precos-entrada/lote
 *   PRECOS_AGENTE_FONTE    mac-ricardo
 *   PRECOS_AGENTE_SEGREDO  (o mesmo que está em PRECOS_ENTRADA_FONTES no VPS)
 *   PRECOS_AGENTE_TICKS    caminho do ticks.json do terminal
 *   PRECOS_AGENTE_RITMO_MS 50   · PRECOS_AGENTE_REENVIO_MS 5000
 */
import { promises as fs } from 'node:fs'
import { assinar } from '../../lib/precos-entrada/assinatura'
import { lerTicksBrutos, montarLote, OPCOES_LOTE } from '../../lib/precos-entrada/lote'

const CFG = {
  url: process.env.PRECOS_AGENTE_URL ?? '',
  fonte: process.env.PRECOS_AGENTE_FONTE ?? '',
  segredo: process.env.PRECOS_AGENTE_SEGREDO ?? '',
  ticks: process.env.PRECOS_AGENTE_TICKS ?? '',
  ritmoMs: Math.max(20, Number(process.env.PRECOS_AGENTE_RITMO_MS ?? 50)),
  reenvioMs: Math.max(1_000, Number(process.env.PRECOS_AGENTE_REENVIO_MS ?? OPCOES_LOTE.reenvioMs)),
  tempoLimiteMs: Math.max(500, Number(process.env.PRECOS_AGENTE_TEMPO_LIMITE_MS ?? 2_000)),
}

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

if (!CFG.url || !CFG.fonte || CFG.segredo.length < 32 || !CFG.ticks) {
  console.error('[precos-agente] falta URL, fonte, segredo (≥32 caracteres) ou caminho dos ticks.')
  process.exit(1)
}

const enviados = new Map<string, number>()
let ultimoCheioEm = 0
// A sequência tem de SUBIR mesmo entre arranques do agente: um agente reiniciado a começar em 1
// ficava para sempre abaixo do último `seq` que o receptor viu, e nada dele entrava. Ancorar no
// relógio resolve-o sem guardar estado em disco.
let seq = Date.now()
let esperaErroMs = 0
let ultimoAvisoEm = 0
let lotes = 0
let ticksEnviados = 0
let falhas = 0

async function umaVolta(): Promise<void> {
  let bruto: string
  try {
    bruto = await fs.readFile(CFG.ticks, 'utf8')
  } catch {
    avisar('ticks.json não se lê (terminal fechado ou EA parado?)')
    return
  }
  const foto = lerTicksBrutos(bruto)
  if (!foto.length) { avisar('ticks.json sem cotações'); return }

  const agora = Date.now()
  const envio = montarLote(foto, enviados, agora, ultimoCheioEm, { ...OPCOES_LOTE, reenvioMs: CFG.reenvioMs })
  if (!envio) return

  seq = Math.max(seq + 1, agora)
  const corpo = JSON.stringify({ fonte: CFG.fonte, seq, em: agora, cheio: envio.cheio, p: envio.ticks })
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
      avisar(`receptor respondeu ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`)
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
    avisar(`POST falhou: ${e instanceof Error ? e.message : e}`)
    recuar()
  }
}

/** Rede em baixo não se martela: espera a dobrar até 5 s, e volta ao ritmo assim que passar. */
function recuar(): void {
  esperaErroMs = Math.min(5_000, esperaErroMs ? esperaErroMs * 2 : 250)
}

/** Um aviso por 30 s: o mercado tem 20 leituras por segundo e um log cheio não se lê. */
function avisar(m: string): void {
  const agora = Date.now()
  if (agora - ultimoAvisoEm < 30_000) return
  ultimoAvisoEm = agora
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
  log(`[precos-agente] ${lotes} lotes, ${ticksEnviados} ticks, ${falhas} falhas, ${enviados.size} símbolos`)
}, 300_000).unref?.()

void correr()
