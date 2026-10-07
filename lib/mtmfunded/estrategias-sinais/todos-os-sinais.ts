/**
 * CONTA «TODOS OS SINAIS» — a CONTA-ESPELHO. Uma conta MTM Funded simulada
 * (mtm_trading_accounts.recolhe_todos_sinais, 092) que abre CADA sinal que passa pelo sistema, com a
 * fonte no comentário («Premium», «Scanner Sensei», «GoldKiller», «Scanner MTM», «MTM Alertas»,
 * «PrimeVerse fxedge»…). Existe para recolher dados continuamente — ninguém a copia.
 *
 * ── PORQUE É QUE O LOTE DEIXOU DE SER FIXO (24/09) ───────────────────────────────────────────────
 *
 * A conta-espelho existe para uma coisa só: medir os sinais COM AS PARCIAIS. As estatísticas
 * publicadas vêm de `mtmcopy_signal_tracking`, que mede ideias tudo-ou-nada — um sinal que fez TP1 e
 * TP2 e voltou ao stop conta lá como perda inteira, e por isso o acerto medido dá sempre abaixo do
 * real. Só uma conta com lote suficiente para partir a posição desfaz esse erro.
 *
 * Esta conta nasceu a 0,01 lotes fixos, que é o lote MÍNIMO: não se parte em três, e portanto nunca
 * houve uma parcial para contar. Media melhor do que as ideias (o motor faz BE e trailing a sério),
 * mas continuava a fechar tudo de uma vez — o mesmo defeito, noutro sítio.
 *
 * Agora o lote sai do SALDO da conta (`loteParaConta`, 0,01 por cada 1 000 USD) e a gestão leva as
 * parciais do padrão (50 % / 25 %). O efeito é o pedido do dono a 24/09:
 *   ·  1 000 USD → 0,01 lote → `volumeDaParte` devolve null e não há parciais (igual ao que era);
 *   · 10 000 USD → 0,10 lote → TP1 fecha 0,05, TP2 fecha 0,02 e o resto anda no trailing.
 * Nenhuma conta antiga muda de comportamento; a conta nova de 10 K é que passa a medir a sério.
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

/**
 * A gestão da conta-espelho: as parciais do padrão (50 % no TP1, 25 % no TP2), BE no TP1 e trailing.
 *
 * As parciais são PEDIDAS, não garantidas — `gestaoDoSinal` só grava a que der lote mínimo
 * (`volumeDaParte`). Numa conta de 1 000 USD (0,01 lote) nenhuma dá, e a posição comporta-se
 * exactamente como antes; numa de 10 000 USD (0,10) dão as duas. É esta a razão de o lote vir do
 * saldo e não de uma constante.
 */
export const CONFIG_TODOS_OS_SINAIS: ConfigSinais = { ...CONFIG_PADRAO, permitirDuplicado: false }

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

async function contasQueRecolhem(): Promise<Array<{ id: string; loteMinimo: number | null }>> {
  const db = getSupabaseAdmin()
  const r = await db.from('mtm_trading_accounts').select('id, lote_minimo')
    .eq('recolhe_todos_sinais', true).eq('motor', 'sim').eq('estado', 'ativa').limit(20)
  if (!r.error) return (r.data ?? []).map((c) => ({ id: String(c.id), loteMinimo: c.lote_minimo == null ? null : Number(c.lote_minimo) }))
  // Sem a 197 (lote_minimo) lê-se como antes; sem a 092 a coluna não existe: não há conta, nada acontece.
  const { data, error } = await db.from('mtm_trading_accounts').select('id')
    .eq('recolhe_todos_sinais', true).eq('motor', 'sim').eq('estado', 'ativa').limit(20)
  return error ? [] : (data ?? []).map((c) => ({ id: String(c.id), loteMinimo: null }))
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
    return await Promise.all(contas.map(({ id: accountId, loteMinimo }) => abrirSinalNaConta({
      accountId, loteMinimo, estrategia: 'todos', chave: `chat:${l.chat_message_id}`, impressao, fonte, comentario: fonte,
      chatMessageId: l.chat_message_id, symbol: l.symbol, direcao: l.direction, entrada: l.entry, sl: l.sl,
      // Sem `loteFixo`: o lote sai do saldo da conta (ver cabeçalho) — é o que dá parciais na de 10 K.
      // `loteMinimo` (197): a de 1 K «Todos os sinais» abre a 0,02 desde 07/10, para o TP1 partir a posição.
      tps: l.tps, cfg: CONFIG_TODOS_OS_SINAIS,
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
