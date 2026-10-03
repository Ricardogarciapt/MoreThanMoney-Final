/**
 * GESTÃO AUTOMÁTICA EM CONTAS DE CORRETORA — a decisão, pura (sem base, sem rede, sem Next).
 *
 * PORQUE EXISTE. O Auto BE e o Auto Trailing do WebTrader só funcionavam nas contas MTM Funded: a
 * gestão dessas posições vive em colunas de `funded_positions` e o motor do VPS lê-as a cada tick.
 * Nas contas de corretora os mesmos botões só escreviam no localStorage — a preferência ficava
 * guardada e ninguém a executava. Isto é o «outro lado» que faltava.
 *
 * NÃO É UM MOTOR NOVO. A regra continua a ser a de `decidirGestao` (lib/mtmfunded/simulado/
 * avancadas.ts), a mesma que gere as contas simuladas e as mestres — e que é lucrativa justamente
 * por causa do trailing. Escrever aqui uma segunda versão da regra era ter duas verdades: um SL a
 * comportar-se de uma maneira na conta simulada e de outra na conta com dinheiro. O que esta camada
 * acrescenta são as TRAVÕES de uma conta real, porque aqui um erro custa dinheiro:
 *
 *  1. SEM CONFIGURAÇÃO, SEM ACÇÃO. Só se decide com a configuração que o dono gravou para AQUELA
 *     posição. Uma posição sem linha não é tocada — nem para «arrumar» o SL.
 *  2. NUNCA FECHA NADA. Esta camada só sabe produzir um SL novo. Não fecha, não faz parciais, não
 *     cancela pendentes. Por isso os TPs parciais vão a `null` para `decidirGestao`: a decisão de
 *     fechar volume numa conta real é do trader, e é dada à mão no ticket.
 *  3. SÓ COM PREÇO DA CORRETORA. O nosso feed (`funded_precos`) é indicativo e pode estar minutos
 *     atrasado num símbolo parado. Mover o SL de uma conta real por um preço indicativo era arriscar
 *     apertar um stop contra um preço que já não existe. Sem preço da corretora, não se age.
 *  4. SÓ APERTA, E NUNCA PARA CIMA DO PREÇO. `decidirGestao` já só aperta; aqui volta a verificar-se
 *     tudo à saída (o SL fica do lado seguro do preço e melhor do que o actual), porque a alternativa
 *     de um bug é um SL colocado do lado errado — ou seja, uma posição fechada a mercado sem ninguém
 *     ter pedido. Na dúvida devolve-se «não agir» com o motivo.
 *  5. NADA DE ADIVINHAR A POSIÇÃO. Direcção, entrada, volume e SL actual vêm SEMPRE do que a
 *     corretora acabou de dizer; da base só vem a configuração. Uma posição que mudou (parcial à
 *     mão, SL mexido) é avaliada como está agora.
 *
 * Testado em lib/webtrader/__tests__/gestao-auto-real.check.ts.
 */
import { type Gestao, decidirGestao, passoTrailing } from '@/lib/mtmfunded/simulado/avancadas'
import type { Direcao, Preco, Simbolo } from '@/lib/mtmfunded/simulado/matematica'
import { classeGestao, unidadeGestao } from '@/lib/mtmfunded/simulado/gestao-auto'
import type { DirecaoWT, PosicaoWT, PrecoWT } from './corretoras/tipos'

/** A configuração gravada para uma posição (distâncias em PREÇO, como no motor). */
export interface ConfigGestaoReal {
  trailing_distancia: number | null
  trailing_ativacao: number | null
  be_gatilho: number | null
  be_offset: number
  be_feito: boolean
}

export const CONFIG_VAZIA: ConfigGestaoReal = {
  trailing_distancia: null, trailing_ativacao: null, be_gatilho: null, be_offset: 0, be_feito: false,
}

/** Tem alguma coisa para executar? Uma linha sem gestão não vale uma ida à corretora. */
export function configTemGestao(c: ConfigGestaoReal | null | undefined): boolean {
  return Boolean(c && ((c.trailing_distancia && c.trailing_distancia > 0) || (c.be_gatilho && c.be_gatilho > 0 && !c.be_feito)))
}

const CLASSE_MATEMATICA: Record<ReturnType<typeof classeGestao>, Simbolo['classe']> = {
  ouro: 'metal', forex: 'forex', indice: 'indice', cripto: 'cripto', outro: 'commodity',
}

/**
 * O símbolo mínimo que a decisão precisa, a partir do que uma conta de corretora sabe (nome e casas
 * decimais). É o MESMO `pip_size` que o ecrã usa para converter pips em preço (`unidadeGestao`): se
 * o ecrã prometesse «30 pips» com um pip e o executor usasse outro, o SL aterrava noutro sítio.
 *
 * `volume_min`/`volume_step` só entram nos parciais, que aqui nunca acontecem — ficam em 0,01 (o
 * lote mínimo comum) para o tipo estar completo, não porque alguma decisão os leia.
 */
export function simboloDaCorretora(symbol: string, digits: number): Simbolo & { pip_size: number } {
  const base = { symbol, digits: Math.max(0, Math.min(8, Math.round(digits))) }
  const pip = unidadeGestao(base).tamanho
  return {
    symbol, classe: CLASSE_MATEMATICA[classeGestao(base)], digits: base.digits, pip_size: pip,
    contract_size: 1, spread_pontos: 0, comissao_lote: 0,
    volume_min: 0.01, volume_step: 0.01, volume_max: 100, alavancagem_max: 100,
  }
}

/**
 * O preço a usar para gerir esta posição, ou null quando não se pode confiar nele.
 *
 * Por ordem de confiança: o `precoAtual` que a corretora dá com a própria posição (é o preço a que
 * ela fecharia — o MT5 dá-o) e, quando não vem, a cotação da corretora (a TradeLocker dá-a). O nosso
 * feed indicativo é recusado de propósito: ver a travão 3 no cabeçalho.
 */
export function precoDeGestao(pos: Pick<PosicaoWT, 'symbol' | 'direcao' | 'precoAtual'>, cotacao: PrecoWT | null | undefined): Preco | null {
  if (pos.precoAtual != null && pos.precoAtual > 0) {
    // Um preço só: serve de bid e de ask porque `precoDeFecho` vai escolher o do lado desta posição.
    return { symbol: pos.symbol, bid: pos.precoAtual, ask: pos.precoAtual }
  }
  if (!cotacao || cotacao.indicativo) return null
  if (!(cotacao.bid > 0) || !(cotacao.ask > 0)) return null
  return { symbol: pos.symbol, bid: cotacao.bid, ask: cotacao.ask }
}

export type DecisaoGestaoReal =
  | { agir: false; motivo: string; beFeito: boolean }
  | { agir: true; sl: number; motivo: 'trailing' | 'break_even'; beFeito: boolean }

/**
 * O que fazer a UMA posição de corretora com este preço. `beFeito` volta sempre, porque o
 * break-even pode dar-se por feito sem mexer no SL (quando o SL já estava melhor) e isso tem de
 * ficar gravado — senão o gatilho voltava a disparar para trás no minuto seguinte.
 */
export function decidirGestaoReal(
  pos: Pick<PosicaoWT, 'id' | 'symbol' | 'direcao' | 'volume' | 'precoEntrada' | 'sl'>,
  cfg: ConfigGestaoReal,
  s: Simbolo & { pip_size: number },
  p: Preco | null,
): DecisaoGestaoReal {
  if (!configTemGestao(cfg)) return { agir: false, motivo: 'sem gestão configurada', beFeito: cfg.be_feito }
  if (!p) return { agir: false, motivo: 'sem preço da corretora', beFeito: cfg.be_feito }
  if (!(pos.precoEntrada > 0) || !(pos.volume > 0)) return { agir: false, motivo: 'posição sem entrada ou sem volume', beFeito: cfg.be_feito }

  const gestao: Gestao = {
    trailing_distancia: cfg.trailing_distancia,
    trailing_ativacao: cfg.trailing_ativacao,
    be_gatilho: cfg.be_gatilho,
    be_offset: cfg.be_offset || 0,
    be_no_tp1: false, // não há TP1 aqui: os parciais de uma conta real são do trader
    be_feito: cfg.be_feito,
    tps: null, // travão 2: esta camada nunca fecha volume
    volume_inicial: pos.volume,
  }
  const d = decidirGestao(
    { id: pos.id, symbol: pos.symbol, direcao: pos.direcao as Direcao, volume: pos.volume, preco_entrada: pos.precoEntrada, sl: pos.sl, tp: null, gestao },
    s, p, {},
  )
  // Se alguma vez aparecer um parcial decidido, algo está errado na montagem acima: pára tudo em vez
  // de mexer num SL com a gestão que não era esta.
  if (d.parciais.length) return { agir: false, motivo: 'decisão inesperada com parciais — nada feito', beFeito: cfg.be_feito }
  if (d.novoSl == null || d.motivoSl == null) return { agir: false, motivo: 'nada a mexer neste preço', beFeito: d.beFeito }

  const seguro = slSeguro(pos.direcao, pos.sl, d.novoSl, p, s, cfg)
  if (seguro) return { agir: false, motivo: seguro, beFeito: d.beFeito }
  return { agir: true, sl: d.novoSl, motivo: d.motivoSl, beFeito: d.beFeito }
}

/**
 * A última verificação antes de tocar em dinheiro real: devolve o MOTIVO para não agir, ou null se
 * o SL novo é seguro. É deliberadamente redundante com `decidirGestao` — é a diferença entre um bug
 * que não move o SL e um bug que fecha a posição a mercado.
 */
function slSeguro(
  direcao: DirecaoWT, slActual: number | null, novo: number, p: Preco, s: Simbolo & { pip_size: number }, cfg: ConfigGestaoReal,
): string | null {
  if (!Number.isFinite(novo) || novo <= 0) return 'SL calculado inválido'
  const sinal = direcao === 'buy' ? 1 : -1
  // O preço a que ESTA posição fecha: numa compra vende-se ao bid, numa venda compra-se ao ask.
  const fecho = direcao === 'buy' ? p.bid : p.ask
  if (!(fecho > 0)) return 'preço de fecho inválido'
  // Do lado seguro: numa compra o SL fica ABAIXO do preço. Igual ao preço já é um fecho imediato.
  if ((fecho - novo) * sinal <= 0) return 'SL ficaria do lado errado do preço — não mexido'
  // E tem de melhorar o que já lá está, pelo menos o passo do motor (um SL a mexer por décimos de
  // pip era um pedido à corretora por minuto sem ganho nenhum).
  if (slActual != null) {
    const passo = cfg.trailing_distancia && cfg.trailing_distancia > 0 ? passoTrailing(s, cfg.trailing_distancia) : s.pip_size
    if ((novo - slActual) * sinal < Math.min(passo, s.pip_size) - 1e-12) return 'o SL actual já está igual ou melhor'
  }
  return null
}

/**
 * Uma linha da base → configuração. Tolerante ao que vem da base (numéricos chegam como string),
 * severo com o que não faz sentido: um número ilegível vale null, e null é «não gerir».
 */
export function configDaLinha(r: Record<string, unknown>): ConfigGestaoReal {
  const n = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const x = Number(v)
    return Number.isFinite(x) && x > 0 ? x : null
  }
  return {
    trailing_distancia: n(r.trailing_distancia),
    trailing_ativacao: n(r.trailing_ativacao),
    be_gatilho: n(r.be_gatilho),
    be_offset: n(r.be_offset) ?? 0,
    be_feito: r.be_feito === true || r.be_feito === 'true',
  }
}

/**
 * O pedido que chega do ecrã → configuração gravável, ou o erro. As mesmas regras de `validarGestao`
 * (folga menor que o gatilho, trailing de pelo menos 1 pip), porque é a mesma promessa; validar mais
 * frouxo aqui deixava entrar uma gestão que o motor recusaria e que ficava para sempre parada.
 */
export function validarConfigPedida(
  pedido: Record<string, unknown>, s: Simbolo & { pip_size: number },
): { ok: true; config: Omit<ConfigGestaoReal, 'be_feito'> } | { ok: false; erro: string } {
  const f = Math.pow(10, s.digits)
  const arred = (x: number) => Math.round(x * f) / f
  const n = (v: unknown): number | null => {
    if (v == null || v === '') return null
    const x = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
    return Number.isFinite(x) ? x : NaN
  }
  const td = n(pedido.trailing_distancia)
  const ta = n(pedido.trailing_ativacao)
  const bg = n(pedido.be_gatilho)
  const bo = n(pedido.be_offset) ?? 0
  if ([td, ta, bg, bo].some((v) => Number.isNaN(v))) return { ok: false, erro: 'valores da gestão inválidos' }

  const out = { trailing_distancia: null as number | null, trailing_ativacao: null as number | null, be_gatilho: null as number | null, be_offset: 0 }
  if (td != null) {
    if (!(td > 0)) return { ok: false, erro: 'a distância do trailing tem de ser positiva' }
    if (td < s.pip_size) return { ok: false, erro: `o trailing tem de ter pelo menos 1 pip (${s.pip_size})` }
    out.trailing_distancia = arred(td)
    if (ta != null && ta < 0) return { ok: false, erro: 'a ativação do trailing não pode ser negativa' }
    out.trailing_ativacao = ta == null || ta === 0 ? null : arred(ta)
  }
  if (bg != null) {
    if (!(bg > 0)) return { ok: false, erro: 'o gatilho do break-even tem de ser positivo' }
    if (bo < 0) return { ok: false, erro: 'a folga do break-even não pode ser negativa' }
    if (bo >= bg) return { ok: false, erro: 'a folga do break-even tem de ser menor que o gatilho' }
    out.be_gatilho = arred(bg)
    out.be_offset = arred(bo)
  }
  return { ok: true, config: out }
}
