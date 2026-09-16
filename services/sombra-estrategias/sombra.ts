/**
 * SOMBRA DAS ESTRATÉGIAS — corrida diária na VPS (systemd timer, 06:30 UTC). Não abre nada.
 *
 * Para cada estratégia em sombra (hoje só o MTM Scanner): lê as entradas dos últimos dias, decide
 * quais TERIAM passado o gate do webhook, repete-as em velas M15 do TradingView com a gestão actual
 * (`configDoProvider`) e grava UMA linha por dia em `estrategia_sombra_dia` — tudo num único upsert.
 * Código de medição partilhado com o estudo do histórico: lib/mtmauto/sombra.
 *
 *   node sombra.js                      # os últimos 3 dias fechados (D-3..D-1), salta os já definitivos
 *   node sombra.js --dias 5
 *   node sombra.js --desde 2026-07-12   # preenche o histórico (continua a ser um upsert só)
 *   node sombra.js --seco               # mede e imprime, não escreve
 *
 * PORQUÊ NA VPS E NÃO NA VERCEL: as velas vêm do websocket não-oficial do TradingView
 * (./tvfeed.cjs, o cliente do MCP). Na VPS corre em Node sem limite de tempo, num IP fixo que já fala
 * com serviços externos, e uma falha fica no journal; numa função da Vercel seria um websocket
 * longo (15 símbolos, ~1 min) dentro de um limite de execução, a partir de IPs partilhados.
 *
 * CARGA NO SUPABASE: 3 leituras pequenas (provider, regras, interruptores) + as entradas dos dias
 * pedidos (+5 dias antes, para a exposição contar as posições que vinham de trás) + 1 leitura dos
 * dias já definitivos + 1 escrita. Construir e instalar: deploy/vps-stream/sombra-estrategias/README.md
 */
import { DEFAULT_SIGNAL_RULES, type SignalRules } from '../../lib/mtmcopy/signal-rules'
import type { Vela } from '../../lib/estudos/replay-velas'
import { medirSombra } from '../../lib/mtmauto/sombra/correr'
import {
  ALERT_NAME_SCANNER, SLUG_SCANNER, configDoProvider, descreverGestao, diaUtc, linhasPorDia,
  type Interruptores, type LinhaSinal,
} from '../../lib/mtmauto/sombra/scanner'

interface TvFeed {
  getHistory(o: { symbol: string; interval: string; nBars: number; timeoutMs?: number }): Promise<{ bars: { time: number; open: number; high: number; low: number; close: number }[] }>
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tvfeed = require('./tvfeed.cjs') as TvFeed

const env = (k: string) => process.env[k]?.trim() ?? ''
const URL_SB = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL')
const KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null)
const SECO = process.argv.includes('--seco')
const DIA_MS = 86_400_000
/**
 * Dias antes do primeiro dia medido que se lêem só para a exposição. A janela do replay é de 288
 * VELAS (3 dias de mercado), e as velas saltam o fim-de-semana: uma trade de quinta pode estar
 * aberta na terça. 5 dias de calendário cobrem isso.
 */
const ARRASTO_DIAS = 5

async function rest<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${URL_SB}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!r.ok) throw new Error(`supabase ${r.status} em ${caminho.split('?')[0]}: ${(await r.text()).slice(0, 300)}`)
  const txt = await r.text()
  return (txt ? JSON.parse(txt) : null) as T
}

async function lerSinais(desde: string, ate: string): Promise<LinhaSinal[]> {
  const out: LinhaSinal[] = []
  for (let pagina = 0; ; pagina++) {
    const q = new URLSearchParams({
      select: 'id,received_at,ticker,action,raw_payload',
      alert_name: `eq.${ALERT_NAME_SCANNER}`,
      signal_kind: 'eq.entry',
      and: `(received_at.gte.${desde},received_at.lt.${ate})`,
      order: 'received_at.asc,id.asc',
      offset: String(pagina * 1000),
      limit: '1000',
    })
    const lote = await rest<LinhaSinal[]>(`tradingview_signals?${q}`)
    out.push(...lote)
    if (lote.length < 1000) return out
  }
}

async function velas(ticker: string, candidatos: string[], desdeMs: number) {
  // velas suficientes para cobrir desde o primeiro sinal até agora, com folga (o feed pagina sozinho)
  const nBars = Math.min(20000, Math.ceil((Date.now() - desdeMs) / 900_000) + 300)
  let erro = ''
  for (const tv of candidatos) {
    try {
      const r = await tvfeed.getHistory({ symbol: tv, interval: '15m', nBars, timeoutMs: 180_000 })
      if (!r.bars?.length) { erro = `${tv}: zero velas`; continue }
      const bars: Vela[] = r.bars.map((b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close }))
      if (bars[0].t * 1000 > desdeMs) console.warn(`[velas] ${tv}: só desde ${new Date(bars[0].t * 1000).toISOString()}`)
      return { velas: bars, tv }
    } catch (e) {
      erro = `${tv}: ${(e as Error).message.slice(0, 120)}`
    }
  }
  console.warn(`[velas] ${ticker} sem velas — ${erro}`)
  return { velas: null, tv: null, erro }
}

async function main() {
  if (!URL_SB || !KEY) throw new Error('faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const hoje = Date.parse(`${diaUtc(Date.now())}T00:00:00Z`)
  const desdeArg = arg('--desde')
  const nDias = Math.max(1, Number(arg('--dias') ?? 3) || 3)
  const primeiro = desdeArg ? Date.parse(`${desdeArg}T00:00:00Z`) : hoje - nDias * DIA_MS
  if (!Number.isFinite(primeiro) || primeiro >= hoje) throw new Error(`--desde inválido: ${desdeArg}`)
  const dias: string[] = []
  for (let t = primeiro; t < hoje; t += DIA_MS) dias.push(diaUtc(t))

  const [provs, regrasLinha, swLinha, definitivos] = await Promise.all([
    rest<Record<string, unknown>[]>(`mtmauto_providers?select=*&slug=eq.${SLUG_SCANNER}`),
    rest<{ value: Partial<SignalRules> }[]>('site_settings?select=value&key=eq.mtmcopy_signal_rules'),
    rest<{ value: Interruptores }[]>('site_settings?select=value&key=eq.mtmcopy_exec_switches'),
    // Sem a tabela (migração 108 por aplicar) mede-se na mesma: o --seco serve para ensaiar antes.
    rest<{ dia: string }[]>(`estrategia_sombra_dia?select=dia&estrategia=eq.${SLUG_SCANNER}&definitivo=eq.true&dia=gte.${dias[0]}`)
      .catch((e: Error) => { console.warn(`[sombra] não li os dias definitivos: ${e.message.slice(0, 160)}`); return [] as { dia: string }[] }),
  ])
  const prov = provs[0]
  if (!prov) throw new Error(`mtmauto_providers sem a linha ${SLUG_SCANNER}`)
  const cfg = configDoProvider(prov)
  const regras: SignalRules = { ...DEFAULT_SIGNAL_RULES, ...(regrasLinha[0]?.value ?? {}) }
  const sw: Interruptores = swLinha[0]?.value ?? {}
  const jaFeitos = new Set(definitivos.map((d) => d.dia))
  const aMedir = desdeArg ? dias : dias.filter((d) => !jaFeitos.has(d))
  console.log(`[sombra] ${SLUG_SCANNER} ativo=${prov.ativo} modo=${(prov.sinais_config as Record<string, unknown> | null)?.modo ?? '—'} · dias ${aMedir.join(', ') || '(todos definitivos)'}`)
  if (!aMedir.length) return

  const desdeLeitura = new Date(Date.parse(`${aMedir[0]}T00:00:00Z`) - ARRASTO_DIAS * DIA_MS).toISOString()
  const m = await medirSombra({ lerSinais, velas }, {
    desde: desdeLeitura, ate: new Date(hoje).toISOString(), regras, interruptores: sw, cfg,
  })
  const gestao = { ...descreverGestao(cfg), ativo: prov.ativo === true }
  const linhas = linhasPorDia({ estrategia: SLUG_SCANNER, dias: aMedir, trades: m.trades, gestao, sinaisPorDia: m.sinaisPorDia })
  for (const l of linhas) {
    console.log(`[sombra] ${l.dia}: ideias ${l.detalhe.ideias ?? 0} · gate ${l.detalhe.passaram_gate ?? 0} · trades ${l.trades} · vit ${l.vitorias} · R ${l.r_total} · pior ${l.pior_sequencia} · perdas seguidas ${l.perdas_seguidas} · exposição ${l.exposicao_max} · abertas ${l.abertas}${l.definitivo ? '' : ' (provisório)'}`)
  }
  if (Object.keys(m.naoMedidos).length) console.log(`[sombra] não medidos: ${JSON.stringify(m.naoMedidos)}`)
  if (SECO) { console.log('[sombra] --seco: nada escrito'); return }
  const agora = new Date().toISOString()
  await rest('estrategia_sombra_dia?on_conflict=estrategia,dia', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(linhas.map((l) => ({ ...l, atualizado_em: agora }))),
  })
  console.log(`[sombra] gravadas ${linhas.length} linha(s) num upsert`)
}

main().catch((e) => { console.error('[sombra] falhou:', e instanceof Error ? e.message : e); process.exit(1) })
