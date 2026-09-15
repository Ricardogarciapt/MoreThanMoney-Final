/**
 * CONTA «TODOS OS SINAIS» — uma conta MTM Funded simulada (mtm_trading_accounts.recolhe_todos_sinais,
 * 092) que abre CADA sinal que passa pelo sistema a 0,01 lotes, com a fonte no comentário
 * («Premium», «Scanner Sensei», «GoldKiller», «Scanner MTM», «MTM Alertas», «PrimeVerse fxedge»…).
 * Existe para recolher dados continuamente — ninguém a copia.
 *
 * ONDE ENTRA: no signal-tracker (lib/mtmcopy/signal-tracker.ts), no instante em que um sinal de
 * QUALQUER canal do Tap to Trade enche a entrada — é o único ponto por onde passam todas as fontes
 * (Premium, Sensei, GoldKiller, MTM Scanner, Aurum, alertas/ideias, PrimeVerse). Os perpétuos só
 * seguidos (t2tMode 'follow') não entram lá e não abrem aqui.
 *
 * SEGUIMENTOS: a posição leva SL, TP final e a mesma regra do tracker (stop para a entrada quando o
 * lucro chega ao TP1) + trailing — o motor aplica ao nosso preço. Fechos/cancelamentos MANUAIS da
 * fonte chegam por closeFollowersByMessage (lib/mtmcopy/t2t-lifecycle.ts) → fecharTodosOsSinaisDaMensagem.
 *
 * DUPLICADOS: chave = mensagem de entrada; impressão = par+direcção+entrada+hora. O mesmo trade
 * pelo chat Premium e por outra fonte abre uma vez; a segunda fonte fica em `fontes_extra`.
 *
 * Desligar: TODOS_SINAIS_DESLIGADO=1 (env) ou tirar `recolhe_todos_sinais` à conta. Nunca lança.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { abrirSinalNaConta, aplicarNasPontes, type PonteViva, type ResultadoAbrir } from './abrir'
import { CONFIG_PADRAO, comentarioDaFonte, impressaoDoTrade, traderDoConteudo, type ConfigSinais } from './calculo'

export const LOTE_TODOS_OS_SINAIS = 0.01

/** 0,01 não dá parciais: stop para a entrada no TP1 + trailing, TP final como rede. */
export const CONFIG_TODOS_OS_SINAIS: ConfigSinais = { ...CONFIG_PADRAO, saidasPct: [], permitirDuplicado: false }

export interface LinhaTracker {
  chat_message_id: string
  channel_slug: string
  source_key: string | null
  symbol: string
  direction: 'buy' | 'sell'
  entry: number | null
  sl: number | null
  tps: number[]
  announce?: boolean
}

const desligado = () => process.env.TODOS_SINAIS_DESLIGADO === '1'

async function contasQueRecolhem(): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin().from('mtm_trading_accounts').select('id')
    .eq('recolhe_todos_sinais', true).eq('motor', 'sim').eq('estado', 'ativa').limit(20)
  // Sem a 092 a coluna não existe: não há conta, nada acontece.
  return error ? [] : (data ?? []).map((c) => String(c.id))
}

export async function abrirNaContaTodosOsSinais(l: LinhaTracker): Promise<ResultadoAbrir[]> {
  try {
    if (desligado() || l.announce === false) return []
    const contas = await contasQueRecolhem()
    if (!contas.length) return []
    let trader: string | null = null
    if (l.source_key === 'primeverse') {
      const { data } = await getSupabaseAdmin().from('chat_messages').select('content').eq('id', l.chat_message_id).maybeSingle()
      trader = traderDoConteudo(data?.content as string | undefined)
    }
    const fonte = comentarioDaFonte({ sourceKey: l.source_key, channelSlug: l.channel_slug, trader })
    const impressao = impressaoDoTrade({ symbol: l.symbol, direcao: l.direction, entrada: l.entry })
    return await Promise.all(contas.map((accountId) => abrirSinalNaConta({
      accountId, estrategia: 'todos', chave: `chat:${l.chat_message_id}`, impressao, fonte, comentario: fonte,
      chatMessageId: l.chat_message_id, symbol: l.symbol, direcao: l.direction, entrada: l.entry, sl: l.sl,
      tps: l.tps, cfg: CONFIG_TODOS_OS_SINAIS, loteFixo: LOTE_TODOS_OS_SINAIS,
    })))
  } catch (e) {
    console.warn('[todos-os-sinais] abrir falhou:', e instanceof Error ? e.message : String(e))
    return []
  }
}

/** A fonte fechou/cancelou o sinal à mão → fecha a posição dele na conta «Todos os sinais». */
export async function fecharTodosOsSinaisDaMensagem(chatMessageId: string, pendingOnly = false): Promise<number> {
  try {
    if (desligado() || pendingOnly || !chatMessageId) return 0
    const { data } = await getSupabaseAdmin().from('funded_sinal_posicoes')
      .select('id, account_id, funded_position_id, estado')
      .eq('estrategia', 'todos').eq('chave', `chat:${chatMessageId}`).in('estado', ['a_abrir', 'aberta']).limit(20)
    if (!data?.length) return 0
    const r = await aplicarNasPontes(data as PonteViva[], 'fechar')
    return r.fechadas
  } catch (e) {
    console.warn('[todos-os-sinais] fecho falhou:', e instanceof Error ? e.message : String(e))
    return 0
  }
}
