/**
 * RESULTADO REAL DAS CÓPIAS vs MESTRE — puro e testado (__tests__/resultados.check.ts).
 *
 * Porque existe (17/11/2026): o motor guardava a abertura das cópias mas nunca o FECHO real no MT5,
 * por isso ninguém sabia, trade a trade, quanto cada conta divergia da mestre MTM Funded. Aqui junta-se
 * o histórico de deals da corretora (MetaApi) com a posição da mestre e mede-se em PIPS (convenção da
 * casa, lib/mestres/pips.ts).
 *
 * «Sombra B» — saída com a mestre: estima o que a cópia teria feito se em vez de sair no SEU stop
 * (spread da corretora) tivesse saído quando a mestre fechou. Não toca em nenhuma conta: é só conta.
 * Fórmula: pips da mestre (entrada mestre → fecho mestre) menos o que a cópia perdeu à entrada
 * (entrada cópia pior do que a mestre). O spread do fecho não se conhece de antemão, por isso fica
 * fora — o número é um teto honesto, não uma promessa.
 */
import { pipDe } from '../mestres/pips'

export type Direcao = 'buy' | 'sell'

export interface DealMt {
  id?: string
  positionId?: string
  clientId?: string
  symbol?: string
  type?: string
  entryType?: string
  reason?: string
  volume?: number
  price?: number
  profit?: number
  commission?: number
  swap?: number
  time?: string | Date
}

export interface FechoDaCopia {
  positionId: string
  simbolo: string | null
  precoEntrada: number | null
  precoFecho: number | null
  volume: number
  lucro: number
  fechadaEm: string | null
  /** sl · tp · fecho_motor (o nosso pedido/so) · manual · outro */
  motivo: 'sl' | 'tp' | 'fecho_motor' | 'manual' | 'outro'
}

const n = (x: unknown) => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null)

function motivoDoDeal(reason: string | undefined): FechoDaCopia['motivo'] {
  const r = String(reason ?? '').toUpperCase()
  if (r.includes('SL')) return 'sl'
  if (r.includes('TP')) return 'tp'
  if (r.includes('EXPERT')) return 'fecho_motor'
  if (r.includes('CLIENT') || r.includes('MOBILE') || r.includes('WEB')) return 'manual'
  return 'outro'
}

/**
 * Agrupa deals por posição e devolve só as posições já FECHADAS (volume de saída ≥ volume de entrada).
 * Parciais: o preço de fecho é a média ponderada das saídas; o motivo é o da última saída.
 */
export function fechosPorPosicao(deals: DealMt[]): Map<string, FechoDaCopia> {
  const grupos = new Map<string, DealMt[]>()
  for (const d of deals) {
    if (d.type !== 'DEAL_TYPE_BUY' && d.type !== 'DEAL_TYPE_SELL') continue
    const id = String(d.positionId ?? '')
    if (!id) continue
    const g = grupos.get(id) ?? []
    g.push(d)
    grupos.set(id, g)
  }
  const out = new Map<string, FechoDaCopia>()
  for (const [id, g] of grupos) {
    g.sort((a, b) => Date.parse(String(a.time)) - Date.parse(String(b.time)))
    const entradas = g.filter((d) => d.entryType === 'DEAL_ENTRY_IN')
    const saidas = g.filter((d) => d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_OUT_BY' || d.entryType === 'DEAL_ENTRY_INOUT')
    const volIn = entradas.reduce((s, d) => s + (n(d.volume) ?? 0), 0)
    const volOut = saidas.reduce((s, d) => s + (n(d.volume) ?? 0), 0)
    if (!saidas.length || volOut + 1e-9 < volIn) continue
    const media = (ds: DealMt[]) => {
      const v = ds.reduce((s, d) => s + (n(d.volume) ?? 0), 0)
      return v > 0 ? Number((ds.reduce((s, d) => s + (n(d.price) ?? 0) * (n(d.volume) ?? 0), 0) / v).toFixed(6)) : null
    }
    const ultima = saidas[saidas.length - 1]
    const t = ultima.time instanceof Date ? ultima.time.toISOString() : ultima.time ? String(ultima.time) : null
    out.set(id, {
      positionId: id,
      simbolo: entradas[0]?.symbol ?? ultima.symbol ?? null,
      precoEntrada: media(entradas),
      precoFecho: media(saidas),
      volume: volIn || volOut,
      lucro: Math.round(g.reduce((s, d) => s + (n(d.profit) ?? 0) + (n(d.commission) ?? 0) + (n(d.swap) ?? 0), 0) * 100) / 100,
      fechadaEm: t,
      motivo: motivoDoDeal(ultima.reason),
    })
  }
  return out
}

const umDecimal = (x: number) => Math.round(x * 10) / 10

export function pipsEntre(direcao: Direcao, entrada: number | null, fecho: number | null, simbolo: string): number | null {
  if (entrada == null || fecho == null || !(entrada > 0) || !(fecho > 0)) return null
  return umDecimal((direcao === 'buy' ? fecho - entrada : entrada - fecho) / pipDe(simbolo))
}

export interface Comparacao {
  pipsCopia: number | null
  pipsMestre: number | null
  /** cópia − mestre: negativo = a cópia fez pior */
  divergenciaPips: number | null
  /** pips que a cópia perdeu à entrada face à mestre (positivo = entrou pior) */
  custoEntradaPips: number | null
  /** a cópia saiu mais de 30 s antes da mestre */
  saiuAntes: boolean
  /** Sombra B: o que a cópia teria feito a sair com a mestre (sem o spread do fecho) */
  pipsSombraB: number | null
}

export function compararComMestre(p: {
  direcao: Direcao
  simbolo: string
  copia: Pick<FechoDaCopia, 'precoEntrada' | 'precoFecho' | 'fechadaEm'>
  mestre: { precoEntrada: number | null; precoFecho: number | null; fechadaEm: string | null }
}): Comparacao {
  const pipsCopia = pipsEntre(p.direcao, p.copia.precoEntrada, p.copia.precoFecho, p.simbolo)
  const pipsMestre = pipsEntre(p.direcao, p.mestre.precoEntrada, p.mestre.precoFecho, p.simbolo)
  const custoEntradaPips = p.copia.precoEntrada != null && p.mestre.precoEntrada != null
    ? pipsEntre(p.direcao, p.mestre.precoEntrada, p.copia.precoEntrada, p.simbolo)
    : null
  const tc = Date.parse(String(p.copia.fechadaEm)), tm = Date.parse(String(p.mestre.fechadaEm))
  const saiuAntes = Number.isFinite(tc) && Number.isFinite(tm) && tc < tm - 30_000
  return {
    pipsCopia,
    pipsMestre,
    divergenciaPips: pipsCopia != null && pipsMestre != null ? umDecimal(pipsCopia - pipsMestre) : null,
    custoEntradaPips,
    saiuAntes,
    pipsSombraB: pipsMestre != null ? umDecimal(pipsMestre - (custoEntradaPips ?? 0)) : null,
  }
}

export interface LinhaResumo {
  destino_chave: string
  pips_copia: number | null
  pips_mestre: number | null
  pips_sombra_b: number | null
  saiu_antes: boolean
}

/** Resumo por conta para o Telegram: real vs mestre vs «sair com a mestre». */
export function resumoPorConta(linhas: LinhaResumo[]): Array<{ conta: string; n: number; copia: number; mestre: number; sombraB: number; saiuAntes: number }> {
  const m = new Map<string, { conta: string; n: number; copia: number; mestre: number; sombraB: number; saiuAntes: number }>()
  for (const l of linhas) {
    if (l.pips_copia == null || l.pips_mestre == null) continue
    const r = m.get(l.destino_chave) ?? { conta: l.destino_chave, n: 0, copia: 0, mestre: 0, sombraB: 0, saiuAntes: 0 }
    r.n++
    r.copia += l.pips_copia
    r.mestre += l.pips_mestre
    r.sombraB += l.pips_sombra_b ?? l.pips_mestre
    if (l.saiu_antes) r.saiuAntes++
    m.set(l.destino_chave, r)
  }
  return [...m.values()]
    .map((r) => ({ ...r, copia: umDecimal(r.copia), mestre: umDecimal(r.mestre), sombraB: umDecimal(r.sombraB) }))
    .sort((a, b) => (a.copia - a.mestre) - (b.copia - b.mestre))
}

// ── VIGIA DAS CÓPIAS VIVAS ─────────────────────────────────────────────────────────────────────
// Os dados de 17/11 mostraram dois buracos que ninguém via:
//  · cópias que ficaram «aberta» na base depois de a mestre fechar (a corretora fechou-as no SL dela
//    mas o fecho do motor foi recusado enquanto a conta estava bloqueada) — e, pior, uma cópia que
//    continue mesmo ABERTA na corretora sem mestre é dinheiro real sem gestão: uma órfã;
//  · ordens enviadas que o motor deu como «não encontradas» porque só procura nas posições ABERTAS:
//    se a corretora encheu e o stop bateu antes da confirmação, o trade existiu e não contava.
// Aqui só se decide; o servidor lê a corretora (GET) e só escreve na NOSSA tabela. Fechar uma órfã
// fica para o admin: é dinheiro real.

export interface CopiaViva {
  id: string
  estado: string
  destino_posicao_id: string | null
  client_id: string | null
  origem_posicao_id: string | null
  destino_simbolo?: string | null
  direcao?: string | null
}

export interface MestreLida { estado: string | null; fechada_em: string | null }

export interface VigiaCopias {
  /** abertas na corretora com a mestre fechada há mais do que a tolerância */
  orfas: Array<{ copiaId: string; positionId: string; simbolo: string | null; direcao: string | null; mestreFechadaEm: string }>
  /** correcções à base: a cópia já não está aberta (fechou na corretora) ou foi encontrada pelo clientId */
  correcoes: Array<{ copiaId: string; estado: 'aberta' | 'fechada'; destino_posicao_id?: string; nota: string }>
}

export function vigiarCopias(p: {
  copias: CopiaViva[]
  abertasNoDestino: Array<{ id: string; clientId: string | null }>
  deals: DealMt[]
  mestres: Map<string, MestreLida>
  agora: number
  toleranciaMs?: number
}): VigiaCopias {
  const tol = p.toleranciaMs ?? 5 * 60_000
  const abertas = new Set(p.abertasNoDestino.map((x) => String(x.id)))
  const abertaPorCliente = new Map(p.abertasNoDestino.filter((x) => x.clientId).map((x) => [String(x.clientId), String(x.id)]))
  const fechos = fechosPorPosicao(p.deals)
  const posPorCliente = new Map<string, string>()
  for (const d of p.deals) if (d.clientId && d.positionId && d.entryType === 'DEAL_ENTRY_IN') posPorCliente.set(String(d.clientId), String(d.positionId))

  const out: VigiaCopias = { orfas: [], correcoes: [] }
  const verOrfa = (c: CopiaViva, positionId: string) => {
    const m = c.origem_posicao_id ? p.mestres.get(String(c.origem_posicao_id)) : undefined
    const t = m?.estado === 'fechada' ? Date.parse(String(m.fechada_em)) : NaN
    if (Number.isFinite(t) && p.agora - t > tol) {
      out.orfas.push({ copiaId: c.id, positionId, simbolo: c.destino_simbolo ?? null, direcao: c.direcao ?? null, mestreFechadaEm: String(m!.fechada_em) })
    }
  }

  for (const c of p.copias) {
    if (c.estado === 'aberta' && c.destino_posicao_id) {
      const id = String(c.destino_posicao_id)
      if (abertas.has(id)) verOrfa(c, id)
      else if (fechos.has(id)) out.correcoes.push({ copiaId: c.id, estado: 'fechada', nota: 'fechou na corretora (SL/TP/manual) — base acertada pela vigia' })
      continue
    }
    if (c.estado === 'erro' && !c.destino_posicao_id && c.client_id) {
      const viva = abertaPorCliente.get(String(c.client_id))
      if (viva) {
        out.correcoes.push({ copiaId: c.id, estado: 'aberta', destino_posicao_id: viva, nota: 'ordem encontrada pelo clientId (estava dada como não encontrada)' })
        verOrfa(c, viva)
        continue
      }
      const pos = posPorCliente.get(String(c.client_id))
      if (pos && fechos.has(pos)) {
        out.correcoes.push({ copiaId: c.id, estado: 'fechada', destino_posicao_id: pos, nota: 'ordem encheu e fechou antes da confirmação — encontrada no histórico pelo clientId' })
      }
    }
  }
  return out
}

// ── FACTOS PARA O AUDITOR IA ───────────────────────────────────────────────────────────────────
// A IA recebe números já feitos (nunca as linhas cruas): menos tokens e nada para ela «calcular».

export interface LinhaAuditor {
  destino_chave: string
  simbolo: string | null
  pips_copia: number | null
  pips_mestre: number | null
  pips_sombra_b: number | null
  custo_entrada_pips: number | null
  saiu_antes: boolean | null
  motivo: string | null
  fechada_em: string | null
}

export function factosParaAuditor(linhas: LinhaAuditor[]) {
  const porConta = new Map<string, LinhaAuditor[]>()
  for (const l of linhas) {
    if (l.pips_copia == null || l.pips_mestre == null) continue
    const g = porConta.get(l.destino_chave) ?? []
    g.push(l)
    porConta.set(l.destino_chave, g)
  }
  const soma = (xs: Array<number | null>) => umDecimal(xs.reduce<number>((s, x) => s + (x ?? 0), 0))
  const contas = [...porConta.entries()].map(([conta, g]) => {
    const horas = new Map<number, { n: number; div: number }>()
    for (const l of g) {
      const h = l.fechada_em ? new Date(l.fechada_em).getUTCHours() : -1
      const x = horas.get(h) ?? { n: 0, div: 0 }
      x.n++
      x.div += (l.pips_copia ?? 0) - (l.pips_mestre ?? 0)
      horas.set(h, x)
    }
    const motivos: Record<string, number> = {}
    for (const l of g) motivos[l.motivo ?? 'outro'] = (motivos[l.motivo ?? 'outro'] ?? 0) + 1
    const custos = g.map((l) => l.custo_entrada_pips).filter((x): x is number => x != null)
    return {
      conta,
      n: g.length,
      pipsCopia: soma(g.map((l) => l.pips_copia)),
      pipsMestre: soma(g.map((l) => l.pips_mestre)),
      pipsSairComMestre: soma(g.map((l) => l.pips_sombra_b ?? l.pips_mestre)),
      saiuAntesDaMestre: g.filter((l) => l.saiu_antes).length,
      custoEntradaMedioPips: custos.length ? umDecimal(custos.reduce((s, x) => s + x, 0) / custos.length) : null,
      motivosFecho: motivos,
      piorHorasUtc: [...horas.entries()].filter(([h]) => h >= 0)
        .map(([h, x]) => ({ hora: h, n: x.n, divergenciaPips: umDecimal(x.div) }))
        .sort((a, b) => a.divergenciaPips - b.divergenciaPips).slice(0, 3),
    }
  }).sort((a, b) => (a.pipsCopia - a.pipsMestre) - (b.pipsCopia - b.pipsMestre))
  return { contas }
}
