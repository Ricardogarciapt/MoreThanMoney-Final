/**
 * O QUE O CAMINHO GENÉRICO DO WEBHOOK PUBLICA NO CHAT — puro.
 *
 * O caminho genérico (`composeGenericPost` em app/api/webhooks/tradingview/route.ts) serve tudo o que
 * não é o ouro do Sensei: perpétuos cripto (canal «Ideias de Cripto», a Aurum Flow e o MTM Sensei X),
 * forex, índices. Até 26/10/2026 desenhava SEMPRE um cartão de entrada, mesmo quando o alerta era um
 * seguimento. Numa só trade do MTM Sensei X em BTCUSDT.P (25/10, 23:30) saíram vários «Novo sinal»:
 * o break-even das 01:40 chegou ao chat como sinal novo com o stop EM CIMA da entrada (80045.4), e o
 * T2T mostrava-o como uma ideia para abrir. Antes disso já tinham saído cartões com o stop do lado do
 * lucro (20/10, compra a 82120.9 com stop 82421.14), repetidos no mesmo segundo.
 *
 * Três regras:
 *  · um SEGUIMENTO nunca sai como entrada: responde à mensagem da entrada com o vocabulário canónico
 *    (lifecycleMessage) ou, sem entrada publicada a que responder, não sai;
 *  · uma ENTRADA repetida (mesma estratégia e chave ainda aberta) não sai outra vez;
 *  · uma ENTRADA com o stop do lado errado, igual à entrada ou (nos perpétuos) sem stop não sai.
 *
 * Isto só decide o que se ESCREVE e o que se oferece para executar; a gravação em
 * `tradingview_signals` continua igual, com o motivo em `ai_error`.
 */
import type { SignalEvent } from '@/lib/mtmcopy/signal-lifecycle'
import { stopDoLadoErrado } from '@/lib/mtmcopy/source-risk-rules'

export type DecisaoPublicacao =
  | { publicar: 'entrada' }
  | { publicar: 'seguimento'; evento: SignalEvent }
  | { publicar: null; motivo: string }

export interface ContextoPublicacao {
  seguimento: boolean
  /** tp_hit | breakeven | sl_hit | exit (do alerta do Pine). */
  alertType?: string | null
  tpLevel?: number | null
  /** A mensagem de chat da ENTRADA a que este seguimento pertence. */
  entradaChatId?: string | null
  /** O seguimento é um stop depois do break-even/trailing (fecho protegido, não perda). */
  slProtegido?: boolean
  /** Entrada repetida de uma trade ainda aberta. */
  duplicada?: boolean
  classe?: string | null
  direcao?: 'buy' | 'sell' | null
  entrada?: number | null
  sl?: number | null
  tp1?: number | null
}

export function decidirPublicacaoGenerica(c: ContextoPublicacao): DecisaoPublicacao {
  if (c.seguimento) {
    if (!c.entradaChatId) {
      return { publicar: null, motivo: 'seguimento sem entrada publicada — não sai como sinal novo' }
    }
    const evento = eventoDoSeguimento(c.alertType, c.tpLevel, c.slProtegido)
    return evento ? { publicar: 'seguimento', evento } : { publicar: null, motivo: `seguimento sem tipo conhecido (${c.alertType ?? '—'})` }
  }

  if (c.duplicada) return { publicar: null, motivo: 'entrada repetida de uma trade ainda aberta' }

  const perps = c.classe === 'crypto_perp'
  if (!c.direcao) {
    return perps ? { publicar: null, motivo: 'entrada sem direcção' } : { publicar: 'entrada' }
  }
  if (c.sl == null || !(c.sl > 0)) {
    return perps ? { publicar: null, motivo: 'entrada sem stop' } : { publicar: 'entrada' }
  }
  const errado = stopDoLadoErrado({ direction: c.direcao, entry: c.entrada ?? null, sl: c.sl, tp1: c.tp1 ?? null })
  if (errado) return { publicar: null, motivo: `entrada recusada: ${errado}` }
  return { publicar: 'entrada' }
}

function eventoDoSeguimento(alertType?: string | null, tpLevel?: number | null, slProtegido?: boolean): SignalEvent | null {
  switch (alertType) {
    case 'tp_hit':
      return (tpLevel ?? 1) >= 4 ? 'target_final' : 'partial'
    case 'breakeven':
      return 'break_even'
    case 'sl_hit':
      return slProtegido ? 'stop_protegido' : 'stop_loss'
    case 'exit':
      return 'closed'
    default:
      return null
  }
}
