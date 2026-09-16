/**
 * Módulos falsos dos monitores do site (premium-price-monitor, t2t-price-monitor), comuns aos
 * testes de paridade. Cada chamada relevante fica em `__P.log`.
 */
import { FALSO_SUPABASE } from './harness'

export const FALSOS_SITE: Record<string, string> = {
  '@/lib/supabase-admin-client': FALSO_SUPABASE,
  './exec-switches': `export async function getExecSwitches() { return globalThis.__P.switches }`,
  './metaapi': `
import { posicoesDe, modificarReal, fecharReal } from 'corretora-falsa'
const P = () => globalThis.__P
export async function readOpenPositions(acc) { P().log.push({ k: 'ler', acc }); return posicoesDe(acc) }
export async function modifyPositionSlTp(acc, id, sl, tp, trailing, symbol) {
  P().log.push({ k: 'modify', acc, id, sl: sl ?? null, tp: tp ?? null, trailing: trailing ?? null, symbol: symbol ?? null })
  return modificarReal(acc, id, sl, tp) ? { success: true } : { success: false, error: 'falso' }
}
export async function closePositionById(acc, id, vol) {
  P().log.push({ k: 'close', acc, id, vol: vol ?? null })
  return fecharReal(acc, id, vol) ? { success: true } : { success: false, error: 'falso' }
}
export async function listOpenPositions(acc) {
  P().log.push({ k: 'listar', acc })
  const l = posicoesDe(acc)
  if (l == null) throw new Error('falso: ilegível')
  return l
}
export async function readPendingOrders(acc) {
  if (P().ilegivel && P().ilegivel.includes(acc)) return null
  return JSON.parse(JSON.stringify((P().pendentes || {})[acc] || []))
}
export async function cancelPendingOrdersForSymbol(acc, sym) { P().log.push({ k: 'cancel', acc, sym }); return { cancelled: 1, errors: [] } }
`,
  './premium-subscriber-exits': `
export async function mirrorPremiumExit(symbol, direction, action) {
  globalThis.__P.log.push({ k: 'mirror', symbol, direction, action })
  return { accounts: 2, acted: 1, skipped: 1, detail: [] }
}`,
  './adotar-manuais': `export async function adotarManuais() { return { notas: [], adotadas: [] } }`,
  './metaapi-snapshot': `
import { posicoesDe } from 'corretora-falsa'
const P = () => globalThis.__P
export async function lerPosicoesMotor(acc) {
  const w = P()
  if (!(w.snapshotContas || []).includes(acc)) return { posicoes: posicoesDe(acc), decisao: { fonte: 'rpc', motivo: 'falso' }, snapshot: null }
  const todas = posicoesDe(acc)
  const posicoes = todas == null ? null : todas.filter((p) => !(w.snapshotFalta || []).includes(p.id))
  return { posicoes, decisao: { fonte: 'snapshot', motivo: 'falso' }, snapshot: { account_id: acc, posicoes, precos: {}, sincronizado: true, em: 'x' } }
}
export async function precoMotor(acc, canon, sym, snap) { P().log.push({ k: 'precoVivo', acc, sym, snap: !!snap }); return P().precoVivo ?? null }
export async function sombraSnapshot() {}
export async function precoParaMonitor(acc, sym) { P().log.push({ k: 'preco', acc, sym }); return (P().precos || {})[sym] ?? null }
`,
  './market-hours': `export function podeSaltarLeitura() { return false }`,
  './t2t-lifecycle': `export async function announceAndCloseByMessage(a) { globalThis.__P.log.push({ k: 'announce', ...a }) }`,
  '@/lib/gestao-real/contas-live': `export async function contaGeridaPeloMotorReal(acc, tipo) { return (globalThis.__P.live || []).includes(acc + ':' + tipo) }`,
  '@/lib/telegram-channel-push': `export async function sendTelegramChannelPush(a) { globalThis.__P.log.push({ k: 'push', slug: a.slug, content: a.content }) }`,
  './metaapi-inexistentes': `export async function filtrarContasExistentes(ids) { return ids.filter(Boolean) }
export const CONTAS_METAAPI_APAGADAS = new Set()`,
}
