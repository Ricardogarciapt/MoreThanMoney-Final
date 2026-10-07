/**
 * CADEIA DO SENSEI — decisões puras do webhook TradingView que a auditoria de 07/10/2026 apanhou
 * erradas. Sem I/O: o route chama, os testes em `__tests__/sensei-cadeia.check.ts` prendem.
 *
 * 1. A ENTRADA DO SENSEI X É AUTÓNOMA.
 *    O Pine «MTM Sensei X» manda tudo na própria entrada (`state:"ENTRY"`, entry, sl, tp1..tp4) e NÃO
 *    envia ideias pendentes. Mas `sensei_trade_ideas` recebe ideias de OUTROS scanners de ouro
 *    (GoldKiller e MTM Scanner são lidos pelo parser do Sensei como «idea»). Com `findPendingSenseiIdea`
 *    a entrada do Sensei ia buscar a ideia pendente mais recente do XAUUSD — que era do GoldKiller ou
 *    do MTM Scanner — e:
 *      · se essa ideia tinha `provider_order_placed=true` (as do GoldKiller têm), `pendingHadLimit`
 *        fechava o `canExecuteProvider` e a entrada do Sensei NÃO ia à mestre, sem motivo gravado
 *        (01/10 10:00 e 05/10 03:00);
 *      · nas outras, a entrada fundia-se com a ideia alheia e ACTIVAVA-A (07/10 08:00: a venda do Sensei
 *        activou a ideia de COMPRA 4137,3 do MTM Scanner).
 *
 * 2. O SEGUIMENTO VAI À SUA ENTRADA, NÃO À ÚLTIMA DO TICKER.
 *    O estado da entrada em `tradingview_signals` era actualizado pela entrada mais recente do MESMO
 *    TICKER, de qualquer fonte. A 07/10 os TP1..TP4 da venda do Sensei foram parar à COMPRA do MTM
 *    Scanner das 07:45 (que ficou «exit_4»), e a entrada do Sensei ficou «loss».
 */

export interface EntradaSenseiCtx {
  /** identidade do scanner já resolvida no webhook (`?strategy=` ou conteúdo) */
  scannerKey: string | null
  /** classe do activo (`classifyAsset`) */
  assetClass: string | null
  /** `state` cru do payload Pine */
  state: string | null | undefined
}

/**
 * A entrada é do Sensei X estruturado (Ouro/BTC, `state:"ENTRY"`)? Então não se procura ideia
 * pendente: nenhuma ideia pendente é dela.
 */
export function entradaSenseiAutonoma(c: EntradaSenseiCtx): boolean {
  return (
    String(c.scannerKey ?? '').toLowerCase() === 'sensei' &&
    c.assetClass === 'gold_btc' &&
    String(c.state ?? '').trim().toUpperCase() === 'ENTRY'
  )
}

export interface EntradaCandidata {
  id: string
  alert_name?: string | null
  /** preço gravado na linha da entrada */
  price?: number | string | null
  /** `raw_payload` da entrada (o Pine do Sensei guarda lá `entry`) */
  raw_payload?: unknown
}

function numero(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Preço de entrada de uma linha de `tradingview_signals` (entry do payload, senão `price`). */
export function precoDaEntrada(r: EntradaCandidata): number | null {
  const p = r.raw_payload && typeof r.raw_payload === 'object' ? (r.raw_payload as Record<string, unknown>) : {}
  return numero(p.entry) ?? numero(p.entry_price) ?? numero(r.price)
}

/** Tolerância da associação pelo preço de entrada — a mesma de `findActiveSenseiIdeaForFollowup`. */
export const TOLERANCIA_ENTRADA = 0.002

/**
 * Escolhe a entrada a que um seguimento pertence.
 *
 * `candidatas` vêm já filtradas por ticker + `signal_kind=entry` + estado em aberto e ordenadas da
 * mais recente para a mais antiga.
 *
 *  · Só entradas da MESMA fonte (`alert_name`, sem distinguir maiúsculas) — um TP do Sensei nunca
 *    pode marcar uma entrada do MTM Scanner ou do GoldKiller.
 *  · Com o preço de entrada no seguimento (o Pine do Sensei manda-o sempre): a entrada de preço mais
 *    próximo dentro de 0,2%. Sem nenhuma dentro da tolerância → NENHUMA (antes um alvo de uma trade
 *    caía noutra trade, que é pior do que não marcar).
 *  · Sem preço no seguimento: a mais recente da mesma fonte (o comportamento antigo, já sem misturar
 *    fontes).
 */
export function escolherEntradaDoSeguimento<T extends EntradaCandidata>(
  candidatas: T[],
  seguimento: { alertName: string | null | undefined; entry: number | null | undefined },
): T | null {
  const fonte = String(seguimento.alertName ?? '').trim().toLowerCase()
  const daFonte = fonte
    ? candidatas.filter((c) => String(c.alert_name ?? '').trim().toLowerCase() === fonte)
    : candidatas
  if (!daFonte.length) return null
  const entry = numero(seguimento.entry)
  if (entry == null) return daFonte[0] ?? null
  const tol = Math.max(entry * TOLERANCIA_ENTRADA, 0.01)
  let melhor: T | null = null
  let melhorDif = Infinity
  for (const c of daFonte) {
    const p = precoDaEntrada(c)
    if (p == null) continue
    const dif = Math.abs(p - entry)
    if (dif < melhorDif) {
      melhorDif = dif
      melhor = c
    }
  }
  return melhor && melhorDif <= tol ? melhor : null
}

/**
 * Primeiro portão fechado de uma lista ordenada `[aberto, motivo]`. `null` = todos abertos.
 * É o `canExecuteProvider` do webhook escrito de forma a dizer PORQUÊ — antes uma entrada barrada
 * ficava com «a mestre não abriu este sinal (sem motivo registado)».
 *
 * `aberto` pode ser uma função: só é chamada se os portões anteriores estiverem abertos — o mesmo
 * curto-circuito do `&&` de antes (há portões que não podem correr para certas classes de activo).
 */
export function primeiroPortaoFechado(
  portoes: ReadonlyArray<readonly [boolean | (() => boolean), string]>,
): string | null {
  for (const [aberto, motivo] of portoes) {
    const ok = typeof aberto === 'function' ? aberto() : aberto
    if (!ok) return motivo
  }
  return null
}
