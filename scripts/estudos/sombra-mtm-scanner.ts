/**
 * SOMBRA DO MTM SCANNER — o histórico. O que a estratégia `mtm-scanner` teria feito desde 12/07 se
 * executasse, com o gate e a gestão de HOJE, medido em velas M15 reais do TradingView.
 *
 *   npx tsx scripts/estudos/sombra-mtm-scanner.ts                    # desde 2026-07-12 até agora
 *   npx tsx scripts/estudos/sombra-mtm-scanner.ts --desde 2026-08-01
 *   npx tsx scripts/estudos/sombra-mtm-scanner.ts --refrescar-velas
 *
 * SÓ LEITURA: nem `mtmauto_providers` nem nenhuma outra tabela. A medição diária contínua (a que
 * escreve em `estrategia_sombra_dia`) é o serviço services/sombra-estrategias, com o mesmo código
 * (lib/mtmauto/sombra). Este script é o retrato do passado e o banco de ensaio dessa medição.
 *
 * Velas: o cliente do MCP (~/tradingview-mcp/src/tvfeed.js), M15 paginado (chega a ~30/06), em
 * cache em scripts/.cache-velas/ como o estudo GoldKiller/Aurum. Réguas de replay:
 * lib/estudos/replay-velas.ts (as de lib/mtmfunded/reconstituicao.ts).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, join } from 'path'
import { createRequire } from 'module'
import { DEFAULT_SIGNAL_RULES, type SignalRules } from '../../lib/mtmcopy/signal-rules'
import { percentil, type Vela } from '../../lib/estudos/replay-velas'
import { medirSombra, type Dependencias } from '../../lib/mtmauto/sombra/correr'
import {
  ALERT_NAME_SCANNER, SLUG_SCANNER, configDoProvider, descreverGestao, diaUtc, exposicaoMaxima, resumir,
  type Interruptores, type LinhaSinal, type TradeSombra,
} from '../../lib/mtmauto/sombra/scanner'

const requireCjs = createRequire(__filename)
for (const ln of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(ln.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null)
const DESDE = arg('--desde') ?? '2026-07-12'
const REFRESCAR = process.argv.includes('--refrescar-velas')
const CACHE = resolve(__dirname, '../.cache-velas')
const SAIDA = resolve(__dirname, '../../docs/sombra-mtm-scanner.md')
const LEITURA = resolve(__dirname, '../../docs/sombra-mtm-scanner-leitura.md')

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_SB || !KEY) throw new Error('faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local')

async function rest<T>(caminho: string): Promise<T> {
  const r = await fetch(`${URL_SB}/rest/v1/${caminho}`, { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`)
  return (await r.json()) as T
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

async function velas(ticker: string, candidatos: string[]): Promise<{ velas: Vela[] | null; tv: string | null; erro?: string }> {
  mkdirSync(CACHE, { recursive: true })
  let erro = ''
  for (const tv of candidatos) {
    const ficheiro = join(CACHE, `${tv.replace(/[^A-Z0-9]/gi, '_')}_15m.json`)
    if (!REFRESCAR && existsSync(ficheiro)) {
      const g = JSON.parse(readFileSync(ficheiro, 'utf8')) as { tv: string; bars: Vela[] }
      return { velas: g.bars, tv: g.tv }
    }
    const { getHistory } = requireCjs('/Users/ricardogarcia/tradingview-mcp/src/tvfeed.js') as {
      getHistory: (o: { symbol: string; interval: string; nBars: number; timeoutMs?: number }) => Promise<{ bars: { time: number; open: number; high: number; low: number; close: number }[] }>
    }
    try {
      const r = await getHistory({ symbol: tv, interval: '15m', nBars: 20000, timeoutMs: 180000 })
      if (!r.bars?.length) { erro = `${tv}: zero velas`; continue }
      const bars: Vela[] = r.bars.map((b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close }))
      writeFileSync(ficheiro, JSON.stringify({ tv, bars }))
      console.log(`   ✓ ${ticker} → ${tv}: ${bars.length} velas desde ${new Date(bars[0].t * 1000).toISOString().slice(0, 10)}`)
      return { velas: bars, tv }
    } catch (e) {
      erro = `${tv}: ${(e as Error).message.slice(0, 80)}`
    }
  }
  console.log(`   ✗ ${ticker}: ${erro}`)
  return { velas: null, tv: null, erro }
}

// ── tabelas ──────────────────────────────────────────────────────────────────

const f = (x: number | null | undefined, c = 2) => (x != null && Number.isFinite(x) ? x.toFixed(c) : '—')
const sinalR = (x: number, c = 1) => `${x >= 0 ? '+' : ''}${f(x, c)}`

/** Segunda-feira (UTC) da semana de um instante. */
const semanaDe = (ms: number) => {
  const d = new Date(ms)
  const dow = (d.getUTCDay() + 6) % 7
  return diaUtc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow))
}

function tabelaGrupos(titulo: string, grupos: Map<string, TradeSombra[]>, comExposicao: boolean): string[] {
  const cab = `| ${titulo} | trades | % vit. | R total | R médio | pior queda (R) | perdas seguidas |${comExposicao ? ' exposição máx. | risco somado a 0,25% | a 1% |' : ''}`
  const sep = `|---|---:|---:|---:|---:|---:|---:|${comExposicao ? '---:|---:|---:|' : ''}`
  const linhas = [...grupos].map(([k, ts]) => {
    const r = resumir(ts)
    const e = comExposicao ? exposicaoMaxima(ts) : null
    return `| ${k} | ${r.trades} | ${f(r.pctVitorias, 1)}% | ${sinalR(r.rTotal)} | ${sinalR(r.rMedio ?? NaN, 3)} | ${f(r.piorSequenciaR, 1)} | ${r.perdasSeguidas} |` +
      (e ? ` ${e.max} | ${f(e.max * 0.25, 2)}% | ${e.max}% |` : '')
  })
  return [cab, sep, ...linhas]
}

function agrupar(ts: TradeSombra[], chave: (t: TradeSombra) => string, ordenar?: (a: [string, TradeSombra[]], b: [string, TradeSombra[]]) => number) {
  const m = new Map<string, TradeSombra[]>()
  for (const t of ts) {
    const k = chave(t)
    const l = m.get(k)
    if (l) l.push(t)
    else m.set(k, [t])
  }
  return new Map([...m].sort(ordenar ?? ((a, b) => a[0].localeCompare(b[0]))))
}

/** Variante «uma posição por símbolo»: um sinal num símbolo que ainda tem trade aberta é saltado. */
function umaPorSimbolo(ts: TradeSombra[]): TradeSombra[] {
  const livreEm = new Map<string, number>()
  const out: TradeSombra[] = []
  for (const t of ts) {
    if ((livreEm.get(t.ticker) ?? 0) > t.inicioEm) continue
    out.push(t)
    livreEm.set(t.ticker, t.fechoEm)
  }
  return out
}

function linhaResumo(nome: string, ts: TradeSombra[]): string {
  const r = resumir(ts)
  const e = exposicaoMaxima(ts)
  return `| ${nome} | ${r.trades} | ${f(r.pctVitorias, 1)}% | ${sinalR(r.rTotal)} | ${sinalR(r.rMedio ?? NaN, 3)} | ${f(r.piorSequenciaR, 1)} | ${r.perdasSeguidas} | ${e.max} |`
}

async function main() {
  const agora = new Date().toISOString()
  const [provs, regrasLinha, swLinha] = await Promise.all([
    rest<Record<string, unknown>[]>(`mtmauto_providers?select=*&slug=eq.${SLUG_SCANNER}`),
    rest<{ value: Partial<SignalRules> }[]>('site_settings?select=value&key=eq.mtmcopy_signal_rules'),
    rest<{ value: Interruptores }[]>('site_settings?select=value&key=eq.mtmcopy_exec_switches'),
  ])
  const prov = provs[0]
  if (!prov) throw new Error('mtmauto_providers sem a linha mtm-scanner')
  const { telegram_bot_token: _t, ...provSemSegredos } = prov as Record<string, unknown> & { telegram_bot_token?: unknown }
  void _t
  const cfg = configDoProvider(provSemSegredos)
  const regras: SignalRules = { ...DEFAULT_SIGNAL_RULES, ...(regrasLinha[0]?.value ?? {}) }
  const sw: Interruptores = swLinha[0]?.value ?? {}
  console.log(`estratégia ${prov.slug} · ativo=${prov.ativo} · sinais_config=${JSON.stringify(prov.sinais_config)}`)
  console.log(`gestão: ${JSON.stringify(descreverGestao(cfg))}`)

  const deps: Dependencias = { lerSinais, velas: (t, c) => velas(t, c) }
  const principal = await medirSombra(deps, { desde: DESDE, ate: agora, regras, interruptores: sw, cfg })
  const semSlMinimo = await medirSombra(deps, { desde: DESDE, ate: agora, regras, interruptores: sw, cfg, slMinimo: false })
  const ts = principal.trades

  const md: string[] = ['# Sombra do MTM Scanner — o que teria sido executado', '']
  md.push(`Corrido a ${agora.slice(0, 16).replace('T', ' ')} UTC · \`npx tsx scripts/estudos/sombra-mtm-scanner.ts\` · velas M15 do TradingView · janela de 3 dias por sinal.`, '')
  md.push('> Só leitura. A estratégia continua `ativo = false`: nada disto abriu uma trade.', '')
  if (existsSync(LEITURA)) md.push(readFileSync(LEITURA, 'utf8').trim(), '')

  md.push('## O que se mediu', '')
  const janela = principal.primeiroSinal != null
    ? `${diaUtc(principal.primeiroSinal)} → ${diaUtc(principal.ultimoSinal!)}`
    : '—'
  md.push(`- **Janela medida:** ${janela} (pedido desde ${DESDE}; as velas M15 do TradingView começam a ~30/06).`)
  md.push(`- **Ideias (entradas MTMScanner na base):** ${principal.ideias}`)
  md.push(`- **Teriam passado o gate de execução:** ${principal.passaram} (${f((100 * principal.passaram) / Math.max(1, principal.ideias), 1)}%)`)
  md.push(`- **Medidas em velas:** ${ts.length}`)
  md.push(`- **Gestão (a de \`configDoProvider\` para a linha actual):** ${Object.entries(descreverGestao(cfg)).map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join('/') : v}`).join(' · ')}`)
  md.push(`- **Linha da estratégia:** ativo = ${prov.ativo} · sinais_config = \`${JSON.stringify(prov.sinais_config)}\` · trailing_arranca_pips = ${prov.trailing_arranca_pips} · saidas_pct = ${JSON.stringify(prov.saidas_pct)} · be_gatilho = ${prov.be_gatilho} (ignorado de propósito por \`configDoProvider\`)`)
  md.push(`- **Regras do gate (site_settings, lidas agora):** whitelist ${regras.exec_symbol_whitelist.length} símbolos · confirmações ≥ ${regras.exec_min_confirmations} (venda ≥ ${regras.exec_sell_min_confirmations}) · exclusões do Scanner ${JSON.stringify(regras.scanner_symbol_exclusions?.mtmscanner ?? [])} · interruptor forex = ${sw.forex}`)
  md.push(`- **Spread simulado:** 1,2 pips nos majors, 2,5 nos cruzados. Resultado em R (1R = distância entrada→stop DEPOIS de alargado a 20 pips e com spread).`, '')

  md.push('**Ficaram de fora no gate:**', '')
  for (const [m, n] of Object.entries(principal.foraDoGate).sort((a, b) => b[1] - a[1])) md.push(`- ${n} — ${m}`)
  md.push('', '**Passaram o gate mas não se mediram:**', '')
  const nm = Object.entries(principal.naoMedidos).sort((a, b) => b[1] - a[1])
  if (!nm.length) md.push('- nenhuma')
  for (const [m, n] of nm) md.push(`- ${n} — ${m}`)
  md.push('', `Velas: ${Object.entries(principal.fonteVelas).map(([k, v]) => `${k} ← ${v}`).join(' · ')}`, '')

  const r = resumir(ts)
  const e = exposicaoMaxima(ts)
  md.push('## 1. Resultado global', '')
  md.push('| variante | trades | % vit. | R total | R médio | pior queda (R) | perdas seguidas | exposição máx. |', '|---|---:|---:|---:|---:|---:|---:|---:|')
  md.push(linhaResumo('**gate + gestão actuais (stop mínimo 20 pips)**', ts))
  md.push(linhaResumo('stop do sinal, sem alargar', semSlMinimo.trades))
  md.push(linhaResumo('só uma posição por símbolo', umaPorSimbolo(ts)))
  md.push(linhaResumo('só compras', ts.filter((t) => t.direcao === 'buy')))
  md.push(linhaResumo('só vendas', ts.filter((t) => t.direcao === 'sell')))
  md.push('')
  const rs = ts.map((t) => t.R)
  const media = r.rMedio ?? 0
  const desvio = Math.sqrt(rs.reduce((a, x) => a + (x - media) ** 2, 0) / Math.max(1, rs.length - 1))
  const barras = new Set(ts.map((t) => Math.floor(t.em / 900_000))).size
  md.push(`IC 95% do R médio (trades tratadas como independentes): ${sinalR(media, 3)} ± ${f((1.96 * desvio) / Math.sqrt(Math.max(1, rs.length)), 3)}. ` +
    `Mas não são independentes: as ${ts.length} trades nasceram em apenas **${barras} velas de 15 m diferentes** (${f(ts.length / Math.max(1, barras), 2)} trades por vela). ` +
    `Com o tamanho efectivo das velas, o intervalo alarga para ± ${f((1.96 * desvio) / Math.sqrt(Math.max(1, barras)), 3)}.`, '')
  const motivos = ts.reduce<Record<string, number>>((a, t) => ((a[t.motivo] = (a[t.motivo] ?? 0) + 1), a), {})
  md.push(`Como fecharam: ${Object.entries(motivos).map(([k, v]) => `${k} ${v}`).join(' · ')}.`, '')

  md.push('## 2. Exposição simultânea', '')
  md.push(`- **Máximo de posições abertas ao mesmo tempo:** ${e.max}, a ${e.em ? new Date(e.em).toISOString().slice(0, 16).replace('T', ' ') : '—'} UTC (a moeda mais repetida nesse momento: ${e.moeda} em ${e.moedaN}).`)
  md.push(`- **Risco somado nesse momento:** ${f(e.max * 0.25, 2)}% da conta a 0,25% por trade · **${e.max}%** a 1% por trade.`)
  md.push(`- **Pior concentração numa moeda (em qualquer altura):** ${e.piorMoeda} em ${e.piorMoedaN} posições abertas.`)
  // distribuição: posições abertas no instante de cada abertura
  const nosInstantes: number[] = []
  {
    const ev = ts.flatMap((t) => [{ t: t.inicioEm, d: 1 }, { t: t.fechoEm, d: -1 }]).sort((a, b) => a.t - b.t || a.d - b.d)
    let n = 0
    for (const x of ev) { n += x.d; if (x.d === 1) nosInstantes.push(n) }
  }
  md.push(`- **Posições abertas no momento de cada nova entrada:** p50 ${f(percentil(nosInstantes, 0.5), 0)} · p90 ${f(percentil(nosInstantes, 0.9), 0)} · p99 ${f(percentil(nosInstantes, 0.99), 0)}.`)
  const porDia = agrupar(ts, (t) => diaUtc(t.em))
  const nDia = [...porDia.values()].map((x) => x.length)
  const rDia = [...porDia.values()].map((x) => resumir(x).rTotal)
  md.push(`- **Trades por dia:** p50 ${f(percentil(nDia, 0.5), 0)} · máx ${Math.max(0, ...nDia)} · ${porDia.size} dias com trades. **R por dia:** pior ${f(Math.min(...rDia), 1)} · melhor ${f(Math.max(...rDia), 1)} · dias negativos ${rDia.filter((x) => x < 0).length}/${rDia.length}.`)
  const umaSim = exposicaoMaxima(umaPorSimbolo(ts))
  md.push(`- Com **uma posição por símbolo** o máximo desce para ${umaSim.max} (${f(umaSim.max * 0.25, 2)}% a 0,25%, ${umaSim.max}% a 1%).`, '')

  md.push('## 3. Por semana (segunda-feira UTC)', '')
  md.push(...tabelaGrupos('semana', agrupar(ts, (t) => semanaDe(t.em)), true), '')

  md.push('## 4. Por símbolo', '')
  md.push(...tabelaGrupos('símbolo', agrupar(ts, (t) => t.ticker, (a, b) => resumir(b[1]).rTotal - resumir(a[1]).rTotal), true), '')

  md.push('## 5. Por mês', '')
  md.push(...tabelaGrupos('mês', agrupar(ts, (t) => diaUtc(t.em).slice(0, 7)), true), '')

  mkdirSync(resolve(__dirname, '../../docs'), { recursive: true })
  writeFileSync(SAIDA, md.join('\n') + '\n')
  console.log(`\nideias ${principal.ideias} · gate ${principal.passaram} · medidas ${ts.length} · R ${f(r.rTotal, 1)} · exposição máx ${e.max}`)
  console.log(`→ ${SAIDA}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
