/**
 * A CADEIA INTEIRA, NA MESMA MÁQUINA — EA → agente → receptor → ficheiro que o motor lê.
 *
 * Isto não é um teste de unidade: levanta o receptor e o agente como processos, escreve um
 * `ticks.json` a fingir de EA e vai ver se o ficheiro do outro lado aparece com o preço certo. É o
 * que prova que as peças encaixam — e é também o ensaio que se corre no Mac antes de apontar o
 * agente ao VPS. O que fica de fora é só o transporte real (TLS + nginx).
 *
 * Correr: npx tsx services/precos-entrada/cadeia.e2e.check.ts
 */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assinar } from '../../lib/precos-entrada/assinatura'

/** O MT5 do Mac carimba os ticks na hora do servidor da corretora — no caso real, GMT+3. */
const DESVIO_CORRETORA_MS = 3 * 3_600_000

const SEGREDO = 'ensaio'.repeat(8) // 48 caracteres
const FONTE = 'mac-ensaio'
const PORTA = 8799
const URL = `http://127.0.0.1:${PORTA}/precos-entrada/lote`
const raizProjeto = path.resolve(__dirname, '..', '..')

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function ate<T>(o: string, f: () => Promise<T | null>, limiteMs = 15_000): Promise<T> {
  const fim = Date.now() + limiteMs
  for (;;) {
    const v = await f().catch(() => null)
    if (v) return v
    if (Date.now() > fim) throw new Error(`esgotou a espera: ${o}`)
    await esperar(150)
  }
}

function levantar(ficheiro: string, env: Record<string, string>, ouvir?: (t: string) => void): ChildProcess {
  // `detached` para se poder matar o GRUPO: o `npx` é o pai do `tsx`, e matar só o pai deixava o
  // receptor a segurar a porta — o ensaio seguinte rebentava com EADDRINUSE.
  const p = spawn('npx', ['tsx', ficheiro], { cwd: raizProjeto, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  p.stdout?.on('data', (d) => { ouvir?.(String(d)); process.stdout.write(`  · ${d}`) })
  p.stderr?.on('data', (d) => { ouvir?.(String(d)); process.stderr.write(`  ! ${d}`) })
  return p
}

async function correr(): Promise<void> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'mtm-cadeia-'))
  const ticksLocais = path.join(base, 'terminal', 'MQL5', 'Files', 'mtm-conector', 'ticks.json')
  const destino = path.join(base, 'entrada', FONTE, 'MQL5', 'Files', 'mtm-conector', 'ticks.json')
  await fs.mkdir(path.dirname(ticksLocais), { recursive: true })

  const receptor = levantar('services/precos-entrada/receptor.ts', {
    PRECOS_ENTRADA_PORTA: String(PORTA),
    PRECOS_ENTRADA_RAIZ: path.join(base, 'entrada'),
    PRECOS_ENTRADA_FONTES: `${FONTE}:${SEGREDO}`,
    PRECOS_ENTRADA_REFERENCIA: '',
    PRECOS_ENTRADA_SEGREDO_VIGIA: SEGREDO,
  })
  let logAgente = ''
  const agente = levantar('services/precos-entrada/agente-remoto.ts', {
    PRECOS_AGENTE_URL: URL,
    PRECOS_AGENTE_FONTE: FONTE,
    PRECOS_AGENTE_SEGREDO: SEGREDO,
    PRECOS_AGENTE_TICKS: ticksLocais,
    PRECOS_AGENTE_RITMO_MS: '50',
  }, (t) => { logAgente += t })

  // O «EA»: carimba +3 h como o MT5 do Mac (GMT+3) e escreve como o EA escreve — `.tmp`, APAGA o
  // destino, renomeia. É essa janela sem ficheiro, 20 vezes por segundo, que fazia o agente perder
  // leituras às centenas; o ensaio só prova a retentativa se a reproduzir.
  let bid = 4286.0
  const escreverEa = async () => {
    const em = Date.now()
    const corpo = JSON.stringify({ em, p: [{ s: 'XAUUSD.s', b: bid, a: bid + 0.4, t: em + DESVIO_CORRETORA_MS }] })
    await fs.writeFile(`${ticksLocais}.tmp`, corpo, 'utf8')
    await fs.rm(ticksLocais, { force: true })
    await fs.rename(`${ticksLocais}.tmp`, ticksLocais)
  }
  const ea = setInterval(() => void escreverEa().catch(() => undefined), 50)

  try {
    await ate('receptor de pé', async () => (await fetch(`http://127.0.0.1:${PORTA}/precos-entrada/saude`)).ok || null)

    const lido = await ate('ficheiro do receptor', async () => {
      const bruto = await fs.readFile(destino, 'utf8')
      const j = JSON.parse(bruto) as { p: Array<{ s: string; b: number; t: number }> }
      return j.p.find((x) => x.s.startsWith('XAUUSD')) ?? null
    })
    assert.equal(lido.b, 4286.0, 'o preço do «Mac» tem de chegar ao ficheiro que o motor lê')
    assert.equal(lido.s, 'XAUUSD.S', 'o nome da corretora viaja intacto; canonizar é do motor')

    /**
     * A CORRECÇÃO DA HORA, que é o que fazia isto ser inútil como reserva: o EA carimba +3 h e o
     * ficheiro que o motor lê tem de ficar em UTC. Sem isto, 100 % dos ticks eram recusados por
     * «futuro» (medido em produção a 28/09: 5741 recusas, zero aceites).
     */
    const idade = Date.now() - lido.t
    assert.ok(idade >= -5_000 && idade <= 10_000, `o tick tem de ficar à hora de agora, não +3 h (idade ${idade} ms)`)

    // E acompanha o movimento.
    bid = 4290.0
    await ate('preço a acompanhar', async () => {
      const j = JSON.parse(await fs.readFile(destino, 'utf8')) as { p: Array<{ s: string; b: number }> }
      return j.p.some((x) => x.b === 4290.0) || null
    })

    // ── E agora as trancas, com o receptor já a trabalhar ──────────────────
    const corpo = JSON.stringify({ fonte: FONTE, seq: Date.now(), em: Date.now(), p: [{ s: 'XAUUSD', b: 9999, a: 9999.4, t: Date.now() }] })
    const semAssinatura = await fetch(URL, { method: 'POST', headers: { 'x-mtm-fonte': FONTE }, body: corpo })
    assert.equal(semAssinatura.status, 401, 'sem assinatura não entra')
    const maAssinatura = await fetch(URL, { method: 'POST', headers: { 'x-mtm-fonte': FONTE, 'x-mtm-assinatura': assinar('x'.repeat(48), corpo) }, body: corpo })
    assert.equal(maAssinatura.status, 401, 'segredo errado não entra')
    const outraFonte = await fetch(URL, { method: 'POST', headers: { 'x-mtm-fonte': 'inventada', 'x-mtm-assinatura': assinar(SEGREDO, corpo) }, body: corpo })
    assert.equal(outraFonte.status, 401, 'fonte que não existe não entra')

    // Um lote legítimo, e a REPETIÇÃO desse lote.
    const cab = { 'content-type': 'application/json', 'x-mtm-fonte': FONTE, 'x-mtm-assinatura': assinar(SEGREDO, corpo) }
    const bom = await fetch(URL, { method: 'POST', headers: cab, body: corpo })
    const respostaBom = (await bom.json()) as { ok: boolean; aceites: number; recusados: number }
    assert.equal(bom.status, 200)
    // O preço absurdo (9999 com o anterior a 4290) tem de ser recusado pela sanidade, mesmo vindo
    // bem assinado: a assinatura prova a autoria, não a verdade.
    assert.equal(respostaBom.aceites, 0, 'salto absurdo não entra nem assinado')
    assert.equal(respostaBom.recusados, 1)

    const repetido = await fetch(URL, { method: 'POST', headers: cab, body: corpo })
    assert.equal(repetido.status, 409, 'o mesmo lote outra vez é recusado (sequência)')

    // ── O desvio é uma DECLARAÇÃO, e o receptor recusa-a ───────────────────
    let seqEnsaio = Date.now()
    const comDesvio = (desvioMs: number, tCorretora: number) => {
      const c = JSON.stringify({ fonte: FONTE, seq: ++seqEnsaio, em: Date.now(), desvioMs, p: [{ s: 'XAUUSD.s', b: 4290.0, a: 4290.4, t: tCorretora }] })
      return { c, cab: { 'content-type': 'application/json', 'x-mtm-fonte': FONTE, 'x-mtm-assinatura': assinar(SEGREDO, c) } }
    }
    // Um desvio que não é múltiplo de 15 min não é um fuso, é uma tentativa.
    const torto = comDesvio(37 * 60_000 + 13, Date.now())
    assert.equal((await fetch(URL, { method: 'POST', headers: torto.cab, body: torto.c })).status, 400, 'desvio torto recusado')
    const enorme = comDesvio(20 * 3_600_000, Date.now())
    assert.equal((await fetch(URL, { method: 'POST', headers: enorme.cab, body: enorme.c })).status, 400, 'desvio fora do mundo recusado')

    /**
     * E O CASO QUE IMPORTA: um desvio MENTIROSO, bem assinado. Declara −3 h para um tick já
     * carimbado +3 h — a normalização atira o tick 6 h para o futuro e as guardas de sempre
     * recusam-no. Não há valor de desvio que faça passar um preço implausível: é isso que permite
     * ao agente medir e ao receptor não ter de acreditar.
     */
    const mentira = comDesvio(-3 * 3_600_000, Date.now() + DESVIO_CORRETORA_MS)
    const rm = await fetch(URL, { method: 'POST', headers: mentira.cab, body: mentira.c })
    assert.equal(rm.status, 200, 'o lote é válido — a mentira está no conteúdo')
    assert.equal(((await rm.json()) as { aceites: number }).aceites, 0, 'um desvio mentiroso não faz passar nada')

    // O ficheiro NÃO pode ter o preço absurdo.
    const final = JSON.parse(await fs.readFile(destino, 'utf8')) as { p: Array<{ b: number }> }
    assert.ok(!final.p.some((x) => x.b === 9999), 'o preço recusado não pode estar no ficheiro')

    // O estado só se vê com o segredo da vigia.
    assert.equal((await fetch(`http://127.0.0.1:${PORTA}/precos-entrada/estado`)).status, 401)
    const estado = await fetch(`http://127.0.0.1:${PORTA}/precos-entrada/estado`, { headers: { 'x-mtm-vigia': SEGREDO } })
    assert.equal(estado.status, 200)
    const j = (await estado.json()) as { fontes: Array<{ fonte: string; aceites: number; recusados: number; desvioH: number; desvioMedicoes: number; idadeTickMsP50: number | null }> }
    assert.equal(j.fontes[0].fonte, FONTE)
    assert.ok(j.fontes[0].aceites > 0)
    assert.ok(j.fontes[0].recusados > 0)
    // O desvio tem de estar MEDIDO e visível a quem for ver o estado no VPS.
    assert.equal(j.fontes[0].desvioH, 3, 'o receptor mostra o desvio que a fonte declarou')
    assert.ok(j.fontes[0].desvioMedicoes > 0)
    assert.ok((j.fontes[0].idadeTickMsP50 ?? 1e9) < 10_000, 'e os ticks do retrato estão frescos em UTC')

    /**
     * A JANELA DO RENAME. O EA apaga o destino antes de renomear, 20 vezes por segundo: sem
     * retentativas o agente dava o ficheiro por ilegível às centenas entre envios bons. Com o
     * «EA» deste ensaio a escrever assim todo o tempo, não pode haver um único aviso depois de a
     * cadeia estar a andar.
     */
    const desde = logAgente.length
    bid = 4291.0
    await ate('mais um preço', async () => {
      const j = JSON.parse(await fs.readFile(destino, 'utf8')) as { p: Array<{ b: number }> }
      return j.p.some((x) => x.b === 4291.0) || null
    })
    await esperar(1_000)
    const avisos = (logAgente.slice(desde).match(/não se lê/g) ?? []).length
    assert.equal(avisos, 0, `o agente não pode perder leituras na rotação do ficheiro (${avisos} avisos)`)

    console.log('cadeia.e2e: ok')
  } finally {
    clearInterval(ea)
    for (const p of [agente, receptor]) {
      try { if (p.pid) process.kill(-p.pid, 'SIGKILL') } catch { p.kill('SIGKILL') }
    }
    await fs.rm(base, { recursive: true, force: true }).catch(() => undefined)
  }
}

void correr().catch((e) => {
  console.error(e)
  process.exit(1)
})
