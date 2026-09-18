/**
 * TAP TO TRADE PELO MOTOR — decisões puras (testadas em __tests__/mestres.check.ts).
 *
 * Aceitar um sinal executa DIRECTAMENTE nas contas T2T do cliente (o mesmo fan-out do site: todas as
 * contas com T2T ligado, cada uma pelo seu sizing T2T), sem CopyFactory e sem ordem nenhuma na mestre.
 * A mestre SIM da estratégia só serve de RELÓGIO da gestão: a posição que o cliente abre fica ligada à
 * posição da mestre do mesmo sinal, e cada parcial / BE / trailing / fecho que o motor faz na mestre
 * (pelas regras da estratégia, `sinais_config`) chega à conta do cliente pelo mesmo caminho da cópia —
 * em pips a partir da entrada REAL dele. É o «mesmo motor» a gerir cópias e T2T.
 *
 * Sem posição da mestre para o sinal (fonte sem mestre, mestre recusou, sinal antigo) o motor não
 * aceita e o T2T de sempre (execução directa + t2t-price-monitor) continua a tratar do pedido.
 */
import { estrategiaDoTrader, traderDoConteudo } from '../mtmfunded/estrategias-sinais/calculo'
import type { Direcao } from '../copia-contas/tipos'

/** Canal do chat → estratégia (slug de mtmauto_providers). */
export const ESTRATEGIA_DO_CANAL: Record<string, string> = {
  'sensei-scanner': 'sensei',
  'sinais-goldkiller': 'Goldkiller',
  'premium-ideas': 'premium-ouro',
}

export function estrategiaDoSinalT2T(channelSlug: string | null | undefined, content: string | null | undefined): string | null {
  const trader = traderDoConteudo(content)
  if (trader) return estrategiaDoTrader(trader)?.slug ?? null
  return ESTRATEGIA_DO_CANAL[String(channelSlug ?? '')] ?? null
}

export interface PosicaoMestreCandidata {
  id: string
  symbol: string
  direcao: Direcao
  preco_entrada: number
  aberta_em: string
  estado: string
}

/**
 * A posição da mestre que corresponde ao sinal aceite: mesmo par (canónico, sem sufixo), mesma
 * direcção, ABERTA, aberta desde pouco antes da mensagem do chat (a mestre pode abrir 1–2 s antes de
 * a mensagem ser gravada) e, com entrada no sinal, a menos de `tolPips` pips dela. A mais recente ganha.
 */
export function escolherPosicaoMestre(
  candidatas: PosicaoMestreCandidata[],
  sinal: { symbol: string; direcao: Direcao; entrada: number | null; mensagemEm: string; pip: number },
  opts: { antesMs?: number; depoisMs?: number; tolPips?: number } = {},
): PosicaoMestreCandidata | null {
  const antes = opts.antesMs ?? 10 * 60_000
  const depois = opts.depoisMs ?? 6 * 3600_000
  const tol = opts.tolPips ?? 60
  const t0 = Date.parse(sinal.mensagemEm)
  const norm = (s: string) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const s = norm(sinal.symbol)
  const boas = candidatas.filter((c) => {
    if (c.estado !== 'aberta' || c.direcao !== sinal.direcao) return false
    const cs = norm(c.symbol)
    if (cs !== s && !cs.startsWith(s) && !s.startsWith(cs)) return false
    const t = Date.parse(c.aberta_em)
    if (!Number.isFinite(t) || !Number.isFinite(t0) || t < t0 - antes || t > t0 + depois) return false
    if (sinal.entrada != null && sinal.entrada > 0 && sinal.pip > 0 && Math.abs(c.preco_entrada - sinal.entrada) / sinal.pip > tol) return false
    return true
  })
  boas.sort((a, b) => Date.parse(b.aberta_em) - Date.parse(a.aberta_em))
  return boas[0] ?? null
}

/** Chave do evento de abertura por ACEITE (≠ da abertura do trigger, que numa rota T2T é ignorada). */
export function chaveAberturaAceite(rotaId: string, posicaoId: string): string {
  return `${rotaId}:${posicaoId}:open:aceite`
}
