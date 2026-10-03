/**
 * FONTES MT4/MT5/TradeLocker → FACTOS. O leitor mantém a última fotografia de posições da conta de
 * origem e, a cada fotografia nova, calcula o que aconteceu: abriu, modificou SL/TP, fechou parte,
 * fechou.
 *
 * Regras que protegem dinheiro real:
 *  · FOTOGRAFIA NULA NÃO É FECHO. `null` = «não sei» (dessincronizado, erro de leitura) → zero
 *    factos e a fotografia anterior fica. Uma lista vazia sim, é «não há posições».
 *  · ARRANQUE NÃO COPIA O PASSADO. A primeira fotografia de uma conta é só base: as posições que lá
 *    estão já existiam. Excepção deliberada: posições abertas DEPOIS da aprovação da rota e há menos
 *    de `janelaArranqueMs` (o processo reiniciou a meio de uma abertura) — essas contam como
 *    abertas, e a chave de idempotência impede o duplicado se já tinham sido vistas.
 *  · Um aumento de volume (MT5 em netting, TradeLocker a somar) NÃO gera facto: não se copia uma
 *    abertura nova que a origem não abriu como posição nova.
 *
 * Puro e testado.
 */
import type { PosicaoOrigem, TipoEventoCopia } from './tipos'

export interface Facto {
  tipo: TipoEventoCopia
  posicaoId: string
  discriminador: string
  payload: {
    symbol: string
    direcao: 'buy' | 'sell'
    volume: number
    volume_fechado?: number
    preco: number | null
    sl: number | null
    tp: number | null
    aberta_em: string | null
  }
}

const EPS = 1e-8
const igual = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < EPS)
const r8 = (x: number) => Number(x.toFixed(8))

function payloadDe(p: PosicaoOrigem) {
  return { symbol: p.symbol, direcao: p.direcao, volume: p.volume, preco: p.preco, sl: p.sl, tp: p.tp, aberta_em: p.abertaEm }
}

export function diffPosicoes(
  anterior: Map<string, PosicaoOrigem> | null,
  atual: PosicaoOrigem[] | null,
  opcoes: { agora?: number; desdeMs?: number | null; janelaArranqueMs?: number } = {},
): { factos: Facto[]; fotografia: Map<string, PosicaoOrigem> | null } {
  if (atual == null) return { factos: [], fotografia: anterior }
  const nova = new Map(atual.map((p) => [p.id, p]))
  const factos: Facto[] = []

  if (anterior == null) {
    const agora = opcoes.agora ?? Date.now()
    const janela = opcoes.janelaArranqueMs ?? 120_000
    for (const p of atual) {
      const t = p.abertaEm ? Date.parse(p.abertaEm) : NaN
      const recente = Number.isFinite(t) && agora - t <= janela && (opcoes.desdeMs == null || t >= opcoes.desdeMs)
      if (recente) factos.push({ tipo: 'open', posicaoId: p.id, discriminador: '0', payload: payloadDe(p) })
    }
    return { factos, fotografia: nova }
  }

  for (const p of atual) {
    const antes = anterior.get(p.id)
    if (!antes) {
      factos.push({ tipo: 'open', posicaoId: p.id, discriminador: '0', payload: payloadDe(p) })
      continue
    }
    if (p.volume < antes.volume - EPS) {
      factos.push({
        tipo: 'partial', posicaoId: p.id, discriminador: String(r8(p.volume)),
        payload: { ...payloadDe(p), volume_fechado: r8(antes.volume - p.volume) },
      })
    }
    if (!igual(p.sl, antes.sl) || !igual(p.tp, antes.tp)) {
      factos.push({ tipo: 'modify', posicaoId: p.id, discriminador: `${p.sl ?? '-'}/${p.tp ?? '-'}`, payload: payloadDe(p) })
    }
  }
  for (const [id, antes] of anterior) {
    if (!nova.has(id)) factos.push({ tipo: 'close', posicaoId: id, discriminador: '0', payload: payloadDe(antes) })
  }
  return { factos, fotografia: nova }
}

/**
 * Modificações em rajada (arrastar o SL gera dez): numa lista de factos por ordem, só a ÚLTIMA
 * modificação contígua de cada posição fica.
 */
export function colapsarModificacoes<T extends { tipo: TipoEventoCopia; posicaoId: string }>(factos: T[]): { manter: T[]; saltar: T[] } {
  const manter: T[] = []
  const saltar: T[] = []
  for (let i = 0; i < factos.length; i++) {
    const f = factos[i]
    const seg = factos.slice(i + 1).find((x) => x.posicaoId === f.posicaoId)
    if (f.tipo === 'modify' && seg && seg.tipo === 'modify') saltar.push(f)
    else manter.push(f)
  }
  return { manter, saltar }
}

/** Atrasos entre tentativas de um evento: 1 s, 5 s, 30 s, 2 min — depois disso fica em erro. */
export const ATRASOS_MS = [1_000, 5_000, 30_000, 120_000]
export function proximaTentativa(feitas: number): { desistir: true } | { desistir: false; emMs: number } {
  if (feitas >= ATRASOS_MS.length) return { desistir: true }
  return { desistir: false, emMs: ATRASOS_MS[Math.max(0, feitas)] }
}

/** Sondagem TradeLocker: ≥2 s, a dobrar em erro até 60 s, volta a 2 s ao primeiro sucesso. */
export function proximaSondagemMs(atualMs: number, correuBem: boolean, min = 2_000, max = 60_000): number {
  if (correuBem) return min
  return Math.min(max, Math.max(min, atualMs * 2))
}

/**
 * RECONCILIAÇÃO NO ARRANQUE. A fotografia vive em memória: se o processo esteve parado enquanto a
 * origem fechou (ou fechou parte de) uma posição já copiada, o diff nunca o veria. Na primeira
 * fotografia de cada fonte comparam-se as cópias abertas desta origem com o que a origem tem agora:
 *  · cópia aberta e a posição já não existe na origem → fecho;
 *  · a origem tem menos volume do que a cópia assume (abertura × (1 − fechado)) → parcial pela diferença.
 * A chave de idempotência usa o volume restante, por isso ver o mesmo facto duas vezes não duplica.
 */
export function reconciliarArranque(
  copiasAbertas: { origem_posicao_id: string; volume_origem_abertura: number; fechado_pct: number; direcao?: 'buy' | 'sell' | null; destino_simbolo?: string | null }[],
  atual: PosicaoOrigem[],
): Facto[] {
  const porId = new Map(atual.map((p) => [p.id, p]))
  const factos: Facto[] = []
  for (const c of copiasAbertas) {
    const p = porId.get(c.origem_posicao_id)
    if (!p) {
      factos.push({
        tipo: 'close', posicaoId: c.origem_posicao_id, discriminador: '0',
        payload: { symbol: c.destino_simbolo ?? '', direcao: c.direcao ?? 'buy', volume: 0, preco: null, sl: null, tp: null, aberta_em: null },
      })
      continue
    }
    const esperado = c.volume_origem_abertura * (1 - Math.min(1, Math.max(0, c.fechado_pct)))
    if (p.volume < esperado - Math.max(EPS, c.volume_origem_abertura * 0.001)) {
      factos.push({
        tipo: 'partial', posicaoId: p.id, discriminador: String(r8(p.volume)),
        payload: { symbol: p.symbol, direcao: p.direcao, volume: p.volume, volume_fechado: r8(esperado - p.volume), preco: p.preco, sl: p.sl, tp: p.tp, aberta_em: p.abertaEm },
      })
    }
  }
  return factos
}
