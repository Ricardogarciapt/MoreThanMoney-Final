/**
 * QUANDO É QUE A ENTRADA DE UM SINAL SEGUIDO «ENCHE» — regra pura do signal-tracker (07/10/2026).
 *
 * DEFEITO 1 — o lado. O tracker dava a entrada por cheia com `compra ? preço <= entrada : preço >=
 * entrada`. Isso só está certo para uma ordem LIMITE. Quando o sinal sai com o preço já para lá da
 * entrada (um SELL 4195 publicado com o ouro a 4186 é uma venda STOP, não limite), a primeira
 * cotação acima de 4195 — ou, com duas fontes de preço desencontradas, uma cotação que o mercado
 * nunca deu — «enchia» a entrada horas depois. A 02/10 às 12:30 as contas «Todos os sinais»
 * (52070492 / 7b1d4163) abriram três SELL Premium de 08:12, 08:39 e 09:56 de uma vez, a 4186/4185/
 * 4183, com o cartão «Entrada atingida» no chat.
 *
 * A regra agora: o TIPO da entrada decide-se no momento em que o sinal é admitido, contra o preço
 * desse instante (`preco_admissao`), e a entrada só enche quando o preço a ATRAVESSA nesse sentido:
 *   · compra abaixo do preço → limite: enche quando o preço DESCE até lá;
 *   · compra acima do preço  → stop:   enche quando o preço SOBE até lá;
 *   · venda acima do preço   → limite: enche quando o preço SOBE até lá;
 *   · venda abaixo do preço  → stop:   enche quando o preço DESCE até lá;
 *   · sem entrada            → mercado: enche já.
 * Sem preço na admissão (linhas antigas, mercado fechado), o tipo decide-se na primeira cotação
 * vista — o que obriga a um cruzamento DEPOIS de começar a seguir, nunca antes.
 *
 * DEFEITO 2 — a validade. Um setup Premium vale 60 minutos (a mesma janela da limite da mestre,
 * lib/mestres/premium.ts › PREMIUM_ENTRADA_PADRAO); o tracker esperava 24 h e enchia ideias mortas.
 *
 * DEFEITO 3 — o preço. Ver lib/mtmcopy/reference-price.ts: o tracker cotava pelas contas MetaApi
 * provider, que deixaram de responder a 02/10 (~21 h) — desde aí nenhuma entrada enchia nem nenhum
 * setup era descartado (29 linhas pendentes, as mais velhas com 5 dias).
 *
 * Testes: lib/mtmcopy/__tests__/tracker-entrada.check.ts.
 */
import { PREMIUM_ENTRADA_PADRAO } from '@/lib/mestres/premium'

export type TipoEntrada = 'mercado' | 'limite' | 'stop'

export function tipoDaEntrada(p: { direcao: 'buy' | 'sell'; entrada: number | null; preco: number | null }): TipoEntrada | null {
  if (p.entrada == null || !(p.entrada > 0)) return 'mercado'
  if (p.preco == null || !(p.preco > 0)) return null
  if (p.direcao === 'buy') return p.entrada <= p.preco ? 'limite' : 'stop'
  return p.entrada >= p.preco ? 'limite' : 'stop'
}

/** A entrada encheu com este preço? (`tipo` null = ainda não se sabe → não enche) */
export function entradaEncheu(p: { direcao: 'buy' | 'sell'; entrada: number | null; tipo: TipoEntrada | null; preco: number }): boolean {
  if (p.tipo === 'mercado' || p.entrada == null) return true
  if (p.tipo == null) return false
  const sobe = (p.direcao === 'buy') === (p.tipo === 'stop')
  return sobe ? p.preco >= p.entrada : p.preco <= p.entrada
}

/** Horas que um setup espera pela entrada antes de ser descartado, por fonte. */
export function horasAteDesistir(sourceKey: string | null | undefined, padraoHoras: number): number {
  if (String(sourceKey ?? '').toLowerCase() === 'premium') return PREMIUM_ENTRADA_PADRAO.validadeMin / 60
  return padraoHoras
}

/**
 * Descartes muito atrasados (o tracker esteve parado) fecham-se em SILÊNCIO: anunciar agora
 * dezenas de «Ideia descartada» de dias atrás seria ruído no chat, não informação.
 */
export function descarteSilencioso(idadeHoras: number, horasAteDesistir: number): boolean {
  return idadeHoras > horasAteDesistir + 6
}
