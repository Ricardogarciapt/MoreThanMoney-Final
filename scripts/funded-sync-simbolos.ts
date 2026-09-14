/**
 * SINCRONIZAR O CATÁLOGO DE SÍMBOLOS DO MTM FUNDED COM A PU PRIME.
 *
 *   npx tsx scripts/funded-sync-simbolos.ts            → escreve supabase/seeds/funded_symbols_puprime.sql
 *   npx tsx scripts/funded-sync-simbolos.ts --resumo   → só conta, não escreve
 *
 * Porquê daqui e não à mão: o dono quer «o mesmo número de símbolos negociáveis que a PU Prime».
 * São mais de mil, com contrato, dígitos, lotes e moeda do lucro próprios — copiar à mão é
 * garantir que um deles fica errado, e um contrato errado dá um lucro errado a quem negoceia.
 *
 * SÓ LEITURA na MetaApi: liga-se em streaming à conta de preços, lê as especificações e uma
 * cotação de cada símbolo (para o spread real), e desliga. Não escreve na base: gera o SQL, e
 * quem o aplica é uma pessoa.
 *
 * O que fica de fora, e porquê:
 *  · DISABLED e CLOSEONLY — a corretora não deixa abrir; um aluno também não devia.
 *  · LONGONLY — a corretora só deixa comprar, e o simulador não tem forma de proibir a venda;
 *    oferecê-los deixava fazer no simulado o que na corretora é impossível.
 *  · a pasta «Removed» — o nome diz tudo.
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { inferPipSize } from '../lib/mtmcopy/pip-points'

const RAIZ = join(__dirname, '..')
try {
  process.loadEnvFile(join(RAIZ, '.env.local'))
} catch {
  /* sem .env.local, usa o ambiente */
}

const CONTA = process.env.METAAPI_CONTA_PRECOS || '530d2e07-b391-440f-bc6e-f4c2a224057b'
const SAIDA = join(RAIZ, 'supabase/seeds/funded_symbols_puprime.sql')
const SO_RESUMO = process.argv.includes('--resumo')

type Classe = 'forex' | 'metal' | 'indice' | 'cripto' | 'acao' | 'etf' | 'energia' | 'commodity' | 'obrigacao'

interface Spec {
  symbol: string
  tradeMode?: string
  path?: string
  description?: string
  digits?: number
  point?: number
  pipSize?: number
  contractSize?: number
  minVolume?: number
  maxVolume?: number
  volumeStep?: number
  profitCurrency?: string
  tradeSessions?: Record<string, Array<{ from: string; to: string }>>
}

/**
 * A classe sai da PASTA da corretora, não do nome. O nome engana (GAS-Cs é gasolina, não gás;
 * «A» é a Agilent); a árvore do MetaTrader é a forma como a própria corretora os arruma.
 */
function classeDe(spec: Spec): Classe | null {
  const partes = (spec.path ?? '').split('\\')
  const topo = partes[0] ?? ''
  const sub = (partes[1] ?? '').toLowerCase()
  const nome = spec.symbol.toUpperCase()
  if (/^removed/i.test(topo)) return null
  if (/^forex/i.test(topo)) return 'forex'
  if (/^(gold|silver)/i.test(topo)) return 'metal'
  if (/^indices/i.test(topo)) return 'indice'
  if (/^oil/i.test(topo)) return 'energia'
  if (/^cryptos?/i.test(topo)) return 'cripto'
  if (/^etf/i.test(topo)) return 'etf'
  if (/^bonds?/i.test(topo)) return 'obrigacao'
  if (/^(equity|us\.24h)/i.test(topo)) return 'acao'
  if (/^commodit/i.test(topo)) {
    if (/GAS|OIL|NG|HEAT|COAL/.test(nome)) return 'energia'
    if (/^XP[TD]|PLAT|PALL/.test(nome)) return 'metal'
    return 'commodity'
  }
  if (/^247/.test(topo)) {
    if (sub.startsWith('stock')) return 'acao'
    if (sub.startsWith('crypto')) return 'cripto'
    if (sub.startsWith('ind')) return 'indice'
    if (sub.startsWith('etf')) return 'etf'
    return 'acao'
  }
  return null
}

/**
 * O NOME CANÓNICO — o que o aluno vê e o que as outras partes da MTM usam.
 *
 * Tira-se só o sufixo da CONTA (`.s`, `-Cs`, `#`), que é arrumação da corretora e não produto.
 * `.24H` e `ft` ficam: são produtos DIFERENTES (acção 24 horas, índice futuro), e tirar-lhes o
 * sufixo punha dois instrumentos com preços diferentes debaixo do mesmo nome.
 *
 * Os índices da lista base mantêm os nomes com que o M1 os semeou e com que os sinais da casa
 * falam (US30, NAS100, US500, GER40…), para as ideias da casa caírem no símbolo certo.
 */
const NOMES_DA_CASA: Record<string, string> = {
  DJ30: 'US30', US30: 'US30',
  NAS100: 'NAS100', USTEC: 'NAS100', NDX100: 'NAS100',
  SP500: 'US500', SPX500: 'US500', US500: 'US500',
  GER40: 'GER40', DE40: 'GER40', GER30: 'GER40',
  FT100: 'UK100', UK100: 'UK100',
  NIKKEI225: 'JPN225', JPN225: 'JPN225',
  USOUSD: 'USOIL', UKOUSD: 'UKOIL',
}

function canonico(simbolo: string): string {
  const limpo = simbolo.replace(/\.s$/i, '').replace(/-Cs$/i, '').replace(/#$/, '').toUpperCase()
  return NOMES_DA_CASA[limpo] ?? limpo
}

const ALAVANCAGEM: Record<Classe, number> = {
  forex: 100, metal: 100, indice: 20, energia: 20, acao: 5, etf: 5, cripto: 2, commodity: 10, obrigacao: 10,
}

/**
 * Comissão de ida e volta por lote, em USD: 7 em forex e metais (o preço típico de uma conta
 * ECN/Raw), 0 no resto — nos CFDs de índices, acções, energia e cripto o custo da corretora está
 * no SPREAD, e cobrar comissão por cima seria cobrar duas vezes o mesmo.
 */
function comissaoDe(classe: Classe): number {
  return classe === 'forex' || classe === 'metal' ? 7 : 0
}

/** O horário antigo de 061 (market-hours) para as classes que ele conhece; `sessoes` para o resto. */
function horarioDe(classe: Classe): string {
  if (classe === 'cripto') return 'cripto_24_7'
  if (classe === 'forex' || classe === 'metal' || classe === 'indice') return classe
  return 'sessoes'
}

/** Majors e metais primeiro — é o que 90% dos alunos procuram, e é o que o WebTrader abre. */
const ORDEM_BASE: Record<string, number> = {
  XAUUSD: 1, XAGUSD: 2, EURUSD: 10, GBPUSD: 11, USDJPY: 12, USDCHF: 13, AUDUSD: 14, USDCAD: 15,
  NZDUSD: 16, EURJPY: 17, GBPJPY: 18, US30: 30, NAS100: 31, US500: 32, GER40: 33, UK100: 34,
  JPN225: 35, USOIL: 40, UKOIL: 41, BTCUSD: 50, ETHUSD: 51,
}
const ORDEM_CLASSE: Record<Classe, number> = {
  forex: 100, metal: 200, indice: 300, energia: 400, cripto: 500, commodity: 600, acao: 1000, etf: 3000, obrigacao: 4000,
}

const q = (s: string | null | undefined) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const n = (x: number) => (Number.isFinite(x) ? String(Math.round(x * 1e8) / 1e8) : 'null')

async function main() {
  const token = process.env.METAAPI_TOKEN
  if (!token) throw new Error('METAAPI_TOKEN em falta')

  const require = createRequire(__filename)
  const sdk = require('metaapi.cloud-sdk/node')
  const MetaApi = sdk.default ?? sdk
  const api = new MetaApi(token)
  const conta = await api.metatraderAccountApi.getAccount(CONTA)
  const ligacao = conta.getStreamingConnection()
  await ligacao.connect()
  await ligacao.waitSynchronized({ timeoutInSeconds: 180 })

  const specs = ligacao.terminalState.specifications as Spec[]
  console.log(`especificações lidas: ${specs.length}`)

  const modos: Record<string, number> = {}
  for (const s of specs) modos[s.tradeMode ?? '?'] = (modos[s.tradeMode ?? '?'] ?? 0) + 1
  console.log('modos de negociação:', modos)

  // ── escolher os negociáveis e dar-lhes nome ────────────────────────────────
  const escolhidos = new Map<string, { spec: Spec; classe: Classe }>()
  const colisoes: string[] = []
  const semClasse: string[] = []
  for (const spec of specs) {
    if (spec.tradeMode !== 'SYMBOL_TRADE_MODE_FULL') continue
    const classe = classeDe(spec)
    if (!classe) { semClasse.push(`${spec.symbol} (${spec.path})`); continue }
    const nome = canonico(spec.symbol)
    const ja = escolhidos.get(nome)
    if (ja) {
      // Duas variantes com o mesmo nome: fica a do sufixo NATIVO da conta (`.s`), que é a que a
      // conta Standard negoceia.
      const preferir = /\.s$/i.test(spec.symbol) && !/\.s$/i.test(ja.spec.symbol)
      colisoes.push(`${nome}: ${ja.spec.symbol} vs ${spec.symbol} → ${preferir ? spec.symbol : ja.spec.symbol}`)
      if (!preferir) continue
    }
    escolhidos.set(nome, { spec, classe })
  }
  if (colisoes.length) console.log('colisões de nome:', colisoes)
  if (semClasse.length) console.log('fora (sem classe):', semClasse.slice(0, 20))

  // ── uma cotação de cada, para o spread real ─────────────────────────────────
  // Em lotes: subscrever mil símbolos de uma vez é pedir para a MetaApi cortar a ligação.
  const precos = new Map<string, { bid: number; ask: number }>()
  if (!SO_RESUMO) {
    const fontes = [...escolhidos.values()].map((e) => e.spec.symbol)
    const LOTE = 40
    for (let i = 0; i < fontes.length; i += LOTE) {
      const lote = fontes.slice(i, i + LOTE)
      await Promise.all(
        lote.map((s) =>
          ligacao.subscribeToMarketData(s, [{ type: 'quotes', intervalInMilliseconds: 5000 }]).catch(() => undefined),
        ),
      )
      await new Promise((r) => setTimeout(r, 2500))
      for (const s of lote) {
        const p = ligacao.terminalState.price(s) as { bid?: number; ask?: number } | undefined
        if (p?.bid && p?.ask && p.ask >= p.bid) precos.set(s, { bid: p.bid, ask: p.ask })
      }
      await Promise.all(lote.map((s) => ligacao.unsubscribeFromMarketData(s).catch(() => undefined)))
      process.stdout.write(`\rcotações: ${precos.size}/${Math.min(i + LOTE, fontes.length)}`)
    }
    process.stdout.write('\n')
  }
  await ligacao.close().catch(() => undefined)

  // ── o SQL ──────────────────────────────────────────────────────────────────
  const porClasse: Record<string, number> = {}
  const linhas: string[] = []
  const lista = [...escolhidos.entries()].sort(([a], [b]) => a.localeCompare(b))
  let semPreco = 0
  lista.forEach(([nome, { spec, classe }], i) => {
    porClasse[classe] = (porClasse[classe] ?? 0) + 1
    const digits = Number(spec.digits ?? 5)
    const point = Number(spec.point ?? Math.pow(10, -digits))
    const pip = inferPipSize({ point, pipSize: spec.pipSize, digits }, nome)
    const p = precos.get(spec.symbol)
    if (!p) semPreco++
    // Spread real se houve cotação; sem ela, 2 pips (conservador — nunca zero, que seria um
    // mercado sem custo que não existe em lado nenhum).
    const spread = Math.max(1, p ? Math.round((p.ask - p.bid) / point) : Math.round((pip / point) * 2))
    const ordem = ORDEM_BASE[nome] ?? ORDEM_CLASSE[classe] + i
    linhas.push(
      `  (${q(nome)}, ${q((spec.description || nome).slice(0, 80))}, ${q(classe)}, ${digits}, ${n(Number(spec.contractSize ?? 1))}, ` +
        `${n(pip)}, ${spread}, ${comissaoDe(classe)}, ${n(Number(spec.volumeStep ?? 0.01))}, ${n(Number(spec.minVolume ?? 0.01))}, ` +
        `${n(Number(spec.maxVolume ?? 50))}, ${ALAVANCAGEM[classe]}, ${q(horarioDe(classe))}, ${q(spec.symbol)}, ` +
        `${q((spec.profitCurrency || 'USD').toUpperCase())}, ${spec.tradeSessions ? q(JSON.stringify(spec.tradeSessions)) + '::jsonb' : 'null'}, ${ordem}, true)`,
    )
  })

  console.log(`negociáveis: ${lista.length} · sem cotação (spread por defeito): ${semPreco}`)
  console.log('por classe:', porClasse)
  if (SO_RESUMO) return

  const sql = `-- Gerado por scripts/funded-sync-simbolos.ts em ${new Date().toISOString()}
-- Fonte: conta PU Prime ${CONTA.slice(0, 8)}… (MetaApi, só leitura). NÃO EDITAR À MÃO — voltar a correr o script.
-- Requer a migração 064 (classes novas, moeda_lucro, sessoes).
--
-- ${lista.length} símbolos negociáveis: ${Object.entries(porClasse).map(([c, k]) => `${c} ${k}`).join(' · ')}
-- Comissão por lote (ida e volta, USD): 7 em forex e metais; 0 no resto (custo no spread).
-- Alavancagem máxima por classe: forex/metal 100 · índice/energia 20 · commodity/obrigação 10 · acção/ETF 5 · cripto 2.
-- \`sessoes\` = tradeSessions da corretora em HORA DO SERVIDOR DA CORRETORA (o motor mede o desvio pelos ticks).

begin;

insert into public.funded_symbols
  (symbol, nome, classe, digits, contract_size, pip_size, spread_pontos, comissao_lote, volume_step, volume_min,
   volume_max, alavancagem_max, horario, simbolo_fonte, moeda_lucro, sessoes, ordem, ativo)
values
${linhas.join(',\n')}
on conflict (symbol) do update set
  nome = excluded.nome, classe = excluded.classe, digits = excluded.digits, contract_size = excluded.contract_size,
  pip_size = excluded.pip_size, spread_pontos = excluded.spread_pontos, comissao_lote = excluded.comissao_lote,
  volume_step = excluded.volume_step, volume_min = excluded.volume_min, volume_max = excluded.volume_max,
  alavancagem_max = excluded.alavancagem_max, horario = excluded.horario, simbolo_fonte = excluded.simbolo_fonte,
  moeda_lucro = excluded.moeda_lucro, sessoes = excluded.sessoes, ordem = excluded.ordem, ativo = true,
  updated_at = now();

-- O que a PU Prime já não negoceia sai da montra — mas NÃO se apaga: há posições que apontam
-- para lá, e o histórico de um aluno não pode perder o nome do que ele negociou.
update public.funded_symbols set ativo = false, updated_at = now()
 where symbol not in (${lista.map(([nome]) => q(nome)).join(', ')});

commit;
`
  mkdirSync(dirname(SAIDA), { recursive: true })
  writeFileSync(SAIDA, sql)
  console.log(`escrito: ${SAIDA}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('falhou:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
