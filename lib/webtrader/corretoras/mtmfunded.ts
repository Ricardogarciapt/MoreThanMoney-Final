/**
 * Adaptador MTM FUNDED — a conta simulada pelo motor `sim`. Não acrescenta regra nenhuma: chama as
 * mesmas funções de lib/mtmfunded/simulado/execucao.ts que a rota /api/mtmfunded/simulado/ordens.
 *
 * As funções avançadas (bracket TP1-3, trailing, OCO, regras, diário, alertas) continuam no ecrã
 * completo do MTM Funded (components/funded/funded-trader.tsx) e nas rotas dele — só existem no
 * motor simulado. Aqui fica o contrato comum, para o WebTrader tratar as três plataformas igual.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  ErroOrdem, cancelarPendente, carregarPrecos, criarPendente, estadoCompleto, exigirNegociavel, fecharPosicao,
  lerConta, modificarPendente, modificarPosicao, abrirPosicao, type Conta,
} from '@/lib/mtmfunded/simulado/execucao'
import type { ModoSessao } from '@/lib/mtmfunded/simulado/credenciais'
import { CAPACIDADES, ErroCorretora, validarPedido, type AdaptadorCorretora, type DirecaoWT } from './tipos'

const n = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

async function comErros<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ErroOrdem) throw new ErroCorretora(e.status, e.message)
    throw e
  }
}

export function adaptadorMtmFunded(conta: Conta, modo: ModoSessao): AdaptadorCorretora {
  const negociavel = modo === 'master' && conta.estado === 'ativa'
  const escrever = async () => {
    const atual = (await lerConta(conta.id)) ?? conta
    exigirNegociavel(atual, modo)
    return atual
  }
  return {
    plataforma: 'mtmfunded',
    capacidades: CAPACIDADES.mtmfunded,
    real: false,
    podeNegociar: negociavel,

    conta: () => comErros(async () => {
      const e = await estadoCompleto((await lerConta(conta.id)) ?? conta, modo)
      return {
        saldo: e.estado.saldo, equity: e.estado.equity, margem: e.estado.margem, margemLivre: e.estado.margemLivre,
        flutuante: e.estado.flutuante, moeda: 'USD',
      }
    }),

    posicoes: () => comErros(async () => {
      const { data } = await getSupabaseAdmin().from('funded_positions').select('*').eq('account_id', conta.id).eq('estado', 'aberta')
      return (data ?? []).map((p) => ({
        id: String(p.id), symbol: String(p.symbol), simboloCorretora: String(p.symbol), direcao: p.direcao as DirecaoWT,
        volume: Number(p.volume), precoEntrada: Number(p.preco_entrada), precoAtual: null, sl: n(p.sl), tp: n(p.tp),
        lucro: null, abertaEm: (p.aberta_em as string) ?? null,
      }))
    }),

    ordens: () => comErros(async () => {
      const { data } = await getSupabaseAdmin().from('funded_orders').select('*').eq('account_id', conta.id).eq('estado', 'pendente')
      return (data ?? []).map((o) => ({
        id: String(o.id), symbol: String(o.symbol), simboloCorretora: String(o.symbol), direcao: o.direcao as DirecaoWT,
        tipo: o.tipo as 'limit' | 'stop', volume: Number(o.volume), preco: Number(o.preco), sl: n(o.sl), tp: n(o.tp),
        criadaEm: (o.criada_em as string) ?? null,
      }))
    }),

    historico: (dias = 30) => comErros(async () => {
      const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
      const { data } = await getSupabaseAdmin().from('funded_positions').select('*').eq('account_id', conta.id)
        .eq('estado', 'fechada').gte('fechada_em', desde).order('fechada_em', { ascending: false }).limit(200)
      return (data ?? []).map((p) => ({
        id: String(p.id), symbol: String(p.symbol), simboloCorretora: String(p.symbol), direcao: p.direcao as DirecaoWT,
        volume: n(p.volume), preco: n(p.preco_fecho), lucro: n(p.pnl), em: (p.fechada_em as string) ?? null, estado: 'fechado',
      }))
    }),

    enviarOrdem: (bruto) => comErros(async () => {
      const p = validarPedido(bruto)
      const c = await escrever()
      if (p.tipo === 'mercado') {
        const r = await abrirPosicao(c, { symbol: p.symbol, direcao: p.direcao, volume: p.volume, sl: p.sl, tp: p.tp, origem: 'manual' })
        return { ok: true as const, id: String((r.posicao as { id?: string }).id ?? '') }
      }
      const r = await criarPendente(c, { symbol: p.symbol, direcao: p.direcao, tipo: p.tipo, volume: p.volume, preco: Number(p.preco), sl: p.sl, tp: p.tp, origem: 'manual' })
      return { ok: true as const, id: String((r.ordem as { id?: string }).id ?? '') }
    }),

    modificar: (m) => comErros(async () => {
      const c = await escrever()
      if (m.alvo === 'posicao') await modificarPosicao(c, m.id, m.sl ?? null, m.tp ?? null)
      else await modificarPendente(c, m.id, m.preco ?? null, m.sl ?? null, m.tp ?? null)
      return { ok: true as const, id: m.id }
    }),

    fechar: (positionId, volume) => comErros(async () => {
      const c = await escrever()
      await fecharPosicao(c, positionId, volume ?? null)
      return { ok: true as const, id: positionId }
    }),

    cancelar: (orderId) => comErros(async () => {
      const c = await escrever()
      await cancelarPendente(c, orderId)
      return { ok: true as const, id: orderId }
    }),

    simbolos: async (q = '') => {
      const termo = q.trim().replace(/[%,()*]/g, '').slice(0, 30)
      let consulta = getSupabaseAdmin().from('funded_symbols').select('symbol, nome').eq('ativo', true).limit(50)
      if (termo) consulta = consulta.ilike('symbol', `%${termo}%`)
      const { data } = await consulta
      return (data ?? []).map((s) => ({ symbol: String(s.symbol), simboloCorretora: String(s.symbol), nome: (s.nome as string) ?? null }))
    },

    preco: async (symbol) => {
      const s = symbol.toUpperCase()
      const { precos, em } = await carregarPrecos([s])
      const p = precos[s]
      return p ? { symbol: s, bid: p.bid, ask: p.ask, em: em[s] ?? new Date().toISOString(), indicativo: false } : null
    },
  }
}
