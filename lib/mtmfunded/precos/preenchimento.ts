/**
 * O PREÇO A QUE UMA CONTA SIMULADA PREENCHE — a regra, pura e sem base de dados.
 *
 * O PRINCÍPIO, que não se negoceia: **um preenchimento nunca pode ser melhor do que o mercado
 * ofereceu.** Havendo dúvida sobre qual dos preços é o verdadeiro, a conta fica com o PIOR dos
 * plausíveis. Uma conta simulada que entra melhor do que a realidade é uma conta que mente — e
 * estes números vão para a prova pública.
 *
 * PORQUE É QUE ISTO PRECISOU DE EXISTIR (medido a 24/09/2026)
 * Nas 7 trades ao vivo da mestre do Sensei, a entrada bateu a favor da casa em 6 e, em 3 delas,
 * a um preço FORA do intervalo da vela M5 da OANDA — um preço que nunca existiu. A causa não foi
 * o estrangulamento da escrita (`ESCRITA_PRECOS_MIN_MS`): os ticks tinham 0,5–4 s de idade
 * declarada. Foi o carimbo: desde que o motor vive sem MetaApi, o ouro vem de fontes de recurso
 * (spot da gold-api, PAXG×k da Binance) que entram com a hora da LEITURA, não com a hora em que o
 * mercado fez aquele preço — e o PAXG, pouco líquido, fica dezenas de segundos parado. A guarda
 * de frescura media a nossa vivacidade, não a idade do preço.
 *
 * E o desvio cai SEMPRE para o mesmo lado porque um sinal de continuação nasce DEPOIS do
 * movimento: um preço de antes do movimento está sempre do lado bom de quem vende a cair.
 *
 * A REGRA
 *  1. sem tick → não se abre (e diz-se porquê);
 *  2. tick mais velho do que `idadeMaxMs` → não se abre;
 *  3. sem preço de referência (ordem à mão no WebTrader) → o tick manda, como sempre;
 *  4. com referência (o preço do sinal) e as duas fontes a discordarem mais do que
 *     `desvioMaxFracao` → não se abre: duas fontes assim longe não dão um preço, dão um palpite;
 *  5. de resto, o preenchimento faz-se pelo PIOR meio-preço dos dois, com o spread do nosso tick.
 *
 * A porta de saída para quando o motor passar a trazer a hora do mercado: um tick com
 * `emMercado` provadamente fresco (< `frescoProvadoMs`) dispensa o passo 5 e vale sozinho. Hoje
 * nenhuma fonte a preenche, por isso o caminho pessimista é o caminho normal — de propósito.
 */

export type Direcao = 'buy' | 'sell'

export interface TickPreenchimento {
  bid: number
  ask: number
  /** Instante em que o MOTOR carimbou o preço (ms). É o que a base guarda hoje em `funded_precos.em`. */
  em: number
  /**
   * Instante em que o MERCADO fez este preço (ms), quando a fonte o sabe dizer. Só isto prova
   * frescura; `em` prova apenas que o motor está vivo.
   */
  emMercado?: number | null
}

/** O preço que a outra ponta (o sinal, a mestre) diz ser o do mercado no momento da decisão. */
export interface ReferenciaPreco {
  preco: number
  em?: number | null
}

export interface PedidoPreenchimento {
  direcao: Direcao
  tick: TickPreenchimento | null
  referencia?: ReferenciaPreco | null
  digits: number
  agora?: number
  /** Acima desta idade não se abre (5 s, o mesmo limite de sempre). */
  idadeMaxMs?: number
  /** Só com `emMercado`: abaixo disto o tick vale sozinho. */
  frescoProvadoMs?: number
  /** Discordância máxima entre as duas fontes, em fracção do preço (0,3 % por omissão). */
  desvioMaxFracao?: number
}

export type MotivoRecusa = 'sem-preco' | 'velho' | 'divergencia'

export type Preenchimento =
  | {
      ok: true
      /** O preço a que a posição abre (ask numa compra, bid numa venda). */
      preco: number
      bid: number
      ask: number
      /** `tick` = o tick mandou; `pior-dos-dois` = a referência era pior e foi ela a mandar. */
      regra: 'tick' | 'pior-dos-dois'
      /** Quanto é que a regra tirou à conta, em preço (≥ 0; 0 quando o tick já era o pior). */
      penalizacao: number
    }
  | { ok: false; motivo: MotivoRecusa; erro: string }

export const IDADE_MAX_MS = 5_000
export const FRESCO_PROVADO_MS = 1_500
export const DESVIO_MAX_FRACAO = 0.003

const meio = (t: { bid: number; ask: number }) => (t.bid + t.ask) / 2

/**
 * Arredonda SEMPRE contra a conta: uma compra sobe ao dígito seguinte, uma venda desce. Meio
 * ponto de ouro não é dinheiro, mas é o mesmo princípio — o arredondamento também não pode ser
 * uma prenda da casa.
 */
export function arredondarContra(valor: number, direcao: Direcao, digits: number): number {
  const passo = 10 ** -digits
  const n = valor / passo
  // A margem de 1e-6 evita que o lixo binário (4350.66 / 0.01 = 435065.99999) empurre um valor
  // exacto um dígito para o lado errado.
  const k = direcao === 'buy' ? Math.ceil(n - 1e-6) : Math.floor(n + 1e-6)
  return Number((k * passo).toFixed(digits))
}

export function precoDePreenchimento(p: PedidoPreenchimento): Preenchimento {
  const agora = p.agora ?? Date.now()
  const idadeMax = p.idadeMaxMs ?? IDADE_MAX_MS
  const frescoProvado = p.frescoProvadoMs ?? FRESCO_PROVADO_MS
  const desvioMax = p.desvioMaxFracao ?? DESVIO_MAX_FRACAO
  const t = p.tick

  if (!t || !(t.bid > 0) || !(t.ask > 0) || !(t.ask >= t.bid)) {
    return { ok: false, motivo: 'sem-preco', erro: 'sem preço ao vivo' }
  }

  // A idade conta-se pelo instante do MERCADO quando o há; senão, pelo carimbo do motor — que
  // é um limite superior generoso, e é por isso que o passo pessimista existe.
  const idade = agora - (t.emMercado ?? t.em)
  if (!(idade <= idadeMax)) {
    return {
      ok: false,
      motivo: 'velho',
      erro: `preço com ${Math.round(idade / 100) / 10} s — acima do limite de ${Math.round(idadeMax / 100) / 10} s`,
    }
  }

  const spread = t.ask - t.bid
  const meioTick = meio(t)
  const soTick = (): Preenchimento => ({
    ok: true,
    preco: p.direcao === 'buy' ? t.ask : t.bid,
    bid: t.bid,
    ask: t.ask,
    regra: 'tick',
    penalizacao: 0,
  })

  const ref = p.referencia
  if (!ref || !(ref.preco > 0)) return soTick()

  const desvio = Math.abs(ref.preco - meioTick) / meioTick
  if (desvio > desvioMax) {
    return {
      ok: false,
      motivo: 'divergencia',
      erro:
        `as duas fontes discordam ${(desvio * 100).toFixed(2)} % (sinal ${ref.preco}, mercado ${meioTick.toFixed(p.digits)})` +
        ' — não se abre às cegas',
    }
  }

  // Frescura PROVADA pela fonte: o tick é o mercado, não há dúvida a resolver.
  if (t.emMercado != null && agora - t.emMercado <= frescoProvado) return soTick()

  const meioPior = p.direcao === 'buy' ? Math.max(meioTick, ref.preco) : Math.min(meioTick, ref.preco)
  const bid = arredondarContra(meioPior - spread / 2, p.direcao, p.digits)
  const ask = arredondarContra(meioPior + spread / 2, p.direcao, p.digits)
  const preco = p.direcao === 'buy' ? ask : bid
  const precoTick = p.direcao === 'buy' ? t.ask : t.bid
  const penalizacao = p.direcao === 'buy' ? Math.max(0, preco - precoTick) : Math.max(0, precoTick - preco)
  return { ok: true, preco, bid, ask, regra: penalizacao > 0 ? 'pior-dos-dois' : 'tick', penalizacao }
}
