/**
 * LEITURA BARATA DAS CONTAS MT5 DO MTM FUNDED — as regras puras.
 *
 * As contas MT5 (plataforma «MT5», corretora) são lidas pela MetaApi só por REST, nunca por
 * ligação RPC/streaming e nunca com getSymbols. Custos da MetaApi (docs «rate limiting», cpu
 * credits): account-information 50 · positions 50 · history-deals por tempo 75 + 0,65/negócio ·
 * symbols 500. Quota: 43 200 créditos por 6 h POR CONTA deployed no token.
 *
 * O ciclo (cron de 10 em 10 min, lib/mtmfunded/leitura-mt5-servidor.ts):
 *  · leitura COMPLETA a cada `minutos_entre_leituras` (60) ou quando o dia da corretora vira:
 *    account-information + history-deals desde o último negócio visto → equity, âncora do dia,
 *    lucro por dia, dias negociados, e quebra retroactiva pelo histórico fechado;
 *  · entre completas, só `positions` (50 créditos). Havendo posições abertas, account-information
 *    e as regras de perda diária/máxima avaliadas nessa passagem (≤10 min de atraso);
 *  · conta PARADA (sem posições, sem negócios há `horasOciosa`) → undeploy (a MetaApi cobra
 *    por hora de conta deployed). Volta a deploy quando o dono abre as métricas, ou numa
 *    varredura diária (o histórico apanha o que foi fechado entretanto).
 *  · travão de quota e registo de contas inexistentes respeitados antes de qualquer pedido;
 *    uma conta não DEPLOYED nunca é lida (ler undeployed é o que estrangula o token).
 *
 * Nada aqui faz rede nem base de dados — é o que os testes verificam.
 */
import { avaliarConta, type RegrasConta, type MotivoQuebra } from './regras'

// ── o dia da corretora ─────────────────────────────────────────────────────────────────────────

/** O dia da corretora vira às 22:00 UTC (convenção do MTM Funded, igual ao motor simulado). */
export const DIA_CORRETORA_VIRA_UTC = 22

export function diaDaCorretora(ms: number): string {
  return new Date(ms + (24 - DIA_CORRETORA_VIRA_UTC) * 3600_000).toISOString().slice(0, 10)
}

export function inicioDoDiaDaCorretora(ms: number): number {
  const d = diaDaCorretora(ms)
  return Date.parse(`${d}T00:00:00.000Z`) - (24 - DIA_CORRETORA_VIRA_UTC) * 3600_000
}

// ── negócios (history-deals da MetaApi) ────────────────────────────────────────────────────────

export interface NegocioMt5 {
  id?: string
  time: string
  type: string
  entryType?: string
  profit?: number
  commission?: number
  swap?: number
}

export function ehNegocioDeTrading(d: NegocioMt5): boolean {
  return d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL'
}

/** Quanto o negócio mexeu no saldo. */
export function deltaDoNegocio(d: NegocioMt5): number {
  return Number(d.profit ?? 0) + Number(d.commission ?? 0) + Number(d.swap ?? 0)
}

const arred = (n: number) => Math.round(n * 100) / 100

export interface EntradaHistorico {
  saldoAtual: number
  saldoInicial: number
  agoraMs: number
  regras: Pick<RegrasConta, 'perda_diaria_pct' | 'perda_maxima_pct'>
  /** Negócios desde o último visto (os anteriores a `ultimoNegocioEm` são ignorados). */
  negocios: NegocioMt5[]
  anterior: {
    lucroPorDia?: Record<string, number>
    saldoReferenciaDia?: number | null
    diaReferencia?: string | null
    ultimoNegocioEm?: string | null
  }
}

export interface ResumoHistorico {
  lucroPorDia: Record<string, number>
  diasNegociados: number
  saldoReferenciaDia: number
  diaReferencia: string
  ultimoNegocioEm: string | null
  /** Quebra detectada nos saldos FECHADOS do histórico (o flutuante dessa altura não se vê). */
  quebra: { motivo: MotivoQuebra; detalhe: string } | null
}

/**
 * Junta o histórico novo ao que se sabia: lucro por dia, âncora do dia actual e quebra
 * retroactiva (o saldo fechado desceu abaixo do chão do dia ou do total a meio do dia).
 *
 * A âncora de hoje: se já tinha sido fixada hoje, mantém-se; senão é o saldo actual menos o que
 * os negócios de hoje mexeram — o saldo com que o dia abriu.
 */
export function resumirHistorico(e: EntradaHistorico): ResumoHistorico {
  const corte = e.anterior.ultimoNegocioEm ? Date.parse(e.anterior.ultimoNegocioEm) : -Infinity
  const novos = e.negocios
    .filter((d) => Number.isFinite(Date.parse(d.time)) && Date.parse(d.time) > corte)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))

  const hoje = diaDaCorretora(e.agoraMs)
  const lucroPorDia: Record<string, number> = { ...(e.anterior.lucroPorDia ?? {}) }
  const deltaPorDia = new Map<string, NegocioMt5[]>()
  for (const d of novos) {
    const dia = diaDaCorretora(Date.parse(d.time))
    if (!deltaPorDia.has(dia)) deltaPorDia.set(dia, [])
    deltaPorDia.get(dia)!.push(d)
    if (ehNegocioDeTrading(d)) lucroPorDia[dia] = arred((lucroPorDia[dia] ?? 0) + deltaDoNegocio(d))
  }

  // Saldo no início de cada dia, reconstruído para trás a partir do saldo actual.
  const dias = [...deltaPorDia.keys()].sort()
  const inicioDoDia = new Map<string, number>()
  let saldoFim = e.saldoAtual
  for (let i = dias.length - 1; i >= 0; i--) {
    const soma = deltaPorDia.get(dias[i])!.reduce((a, d) => a + deltaDoNegocio(d), 0)
    const inicio = saldoFim - soma
    inicioDoDia.set(dias[i], inicio)
    saldoFim = inicio
  }
  // Depósitos/créditos (DEAL_TYPE_BALANCE etc.) contam para a âncora do dia, não como lucro —
  // sem isto, o depósito inicial fazia o saldo «começar» o dia a zero e dava uma quebra falsa.
  const depositosDoDia = (dia: string) =>
    (deltaPorDia.get(dia) ?? []).filter((d) => !ehNegocioDeTrading(d)).reduce((a, d) => a + deltaDoNegocio(d), 0)
  // O dia que já tinha âncora fixada fica com ela (os negócios lidos só cobrem parte desse dia).
  const refDoDia = (dia: string): number | undefined =>
    dia === e.anterior.diaReferencia && Number.isFinite(Number(e.anterior.saldoReferenciaDia))
      ? Number(e.anterior.saldoReferenciaDia)
      : inicioDoDia.has(dia) ? inicioDoDia.get(dia)! + depositosDoDia(dia) : undefined

  let quebra: ResumoHistorico['quebra'] = null
  const chaoTotal = e.saldoInicial * (1 - e.regras.perda_maxima_pct / 100)
  for (const dia of dias) {
    const ref = refDoDia(dia)
    if (ref == null) continue
    let corrente = inicioDoDia.get(dia) ?? ref
    // O mínimo só se mede depois de negócios de TRADING: um depósito não é uma perda.
    let minimo = Infinity
    for (const d of deltaPorDia.get(dia)!) {
      corrente += deltaDoNegocio(d)
      if (ehNegocioDeTrading(d)) minimo = Math.min(minimo, corrente)
    }
    if (!Number.isFinite(minimo)) continue
    const chaoDia = ref * (1 - e.regras.perda_diaria_pct / 100)
    if (e.saldoInicial > 0 && minimo <= chaoTotal) {
      quebra = { motivo: 'perda_maxima', detalhe: `Saldo fechado desceu a ${arred(minimo)} a ${dia}, abaixo do mínimo de ${arred(chaoTotal)} (−${e.regras.perda_maxima_pct}%). Detectado pelo histórico.` }
      break
    }
    if (minimo <= chaoDia) {
      quebra = { motivo: 'perda_diaria', detalhe: `Saldo fechado desceu a ${arred(minimo)} a ${dia}, abaixo do mínimo do dia de ${arred(chaoDia)} (−${e.regras.perda_diaria_pct}%). Detectado pelo histórico.` }
      break
    }
  }

  const saldoReferenciaDia =
    e.anterior.diaReferencia === hoje && Number.isFinite(Number(e.anterior.saldoReferenciaDia))
      ? Number(e.anterior.saldoReferenciaDia)
      : arred(refDoDia(hoje) ?? e.saldoAtual)

  const ultimo = novos.length ? novos[novos.length - 1].time : e.anterior.ultimoNegocioEm ?? null
  return {
    lucroPorDia,
    diasNegociados: Object.keys(lucroPorDia).length,
    saldoReferenciaDia,
    diaReferencia: hoje,
    ultimoNegocioEm: ultimo,
    quebra,
  }
}

// ── o que fazer com cada conta nesta passagem ──────────────────────────────────────────────────

export type AccaoVigia =
  | 'saltar_inexistente'
  | 'saltar_quota'
  | 'saltar_sem_estado'
  | 'aguardar_deploy'
  | 'deploy'
  | 'saltar_parada'
  | 'leitura_completa'
  | 'posicoes'

export interface EntradaVigia {
  agoraMs: number
  /** Estado na listagem de provisioning (uma chamada para todas). null = listagem falhou. */
  estadoMetaApi: string | null
  inexistente: boolean
  quotaBloqueada: boolean
  minutosEntreLeituras: number
  lidaEmMs: number | null
  diaReferencia: string | null
  /** Quando NÓS a parámos por estar ociosa. */
  paradaPorNosEmMs: number | null
  /** Último deploy pedido (por nós, pelo dono ou pela varredura). */
  deployPedidoEmMs: number | null
  /** O dono abriu as métricas depois de a conta ter sido parada. */
  donoPediuEmMs: number | null
  horasVarredura: number
  /** Posições acabaram de fechar: a completa faz-se já, para o histórico apanhar o fecho. */
  forcarCompleta?: boolean
}

export const MINUTOS_ESPERA_DEPLOY = 15

export function decidirVigia(e: EntradaVigia): AccaoVigia {
  if (e.inexistente) return 'saltar_inexistente'
  if (e.quotaBloqueada) return 'saltar_quota'
  // Sem listagem fiável não se arrisca ler uma conta que pode estar undeployed.
  if (e.estadoMetaApi == null) return 'saltar_sem_estado'

  if (e.estadoMetaApi !== 'DEPLOYED') {
    if (e.deployPedidoEmMs != null && e.agoraMs - e.deployPedidoEmMs < MINUTOS_ESPERA_DEPLOY * 60_000) {
      return 'aguardar_deploy'
    }
    // Parada pela MetaApi (ou nunca ligada): uma conta em avaliação tem de ser medida.
    if (e.paradaPorNosEmMs == null) return 'deploy'
    // Parada por nós: o dono voltou, ou chegou a hora da varredura diária.
    if (e.donoPediuEmMs != null && e.donoPediuEmMs > e.paradaPorNosEmMs) return 'deploy'
    const ultimaVista = Math.max(e.lidaEmMs ?? 0, e.paradaPorNosEmMs)
    if (e.agoraMs - ultimaVista >= e.horasVarredura * 3600_000) return 'deploy'
    return 'saltar_parada'
  }

  if (e.lidaEmMs == null || e.forcarCompleta) return 'leitura_completa'
  if (e.agoraMs - e.lidaEmMs >= e.minutosEntreLeituras * 60_000) return 'leitura_completa'
  // O dia virou: a âncora da perda diária tem de ser refeita antes de avaliar seja o que for.
  if (e.diaReferencia !== diaDaCorretora(e.agoraMs)) return 'leitura_completa'
  return 'posicoes'
}

export interface EntradaParar {
  agoraMs: number
  posicoesAbertas: number
  ultimoNegocioEmMs: number | null
  criadaEmMs: number | null
  horasOciosa: number
  /** O dono pediu para a ligar: fica ligada pelo menos este tempo. */
  donoPediuEmMs: number | null
  horasDono?: number
}

/** Deve parar-se (undeploy) esta conta agora? */
export function deveParar(e: EntradaParar): boolean {
  if (e.posicoesAbertas > 0) return false
  const horasDono = e.horasDono ?? 2
  if (e.donoPediuEmMs != null && e.agoraMs - e.donoPediuEmMs < horasDono * 3600_000) return false
  const ref = e.ultimoNegocioEmMs ?? e.criadaEmMs
  if (ref == null) return false
  return e.agoraMs - ref >= e.horasOciosa * 3600_000
}

/** Avaliação das regras com o estado já conhecido — reexportada para o servidor. */
export { avaliarConta }

// ── estimativa de créditos (para o relatório e para o painel) ──────────────────────────────────

export const CREDITOS = { accountInformation: 50, positions: 50, historyDealsBase: 75, historyDealsPorNegocio: 0.65 }
export const QUOTA_6H_POR_CONTA = 43_200

/** Créditos/dia de uma conta DEPLOYED com este padrão de uso. */
export function creditosPorDia(p: {
  minutosTick: number
  minutosCompleta: number
  horasComPosicoes: number
  negociosPorDia: number
}): number {
  const ticks = (24 * 60) / p.minutosTick
  const completas = (24 * 60) / p.minutosCompleta
  const ticksComPosicoes = (p.horasComPosicoes * 60) / p.minutosTick
  return Math.round(
    ticks * CREDITOS.positions +
      ticksComPosicoes * CREDITOS.accountInformation +
      completas * (CREDITOS.accountInformation + CREDITOS.historyDealsBase) +
      p.negociosPorDia * CREDITOS.historyDealsPorNegocio,
  )
}
