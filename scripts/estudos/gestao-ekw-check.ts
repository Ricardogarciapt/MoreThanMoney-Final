/**
 * GESTÃO DO EDGE / KING / WOLF — medida nos PREENCHIMENTOS REAIS das mestres, sem velas.
 *
 *   npx tsx scripts/estudos/gestao-ekw-check.ts
 *
 * SÓ LEITURA. Não escreve em tabela nenhuma.
 *
 * PORQUE É QUE ISTO NÃO É MAIS UM BACKTEST. `scripts/estudos/perfil-pv-traders.ts` replica os
 * sinais em velas OHLC do TradingView — e a vela engana: dá vantagem artificial a stops apertados
 * e o sinal da conclusão muda com o tamanho da vela. Aqui não se replica nada. Lêem-se as posições
 * que a mestre REALMENTE abriu (`funded_positions`, mãe + filhas por `mae_id`) e os preços a que
 * REALMENTE saiu, e só se re-pesa o que é re-pesável.
 *
 * O QUE É EXACTO (e porquê). O motor arma o BE e o trailing por DISTÂNCIA DE PREÇO, nunca por
 * volume: `gestaoDoSinal` põe `be_gatilho`/`trailing_ativacao` a partir da distância ao TP1 e
 * `trailing_distancia` a partir do risco. Mudar a percentagem de cada parcial NÃO mexe no caminho
 * do stop — só muda quanto volume estava em cada saída. Logo o resultado de qualquer outra escada
 * de parciais calcula-se com os MESMOS preços de saída, sem simular nada:
 *
 *     pips ponderados = Σ (fracção do volume inicial × pips daquela saída)
 *
 * O QUE É INFERIDO (e com que banda). O MFE (máximo a favor) não está gravado. Mas a saída do
 * runner É o stop trailing, e o stop trailing é `MFE − trailing_distancia` assim que o trailing
 * arma. Daí:  **MFE ≈ pips do runner + trailing_distancia**, com ±1 passo do motor (distância/10).
 * Quando o runner saiu no BE, o trailing nunca superou a folga e só se sabe que o MFE ficou entre
 * o gatilho do BE e (folga + distância). Quando nem o BE armou, o MFE ficou abaixo do gatilho.
 *
 * O QUE FICA DE FORA: o que o preço fez DEPOIS de a última parte fechar. Por isso o perfil «sem
 * trailing» sai em BANDA (mínimo: o resto volta ao SL original; máximo: o resto vai ao último TP),
 * e não como um número.
 *
 * VIÉS CONHECIDO: até 2026-09-24T14:23Z o preenchimento estava viciado a favor da casa (~+1,79 USD
 * por trade — commit a4b3909e). Toda esta amostra é anterior. Os R absolutos estão inflacionados;
 * as COMPARAÇÕES entre perfis não, porque partilham a mesma entrada.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { pipSizeForSymbol } from '../../lib/mtmcopy/trade-outcome'
import { ESTRATEGIAS_PRIMEVERSE } from '../../lib/mtmfunded/estrategias-sinais/calculo'

for (const ln of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(ln.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

/** mestre de cada estratégia (mtmauto_providers.funded_account_id). */
const MESTRES: Record<string, string> = {
  'mtm-auto-edge': '2ff64e17-6b14-4d77-9082-67fa23d0aee1',
  'mtm-auto-king': '4c517821-ba78-4daf-bd56-ccb0edef0b89',
  'mtm-auto-wolf': 'b8ea7dd4-e323-4e11-aa3d-fc040df0fc95',
}

async function rest(tabela: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const out: Record<string, unknown>[] = []
  for (let p = 0; ; p++) {
    const q = new URLSearchParams({ ...params, offset: String(p * 1000), limit: '1000' })
    const r = await fetch(`${url}/rest/v1/${tabela}?${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!r.ok) throw new Error(`supabase ${tabela} ${r.status}: ${await r.text()}`)
    const lote = (await r.json()) as Record<string, unknown>[]
    out.push(...lote)
    if (lote.length < 1000) return out
  }
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return v != null && v !== '' && Number.isFinite(n) ? n : null
}

interface Saida { fraccao: number; pips: number }
interface Trade {
  estrategia: string; symbol: string; direcao: 'buy' | 'sell'; abriuEm: number
  risco: number                 // pips, entrada → SL ancorado
  tpsPips: number[]             // alvos do sinal em pips desde a NOSSA entrada
  parciais: Saida[]             // saídas em TP já realizadas (filhas)
  runner: Saida                 // a parte que ficou na mãe
  trailDist: number | null      // pips
  beFeito: boolean
  mfeMin: number                // pips — limite inferior do máximo a favor
  mfeEstimado: number | null    // pips — só quando o trailing chegou a mexer
}

/** pips de um preço face à entrada, no sentido da posição. */
const emPips = (px: number, entrada: number, dir: 'buy' | 'sell', pip: number) =>
  ((dir === 'buy' ? px - entrada : entrada - px) / pip)

interface Desperdicio { estrategia: string; sinais: number; abriu: number; recusou: number; motivos: Map<string, number> }

/**
 * DESPERDÍCIO: sinais que chegaram ao ENTRY HIT e mesmo assim não deram posição na mestre. As
 * chaves `recon:` são histórico reconstituído à mão (092) e não contam como sinal vivo.
 *
 * AS RECUSAS DESTA AMOSTRA SÃO TODAS «sem preço ao vivo» E TODAS ANTERIORES A 24/09: a abertura
 * lia o retrato de `funded_precos`, que só aceita cada símbolo de 5 em 5 s enquanto a guarda de
 * frescura exigia EXACTAMENTE 5 s — e o ouro chegava (p50 0,9 s) mas os índices e a cripto não
 * (US30 p50 4,1 s, 41% já acima do limite). Por isso o Edge nunca abriu um índice em 9 dias
 * apesar dos 17 setups de US30/NAS100 do trader. A abertura passou a pedir o tick em memória ao
 * motor (../../lib/mtmfunded/precos/tick-motor.ts) nesse mesmo dia: esta coluna deve cair
 * sozinha, e é por ela que se confirma.
 */
async function desperdicio(): Promise<Desperdicio[]> {
  const linhas = await rest('funded_sinal_posicoes', {
    select: 'estrategia,chave,account_id,estado,erro', estrategia: `in.(${Object.keys(MESTRES).join(',')})`,
  })
  const mestres = new Set(Object.values(MESTRES))
  return Object.keys(MESTRES).map((slug) => {
    const minhas = linhas.filter((l) => l.estrategia === slug && !String(l.chave).startsWith('recon:'))
    const sinais = new Set(minhas.map((l) => String(l.chave)))
    const naMestre = minhas.filter((l) => mestres.has(String(l.account_id)))
    const motivos = new Map<string, number>()
    for (const l of naMestre) if (l.estado === 'recusada') {
      const m = String(l.erro ?? '?').replace(/ para [A-Z0-9]+/, ' para <símbolo>').replace(/ — .*/, '')
      motivos.set(m, (motivos.get(m) ?? 0) + 1)
    }
    return {
      estrategia: slug, sinais: sinais.size,
      abriu: naMestre.filter((l) => l.estado !== 'recusada').length,
      recusou: naMestre.filter((l) => l.estado === 'recusada').length, motivos,
    }
  })
}

async function carregar(): Promise<{ trades: Trade[]; semSinal: number }> {
  const contas = Object.values(MESTRES)
  const pos = await rest('funded_positions', {
    select: 'id,account_id,symbol,direcao,volume,volume_inicial,preco_entrada,preco_fecho,mae_id,estado,aberta_em,fechada_em,trailing_distancia,be_gatilho,be_offset,be_no_tp1,be_feito,motivo_fecho',
    account_id: `in.(${contas.join(',')})`, estado: 'eq.fechada', order: 'aberta_em.asc',
  })
  const pontes = await rest('funded_sinal_posicoes', {
    select: 'funded_position_id,estrategia,sl,tps', estrategia: `in.(${Object.keys(MESTRES).join(',')})`,
  })
  const porPosicao = new Map<string, Record<string, unknown>>()
  for (const p of pontes) if (p.funded_position_id) porPosicao.set(String(p.funded_position_id), p)
  const estrategiaDaConta = new Map(Object.entries(MESTRES).map(([s, c]) => [c, s]))

  const filhasDe = new Map<string, Record<string, unknown>[]>()
  for (const p of pos) if (p.mae_id) filhasDe.set(String(p.mae_id), [...(filhasDe.get(String(p.mae_id)) ?? []), p])

  const trades: Trade[] = []
  let semSinal = 0
  for (const m of pos) {
    if (m.mae_id) continue
    const ponte = porPosicao.get(String(m.id))
    const sl = num(ponte?.sl)
    const entrada = num(m.preco_entrada)
    const v0 = num(m.volume_inicial)
    const fecho = num(m.preco_fecho)
    if (entrada == null || v0 == null || v0 <= 0 || fecho == null) continue
    if (sl == null) { semSinal++; continue }   // as duas posições sem ponte (reposições à mão de 21/09)
    const dir = m.direcao === 'sell' ? 'sell' : 'buy'
    const symbol = String(m.symbol)
    const pip = pipSizeForSymbol(symbol)
    const risco = Math.abs(entrada - sl) / pip
    if (!(risco > 0)) { semSinal++; continue }
    const tpsPips = ((ponte?.tps as number[] | null) ?? [])
      .map((x) => emPips(x, entrada, dir, pip)).filter((x) => x > 0)
    const parciais = (filhasDe.get(String(m.id)) ?? []).map((f) => ({
      fraccao: (num(f.volume) ?? 0) / v0,
      pips: emPips(num(f.preco_fecho) ?? entrada, entrada, dir, pip),
    })).sort((a, b) => a.pips - b.pips)
    const runner = { fraccao: (num(m.volume) ?? 0) / v0, pips: emPips(fecho, entrada, dir, pip) }
    const trailDist = num(m.trailing_distancia) == null ? null : num(m.trailing_distancia)! / pip
    const folga = (num(m.be_offset) ?? 0) / pip
    const beFeito = m.be_feito === true
    // O trailing só se distingue do BE quando o runner saiu ACIMA da folga do BE.
    const trailMexeu = beFeito && trailDist != null && runner.pips > folga + 1e-9
    const mfeEstimado = trailMexeu ? runner.pips + trailDist! : null
    const maiorParcial = parciais.length ? Math.max(...parciais.map((p) => p.pips)) : 0
    trades.push({
      estrategia: estrategiaDaConta.get(String(m.account_id)) ?? '?',
      symbol, direcao: dir, abriuEm: new Date(String(m.aberta_em)).getTime(),
      risco, tpsPips, parciais, runner, trailDist, beFeito,
      mfeMin: Math.max(maiorParcial, runner.pips, mfeEstimado ?? 0),
      mfeEstimado,
    })
  }
  return { trades, semSinal }
}

// ── perfis de escada ─────────────────────────────────────────────────────────

/**
 * Re-pesa UM trade com outra escada de parciais. Exacto: os preços de saída não mudam, porque o
 * BE e o trailing armam por distância, não por volume.
 *
 * `pcts` são as percentagens dos TP1, TP2… O que sobra corre com o trailing e sai onde o runner
 * real saiu. Uma parcial num TP que o preço NÃO tocou não acontece — e o critério de «tocou» é o
 * mesmo do motor: o preço lá esteve (o MFE cobre-o) e o TP fica antes do último alvo.
 */
function reEscalar(t: Trade, pcts: number[]): number {
  let usado = 0
  let total = 0
  for (const [i, pct] of pcts.entries()) {
    const alvo = t.tpsPips[i]
    if (alvo == null || i >= t.tpsPips.length - 1) break
    if (alvo > t.mfeMin + 1e-9) break            // o preço não lá chegou
    const fr = Math.min(pct / 100, 1 - usado)
    if (fr <= 0) break
    total += fr * alvo
    usado += fr
  }
  return total + (1 - usado) * t.runner.pips
}

/** O que a escada actual REALMENTE deu (soma dos preenchimentos). */
const realizado = (t: Trade) =>
  t.parciais.reduce((s, p) => s + p.fraccao * p.pips, 0) + t.runner.fraccao * t.runner.pips

/**
 * A MESMA conta, mas com as parciais ancoradas na FRACÇÃO DO RISCO em vez de nos TPs do trader.
 *
 * É a pergunta de desenho: o TP1 do sinal está a 0,30R no Edge, 0,50R no King e 0,80R no Wolf, por
 * isso a MESMA configuração dá três gestões diferentes — quem manda na nossa gestão é o alvo do
 * trader, não nós. Uma parcial a kR sai sempre no mesmo sítio, seja qual for o trader.
 *
 * Exacto pelo mesmo argumento das outras escadas, e CONSERVADOR: a parcial só se dá por feita se o
 * MFE reconstituído (que é um limite inferior) lá chegou, portanto conta de menos, nunca de mais.
 */
function escadaEmR(t: Trade, niveis: { r: number; pct: number }[]): number {
  let usado = 0
  let total = 0
  for (const n of niveis) {
    const alvo = n.r * t.risco
    if (alvo > t.mfeMin + 1e-9) break
    const fr = Math.min(n.pct / 100, 1 - usado)
    if (fr <= 0) break
    total += fr * alvo
    usado += fr
  }
  return total + (1 - usado) * t.runner.pips
}

/**
 * «Sem trailing»: alvos do sinal + SL original. Em BANDA, porque o que o preço fez depois de a
 * última parte fechar não está gravado. Mínimo: o resto volta ao SL. Máximo: o resto vai ao fim.
 * A banda sai larga de propósito — é a resposta honesta com esta amostra, não um resultado.
 */
function semTrailing(t: Trade, pcts: number[]): { min: number; max: number } {
  let usado = 0
  let total = 0
  for (const [i, pct] of pcts.entries()) {
    const alvo = t.tpsPips[i]
    if (alvo == null || i >= t.tpsPips.length - 1) break
    if (alvo > t.mfeMin + 1e-9) break
    const fr = Math.min(pct / 100, 1 - usado)
    if (fr <= 0) break
    total += fr * alvo
    usado += fr
  }
  const resto = 1 - usado
  const ultimo = t.tpsPips.length ? t.tpsPips[t.tpsPips.length - 1] : t.runner.pips
  return { min: total + resto * -t.risco, max: total + resto * ultimo }
}

/**
 * LIMITE INFERIOR de uma distância de trailing diferente, com as parciais actuais.
 *
 * Um trailing MAIS LARGO sai sempre igual ou mais tarde do que o actual, por isso o MFE que ele
 * chega a ver é ≥ o que se observou: o resultado do runner é **pelo menos** `MFE − distância`.
 * Quando esse limite já é pior do que o realizado, a conclusão é firme (alargar não compensa);
 * quando é melhor, só diz que PODE compensar. Um trailing mais APERTADO não se estima assim — sai
 * mais cedo, num sítio do caminho que não está gravado — e por isso não aparece aqui.
 */
function trailingMaisLargo(t: Trade, fraccaoDoRisco: number): number | null {
  if (t.mfeEstimado == null) return null        // o trailing nem chegou a mexer: nada muda
  const parciais = t.parciais.reduce((s, p) => s + p.fraccao * p.pips, 0)
  const saida = Math.max(t.mfeEstimado - fraccaoDoRisco * t.risco, 0)   // 0 = o BE seguraria
  return parciais + t.runner.fraccao * saida
}

const SESSOES: { nome: string; de: number; ate: number }[] = [
  { nome: 'Ásia 00–07', de: 0, ate: 7 },
  { nome: 'Londres 07–12', de: 7, ate: 12 },
  { nome: 'Nova Iorque 12–17', de: 12, ate: 17 },
  { nome: 'tarde 17–24', de: 17, ate: 24 },
]

const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—')
const sinal = (x: number, d = 2) => `${x >= 0 ? '+' : ''}${f(x, d)}`

function linha(nome: string, ts: Trade[], valor: (t: Trade) => number): string {
  const rs = ts.map((t) => valor(t) / t.risco)
  const soma = rs.reduce((a, b) => a + b, 0)
  const media = soma / rs.length
  const dp = Math.sqrt(rs.reduce((a, b) => a + (b - media) ** 2, 0) / Math.max(1, rs.length - 1))
  const t = dp > 0 ? media / (dp / Math.sqrt(rs.length)) : 0
  const vit = rs.filter((r) => r > 0.02).length
  return `| ${nome} | ${ts.length} | ${Math.round((100 * vit) / rs.length)}% | ${sinal(soma, 1)} | ${sinal(media, 3)} | ${f(t, 1)} |`
}

async function main() {
  const { trades, semSinal } = await carregar()
  const desp = await desperdicio()
  const nomes = new Map(ESTRATEGIAS_PRIMEVERSE.map((e) => [e.slug, e.nome]))
  const md: string[] = []
  md.push('# Gestão do Edge / King / Wolf — medida nos preenchimentos reais', '')
  md.push(`Gerado por \`scripts/estudos/gestao-ekw-check.ts\` em ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Só leitura.`, '')
  md.push('> **Ressalva.** Amostra de dias, não de meses. Toda ela é anterior à correcção do viés de preenchimento de 2026-09-24T14:23Z (~+1,79 USD/trade a favor da casa): os R absolutos estão inflacionados, as comparações entre perfis não. As colunas em banda («sem trailing») são bandas porque o que o preço fez depois do último fecho não está gravado.', '')
  if (semSinal) md.push(`Posições sem ponte de sinal (reposições à mão), fora da conta: **${semSinal}**.`, '')

  md.push('## Do sinal à posição — onde se perdem trades', '')
  md.push('| estratégia | sinais vivos | abriu na mestre | recusou | porquê |', '|---|---:|---:|---:|---|')
  for (const d of desp) {
    const nome = nomes.get(d.estrategia) ?? d.estrategia
    const porque = [...d.motivos].map(([m, n]) => `${m} (${n})`).join(' · ') || '—'
    md.push(`| ${nome} | ${d.sinais} | ${d.abriu} | ${d.recusou} | ${porque} |`)
  }
  md.push('')

  for (const slug of Object.keys(MESTRES)) {
    const ts = trades.filter((t) => t.estrategia === slug)
    md.push(`## ${nomes.get(slug) ?? slug} — ${ts.length} trades`, '')
    if (!ts.length) { md.push('Sem trades fechados.', ''); continue }
    const riscos = ts.map((t) => t.risco).sort((a, b) => a - b)
    const tp1 = ts.filter((t) => t.tpsPips.length).map((t) => t.tpsPips[0] / t.risco).sort((a, b) => a - b)
    md.push(`Risco mediano **${f(riscos[riscos.length >> 1], 0)} pips**. TP1 mediano a **${f(tp1[tp1.length >> 1] ?? NaN)}R**. `
      + `Chegaram ao TP1: **${ts.filter((t) => t.beFeito).length}/${ts.length}**. Saíram pelo TP final: **${ts.filter((t) => t.runner.pips >= (t.tpsPips[t.tpsPips.length - 1] ?? Infinity) - 1e-9).length}/${ts.length}**.`, '')
    const mfes = ts.filter((t) => t.mfeEstimado != null).map((t) => t.mfeEstimado! / t.risco).sort((a, b) => a - b)
    if (mfes.length) {
      md.push(`MFE reconstruído (só os ${mfes.length} em que o trailing chegou a mexer): mediana **${f(mfes[mfes.length >> 1])}R**, máximo **${f(mfes[mfes.length - 1])}R**.`, '')
    }
    md.push('Escadas de parciais (mesmos preços de saída). A linha de controlo repete a escada actual pela fórmula: a diferença para o realizado é o spread dos preenchimentos.', '')
    md.push('| escada de parciais | n | % vit. | R total | R médio | t |', '|---|---:|---:|---:|---:|---:|')
    md.push(linha('**actual** 50% TP1 · 25% TP2 (realizado)', ts, realizado))
    for (const pcts of [[50, 25], [50], [25, 25], [25], [33, 33], []]) {
      const nome = pcts.length ? pcts.map((p, i) => `${p}% TP${i + 1}`).join(' · ') : 'sem parciais (tudo no trailing)'
      md.push(linha(nome + (pcts.length === 2 && pcts[0] === 50 && pcts[1] === 25 ? ' *(controlo: deve bater com o actual)*' : ''), ts, (t) => reEscalar(t, pcts)))
    }
    md.push('')
    md.push('Escadas ancoradas na FRACÇÃO DO RISCO (a parcial sai no mesmo sítio seja qual for o trader). '
      + 'CUIDADO com os níveis perto do MFE máximo da coluna de cima: aí a parcial dá-se por feita ou não por ±1 passo do trailing, '
      + 'e a linha fica pendurada em duas ou três trades — leia-se a direcção, não o número.', '')
    md.push('| escada | n | % vit. | R total | R médio | t |', '|---|---:|---:|---:|---:|---:|')
    for (const niveis of [[{ r: 0.5, pct: 50 }], [{ r: 1, pct: 50 }], [{ r: 1, pct: 33 }], [{ r: 1, pct: 50 }, { r: 2, pct: 25 }], [{ r: 1.5, pct: 50 }]]) {
      md.push(linha(niveis.map((n) => `${n.pct}% @ ${f(n.r, 1)}R`).join(' · '), ts, (t) => escadaEmR(t, niveis)))
    }
    md.push('')
    md.push('**Trailing mais largo** (mesmas parciais; limite INFERIOR — ver o comentário da função):', '')
    md.push('| trailing | n | % vit. | R total | R médio | t |', '|---|---:|---:|---:|---:|---:|')
    md.push(linha('0,50R (actual)', ts, realizado))
    for (const fr of [0.75, 1, 1.5]) {
      md.push(linha(`${f(fr)}R (≥)`, ts, (t) => trailingMaisLargo(t, fr) ?? realizado(t)))
    }
    md.push('')
    md.push('**Sem trailing** (alvos do sinal + SL original) — em banda, e a banda é a resposta:', '')
    md.push('| escada | R total mín. | R total máx. |', '|---|---:|---:|')
    for (const pcts of [[50, 25], [25, 25, 25], []]) {
      const nome = pcts.length ? pcts.map((p, i) => `${p}% TP${i + 1}`).join(' · ') : 'sem parciais (só o TP final)'
      const b = ts.map((t) => semTrailing(t, pcts))
      md.push(`| ${nome} | ${sinal(b.reduce((s, x, i) => s + x.min / ts[i].risco, 0), 1)} | ${sinal(b.reduce((s, x, i) => s + x.max / ts[i].risco, 0), 1)} |`)
    }
    md.push('')
  }

  // ── horários (as três juntas: por estratégia não há amostra nenhuma) ──────
  md.push('## Horário de abertura — as três juntas', '')
  md.push('| sessão (UTC) | n | % vit. | R total | R médio | t |', '|---|---:|---:|---:|---:|---:|')
  for (const se of SESSOES) {
    const ts = trades.filter((t) => { const h = new Date(t.abriuEm).getUTCHours(); return h >= se.de && h < se.ate })
    if (ts.length) md.push(linha(se.nome, ts, realizado))
  }
  md.push('')

  console.log(md.join('\n'))
}

main().catch((e) => { console.error(e); process.exit(1) })
