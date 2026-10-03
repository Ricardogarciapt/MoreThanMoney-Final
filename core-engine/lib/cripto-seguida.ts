/**
 * AS CRIPTO QUE O SISTEMA SEGUE — uma lista, num sítio só.
 *
 * O catálogo da corretora traz 59 símbolos de cripto e o motor seguia-os quase todos: medido a
 * 26/09/2026, 54 deles tinham tick do mesmo segundo e 58 das 201 linhas de `funded_precos` eram
 * cripto. Como o cripto é o único mercado que nunca fecha, essa fatia escrevia 24 horas por dia,
 * fim de semana incluído — e foi escrita a mais que pôs a instância (Micro) em baixo.
 *
 * Do lado do trading, o que existe é BTCUSD e ETHUSD: são as ÚNICAS cripto com posições, ordens,
 * espelho ou sinais na base (contado a 26/09 em funded_positions, funded_orders,
 * funded_espelho_posicoes e funded_sinal_posicoes). Os outros 50 e tantos símbolos só existiam
 * porque alguém podia abrir a página do catálogo — e essa visita, por si, punha o motor a
 * subscrevê-los e a escrevê-los para sempre.
 *
 * Por isso o cripto passa a ser uma lista de quatro. Não é uma opinião sobre o mercado: é o
 * reconhecimento de que seguir um símbolo custa escrita e que ninguém negocia os outros.
 *
 * O QUE ESTA REGRA NÃO FAZ, DE PROPÓSITO:
 *  · não decide pelo nome do símbolo — decide pela CLASSE do catálogo (`funded_symbols.classe`).
 *    Adivinhar pelas letras é como a gate da Apple esconde cripto, e essa já escondeu cinco pares
 *    de forex (USDCLP, USDCOP, USDCZK, USDTHB, USDTWD) por terem «USDT»/«USDC» no nome. Aqui um
 *    falso positivo tirava preço a quem tem uma posição aberta;
 *  · não manda em nada que esteja a ser negociado. Quem tem posição, ordem, espelho, estratégia de
 *    provider ou alerta num símbolo continua a ter preço dele, esteja ou não nesta lista — o motor
 *    filtra só a procura que vem de alguém a OLHAR (`funded_precos_pedidos`);
 *  · não apaga nem desactiva linha nenhuma: os símbolos continuam no catálogo e voltam todos com
 *    um acrescento a esta lista.
 */

/** As quatro que ficam. Ordem do pedido do dono (26/09/2026). */
export const CRIPTO_SEGUIDA = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD'] as const

const SEGUIDAS: ReadonlySet<string> = new Set<string>(CRIPTO_SEGUIDA)

/** A classe como o catálogo a escreve. Só esta interessa a esta regra. */
export const CLASSE_CRIPTO = 'cripto'

function normalizar(symbol?: string | null): string {
  return String(symbol ?? '').trim().toUpperCase()
}

/** Está nas quatro? */
export function ehCriptoSeguida(symbol?: string | null): boolean {
  return SEGUIDAS.has(normalizar(symbol))
}

/**
 * Este símbolo do catálogo ficou de fora?
 *
 * Só devolve `true` para quem o catálogo diz ser cripto: sem classe (um símbolo que ainda não
 * carregou a ficha) devolve `false` — na dúvida mostra-se e segue-se, porque o preço a faltar é
 * pior do que um símbolo a mais na lista.
 */
export function criptoDeFora(symbol?: string | null, classe?: string | null): boolean {
  return classe === CLASSE_CRIPTO && !ehCriptoSeguida(symbol)
}

/** Pode aparecer na listagem/pesquisa do webtrader? */
export function simboloListavel(symbol?: string | null, classe?: string | null): boolean {
  return !criptoDeFora(symbol, classe)
}
