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
import { CANAIS_FIXOS_HISTORICOS } from './canal-t2t'

/**
 * Canal do chat → estratégia. DEIXOU DE SER FIXO (05/10): o mapa deriva-se dos providers
 * (`mapaCanalEstrategia` em ./canal-t2t.ts); isto é só o valor de arranque / rede de segurança.
 */
export const ESTRATEGIA_DO_CANAL: Record<string, string> = { ...CANAIS_FIXOS_HISTORICOS }

export function estrategiaDoSinalT2T(
  channelSlug: string | null | undefined,
  content: string | null | undefined,
  mapa: Record<string, string> = ESTRATEGIA_DO_CANAL,
): string | null {
  const trader = traderDoConteudo(content)
  if (trader) return estrategiaDoTrader(trader)?.slug ?? null
  return mapa[String(channelSlug ?? '')] ?? null
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
  return posicoesCompativeis(candidatas, sinal, opts)[0] ?? null
}

/** As posições compatíveis com o sinal (mesmas regras de `escolherPosicaoMestre`), da mais recente para a mais antiga. */
export function posicoesCompativeis(
  candidatas: PosicaoMestreCandidata[],
  sinal: { symbol: string; direcao: Direcao; entrada: number | null; mensagemEm: string; pip: number },
  opts: { antesMs?: number; depoisMs?: number; tolPips?: number } = {},
): PosicaoMestreCandidata[] {
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
  return boas
}

/**
 * A posição da mestre de um aceite T2T, POR ID primeiro (isolamento 199, 07/10):
 *  1. `posicaoPorId` — a posição que a ponte do sinal (`funded_sinal_posicoes.chat_message_id` =
 *     mensagem aceite) diz ser a dele. Se existir e estiver aberta, é essa — sem olhar a preços.
 *  2. Sem ponte: as compatíveis pelo par/direcção/janela/preço. UMA → essa. Várias (duas camadas
 *     Premium, dois sinais no mesmo par) → AMBÍGUO: não se escolhe «a mais recente», não se liga.
 */
export function posicaoMestreDoAceite(
  candidatas: PosicaoMestreCandidata[],
  sinal: { symbol: string; direcao: Direcao; entrada: number | null; mensagemEm: string; pip: number },
  posicaoPorId: string | null,
): { pos: PosicaoMestreCandidata | null; motivo: string | null } {
  if (posicaoPorId) {
    const pos = candidatas.find((c) => String(c.id) === String(posicaoPorId) && c.estado === 'aberta') ?? null
    return pos ? { pos, motivo: null } : { pos: null, motivo: `a posição ${posicaoPorId} do sinal já não está aberta na origem` }
  }
  const boas = posicoesCompativeis(candidatas, sinal)
  if (boas.length === 1) return { pos: boas[0], motivo: null }
  if (!boas.length) return { pos: null, motivo: null }
  return { pos: null, motivo: `${boas.length} posições da origem servem a este sinal — ambíguo, não se liga nenhuma` }
}

/** Chave do evento de abertura por ACEITE (≠ da abertura do trigger, que numa rota T2T é ignorada). */
export function chaveAberturaAceite(rotaId: string, posicaoId: string): string {
  return `${rotaId}:${posicaoId}:open:aceite`
}
