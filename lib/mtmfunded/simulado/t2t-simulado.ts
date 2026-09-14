import { lucroUsd, type MapaPrecos, type Simbolo } from './matematica'

/**
 * TAP TO TRADE NAS CONTAS SIMULADAS — o ramo que abre a ideia aceite também nas contas MTM Funded
 * do utilizador marcadas com `aceita_t2t` (migração 070).
 *
 * Os caminhos do MT5 e da TradeLocker na rota do T2T ficam intactos: isto corre AO LADO deles e o
 * resultado junta-se à lista de contas da resposta. Uma conta simulada que falhe não impede a real
 * de abrir, e vice-versa.
 *
 * O tamanho é o MESMO risco em percentagem que o T2T usa para a conta real do cliente (o risco da
 * fonte, ou o da conta), aplicado à equity simulada. Duas contas com o mesmo sinal e o mesmo risco
 * contam a mesma história — é o que deixa comparar.
 *
 * A parte pura (`loteT2TSimulado`) está no topo e é testada em __tests__/espelho.check.ts; a parte
 * que toca na base importa-se à vez, para o teste não precisar do Next.
 */

export type LoteT2T = { ok: true; volume: number; riscoUsd: number | null } | { ok: false; motivo: string }

export function loteT2TSimulado(e: {
  equity: number
  riscoPct: number
  entrada: number
  sl: number | null
  simbolo: Simbolo
  precos: MapaPrecos
}): LoteT2T {
  const s = e.simbolo
  const step = s.volume_step > 0 ? s.volume_step : 0.01
  // Sem stop não há risco que medir: abre-se o mínimo e diz-se que foi assim (riscoUsd null).
  if (e.sl == null || !(e.sl > 0) || e.sl === e.entrada) return { ok: true, volume: s.volume_min, riscoUsd: null }
  if (!(e.equity > 0) || !(e.riscoPct > 0)) return { ok: false, motivo: 'conta sem equity ou risco inválido' }
  const perdaPorLote = Math.abs(lucroUsd(s, 'buy', 1, e.entrada, e.sl, { ...e.precos, [s.symbol]: { symbol: s.symbol, bid: e.entrada, ask: e.entrada } }) ?? NaN)
  if (!Number.isFinite(perdaPorLote) || perdaPorLote <= 0) return { ok: false, motivo: `sem conversão para USD em ${s.symbol}` }
  const riscoUsd = Math.round(e.equity * e.riscoPct) / 100
  const ideal = riscoUsd / perdaPorLote
  // A mesma regra da cópia para contas reais: subir ao mínimo só até ao DOBRO do risco pedido.
  if (ideal < s.volume_min / 2) return { ok: false, motivo: `lote ${ideal.toFixed(4)} abaixo de metade do mínimo ${s.volume_min} — o stop é largo demais para esta conta` }
  const volume = Math.round(Math.min(s.volume_max, Math.max(s.volume_min, Math.floor(ideal / step + 1e-6) * step)) * 100) / 100
  return { ok: true, volume, riscoUsd }
}

export interface SinalT2T {
  symbol: string
  direction: 'buy' | 'sell'
  entry: number | null
  sl: number | null
  tp: number | null
  zone?: [number, number] | null
}

export interface ResultadoT2TSimulado {
  account: string
  accountId: string
  simulada: true
  ok: boolean
  skipped?: boolean
  lot?: number
  symbol?: string
  sl?: number | null
  tp?: number | null
  orderId?: string | null
  error?: string
}

/**
 * Abre a ideia em todas as contas simuladas do utilizador com `aceita_t2t`. Nunca lança.
 * `ideia_ref = t2t:<chatMessageId>` + índice único da 070 → cada conta abre a ideia uma vez.
 */
export async function executarT2TSimulado(p: {
  userId: string
  chatMessageId: string
  fonte: string | null
  sinal: SinalT2T
  riscoPct: number
}): Promise<ResultadoT2TSimulado[]> {
  const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
  const ex = await import('./execucao')
  const { candidatosDeTicker, precoFresco } = await import('./ordens')
  const { comentarioT2T } = await import('../espelho/calculo')
  const db = getSupabaseAdmin()

  const { data: linhas, error } = await db.from('mtm_trading_accounts')
    .select('id').eq('user_id', p.userId).eq('motor', 'sim').eq('estado', 'ativa').eq('aceita_t2t', true)
  // Antes da 070 a coluna não existe: sem contas simuladas, nada muda no T2T de sempre.
  if (error || !linhas?.length) return []

  const ref = `t2t:${p.chatMessageId}`
  const comentario = comentarioT2T(p.fonte)
  const candidatos = candidatosDeTicker(p.sinal.symbol)
  const simbolos = await ex.carregarSimbolos(candidatos)
  const symbol = candidatos.find((c) => simbolos[c])

  const uma = async (id: string): Promise<ResultadoT2TSimulado> => {
    const conta = await ex.lerConta(id)
    const label = conta?.mt5_login ? `MTM Funded ${conta.mt5_login}` : `MTM Funded ${id.slice(0, 6)}`
    const base = { account: label, accountId: id, simulada: true as const }
    try {
      if (!conta) return { ...base, ok: false, error: 'conta não encontrada' }
      if (!symbol) return { ...base, ok: false, skipped: true, error: `${p.sinal.symbol} não existe no MTM Funded` }
      const [{ data: jaPos }, { data: jaOrd }] = await Promise.all([
        db.from('funded_positions').select('id').eq('account_id', id).eq('ideia_ref', ref).limit(1),
        db.from('funded_orders').select('id').eq('account_id', id).eq('ideia_ref', ref).limit(1),
      ])
      if (jaPos?.length || jaOrd?.length) return { ...base, ok: false, skipped: true, error: 'já aceite' }

      const s = simbolos[symbol]
      const { precos, em } = await ex.carregarPrecos([symbol, 'USDJPY', 'USDCHF', 'USDCAD', 'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD'])
      const px = precos[symbol]
      if (!px || !precoFresco(em[symbol])) return { ...base, ok: false, error: `sem preço ao vivo para ${symbol}` }
      const mercado = p.sinal.direction === 'buy' ? px.ask : px.bid

      // Tipo de ordem: a mesma regra do caminho MT5 da rota (0,03% ou dentro da zona = mercado).
      let tipo: 'mercado' | 'limit' | 'stop' = 'mercado'
      const entrada = p.sinal.entry && p.sinal.entry > 0 ? p.sinal.entry : null
      if (entrada) {
        const dentro = p.sinal.zone ? mercado >= p.sinal.zone[0] && mercado <= p.sinal.zone[1] : false
        if (!(Math.abs(entrada - mercado) / mercado < 0.0003 || dentro)) {
          tipo = p.sinal.direction === 'buy' ? (entrada > mercado ? 'stop' : 'limit') : (entrada < mercado ? 'stop' : 'limit')
        }
      }
      // SL/TP re-ancorados ao preço a que se entra, preservando a distância do sinal.
      const precoRef = tipo === 'mercado' ? mercado : (entrada as number)
      const entradaRef = entrada ?? mercado
      const ancorar = (nivel: number | null, lado: 'sl' | 'tp') => {
        if (nivel == null || !(nivel > 0)) return null
        const d = Math.abs(entradaRef - nivel)
        if (!(d > 0) || d / entradaRef > 0.25) return null
        const abaixo = (p.sinal.direction === 'buy') === (lado === 'sl')
        const v = abaixo ? precoRef - d : precoRef + d
        return Number(v.toFixed(s.digits))
      }
      const sl = ancorar(p.sinal.sl, 'sl')
      const tp = ancorar(p.sinal.tp, 'tp')
      const lote = loteT2TSimulado({ equity: Number(conta.sim_equity ?? conta.sim_saldo ?? 0), riscoPct: p.riscoPct, entrada: precoRef, sl, simbolo: s, precos })
      if (!lote.ok) return { ...base, ok: false, symbol, error: lote.motivo }

      if (tipo === 'mercado') {
        const r = await ex.abrirPosicao(conta, { symbol, direcao: p.sinal.direction, volume: lote.volume, sl, tp, origem: 'ideia_mtm', ideiaRef: ref, comentario })
        return { ...base, ok: true, lot: lote.volume, symbol, sl, tp, orderId: String((r.posicao as { id?: string }).id ?? '') }
      }
      const r = await ex.criarPendente(conta, {
        symbol, direcao: p.sinal.direction, tipo, volume: lote.volume, preco: entrada as number, sl, tp,
        // A mesma janela dos setups pendentes do T2T: um dia, depois disso a ideia já não vale.
        expiraEm: new Date(Date.now() + 24 * 3600_000).toISOString(),
        origem: 'ideia_mtm', ideiaRef: ref, comentario,
      })
      return { ...base, ok: true, lot: lote.volume, symbol, sl, tp, orderId: String((r.ordem as { id?: string }).id ?? '') }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ...base, ok: false, skipped: /já foi aberta/.test(msg), error: /já foi aberta/.test(msg) ? 'já aceite' : msg }
    }
  }

  return Promise.all(linhas.map((l) => uma(String(l.id))))
}
