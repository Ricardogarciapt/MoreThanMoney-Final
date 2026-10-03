/**
 * A JANELA DE ACEITAÇÃO DE UM SINAL T2T — a regra, sem base de dados. IGUAL nos dois repositórios.
 *
 * Havia QUATRO cópias desta decisão, e nenhuma dizia o mesmo:
 *   · `app/api/mtmcopy/tap-to-trade/route.ts` — a que manda, porque é ela que abre (ou recusa);
 *   · `components/mobile/tap-to-trade-feed.tsx` — `foraDaZona()` + uma idade calculada à parte;
 *   · `app/api/mtmcopy/signal-live/route.ts` — a conta do stop já batido, inteira, outra vez;
 *   · `lib/t2t-mtm.ts` no mtm-auto — `janela()` e `pip()`, com as suas próprias frases.
 *
 * O resultado via-se no ecrã: o mesmo sinal estava «fora da zona» numa app e aceitável na outra,
 * e quando as duas concordavam explicavam-no por palavras diferentes. Pior do que as palavras:
 * um botão que convida para uma trade que a rota vai recusar é uma promessa que o produto não
 * cumpre.
 *
 * Aqui fica a regra, PURA — recebe a linha de acompanhamento (`mtmcopy_signal_tracking`) já lida
 * e devolve o veredito. Quem lê a linha é quem chama: o site pela rota, o mtm-auto pelo servidor
 * dele. As FRASES são as da rota de aceitação, à letra, para o ecrã nunca prometer o contrário
 * do que vai acontecer.
 *
 * ⚠️ Módulo PURO de propósito: o separador T2T é um componente de cliente e não pode arrastar a
 * chave de serviço para dentro do browser.
 */

/** Entrada a mercado: passados cinco minutos já não é a entrada que estava escrita. */
export const JANELA_MERCADO_MS = 5 * 60 * 1000
/** Setup com NÍVEL de entrada (zona/limite): fica de pé até 24h, enquanto o preço não lá chegar. */
export const JANELA_PENDENTE_MS = 24 * 60 * 60 * 1000

export type CodigoDaJanela = 'expired' | 'out_of_zone' | 'closed' | 'stop_hit'

export interface EstadoDaJanela {
  aceitavel: boolean
  /** Porquê, em linguagem que se possa mostrar a quem tocou no botão. */
  motivo: string | null
  code: CodigoDaJanela | null
}

/**
 * AS FRASES. Uma por motivo, e as mesmas em todo o lado.
 *
 * São as que `app/api/mtmcopy/tap-to-trade/route.ts` devolve quando recusa. Se um dia mudarem
 * lá, mudam aqui — e não ao contrário: quem tem a última palavra é quem abre a ordem.
 */
export const MOTIVOS: Record<CodigoDaJanela, string> = {
  closed: 'Este sinal já fechou.',
  stop_hit: 'O stop deste sinal já foi tocado.',
  out_of_zone: 'Já não dá para entrar: o preço saiu da zona de entrada deste sinal.',
  expired: 'Sinal expirado — passaram mais de 5 minutos.',
}

/**
 * Tamanho do pip. O mínimo para saber se o stop já foi — e tinha duas cópias, uma em cada ponta.
 *
 * Espelha `pipSizeForSymbol` de `lib/mtmcopy/trade-outcome` (o dono desta tabela no site). Aqui
 * fica a versão sem dependências para o mtm-auto poder usar a MESMA conta sem importar o módulo
 * de desfechos inteiro.
 */
export function tamanhoDoPip(symbol: string): number {
  const s = String(symbol ?? '').toUpperCase()
  if (/JPY/.test(s)) return 0.01
  if (/XAU|GOLD|XAG|SILVER|BTC|ETH|NAS|US30|US500|GER|SPX|DOW/.test(s)) return 0.1
  return 0.0001
}

/**
 * O stop já foi tocado?
 *
 * `live_pips` é o que a trade vale AGORA, em pips, medido pelo motor. Basta compará-lo com a
 * distância entrada→stop nas mesmas unidades: se já perdeu tanto ou mais do que o stop previa, o
 * preço passou por lá.
 *
 * Vale a QUALQUER altura, não só depois dos cinco minutos — um sinal pode bater no stop em trinta
 * segundos, e aceitar então é abrir uma posição já perdida, sem stop a defendê-la.
 */
export function stopJaBatido(r: {
  live_pips: number | null | undefined
  entry: number | null | undefined
  sl: number | null | undefined
  symbol: string | null | undefined
}): boolean {
  const pips = Number(r.live_pips)
  const entrada = Number(r.entry)
  const stop = Number(r.sl)
  if (!Number.isFinite(pips) || !(entrada > 0) || !(stop > 0)) return false
  const riscoEmPips = Math.abs(entrada - stop) / tamanhoDoPip(String(r.symbol ?? ''))
  return riscoEmPips > 0 && pips <= -riscoEmPips
}

/** A linha de acompanhamento do sinal, na parte que decide a janela. */
export interface LinhaDeAcompanhamento {
  created_at: string
  /** 'pending' | 'active' | 'closed' — tal como o motor a escreveu. */
  status: string | null | undefined
  entry_hit_at: string | null | undefined
  exits_done: number | null | undefined
  closed_at?: string | null | undefined
  live_pips: number | null | undefined
  entry: number | null | undefined
  sl: number | null | undefined
  symbol: string | null | undefined
}

/**
 * Ainda dá para aceitar este sinal?
 *
 * Pela mesma ordem de decisão da rota que abre:
 *   1. fechado — acabou;
 *   2. stop batido — acabou, mesmo que o estado ainda não tenha sido escrito;
 *   3. dentro dos 5 minutos — entra;
 *   4. sem NÍVEL de entrada escrito era uma entrada a mercado, e essa morreu aos 5 minutos;
 *   5. com nível, mas o preço já lá foi (entrada tocada ou parcial feito) — o barco partiu;
 *   6. com nível e ainda à espera, mas de ontem — um setup de ontem não se abre hoje.
 */
export function vereditoDaJanela(r: LinhaDeAcompanhamento): EstadoDaJanela {
  const aceita: EstadoDaJanela = { aceitavel: true, motivo: null, code: null }
  const recusa = (code: CodigoDaJanela): EstadoDaJanela => ({ aceitavel: false, motivo: MOTIVOS[code], code })

  const estado = String(r.status ?? 'active')
  if (estado === 'closed' || r.closed_at) return recusa('closed')
  if (stopJaBatido(r)) return recusa('stop_hit')

  const idade = Date.now() - Date.parse(r.created_at)
  if (!Number.isFinite(idade) || idade <= JANELA_MERCADO_MS) return aceita

  const temNivel = Number(r.entry) > 0
  if (!temNivel) return recusa('expired')
  if (Number(r.exits_done ?? 0) > 0 || r.entry_hit_at) return recusa('out_of_zone')
  if (idade > JANELA_PENDENTE_MS) return recusa('expired')
  return aceita
}
