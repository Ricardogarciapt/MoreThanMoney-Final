/**
 * A GUARDA DA VISTA DOS ALERTAS.
 *
 *   npx tsx lib/mtm-alerts/vista.check.ts
 *
 * O caso mau é o que foi reportado a 01/10: 470 alertas em 24 horas e o ecrã vazio, sem erro
 * nenhum e sem dizer porquê.
 */
import { montarVista, naSubscricao, estadoDoAlerta, type AlertaParaVista, type Subscricao } from './vista'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const VAZIA: Subscricao = { symbols: [], strategies: [], timeframes: [] }
/** Os sete com que a subscrição nasce. A casa sinaliza em dezenas. */
const POR_DEFEITO: Subscricao = {
  symbols: ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDCAD', 'USDJPY', 'BTCUSD', 'US30'],
  strategies: [], timeframes: [],
}
const a = (ticker: string, tradeStatus: string | null = 'active'): AlertaParaVista => ({ ticker, tradeStatus })

/** O retrato real das 24 que a rota devolvia quando o ecrã aparecia vazio. */
const REAIS = [
  a('NZDUSD'), a('AUDCHF'), a('NZDCHF'), a('GBPCHF'), a('EURGBP'), a('GBPCAD'),
  a('AUDCAD'), a('NZDJPY'), a('EURJPY'), a('SPX500'), a('NATURALGAS'), a('GBPNZD'),
  a('EURUSD'), a('USDCAD'), a('USDCHF', 'loss'), a('GBPJPY', 'loss'),
]

// ── O CASO MAU ──────────────────────────────────────────────────────────────
{
  const comFiltro = montarVista(REAIS, { sub: POR_DEFEITO, soOQueSigo: true, estado: 'all' })
  teste('com a subscrição a filtrar, quase tudo desaparece', comFiltro.visiveis.length <= 3)
  teste('e diz quantos está a esconder', comFiltro.escondidosPelaSubscricao > 10)

  /**
   * O QUE ESTE MÓDULO MUDA: a vista abre em TODOS. Quem abre a lista está a perguntar «o que há»,
   * não «o que é que eu mandei avisar-me». A subscrição decide o que é ENVIADO, não o que é VISTO.
   */
  const semFiltro = montarVista(REAIS, { sub: POR_DEFEITO, soOQueSigo: false, estado: 'all' })
  teste('sem o filtro ligado, vê-se o que há', semFiltro.visiveis.length === 14)
  teste('e não há vazio para explicar', semFiltro.motivoDoVazio === null)
}

// ── UM VAZIO TEM SEMPRE MOTIVO ──────────────────────────────────────────────
{
  /**
   * «Não há alertas» era MENTIRA: havia 470. Um vazio que não se explica manda a pessoa
   * recarregar a página para sempre.
   */
  const soExoticos = [a('NZDCHF'), a('GBPCAD'), a('NATURALGAS')]
  const v = montarVista(soExoticos, { sub: POR_DEFEITO, soOQueSigo: true, estado: 'all' })
  teste('vazio por subscrição diz que é a subscrição', v.visiveis.length === 0 && v.motivoDoVazio === 'subscricao')

  const soTerminados = [a('EURUSD', 'loss'), a('EURUSD', 'exit_3')]
  const e = montarVista(soTerminados, { sub: VAZIA, soOQueSigo: false, estado: 'all' })
  teste('vazio por estado diz que é o estado', e.visiveis.length === 0 && e.motivoDoVazio === 'estado')

  const nada = montarVista([], { sub: VAZIA, soOQueSigo: false, estado: 'all' })
  teste('sem nada chegado, diz isso', nada.motivoDoVazio === 'nada_chegou')

  // E o motivo culpa o filtro CERTO: com a subscrição desligada o problema deixa de ser ela.
  const semSub = montarVista(soExoticos, { sub: POR_DEFEITO, soOQueSigo: false, estado: 'win' })
  teste('com a subscrição desligada, a culpa é do estado', semSub.motivoDoVazio === 'estado')
}

// ── A SUBSCRIÇÃO ────────────────────────────────────────────────────────────
{
  teste('subscrição vazia não filtra nada', naSubscricao(a('QUALQUERCOISA'), VAZIA))
  teste('símbolo na lista passa', naSubscricao(a('EURUSD'), POR_DEFEITO))
  teste('símbolo fora da lista não passa', !naSubscricao(a('NZDCHF'), POR_DEFEITO))
  // Pontuação e caixa não fazem um símbolo diferente: «EUR/USD» é EURUSD.
  teste('a pontuação não muda o símbolo', naSubscricao(a('eur/usd'), POR_DEFEITO))
  teste('timeframe fora não passa',
    !naSubscricao({ ticker: 'EURUSD', timeframe: '5' }, { ...POR_DEFEITO, timeframes: ['60'] }))
  teste('sem timeframe no alerta, o filtro de timeframe não o apaga',
    naSubscricao({ ticker: 'EURUSD' }, { ...POR_DEFEITO, timeframes: ['60'] }))
}

// ── OS ESTADOS ──────────────────────────────────────────────────────────────
{
  teste('pending', estadoDoAlerta('pending') === 'pending')
  teste('loss', estadoDoAlerta('loss') === 'loss')
  teste('exit_1 é win', estadoDoAlerta('exit_1') === 'win')
  teste('closed é win', estadoDoAlerta('closed') === 'win')
  teste('nulo é activo', estadoDoAlerta(null) === 'active')

  const t = [a('EURUSD', 'pending'), a('EURUSD', 'active'), a('EURUSD', 'loss'), a('EURUSD', 'exit_2')]
  teste('«Ativos» mostra só vivos',
    montarVista(t, { sub: VAZIA, soOQueSigo: false, estado: 'all' }).visiveis.length === 2)
  teste('«Wins» mostra só os ganhos',
    montarVista(t, { sub: VAZIA, soOQueSigo: false, estado: 'win' }).visiveis.length === 1)
  teste('e diz quantos o estado escondeu',
    montarVista(t, { sub: VAZIA, soOQueSigo: false, estado: 'win' }).escondidosPeloEstado === 3)
}

if (falhas.length) {
  console.error(`mtm-alerts/vista: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('mtm-alerts/vista: a lista abre em TODOS, e um vazio diz sempre porquê ✓')
