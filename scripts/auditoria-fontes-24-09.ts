/**
 * AUDITORIA DAS FONTES DE SINAL — 24/09/2026, a pergunta do dono.
 *
 * «Descobre qual a fonte de sinais, scanners, alertas que são lucrativos e bons com a nossa
 * automatização.» A segunda metade é a que manda: não basta o sinal ser bom no papel, tem de
 * sobreviver ao que lhe fazemos — break-even, parciais, trailing, whitelist de símbolos, gate de
 * execução, saldo do cliente.
 *
 * ── SÓ LEITURA ───────────────────────────────────────────────────────────────────────────────────
 * Este script não escreve nada. Nenhum UPDATE, nenhum INSERT, nenhuma alteração de configuração.
 *
 * ── Que instrumentos existem, e em qual se pode confiar ──────────────────────────────────────────
 *
 *  1. `mtmcopy_signal_tracking` — o seguidor a 1 MINUTO (cron `signal-tracker`, * * * * *). Segue
 *     todos os sinais publicados no T2T pela cotação e aplica a NOSSA gestão: parciais 50/25/25 e
 *     stop no break-even a partir do alvo 1. É o melhor instrumento que temos. NÃO é tudo-ou-nada
 *     desde 09/09 (ver `pipsEmbolsados` em lib/mtmcopy/signal-tracker.ts) — o aviso de que um TP1
 *     seguido de stop conta como perda inteira já não é verdade para as linhas recentes.
 *
 *  2. `tradingview_signals.trade_status` — o avaliador a 15 MINUTOS (cron `mtm-alerts-evaluate`).
 *     26 mil alertas, muito mais fundo no tempo, mas por INSTANTÂNEO: lê o preço de agora e só
 *     PROGRIDE o estado (lib/mtm-alerts/evaluate.ts diz "nunca reverte um win para loss"). Um
 *     stop batido entre duas leituras desaparece; um preço que volta ao alvo horas depois vira
 *     "exit_3". A função `calibracao()` aqui em baixo mede esse erro cruzando os dois
 *     instrumentos no MESMO sinal — e ele é enorme.
 *
 *  3. `mtmauto_executions` — execução a sério nas contas dos clientes. Pouca amostra, mas é a
 *     única com dinheiro real. ATENÇÃO: `resultado_pips` está avariado (sinal trocado em compras
 *     de ouro — ver `contradicoesPips()`); o que vale é `resultado`, que vem da corretora.
 *
 *  4. `funded_positions` — motor SIMULADO do MTM Funded. Entradas viciadas a favor da casa até
 *     2026-09-24T14:23:58Z (lib/pips-proof.ts, FRONTEIRA_VIES_PRECO). Serve para contar
 *     desperdício, não para julgar qualidade. Linhas `recon:` e `espelho-provider:` são separadas.
 *
 *  5. `mtmcopy_trade_exits` — NÃO usada como medida: só recebe linha quando o motor fecha num
 *     alvo, logo é uma amostra só de vencedoras (20 linhas, 100% de acerto por construção).
 *
 * ── Defeito de medição encontrado (e datado) ─────────────────────────────────────────────────────
 * A partir da semana de 07/09, o tracker passa a gravar `sl = entry` nas linhas que chegaram ao
 * break-even: o stop original é ESMAGADO. Consequência prática: para qualquer sinal vencedor
 * depois dessa data já não há risco para normalizar, e qualquer média de R feita sobre o período
 * recente dá exactamente −1 (só os perdedores mantêm um stop verdadeiro). Por isso o quadro de R
 * aqui corre só até 06/09, e o quadro de pips corre em todo o período.
 *
 * Correr:  npx tsx scripts/auditoria-fontes-24-09.ts
 */
import { join } from 'node:path'

const RAIZ = join(__dirname, '..')
try {
  process.loadEnvFile(join(RAIZ, '.env.local'))
} catch {
  /* usa o ambiente */
}

/** A hora em que o preenchimento deixou de favorecer a casa (lib/pips-proof.ts). */
const FRONTEIRA_VIES = Date.parse('2026-09-24T14:23:58.000Z')
/** A semana a partir da qual o tracker esmaga o stop original com o break-even. */
const CORTE_R_LIMPO = Date.parse('2026-09-07T00:00:00.000Z')

type Linha = Record<string, unknown>

/** Tamanho do pip — cópia deliberada de lib/mtmcopy/trade-outcome.ts, para o script ser auditável sozinho. */
function pipSize(symbol: string): number {
  const s = (symbol ?? '').toUpperCase()
  if (/XAU|GOLD/.test(s)) return 0.1
  if (/XAG|SILVER/.test(s)) return 0.01
  if (/^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|AVAX|LINK|DOT|LTC)/.test(s)) return 1
  if (/JPY/.test(s)) return 0.01
  if (s.replace(/[^A-Z]/g, '').length === 6) return 0.0001
  return 1
}

/**
 * Número ou null. O `null` tem de sair `null` e NÃO zero: `Number(null)` é 0, e foi assim que os
 * 98 sinais do James — que não têm preço de entrada nenhum — apareceram na primeira versão deste
 * quadro como 98 trades medidas a 0 pips. «Não se sabe» e «zero» são coisas diferentes.
 */
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Lê uma tabela inteira em páginas — as tabelas de sinais não cabem no limite de 1000 do PostgREST. */
async function lerTudo(
  db: { from: (t: string) => { select: (c: string) => { range: (a: number, b: number) => PromiseLike<{ data: Linha[] | null; error: { message: string } | null }> } } },
  tabela: string,
  colunas: string,
): Promise<Linha[]> {
  const out: Linha[] = []
  const passo = 1000
  for (let i = 0; ; i += passo) {
    const { data, error } = await db.from(tabela).select(colunas).range(i, i + passo - 1)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    const lote = data ?? []
    out.push(...lote)
    if (lote.length < passo) break
  }
  return out
}

interface Caixa {
  n: number
  soma: number
  soma2: number
}
const caixa = (): Caixa => ({ n: 0, soma: 0, soma2: 0 })
const junta = (c: Caixa, v: number) => {
  c.n += 1
  c.soma += v
  c.soma2 += v * v
}
const media = (c: Caixa) => (c.n ? c.soma / c.n : null)
/** Meio-intervalo de confiança a 95% da média (normal). Sem isto um número de 12 trades passa por facto. */
function ic95(c: Caixa): number | null {
  if (c.n < 2) return null
  const m = c.soma / c.n
  const varia = (c.soma2 - c.n * m * m) / (c.n - 1)
  if (!(varia >= 0)) return null
  return (1.96 * Math.sqrt(varia)) / Math.sqrt(c.n)
}

const f = (v: number | null, casas = 2) => (v == null ? '—' : v.toFixed(casas))

function quadro(titulo: string, cabecalho: string[], linhas: (string | number | null)[][]) {
  const todas = [cabecalho, ...linhas.map((l) => l.map((c) => (c == null ? '—' : String(c))))]
  const larguras = cabecalho.map((_, i) => Math.max(...todas.map((l) => (l[i] ?? '').length)))
  console.log(`\n${titulo}`)
  console.log(todas
    .map((l, idx) =>
      l.map((c, i) => (i === 0 ? c.padEnd(larguras[i]) : c.padStart(larguras[i]))).join('  ') +
      (idx === 0 ? `\n${larguras.map((w) => '─'.repeat(w)).join('  ')}` : ''))
    .join('\n'))
}

// ── 1. IDEIAS COM A NOSSA GESTÃO, POR FONTE (tracking a 1 minuto) ────────────────────────────────

function quadroFontes(tracking: Linha[]) {
  const fora = new Set(['Ideia descartada', 'Dados inválidos'])
  const por = new Map<string, { total: number; descartada: number; medidos: number; alvo: number; parcial: number; stop: number; ganhos: number; pips: number; ganho: number; perda: number; semPips: number }>()
  for (const l of tracking) {
    const k = String(l.source_key ?? '(sem fonte)')
    const e = por.get(k) ?? { total: 0, descartada: 0, medidos: 0, alvo: 0, parcial: 0, stop: 0, ganhos: 0, pips: 0, ganho: 0, perda: 0, semPips: 0 }
    e.total += 1
    const rotulo = String(l.outcome_label ?? '')
    if (rotulo === 'Ideia descartada') e.descartada += 1
    if (rotulo === 'Alvo final') e.alvo += 1
    if (rotulo.startsWith('Parciais') || rotulo.startsWith('Alvo 1')) e.parcial += 1
    if (rotulo === 'Stop loss') e.stop += 1
    const p = num(l.result_pips)
    if (!fora.has(rotulo)) {
      if (p == null) {
        if (l.status === 'closed') e.semPips += 1
      } else {
        e.medidos += 1
        e.pips += p
        if (p > 0) {
          e.ganhos += 1
          e.ganho += p
        } else e.perda += -p
      }
    }
    por.set(k, e)
  }
  quadro(
    '1) IDEIAS COM A NOSSA GESTÃO — mtmcopy_signal_tracking (1 min, 25/08→24/09)',
    ['fonte', 'sinais', 'descart.', 'medidos', 'fechad.s/pips', 'alvo', 'parc+BE', 'stop', 'acerto%', 'pips', 'PF', 'pips/sinal'],
    [...por.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([k, e]) => [
        k, e.total, e.descartada, e.medidos, e.semPips, e.alvo, e.parcial, e.stop,
        e.medidos ? f((100 * e.ganhos) / e.medidos, 1) : '—',
        e.medidos ? Math.round(e.pips) : '—',
        e.perda > 0 ? f(e.ganho / e.perda) : '—',
        e.medidos ? f(e.pips / e.medidos, 1) : '—',
      ]),
  )
  console.log('   NOTA: os pips só se somam dentro da mesma classe de activo. premium/goldkiller/sensei são')
  console.log('   só XAUUSD, mtmscanner só forex, primeverse quase só XAUUSD; aurum mistura BTC/ETH em PONTOS.')
}

// ── 2. R NORMALIZADO PELO RISCO — só até 06/09, antes de o break-even esmagar o stop ─────────────

function quadroR(tracking: Linha[]) {
  const fora = new Set(['Ideia descartada', 'Dados inválidos'])
  const por = new Map<string, Caixa>()
  const risco = new Map<string, Caixa>()
  for (const l of tracking) {
    if (l.status !== 'closed') continue
    if (fora.has(String(l.outcome_label ?? ''))) continue
    if (Date.parse(String(l.created_at)) >= CORTE_R_LIMPO) continue
    const entry = num(l.entry)
    const sl = num(l.sl)
    const p = num(l.result_pips)
    if (entry == null || sl == null || p == null || entry === sl) continue
    const r = Math.abs(entry - sl) / pipSize(String(l.symbol ?? ''))
    if (!(r > 0)) continue
    const k = String(l.source_key ?? '(sem fonte)')
    const c = por.get(k) ?? caixa()
    junta(c, p / r)
    por.set(k, c)
    const cr = risco.get(k) ?? caixa()
    junta(cr, r)
    risco.set(k, cr)
  }
  quadro(
    '2) EXPECTATIVA EM R (resultado ÷ risco do sinal) — só 25/08→06/09, ver defeito do stop em cabeçalho',
    ['fonte', 'n', 'R médio', 'IC95 baixo', 'IC95 alto', 'risco médio (pips)'],
    [...por.entries()]
      .filter(([, c]) => c.n >= 10)
      .sort((a, b) => (media(b[1]) ?? -9) - (media(a[1]) ?? -9))
      .map(([k, c]) => {
        const m = media(c)
        const i = ic95(c)
        return [k, c.n, f(m, 3), m != null && i != null ? f(m - i, 3) : '—', m != null && i != null ? f(m + i, 3) : '—', f(media(risco.get(k) ?? caixa()), 1)]
      }),
  )
}

// ── 3. O DEFEITO DATADO: o break-even esmaga o stop original ─────────────────────────────────────

function defeitoStop(tracking: Linha[]) {
  const por = new Map<string, { n: number; igual: number; ganhadores: number; ganhadoresIguais: number }>()
  for (const l of tracking) {
    if (l.status !== 'closed') continue
    const d = new Date(String(l.created_at))
    const semana = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)))
      .toISOString().slice(0, 10)
    const e = por.get(semana) ?? { n: 0, igual: 0, ganhadores: 0, ganhadoresIguais: 0 }
    const entry = num(l.entry)
    const sl = num(l.sl)
    const p = num(l.result_pips)
    e.n += 1
    if (entry != null && sl != null && entry === sl) e.igual += 1
    if (p != null && p > 0) {
      e.ganhadores += 1
      if (entry != null && sl != null && entry === sl) e.ganhadoresIguais += 1
    }
    por.set(semana, e)
  }
  quadro(
    '3) DEFEITO DE MEDIÇÃO — quantas linhas ficam com sl = entry (break-even a esmagar o stop original)',
    ['semana', 'fechadas', 'sl=entry', 'vencedoras', 'vencedoras c/ sl=entry', '% das vencedoras'],
    [...por.entries()].sort().map(([k, e]) => [
      k, e.n, e.igual, e.ganhadores, e.ganhadoresIguais,
      e.ganhadores ? f((100 * e.ganhadoresIguais) / e.ganhadores, 0) : '—',
    ]),
  )
  console.log('   Sem o stop original não há risco, não há R, não há expectativa por fonte. Guardar `sl_inicial`')
  console.log('   (ou escrever o break-even noutra coluna) é o conserto de maior retorno em toda esta auditoria.')
}

// ── 4. CALIBRAÇÃO: o avaliador de 15 min contra o seguidor de 1 min, no MESMO sinal ──────────────

function calibracao(tracking: Linha[], tv: Linha[]) {
  const porMsg = new Map<string, Linha>()
  for (const l of tracking) if (l.chat_message_id) porMsg.set(String(l.chat_message_id), l)
  const por = new Map<string, { n: number; chegouFinal: number; chegouTp1: number; pico: Caixa }>()
  for (const v of tv) {
    const id = v.chat_message_id ? String(v.chat_message_id) : null
    if (!id) continue
    const t = porMsg.get(id)
    if (!t || t.status !== 'closed') continue
    const estado = String(v.trade_status ?? '')
    if (!estado.startsWith('exit_')) continue
    const payload = (v.raw_payload ?? {}) as Record<string, unknown>
    const fonte = String(payload.strategy ?? v.alert_name ?? '(sem fonte)')
    const entry = num(t.entry)
    const tps = (t.tps as number[] | null) ?? []
    const pico = num(t.peak_pips)
    if (entry == null || !tps.length || pico == null) continue
    const pip = pipSize(String(t.symbol ?? ''))
    const dFinal = Math.abs(tps[tps.length - 1] - entry) / pip
    const d1 = Math.abs(tps[0] - entry) / pip
    const k = `${fonte} · ${estado}`
    const e = por.get(k) ?? { n: 0, chegouFinal: 0, chegouTp1: 0, pico: caixa() }
    e.n += 1
    if (pico >= dFinal) e.chegouFinal += 1
    if (pico >= d1) e.chegouTp1 += 1
    if (dFinal > 0) junta(e.pico, pico / dFinal)
    por.set(k, e)
  }
  quadro(
    '4) CALIBRAÇÃO — o avaliador de 15 min diz "exit_N"; o seguidor de 1 min confirma?',
    ['fonte · estado de 15 min', 'sinais', 'chegou ao alvo final (1 min)', 'chegou ao TP1 (1 min)', 'pico ÷ distância ao alvo final'],
    [...por.entries()]
      .filter(([, e]) => e.n >= 4)
      .sort((a, b) => b[1].n - a[1].n)
      .map(([k, e]) => [k, e.n, `${e.chegouFinal} (${f((100 * e.chegouFinal) / e.n, 0)}%)`, `${e.chegouTp1} (${f((100 * e.chegouTp1) / e.n, 0)}%)`, f(media(e.pico), 2)]),
  )
  console.log('   Quanto mais baixa a 3.ª coluna, mais o avaliador de 15 min inventa vitórias. Qualquer número')
  console.log('   tirado de `tradingview_signals.trade_status` tem de levar este desconto colado.')
}

// ── 5. EXECUÇÃO REAL E DESPERDÍCIO, NAS CONTAS DOS CLIENTES ──────────────────────────────────────

function categoriaDesperdicio(estado: string, motivo: string): string {
  const m = motivo.toLowerCase()
  if (/not connected a broker|não ligaste uma conta/.test(m)) return 'sem conta ligada'
  if (/read the account balance|no balance/.test(m)) return 'sem saldo / saldo ilegível'
  if (/open positions limit/.test(m)) return 'limite de posições'
  if (/access is not active/.test(m)) return 'sem direito (acesso inactivo)'
  if (/outside the symbols|não negoceia|unknown symbol|trade disabled/.test(m)) return 'símbolo (whitelist/corretora)'
  if (/invalid stops/.test(m)) return 'stops inválidos'
  if (/no error returned|err_no_error|não respondeu|recusou|no quotes|mt5 dropped/.test(m)) return 'corretora / ligação'
  if (/mtm funded/.test(m)) return 'desviado p/ MTM Funded'
  if (/switched off/.test(m)) return 'cópia desligada'
  if (estado === 'closed' || estado === 'open') return '— executou'
  return motivo ? motivo.slice(0, 40) : '(sem motivo)'
}

function quadroExecucao(sinais: Linha[], execs: Linha[], providers: Linha[]) {
  const nomeProv = new Map(providers.map((p) => [String(p.id), String(p.slug ?? p.id)]))
  const provDoSinal = new Map(sinais.map((s) => [String(s.id), nomeProv.get(String(s.provider_id)) ?? '(sem provider)']))
  const por = new Map<string, { tent: number; exec: number; dinheiro: number; ganhos: number; comDinheiro: number; ganho: number; perda: number; cat: Map<string, number> }>()
  for (const e of execs) {
    const k = provDoSinal.get(String(e.signal_id)) ?? '(sinal órfão)'
    const linha = por.get(k) ?? { tent: 0, exec: 0, dinheiro: 0, ganhos: 0, comDinheiro: 0, ganho: 0, perda: 0, cat: new Map() }
    linha.tent += 1
    const cat = categoriaDesperdicio(String(e.estado ?? ''), String(e.motivo ?? ''))
    linha.cat.set(cat, (linha.cat.get(cat) ?? 0) + 1)
    const r = num(e.resultado)
    if (e.estado === 'closed' && r != null) {
      linha.exec += 1
      linha.comDinheiro += 1
      linha.dinheiro += r
      if (r > 0) {
        linha.ganhos += 1
        linha.ganho += r
      } else linha.perda += -r
    }
    por.set(k, linha)
  }
  quadro(
    '5) EXECUÇÃO NAS CONTAS DOS CLIENTES — mtmauto_executions (26/08→17/09). Dinheiro = o que a corretora diz.',
    ['provider', 'tentativas', 'fechadas c/ resultado', 'acerto%', 'PF (dinheiro)', 'desperdício %', 'maior causa'],
    [...por.entries()]
      .sort((a, b) => b[1].tent - a[1].tent)
      .map(([k, e]) => {
        const maior = [...e.cat.entries()].filter(([c]) => c !== '— executou').sort((a, b) => b[1] - a[1])[0]
        return [
          k, e.tent, e.comDinheiro,
          e.comDinheiro ? f((100 * e.ganhos) / e.comDinheiro, 1) : '—',
          e.perda > 0 ? f(e.ganho / e.perda) : '—',
          f((100 * (e.tent - e.exec)) / e.tent, 0),
          maior ? `${maior[0]} (${maior[1]})` : '—',
        ]
      }),
  )
}

/** As linhas em que os pips e o dinheiro discordam de sinal — prova de que `resultado_pips` não serve. */
function contradicoesPips(sinais: Linha[], execs: Linha[]) {
  const dirDoSinal = new Map(sinais.map((s) => [String(s.id), String(s.direction ?? '')]))
  let contra = 0
  let total = 0
  const exemplos: string[] = []
  for (const e of execs) {
    const p = num(e.resultado_pips)
    const r = num(e.resultado)
    if (p == null || r == null || p === 0 || r === 0) continue
    total += 1
    if (Math.sign(p) !== Math.sign(r)) {
      contra += 1
      if (exemplos.length < 4) {
        exemplos.push(`${dirDoSinal.get(String(e.signal_id)) ?? '?'} lote ${e.lote} → ${p} pips mas ${r} de resultado`)
      }
    }
  }
  console.log(`\n6) mtmauto_executions.resultado_pips CONTRADIZ o dinheiro em ${contra}/${total} fechos.`)
  for (const x of exemplos) console.log(`   · ${x}`)
  console.log('   Enquanto isto não for corrigido, a qualidade de uma fonte mede-se pelo `resultado` (corretora),')
  console.log('   nunca por `resultado_pips`.')
}

// ── 7. MTM FUNDED SIMULADO: só para contar, nunca para julgar ────────────────────────────────────

function quadroFunded(posicoes: Linha[]) {
  let depois = 0
  const por = new Map<string, number>()
  for (const p of posicoes) {
    const ref = p.ideia_ref == null ? null : String(p.ideia_ref)
    const tipo = ref == null ? '(manual / sem ref)' : ref.split(':')[0]
    por.set(tipo, (por.get(tipo) ?? 0) + 1)
    if (Date.parse(String(p.aberta_em)) >= FRONTEIRA_VIES) depois += 1
  }
  quadro(
    '7) MTM FUNDED SIMULADO — funded_positions por tipo de origem (só contagem)',
    ['tipo de origem', 'posições'],
    [...por.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]),
  )
  console.log(`   Posições abertas DEPOIS da correcção do preço de 24/09: ${depois} de ${posicoes.length}` +
    ` (${f((100 * depois) / Math.max(posicoes.length, 1), 1)}%).`)
  console.log('   Tudo o resto foi preenchido pelo motor viciado a favor da casa (+1,79 USD por trade medidos na')
  console.log('   mestre do Sensei). Serve para contar desperdício; não serve para dizer se uma fonte é boa.')
}

async function main() {
  const { getSupabaseAdmin } = await import('../lib/supabase-admin-client')
  const db = getSupabaseAdmin() as unknown as Parameters<typeof lerTudo>[0]

  const tracking = await lerTudo(db, 'mtmcopy_signal_tracking',
    'id,chat_message_id,channel_slug,source_key,symbol,direction,entry,sl,tps,status,exits_done,peak_pips,result_pips,outcome_label,created_at')
  const tv = await lerTudo(db, 'tradingview_signals',
    'id,received_at,ticker,action,trade_status,signal_kind,chat_status,alert_name,raw_payload,chat_message_id')
  const sinais = await lerTudo(db, 'mtmauto_signals', 'id,provider_id,symbol,direction,entry,sl,created_at')
  const execs = await lerTudo(db, 'mtmauto_executions', 'id,signal_id,estado,motivo,lote,resultado,resultado_pips,created_at')
  const providers = await lerTudo(db, 'mtmauto_providers', 'id,slug')
  const funded = await lerTudo(db, 'funded_positions', 'id,ideia_ref,aberta_em,estado')

  console.log(`Lido (só leitura): ${tracking.length} ideias seguidas · ${tv.length} alertas TradingView · ` +
    `${execs.length} tentativas de execução · ${funded.length} posições MTM Funded.`)

  quadroFontes(tracking)
  quadroR(tracking)
  defeitoStop(tracking)
  calibracao(tracking, tv.filter((v) => v.signal_kind === 'entry' || v.signal_kind == null))
  quadroExecucao(sinais, execs, providers)
  contradicoesPips(sinais, execs)
  quadroFunded(funded)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
