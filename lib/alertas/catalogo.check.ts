/**
 * A GUARDA DO CATÁLOGO DOS ALERTAS.
 *
 *   npx tsx lib/alertas/catalogo.check.ts
 *
 * O caso mau é o de 05/10: «ESTRATÉGIAS (6)» com 4 chips apagados e «ATIVOS (7)» com 5
 * categorias — cada superfície com o seu catálogo à mão e a subscrição guardada num formato que
 * nenhuma delas voltava a reconhecer. Esta guarda FALHA se uma superfície voltar a declarar o seu
 * próprio catálogo, ou se a subscrição deixar de ser lida pela chave canónica.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLASSES_DE_ACTIVOS, ESTRATEGIAS, GRUPOS_DE_ACTIVOS, TIMEFRAMES, TOTAL_DE_ACTIVOS,
  alertaNasEstrategias, cabecalhoDoSelector, chaveDeSubscricao, normalizarEstrategiasSubscricao,
} from './catalogo'
import { naSubscricao } from '../mtm-alerts/vista'
import { SCANNER_ORDER } from '../mtm-alerts/scanners'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

// ── O CASO MAU: a linha REAL da base que dava «ESTRATÉGIAS (6)» com 4 chips ─────────────
{
  const guardado = ['GOLDENZONE', 'KILLSHOT', 'SENSEI', 'GOLDKILLER', 'MTMSCANNER', 'AURUM FLOW']
  const limpo = normalizarEstrategiasSubscricao(guardado)
  teste('as 6 guardadas ficam 4 — as que existem', limpo.length === 4)
  teste('GOLDENZONE nunca foi estratégia de alerta', chaveDeSubscricao('GOLDENZONE') === null)
  teste('KILLSHOT também não', chaveDeSubscricao('KILLSHOT') === null)
  // E NÃO caem no MTM Scanner por omissão — era o que scannerKeyFromStrategy faria.
  teste('o que não existe não vira MTM Scanner às escondidas', !limpo.includes('mtmscanner') || limpo.filter((k) => k === 'mtmscanner').length === 1)
  teste('o chip acende com o valor em maiúsculas da base', chaveDeSubscricao('SENSEI') === 'sensei')
  teste('«AURUM FLOW» (texto antigo do chip) é a aurum', chaveDeSubscricao('AURUM FLOW') === 'aurum')
  teste('«Goldkiller» (texto antigo do chip) é a goldkiller', chaveDeSubscricao('Goldkiller') === 'goldkiller')
  teste('«MTMScanner» (texto antigo do chip) é a mtmscanner', chaveDeSubscricao('MTMScanner') === 'mtmscanner')
  teste('a chave canónica lê-se a si própria', ESTRATEGIAS.every((e) => chaveDeSubscricao(e.valorSubscricao) === e.chave))
  teste('repetidos colapsam', normalizarEstrategiasSubscricao(['SENSEI', 'sensei', 'Sensei']).length === 1)
}

// ── O CABEÇALHO DIZ O QUE CONTA E DE QUANTO ──────────────────────────────────────────────
{
  teste('«7 de 22», não «(7)»', cabecalhoDoSelector('Ativos', 7, TOTAL_DE_ACTIVOS) === `Ativos · 7 de ${TOTAL_DE_ACTIVOS}`)
  teste('zero seleccionados = todos', cabecalhoDoSelector('Estratégias', 0, 4) === 'Estratégias · todos (4)')
  teste('há 4 estratégias no catálogo, as mesmas de lib/mtm-alerts/scanners', ESTRATEGIAS.length === SCANNER_ORDER.length)
  teste('5 grupos no selector de activos', GRUPOS_DE_ACTIVOS.length === 5)
  teste('o selector tem Ações com 6 (eram geradas num spread e o grep contava 1)', GRUPOS_DE_ACTIVOS.find((g) => g.chave === 'stock')?.simbolos.length === 6)
  teste('5 classes para filtrar alertas', CLASSES_DE_ACTIVOS.length === 5)
  teste('6 timeframes', TIMEFRAMES.length === 6 && TIMEFRAMES.includes('15'))
}

// ── A SUBSCRIÇÃO FILTRA PELA CHAVE CANÓNICA, NÃO POR TEXTO ────────────────────────────────
{
  teste('«MTM Sensei X» cabe numa subscrição «SENSEI»', alertaNasEstrategias('MTM Sensei X', ['SENSEI']))
  teste('«MTMScanner» não cabe numa subscrição só GoldKiller', !alertaNasEstrategias('MTMScanner', ['goldkiller']))
  teste('«MTM Perps Aurum Flow» cabe na aurum', alertaNasEstrategias('MTM Perps Aurum Flow', ['aurum']))
  teste('subscrição vazia deixa passar tudo', alertaNasEstrategias('GoldKiller', []))
  teste('subscrição só com lixo = vazia (não esconde tudo)', alertaNasEstrategias('GoldKiller', ['GOLDENZONE']))
  const sub = { symbols: [], strategies: ['GOLDKILLER'], timeframes: [] }
  teste('a vista usa a mesma regra', naSubscricao({ ticker: 'XAUUSD', strategy: 'GoldKiller' }, sub) && !naSubscricao({ ticker: 'EURUSD', strategy: 'MTMScanner' }, sub))
}

// ── AS TRÊS SUPERFÍCIES IMPORTAM DAQUI — e não têm catálogo próprio ──────────────────────
{
  const raiz = join(__dirname, '..', '..')
  const ler = (p: string) => readFileSync(join(raiz, p), 'utf8')
  const mobile = ler('components/mobile/trading-alerts-mobile.tsx')
  const desktop = ler('components/alertas-mtm.tsx')
  const scannerAccess = ler('app/scanner-access/page.tsx')
  const paginaAlertas = ler('app/alertas-mtm/page.tsx')
  const subsRoute = ler('app/api/mtm-alerts/subscriptions/route.ts')
  const webhook = ler('app/api/webhooks/tradingview/route.ts')
  const manage = ler('app/api/mtm-alerts/manage/route.ts')

  teste('a app-mobile importa o catálogo', mobile.includes('@/lib/alertas/catalogo'))
  teste('o desktop importa o catálogo', desktop.includes('@/lib/alertas/catalogo'))
  // /scanner-access e /alertas-mtm herdam do desktop: é o MESMO componente.
  teste('/scanner-access usa o componente partilhado', scannerAccess.includes('from "@/components/alertas-mtm"'))
  teste('/alertas-mtm usa o componente partilhado', paginaAlertas.includes('from "@/components/alertas-mtm"'))

  const proprio = [/const STRATEGIES\b/, /const ASSET_CLASSES\b/, /const TIMEFRAMES\s*=/, /const CLASS_LABELS\b/, /function classifyAssetClient/, /const FX_CODES\b/]
  for (const re of proprio) {
    teste(`a app-mobile não declara catálogo próprio (${re.source})`, !re.test(mobile))
    teste(`o desktop não declara catálogo próprio (${re.source})`, !re.test(desktop))
  }

  teste('a rota das subscrições grava chaves canónicas', subsRoute.includes('normalizarEstrategiasSubscricao(body.strategies)'))
  teste('o push do webhook respeita as estratégias subscritas', webhook.includes('alertaNasEstrategias(strategy, s.strategies)') && webhook.includes('symbols, timeframes, strategies'))

  // A análise IA passa pela porta única — nunca por um fornecedor directo.
  teste('a gestão IA usa chamarIA', manage.includes("from \"@/lib/ia/chamar\""))
  for (const [nome, src] of [['manage', manage], ['mobile', mobile], ['desktop', desktop]] as const) {
    teste(`${nome} não chama Anthropic/OpenAI directamente`, !/from ['"]@anthropic-ai|from ['"]openai['"]|api\.openai\.com|api\.anthropic\.com/.test(src))
  }
}

if (falhas.length) {
  console.error(`alertas/catalogo: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('alertas/catalogo: uma fonte para as três superfícies, e a subscrição lê-se pela chave ✓')
