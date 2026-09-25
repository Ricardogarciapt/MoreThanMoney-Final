/**
 * O MTM SCANNER VAI À SUA MESTRE? — a decisão, e o motivo quando não vai.
 *
 * Porque é que isto saiu do webhook para aqui: a 24/09 o desvio do scanner para a mestre 77696002
 * foi escrito como uma lista de condições dentro da rota. Duas delas — `!isIdeaAlert` e
 * `!activeSensei` — vieram copiadas do portão `canExecuteProvider`, onde fazem sentido (lá servem
 * para distinguir a IDEIA do Sensei da sua activação). Nos alertas do MTM Scanner são sempre falsas:
 *
 *   · o alerta do scanner é JSON com `ticker` + `action` e SEM texto de alerta reconhecível;
 *   · `parseSenseiTradingViewAlert` tem um ramo final (signal-parser.ts) que, com ticker+action,
 *     devolve SEMPRE um alerta montado a partir dos campos → `activeSensei` nunca é nulo;
 *   · nesse ramo, `sl != null && tps.length > 0` infere `alertType: 'idea'` → `isIdeaAlert` é true.
 *
 * Resultado medido nos alertas reais de 24/09 (EURCHF buy 14:30, GBPUSD sell 14:30, GBPCHF buy
 * 14:15): `scannerParaMestre` era false em 100% dos casos e o bloco nunca chegou a correr — nem uma
 * linha em `mestres_sinais`, nem uma posição na mestre, nem um motivo em lado nenhum.
 *
 * A pergunta certa não é «isto não é uma ideia do Sensei?» mas «isto é uma ENTRADA do scanner?».
 * O webhook já a responde antes: `initSignalKind` ('entry' vs 'followup'), que é o mesmo valor que
 * fica gravado em `tradingview_signals.signal_kind`. Nos 1363 alertas `MTMScanner` dos últimos 7
 * dias, TODOS são `entry` — os eventos de gestão (`event: tp_hit|sl_hit|exit|be`) saem do webhook
 * muito antes, pelo atalho dos follow-ups.
 *
 * O segundo defeito que isto fecha é o silêncio: `candidato` marca os sinais que passaram o filtro
 * das confirmações (~21/dia nos 60 dias medidos) e que, portanto, MERECEM explicação quando não
 * abrem. É esse motivo que o webhook grava em `tradingview_signals.ai_error`.
 *
 * Puro: sem base, sem rede. Testes em __tests__/scanner-confirmacoes.check.ts.
 */
import type { AssetClass } from './webhook-gates'
import type { ResultadoConfirmacoes } from './scanner-confirmacoes'

/** As classes de activo que a mestre do scanner aceita (as outras seguem só publicação/T2T). */
export const CLASSES_DA_MESTRE_SCANNER: readonly AssetClass[] = ['gold_btc', 'forex']

export interface EntradaDecisaoScanner {
  /** `scannerKey` do webhook: só `mtmscanner` tem mestre própria. */
  scanner: string | null
  /** `initSignalKind` do webhook: `entry` é entrada, `followup` é gestão (TP/BE/SL/saída). */
  tipoSinal: 'entry' | 'followup'
  classe: AssetClass
  simbolo: string | null
  direcao: string | null
  /** `temTodasAsConfirmacoes(payload, direcao)`; `null` quando nem se chegou a perguntar. */
  confirmacoes: ResultadoConfirmacoes | null
  /** `stopsSane(entrada ?? preço, sl)` */
  stopsSaos: boolean
  /** `passesExecGate(...)` — whitelist, exclusões por scanner, mínimo de confirmações. */
  gateExec: { ok: boolean; reason?: string }
  /** O sinal já vai pelo caminho de execução normal? (então não há desvio nenhum a fazer) */
  podeExecutarProvider: boolean
}

export interface DecisaoScanner {
  /** Encaminhar para `encaminharSinalParaMestre`? */
  vai: boolean
  /** Porque não. Vazio só quando `vai` é true. */
  motivo?: string
  /**
   * Este sinal era um candidato sério (entrada do scanner com TODAS as confirmações)?
   * É o que separa «não abriu e alguém vai perguntar porquê» dos ~95% que o filtro corta todos os
   * dias e que não têm de encher `ai_error`.
   */
  candidato: boolean
}

/** O MTM Scanner manda este alerta para a sua conta mestre? (função pura) */
export function decidirScannerParaMestre(e: EntradaDecisaoScanner): DecisaoScanner {
  const doScanner = e.scanner === 'mtmscanner'
  const candidato = doScanner && e.tipoSinal === 'entry' && e.confirmacoes?.ok === true

  if (!doScanner) return { vai: false, candidato: false, motivo: 'não é um alerta do MTM Scanner' }
  if (e.podeExecutarProvider) {
    return { vai: false, candidato, motivo: 'o sinal já segue pelo caminho de execução normal (sem desvio)' }
  }
  if (e.tipoSinal !== 'entry') {
    return { vai: false, candidato, motivo: 'seguimento (TP/BE/SL/saída), não é uma entrada' }
  }
  if (!e.confirmacoes) return { vai: false, candidato, motivo: 'alerta sem confirmações' }
  if (!e.confirmacoes.ok) {
    return { vai: false, candidato, motivo: e.confirmacoes.motivo ?? 'faltam confirmações' }
  }
  if (!CLASSES_DA_MESTRE_SCANNER.includes(e.classe)) {
    return { vai: false, candidato, motivo: `classe ${e.classe} fora do âmbito da mestre (só ouro/BTC e forex)` }
  }
  if (!e.simbolo || !e.direcao) return { vai: false, candidato, motivo: 'alerta sem símbolo ou sem direcção' }
  if (!e.stopsSaos) return { vai: false, candidato, motivo: 'stop fora de escala (mais de 25% do preço)' }
  if (!e.gateExec.ok) return { vai: false, candidato, motivo: `gate de execução: ${e.gateExec.reason ?? 'recusado'}` }
  return { vai: true, candidato }
}
