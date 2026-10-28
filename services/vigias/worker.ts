/**
 * MTM VIGIAS — processo longo do VPS que corre os monitores que eram crons de 1 min na Vercel.
 *
 *  · Só corre as tarefas listadas em VIGIAS_TAREFAS (vírgulas; `todas` = lista completa). Começa-se
 *    por uma, vê-se o pulso, junta-se a seguinte.
 *  · Cada tarefa corre de VIGIAS_INTERVALO_MS em VIGIAS_INTERVALO_MS (omissão 10 s), sem sobreposição:
 *    se a anterior ainda não acabou, a passagem salta.
 *  · Pulso em servicos_pulso ('mtm-vigias') de 30 em 30 s, com o estado de cada tarefa. É esse pulso
 *    que faz o cron da Vercel da mesma tarefa sair sem trabalhar (lib/vigias/delegacao.ts) — nunca
 *    correm os dois.
 *  · Os interruptores de sempre (site_settings.mtmcopy_exec_switches, funis_motor_ligado, …) são
 *    lidos pelas próprias funções, tal como na Vercel.
 *
 * Build (no Mac ou aqui):
 *   node_modules/.bin/esbuild services/vigias/worker.ts --bundle --platform=node --target=node18 --outfile=/tmp/vigias.js
 */
import { hostname } from 'node:os'
import { getSupabaseAdmin } from '../../lib/supabase-admin-client'
import { emSegundoPlano } from '../../lib/mtmcopy/metaapi-quota'
import { correrGestaoAutoDeTodas } from '../../lib/webtrader/gestao-auto-servidor'
import { runT2TPriceMonitor } from '../../lib/mtmcopy/t2t-price-monitor'
import { runSignalTracker } from '../../lib/mtmcopy/signal-tracker'
import { runPremiumZoneMonitor } from '../../lib/mtmcopy/premium-zone-monitor'
import { runPremiumPriceMonitor } from '../../lib/mtmcopy/premium-price-monitor'
import { runPerpsPositionMonitor } from '../../lib/mtmcopy/perps-position-monitor'
import { publicarTodasAsMestres } from '../../lib/mestres/servidor/publicar'
import { correrPercursos } from '../../lib/funis-motor'
import { bracosReais, motorLigado } from '../../lib/funis-bracos'
import { pollMasterAccounts } from '../../lib/mtmcopy/master-poll'
import { correrTrader, registarDecisoesNoLivro } from '../../lib/agentes/trader'
import { correrAgenteCripto } from '../../lib/cripto/ciclo'
import { SERVICO_VIGIAS, TAREFAS_VIGIAS, type EstadoTarefa, type TarefaVigia } from '../../lib/vigias/tarefas'

const VERSAO = 'vigias-008'

const CORRER: Record<TarefaVigia, () => Promise<unknown>> = {
  'webtrader-gestao-auto': () => correrGestaoAutoDeTodas(),
  't2t-price-monitor': () => emSegundoPlano(() => runT2TPriceMonitor()),
  'signal-tracker': () => emSegundoPlano(() => runSignalTracker()),
  'premium-zone-monitor': () => runPremiumZoneMonitor(),
  'premium-price-monitor': () => emSegundoPlano(() => runPremiumPriceMonitor()),
  'perps-position-monitor': () => runPerpsPositionMonitor(),
  'mestre-publicar': () => publicarTodasAsMestres(),
  funis: async () => ((await motorLigado()) ? correrPercursos(bracosReais) : { ligado: false }),
  'mtmcopy-master-poll': () => pollMasterAccounts(),
  // Só escreve no livro quando abriu alguma coisa: uma linha por minuto a dizer «nada» enchia o
  // livro sem informar. A passagem diária (cron agentes, 06:00) continua a registar sempre.
  'agente-trader': async () => {
    const db = getSupabaseAdmin()
    const r = await correrTrader(db)
    if (r.abertas.length) await registarDecisoesNoLivro(db, r)
    return r
  },
  'agente-cripto': () => correrAgenteCripto(getSupabaseAdmin()),
}

/** Os mesmos ritmos mínimos da Vercel onde o trabalho é caro (master-poll era de 2 em 2 min). */
const INTERVALO_MIN_MS: Partial<Record<TarefaVigia, number>> = {
  'mtmcopy-master-poll': 120_000,
  'mestre-publicar': 60_000,
  funis: 60_000,
  'agente-trader': 60_000,
  // Velas de 5 min: de minuto a minuto chega. O GeckoTerminal aceita ~30 pedidos/min.
  'agente-cripto': 60_000,
}

function log(...a: unknown[]) {
  console.log(new Date().toISOString(), ...a)
}

function tarefasPedidas(): TarefaVigia[] {
  const bruto = (process.env.VIGIAS_TAREFAS ?? '').trim()
  if (bruto === 'todas') return [...TAREFAS_VIGIAS]
  const pedidas = bruto.split(',').map((s) => s.trim()).filter(Boolean)
  const desconhecidas = pedidas.filter((p) => !(TAREFAS_VIGIAS as readonly string[]).includes(p))
  if (desconhecidas.length) log('[vigias] tarefas desconhecidas ignoradas:', desconhecidas.join(', '))
  return pedidas.filter((p): p is TarefaVigia => (TAREFAS_VIGIAS as readonly string[]).includes(p))
}

const estado: Partial<Record<TarefaVigia, EstadoTarefa>> = {}
const aCorrer = new Set<TarefaVigia>()
let parar = false

async function passagem(nome: TarefaVigia) {
  if (aCorrer.has(nome) || parar) return
  aCorrer.add(nome)
  const t0 = Date.now()
  let erro: string | null = null
  try {
    await CORRER[nome]()
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e)
    log(`[${nome}] erro:`, erro)
  } finally {
    aCorrer.delete(nome)
    const anterior = estado[nome]
    estado[nome] = { ultima: new Date().toISOString(), ms: Date.now() - t0, erro, passagens: (anterior?.passagens ?? 0) + 1 }
  }
}

async function pulso() {
  const { error } = await getSupabaseAdmin()
    .from('servicos_pulso')
    .upsert(
      { servico: SERVICO_VIGIAS, host: process.env.HOSTNAME ?? hostname(), versao: VERSAO, estado: { tarefas: estado }, em: new Date().toISOString() },
      { onConflict: 'servico' },
    )
  if (error) log('[pulso] servicos_pulso:', error.message)
}

function main() {
  const tarefas = tarefasPedidas()
  const base = Math.max(5_000, Number(process.env.VIGIAS_INTERVALO_MS) || 10_000)
  log(`[vigias] ${VERSAO} · ${tarefas.length ? tarefas.join(', ') : 'nenhuma tarefa (VIGIAS_TAREFAS vazio)'} · ${base} ms`)

  const timers: NodeJS.Timeout[] = []
  for (const nome of tarefas) {
    const ms = Math.max(base, INTERVALO_MIN_MS[nome] ?? 0)
    void passagem(nome)
    timers.push(setInterval(() => void passagem(nome), ms))
  }
  void pulso()
  timers.push(setInterval(() => void pulso().catch((e) => log('[pulso]', e)), 30_000))

  const sair = () => {
    parar = true
    timers.forEach(clearInterval)
    log('[vigias] a sair')
    // Pulso «parado» para a Vercel assumir já, sem esperar que envelheça.
    getSupabaseAdmin()
      .from('servicos_pulso')
      .upsert({ servico: SERVICO_VIGIAS, host: process.env.HOSTNAME ?? hostname(), versao: VERSAO, estado: { tarefas: {} }, em: new Date().toISOString() }, { onConflict: 'servico' })
      .then(() => process.exit(0), () => process.exit(0))
    setTimeout(() => process.exit(0), 5_000).unref()
  }
  process.on('SIGTERM', sair)
  process.on('SIGINT', sair)
}

main()
