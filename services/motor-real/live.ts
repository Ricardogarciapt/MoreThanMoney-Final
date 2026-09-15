/**
 * EXECUTOR LIVE — só corre com MOTOR_REAL_ESCRITA=1 e para contas na lista `motor_real_contas_live`
 * (tipo suportado). Em sombra nada disto é chamado.
 *
 *  · Ordens: REST cliente regional da MetaApi, POST /users/current/accounts/{id}/trade
 *    (POSITION_MODIFY / POSITION_PARTIAL / POSITION_CLOSE_ID). Nunca a ligação RPC partilhada.
 *    Contas marcadas como inexistentes não recebem ordens (tentar outra vez é o que estrangula o token).
 *  · Trailing do lado da MetaApi (quando a regra o pede): distância convertida para pontos com a
 *    especificação que o streaming já tem em memória — o mesmo `convertTrailingToRelativePoints` +
 *    `buildTrailingOptions` do monitor. Sem especificação vai sem trailing e diz-se (o ratchet do
 *    motor continua a seguir o preço a cada tick).
 *  · Linha Premium: patch imediato; o pico (`peak_profit_pips`) agrupado de 5 em 5 s por linha.
 *  · Efeitos que vivem no site (anúncio do fecho, registo da saída, espelho aos subscritores):
 *    POST /api/gestao-real/efeitos com o CRON_SECRET — as MESMAS funções do monitor.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildTrailingOptions, convertTrailingToRelativePoints, type SymbolPointSpec, type TrailingDistance } from '../../lib/mtmcopy/pip-points'
import { contaMarcadaInexistente, marcarContaInexistente } from '../../lib/mtmcopy/metaapi-inexistentes'
import { registarErroQuota } from '../../lib/mtmcopy/metaapi-quota'
import type { ExecutorLive } from '../../lib/gestao-real/avaliar'

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)
const PROVISIONING = process.env.METAAPI_PROVISIONING_URL || 'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

export interface OpcoesLive {
  db: SupabaseClient
  tokenDe: (conta: string) => string | null
  especificacao: (conta: string, simbolo: string) => SymbolPointSpec | null
  siteBase: string
  cronSecret: string
}

export function criarExecutorLive(o: OpcoesLive): ExecutorLive & { descarregarPicos: () => Promise<void> } {
  const regioes = new Map<string, string>()
  const picos = new Map<string, number>()

  async function regiao(conta: string, token: string): Promise<string> {
    const r = regioes.get(conta)
    if (r) return r
    const res = await fetch(`${PROVISIONING}/users/current/accounts/${conta}`, { headers: { 'auth-token': token }, signal: AbortSignal.timeout(10_000) })
    if (res.status === 404) {
      const e = Object.assign(new Error(`NotFoundError: conta ${conta} não existe`), { name: 'NotFoundError', status: 404 })
      await marcarContaInexistente(conta, e, { nivelConta: true, origem: 'motor-real:live' })
      throw e
    }
    const j = (await res.json().catch(() => ({}))) as { region?: string }
    const reg = String(j.region ?? 'london')
    regioes.set(conta, reg)
    return reg
  }

  async function trade(conta: string, corpo: Record<string, unknown>): Promise<{ ok: boolean; erro?: string }> {
    if (contaMarcadaInexistente(conta)) return { ok: false, erro: 'conta marcada como inexistente na MetaApi — ordem não enviada' }
    const token = o.tokenDe(conta)
    if (!token) return { ok: false, erro: 'sem chave MetaApi para a conta' }
    try {
      const reg = await regiao(conta, token)
      const res = await fetch(`https://mt-client-api-v1.${reg}.agiliumtrade.ai/users/current/accounts/${conta}/trade`, {
        method: 'POST',
        headers: { 'auth-token': token, 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(10_000),
      })
      const j = (await res.json().catch(() => ({}))) as { stringCode?: string; numericCode?: number; message?: string; error?: string }
      if (!res.ok) {
        const e = Object.assign(new Error(`${j.error ?? res.status}: ${j.message ?? ''}`), { name: j.error ?? 'Erro', status: res.status })
        if (o.tokenDe(conta) === process.env.METAAPI_TOKEN) await registarErroQuota(conta, e)
        return { ok: false, erro: e.message.slice(0, 200) }
      }
      const ok = j.stringCode === 'TRADE_RETCODE_DONE' || j.numericCode === 10009
      return ok ? { ok } : { ok, erro: `${j.stringCode ?? j.numericCode}: ${j.message ?? ''}`.slice(0, 200) }
    } catch (e) {
      return { ok: false, erro: (e instanceof Error ? e.message : String(e)).slice(0, 200) }
    }
  }

  return {
    async modificar(conta, posicao, simbolo, sl, tp, trailing?: TrailingDistance) {
      const corpo: Record<string, unknown> = { actionType: 'POSITION_MODIFY', positionId: posicao }
      if (sl != null && sl > 0) corpo.stopLoss = sl
      if (tp != null && tp > 0) corpo.takeProfit = tp
      if (trailing) {
        const spec = o.especificacao(conta, simbolo)
        if (spec) corpo.trailingStopLoss = buildTrailingOptions(convertTrailingToRelativePoints(trailing, spec, simbolo))
        else log(`[live] ${conta.slice(0, 8)} ${simbolo}: sem especificação — modificação sem trailing da MetaApi`)
      }
      return trade(conta, corpo)
    },
    fechar(conta, posicao, volume) {
      return trade(conta, volume != null && volume > 0
        ? { actionType: 'POSITION_PARTIAL', positionId: posicao, volume }
        : { actionType: 'POSITION_CLOSE_ID', positionId: posicao })
    },
    async gravarPremium(id, patch) {
      const { error } = await o.db.from('mtmcopy_premium_active').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) log(`[live] premium_active ${id}: ${error.message}`)
    },
    gravarPicoPremium(id, pico) {
      picos.set(id, Math.max(picos.get(id) ?? 0, pico))
    },
    async efeito(tipo, corpo) {
      try {
        const res = await fetch(`${o.siteBase.replace(/\/$/, '')}/api/gestao-real/efeitos`, {
          method: 'POST',
          headers: { authorization: `Bearer ${o.cronSecret}`, 'content-type': 'application/json' },
          body: JSON.stringify({ tipo, ...corpo }),
          signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) log(`[live] efeito ${tipo} → ${res.status}`)
      } catch (e) {
        log(`[live] efeito ${tipo} falhou:`, e instanceof Error ? e.message : e)
      }
    },
    async descarregarPicos() {
      const lote = [...picos]
      picos.clear()
      for (const [id, pico] of lote) {
        const { error } = await o.db.from('mtmcopy_premium_active').update({ peak_profit_pips: pico, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) { picos.set(id, Math.max(picos.get(id) ?? 0, pico)); log(`[live] pico ${id}: ${error.message}`) }
      }
    },
  }
}
