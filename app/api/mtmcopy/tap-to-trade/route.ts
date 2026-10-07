import { NextRequest, NextResponse } from 'next/server'
import { recebeT2T, t2tDesligadoNaConta } from '@/lib/mtmcopy/alvo-t2t'
import { aplicarEscolha, escolhaGuardada, normalizarEscolha, separarEscolha } from '@/lib/mtmcopy/escolha-contas-t2t'
import { ehContaDaCasa } from '@/lib/mtmfunded/contas-da-casa'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { entradaT2T } from '@/lib/mtmcopy/t2t-entry'
import { parseSignal, type ParsedSignal } from '@/lib/mtmcopy/signal-parser'
import { isAllowedT2TSource, t2tMode, t2tSourceKey } from '@/lib/mtmcopy/t2t-source'
import { slComMinimo } from '@/lib/mtmcopy/source-risk-rules'
import {
  computeLotSize,
  getLotSizingSkipReason,
  signalForRiskSizing,
} from '@/lib/mtmcopy/lot-sizing'
import { fetchLotSizingContext, getAccountSnapshot, placeOrder, type OrderRequest } from '@/lib/mtmcopy/metaapi'
import { evaluatePropFirmGuard, propFirmLabel } from '@/lib/mtmcopy/prop-firm-guard'
import { isMarketOpen } from '@/lib/mtmcopy/market-hours'
import { symbolMatchesCanonical } from '@/lib/mtmcopy/symbol-resolver'
import { tapToTradeEnabledChannels, T2T_SIGNAL_CHANNELS as SIGNAL_CHANNELS } from '@/lib/mtmcopy/tap-to-trade-channels'
import { sinalJaSaiuDaZona, JANELA_MERCADO_MS } from '@/lib/mtmcopy/t2t-janela'
import { ehTradeLocker, sessaoDaLigacao } from '@/lib/tradelocker/ligacao'
import { colocarOrdemTL, contextoTL, loteTL, type ContextoTL } from '@/lib/tradelocker/executor'
import { executarT2TSimulado, type ResultadoT2TSimulado } from '@/lib/mtmfunded/simulado/t2t-simulado'
import { destinoDeExecucao } from '@/lib/mtmcopy/destino-execucao'
import { contasFundedLigadasParaT2T } from '@/lib/mtmfunded/simulado/ligar-conta'
import { contasJaExecutadasPeloMotor, encaminharT2TParaMotor } from '@/lib/mestres/servidor/t2t'

export const dynamic = 'force-dynamic'
// 60s: uma ligação MetaApi fria pode demorar até ~55s (CONNECT_TIMEOUT_MS). Com 30s a
// função expirava antes de abrir a trade sob carga/ligação fria. Com a cache de RPC
// quente, as execuções seguintes na mesma conta são rápidas.
export const maxDuration = 60

const supabase = getSupabaseAdmin()

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  return error || !user ? null : user
}

/** Um follow-up que ATIVA ou FECHA o setup (deixa de ser "pendente por tocar"). */
const SETUP_RESOLVED_RE =
  /(entry\s*hit|ativad|activad|tp\s*\d?\s*(hit|atingid)|hit\s*tp|exit\s*\d?\s*(hit|atingid|done|✅)?|sa[íi]da\s*\d|parcial|sl\s*hit|stop\s*loss\s*hit|break\s*even|\bbe\b|trade\s+active|running|fechad|posi[çc][aã]o\s+fechada|closed|close\s+all|cancelad|encerrad|descartad|invalidad|(alvo\s+(final|\d)|stop\s+loss|trailing\s+ativo)\s*·)/i

/**
 * O SETUP ainda está PENDENTE (por tocar) e aceitável fora da janela dos 5 min?
 * É pendente se a mensagem tem um nível de ENTRADA (zona/limite) e NÃO houver, no mesmo canal e
 * DEPOIS dela, um follow-up do MESMO par que a ative/feche. Janela máxima de segurança: 24h.
 */
async function isPendingSetupStillOpen(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  message: { id: string; channel_slug: string; content: string | null; created_at: string | null },
): Promise<boolean> {
  try {
    if (!message.created_at || !message.content) return false
    const ageMs = Date.now() - new Date(message.created_at).getTime()
    if (ageMs > 24 * 60 * 60 * 1000) return false // guarda: setups de ontem não abrem

    const parsed = parseSignal(message.content)
    // Só setups com NÍVEL de entrada (zona/limite) — entradas a mercado continuam a expirar aos 5 min.
    if (!parsed?.symbol || !(parsed.entry != null && parsed.entry > 0)) return false

    const symbolCore = parsed.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    const { data: laterMsgs } = await supabase
      .from('chat_messages')
      .select('content')
      .eq('channel_slug', message.channel_slug)
      .gt('created_at', message.created_at)
      .order('created_at', { ascending: true })
      .limit(80)
    for (const m of laterMsgs ?? []) {
      const c = String((m as { content?: string }).content ?? '')
      if (!c) continue
      const cU = c.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (symbolCore && !cU.includes(symbolCore)) continue // outro par → não resolve este setup
      if (SETUP_RESOLVED_RE.test(c)) return false // já foi ativado/fechado → não aceitar
    }
    return true // continua pendente por tocar
  } catch {
    return false // em dúvida, mantém a regra dos 5 min
  }
}

/** Constrói um ParsedSignal a partir de uma ideia Sensei estruturada (fallback ao parser). */
function signalFromIdea(idea: {
  symbol: string | null
  direction: string | null
  entry: number | null
  sl: number | null
  tp: unknown
}): ParsedSignal | null {
  if (!idea.symbol || (idea.direction !== 'buy' && idea.direction !== 'sell')) return null
  const tp = Array.isArray(idea.tp)
    ? idea.tp.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : []
  return {
    symbol: idea.symbol,
    direction: idea.direction,
    entry: idea.entry ?? null,
    sl: idea.sl ?? null,
    tp,
    orderType: idea.entry != null ? 'limit' : 'market',
    raw: 'sensei_trade_idea',
  }
}

/**
 * LEMBRAR ONDE A PESSOA ESCOLHEU ABRIR — `profiles.profile_data.t2t.contas`.
 *
 * Fica na CONTA e não no dispositivo (escolher no computador e ser outra vez interrogado no
 * telemóvel era o que fazia isto parecer partido), ao lado do que o WebTrader já guarda em
 * `profile_data.webtrader`. Lê-se antes de escrever para não levar o resto do `profile_data` à
 * frente: ali dentro vive também o estado de activação do membro, e um `update` cego apagava-o.
 *
 * É uma preferência de apresentação: não dá acesso a nada. Quem a lê (a pré-visualização) só a
 * usa para pré-marcar caixas, e quem abre ordens volta a validar cada conta do zero.
 */
async function guardarEscolhaT2T(userId: string, contas: string[]): Promise<void> {
  try {
    const { data: perfil } = await supabase.from('profiles').select('profile_data').eq('id', userId).maybeSingle()
    const dados = (perfil?.profile_data ?? {}) as Record<string, unknown>
    const t2t = { ...((dados.t2t ?? {}) as Record<string, unknown>), contas }
    await supabase.from('profiles').update({ profile_data: { ...dados, t2t } }).eq('id', userId)
  } catch (e) {
    console.error('[tap-to-trade] guardar escolha de contas falhou:', e)
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const chatMessageId = String((body as Record<string, unknown>).chat_message_id ?? '').trim()
  if (!chatMessageId) {
    return NextResponse.json({ error: 'chat_message_id obrigatório' }, { status: 400 })
  }

  // 1. Mensagem do chat
  const { data: message, error: msgErr } = await supabase
    .from('chat_messages')
    .select('id, channel_slug, content, telegram_message_id, created_at')
    .eq('id', chatMessageId)
    .maybeSingle()
  if (msgErr || !message) {
    return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })
  }
  // JANELA DE ACEITAÇÃO. Regra base: 5 minutos (entradas a mercado — depois disso o preço já fugiu).
  // RESSALVA (pedido Ricardo 2026-08-18): um SETUP PENDENTE (entrada por ZONA/limite que ainda não
  // foi ativada nem fechada) continua aceitável enquanto estiver vivo — o cliente entra com ordem
  // pendente e o motor trata do resto. Um setup deixa de ser aceitável quando aparece no MESMO canal
  // um follow-up posterior que o ativa/fecha (ENTRY HIT/TP/SL/BE/fechada/cancelada) para o par.
  const ageMs = message.created_at ? Date.now() - new Date(message.created_at).getTime() : 0
  if (ageMs > JANELA_MERCADO_MS) {
    // A trade já saiu da zona (entrada tocada, parcial feito ou sinal fechado)? Então a exceção
    // dos setups pendentes deixa de existir: o que se aceitaria agora era entrar a meio do
    // movimento com o stop do princípio — várias vezes o risco previsto, por uma fatia do alvo.
    const { saiu, fechado } = await sinalJaSaiuDaZona(chatMessageId)
    if (saiu) {
      return NextResponse.json(
        {
          error: fechado
            ? 'Este sinal já fechou.'
            : 'Já não dá para entrar: o preço saiu da zona de entrada deste sinal.',
          code: fechado ? 'closed' : 'out_of_zone',
        },
        { status: 410 },
      )
    }
    const stillPending = await isPendingSetupStillOpen(supabase, message)
    if (!stillPending) {
      return NextResponse.json(
        { error: 'Sinal expirado — passaram mais de 5 minutos.', code: 'expired' },
        { status: 410 },
      )
    }
  }
  // Provider tem de estar ativo no Tap to Trade (toggle em /admin/mtmcopy) — inclui rotas
  // custom sem sender_channel canónico. Fallback aos canais base se a config falhar.
  const enabledChannels = await tapToTradeEnabledChannels()
  const channelIsT2T = enabledChannels
    ? enabledChannels.has(message.channel_slug)
    : SIGNAL_CHANNELS.includes(message.channel_slug)
  if (!channelIsT2T) {
    return NextResponse.json({ error: 'Este provider não está ativo no Tap to Trade.', code: 'provider_off' }, { status: 403 })
  }

  // 2. Interpretar o sinal — parser do conteúdo, com fallback à ideia Sensei estruturada
  const bruto = message.content ? parseSignal(message.content) : null
  let signal: ParsedSignal | null = bruto ? entradaT2T(bruto) : null
  if (!signal || !signal.symbol || !signal.direction) {
    const { data: idea } = await supabase
      .from('sensei_trade_ideas')
      .select('symbol, direction, entry, sl, tp')
      .eq('chat_message_id', chatMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (idea) signal = signalFromIdea(idea)
  }
  if (!signal || !signal.symbol || !signal.direction) {
    return NextResponse.json({ error: 'Não foi possível interpretar o sinal desta mensagem' }, { status: 400 })
  }
  // Só entradas COMPLETAS são negociáveis: exige TP (alvo) e exclui updates/follow-ups (só-SL,
  // "Ref:", TP hit, BE, fecho). Espelha o filtro do chat/feed (defesa em profundidade contra
  // abrir ouro em sinais incompletos do Premium).
  // Fonte permitida? SÓ Premium/Sensei/James/PrimeVerse são negociáveis (evita poluição do T2T).
  if (!isAllowedT2TSource(message.channel_slug, message.content)) {
    return NextResponse.json(
      { error: 'Este sinal não é negociável por Tap to Trade.', code: 'source_not_allowed' },
      { status: 400 },
    )
  }
  const hasTp = Array.isArray(signal.tp) && signal.tp.some((t) => typeof t === 'number' && t > 0)
  const isFollowupMsg =
    /(tp\s*\d?\s*(hit|atingid)|hit\s*tp|break\s*even|be\s*set|posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|cancelad|encerrad)/i.test(
      message.content || '',
    )
  if (isFollowupMsg || !hasTp) {
    return NextResponse.json(
      { error: 'Sinal incompleto (sem alvo/TP) ou é um update — não é negociável.', code: 'incomplete_signal' },
      { status: 400 },
    )
  }

  // ── MODO SEGUIR (perpétuos) ──────────────────────────────────────────────────────────
  // Nos perpétuos a posição vive na ordem-mestre da Bybit, não na conta MT5 de cada cliente —
  // e a maioria dos pares nem sequer existe lá. Aceitar aqui significa SEGUIR: o sinal fica
  // marcado como ativo para este utilizador e a gestão do motor real (entrada, parciais,
  // break-even, fecho) chega-lhe por notificação, sem abrir nada na conta dele.
  // BTCUSD/BTCUSDT são a exceção: existem em MT5 e continuam a executar pelo caminho normal.
  if (t2tMode(message.channel_slug, message.content) === 'follow') {
    const { error: seguirErr } = await supabase.from('mtmcopy_signal_log').insert({
      user_id: user.id,
      connection_id: null,
      chat_message_id: chatMessageId,
      symbol: signal.symbol,
      direction: signal.direction,
      entry: signal.entry,
      sl: signal.sl,
      tp: signal.tp?.[0] ?? null,
      lot: null,
      status: 'following',
      detail: 'Perpétuo: a seguir a ordem-mestre. Sem ordem na conta do cliente.',
      channel_key: message.channel_slug,
      telegram_message_id: message.telegram_message_id ?? null,
    })
    if (seguirErr && (seguirErr as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Já estás a seguir este sinal.', code: 'already_following' }, { status: 409 })
    }
    if (seguirErr) {
      console.error('[tap-to-trade] seguir perp falhou:', seguirErr)
      return NextResponse.json({ error: 'Não foi possível seguir este sinal.' }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      mode: 'follow',
      symbol: signal.symbol,
      direction: signal.direction,
      message: `A seguir ${signal.symbol}. A gestão desta posição chega-te por notificação — não foi aberta nenhuma ordem na tua conta.`,
    })
  }

  // 3. Contas destino — FAN-OUT. Aceitar o sinal abre em TODAS as contas do user com T2T ligado
  //    (t2t_enabled, ou a conta dedicada purpose=tap_to_trade). Cada conta é dimensionada pelo SEU
  //    próprio saldo → risco idêntico "por equidade". O sizing T2T (t2t_lot_mode/value) é próprio e
  //    NÃO mexe no sizing da cópia (lot_mode/value). Retrocompat: sem contas marcadas, usa a 1ª ativa.
  const { data: conns } = await supabase
    .from('mtmcopy_connections')
    // '*': as colunas tl_* (TradeLocker) só existem depois da migração 069 — pedir colunas em
    // falta fazia a query inteira falhar e o T2T ficava sem contas para toda a gente.
    .select('*')
    .eq('user_id', user.id)
    .neq('mt5_status', 'disconnected')
  // Conta com onde executar: MetaApi (MT5) ou TradeLocker (conta escolhida na ligação).
  // Ligações MTM Funded (mt5_platform='mtmfunded') ficam SEMPRE fora deste caminho: executam pelo
  // motor simulado, abaixo (lib/mtmcopy/destino-execucao).
  const withAccount = (conns ?? []).filter((c) => {
    const d = destinoDeExecucao(c)
    return d === 'metaapi' || d === 'tradelocker'
  })
  // Regra única (lib/mtmcopy/alvo-t2t): t2t_enabled=false numa conta dedicada = desligada nesta conta.
  const t2tTargets = withAccount.filter((c) => recebeT2T(c))

  // Contas SIMULADAS MTM Funded com «aceita Tap to Trade» (migração 070): abrem a ideia ao lado
  // das reais. Um utilizador só com simuladas também pode aceitar — daí contarem para os guardas
  // abaixo. Antes da 070 a coluna não existe, a leitura dá erro e isto fica a false.
  const { data: simT2Tbruto } = await supabase
    .from('mtm_trading_accounts').select('id, tipo, conta_casa, recolhe_todos_sinais')
    .eq('user_id', user.id).eq('motor', 'sim').eq('estado', 'ativa').eq('aceita_t2t', true).limit(20)
  // As contas da casa nunca são destino de uma aceitação (lib/mtmfunded/contas-da-casa): mestres,
  // conta-espelho e «Todos os sinais» são instrumentos de medição, não contas para negociar.
  const simT2T = (simT2Tbruto ?? []).filter((c) => !ehContaDaCasa(c))
  // + contas MTM Funded ligadas pelo cliente no «Ligar conta» (074): dele, não só-leitura, não pausadas.
  const fundedLigadas = await contasFundedLigadasParaT2T(user.id, (conns ?? []) as Array<Record<string, unknown>>).catch(() => [] as string[])
  let temSimuladas = Boolean(simT2T.length) || fundedLigadas.length > 0

  // Contas T2T pausadas (is_active=false) ficam ligadas só para estatísticas → não executam.
  let targets = t2tTargets.filter((c) => c.is_active !== false)
  if (t2tTargets.length && !targets.length && !temSimuladas) {
    return NextResponse.json({ error: 'O Tap to Trade está em pausa nas tuas contas. Retoma-o no T2T para executar sinais.', code: 't2t_paused' }, { status: 400 })
  }
  // Retrocompat (conta única): sem nenhuma conta marcada como T2T → a 1ª conta MT5 ativa.
  if (!targets.length) {
    // Uma conta com o T2T desligado explicitamente (ex.: TradeLocker ligada no WebTrader) nunca é o recurso.
    const fallback = withAccount.find((c) => c.is_active !== false && !t2tDesligadoNaConta(c))
    if (fallback) targets = [fallback]
  }
  if (!targets.length && !temSimuladas) {
    return NextResponse.json({ error: 'Sem conta ligada (ou todas em pausa). Liga/retoma a tua conta MT5 no T2T.', code: 'no_connection' }, { status: 400 })
  }

  /**
   * 3b. ONDE ABRE — a escolha de quem aceita (2026-09-24).
   *
   * O leque continua a existir; deixa é de ser o que acontece por omissão a quem não disse nada.
   * Quem manda `contas` abre SÓ nas que mandou. Quem NÃO manda — a app iOS antiga, a MTM Auto,
   * qualquer cliente por actualizar — herda a preferência guardada, se a pessoa tiver feito
   * alguma escolha em qualquer superfície; e quem nunca escolheu nada cai exactamente no caminho
   * de sempre, o leque por todas as contas elegíveis.
   *
   * A escolha é um FILTRO sobre o que já era elegível (lib/mtmcopy/escolha-contas-t2t): nunca
   * acrescenta uma conta, nunca salta um portão, e não toca no sizing — o lote e o risco de cada
   * conta que fica são os mesmos que seriam.
   */
  const escolha = normalizarEscolha((body as Record<string, unknown>).contas)
  const { reais: escolhaReais, simuladas: escolhaSimuladas } = separarEscolha(escolha)
  let simuladasPedidas: string[] | undefined
  /**
   * PEDIDAS MAS RECUSADAS. A lista no ecrã é conveniência; quem decide é o servidor. Uma conta
   * pedida que não esteja no conjunto elegível — de outra pessoa, mestre da casa, em pausa, com o
   * T2T desligado, sem a ligação concluída — não abre, e não se cala sobre isso: vai no `recusadas`
   * da resposta para a app poder dizer PORQUÊ em vez de a saltar em silêncio.
   */
  let recusadas: string[] = []

  /**
   * QUEM NÃO PERGUNTA, HERDA A ESCOLHA — mas nunca fica sem abrir por causa dela.
   *
   * A MTM Auto aceita com um toque e não tem folha de confirmação; uma app iOS antiga também não
   * manda `contas`. Se a pessoa já escolheu onde quer abrir (no site ou na app), ignorar isso
   * nesses caminhos era manter lá dentro exactamente a surpresa que isto veio corrigir. Por isso
   * a preferência guardada vale também aqui.
   *
   * A diferença face a uma escolha EXPLÍCITA: esta é uma preferência, não uma ordem. Se ela já não
   * casar com nenhuma conta elegível — contas apagadas, desligadas, trocadas — não se recusa a
   * aceitação num cliente que não tem ecrã para a corrigir: volta ao caminho de sempre.
   */
  if (!escolha.length) {
    const { data: perfil } = await supabase.from('profiles').select('profile_data').eq('id', user.id).maybeSingle()
    const preferida = escolhaGuardada(perfil?.profile_data)
    if (preferida.length) {
      const { reais: prefReais, simuladas: prefSim } = separarEscolha(preferida)
      const elegiveisSim = new Set<string>([...simT2T.map((c) => String(c.id)), ...fundedLigadas])
      const alvosPref = prefReais.length ? aplicarEscolha(targets, (c) => String(c.id), prefReais).contas : []
      const simPref = prefSim.filter((id) => elegiveisSim.has(id))
      // Só se aplica a preferência se ela ainda apanhar ALGUMA conta: uma preferência que ficou
      // sem destinos não pode transformar uma aceitação numa ordem que não abre em lado nenhum.
      if (alvosPref.length || (simPref.length && temSimuladas)) {
        targets = alvosPref
        simuladasPedidas = simPref
        temSimuladas = temSimuladas && simPref.length > 0
      }
    }
  }

  if (escolha.length) {
    const elegiveisSim = new Set<string>([...simT2T.map((c) => String(c.id)), ...fundedLigadas])
    const filtro = aplicarEscolha(targets, (c) => String(c.id), escolhaReais)
    const permitidas = new Set<string>([
      ...filtro.contas.map((c) => String(c.id)),
      ...escolhaSimuladas.filter((id) => elegiveisSim.has(id)).map((id) => `sim:${id}`),
    ])
    recusadas = escolha.filter((ref) => !permitidas.has(ref))
    targets = escolhaReais.length ? filtro.contas : []
    simuladasPedidas = escolhaSimuladas.filter((id) => elegiveisSim.has(id))
    temSimuladas = temSimuladas && simuladasPedidas.length > 0
    if (!targets.length && !temSimuladas) {
      // Nunca se volta ao leque por a escolha ter envelhecido: quem escreveu «só nesta» não pode
      // acabar com doze posições porque a conta que escolheu deixou de servir.
      return NextResponse.json(
        {
          error: 'As contas que escolheste já não estão disponíveis para este sinal. Escolhe outra vez onde queres abrir.',
          code: 'no_chosen_account',
        },
        { status: 400 },
      )
    }
  }

  // MESTRES NOSSAS (116): com o T2T da estratégia em live, o motor das mestres executa nestas contas
  // (execução directa, gestão pela mestre SIM da estratégia) e elas saem do caminho de sempre. Em
  // sombra/desligado não muda nada. E nunca se repete aqui um trade que o motor já executou na conta.
  const motorT2T = await encaminharT2TParaMotor({
    userId: user.id, chatMessageId,
    mensagem: { channel_slug: message.channel_slug ?? null, content: message.content ?? null, created_at: message.created_at ?? null },
    sinal: { symbol: signal.symbol, direction: signal.direction, entry: signal.entry ?? null },
    contas: targets as unknown as Array<Record<string, unknown> & { id: string; user_id: string }>,
  })
  const tratadasPeloMotor = new Set(motorT2T.tratadas.map((t) => t.connectionId))
  const jaPeloMotor = await contasJaExecutadasPeloMotor(
    targets.filter((c) => !tratadasPeloMotor.has(c.id)) as unknown as Array<Record<string, unknown> & { id: string; user_id: string }>,
    { symbol: signal.symbol, direction: signal.direction, entry: signal.entry ?? null },
    motorT2T.estrategia ?? null,
  )
  targets = targets.filter((c) => !tratadasPeloMotor.has(c.id) && !jaPeloMotor.has(c.id))
  const resultadosDoMotor = [
    ...motorT2T.tratadas.map((t) => ({ account: t.account, connectionId: t.connectionId, ok: t.ok, skipped: t.skipped, error: t.error, symbol: signal.symbol ?? undefined })),
    ...[...jaPeloMotor].map((id) => ({ account: id.slice(0, 6), connectionId: id, ok: false, skipped: true, error: 'já executado nesta conta pelo motor da estratégia' })),
  ]

  const symU = signal.symbol.toUpperCase()
  // Valores já validados (o guard de "sinal incompleto" garante symbol/direction) — capturados
  // aqui porque o narrowing do TS não atravessa a closure executeOnAccount abaixo.
  const sSymbol = signal.symbol as string
  const sDirection = signal.direction as 'buy' | 'sell'

  type AcctResult = { account: string; connectionId: string; ok: boolean; skipped?: boolean; orderId?: string | null; lot?: number; symbol?: string; sl?: number | null; tp?: number | null; error?: string }

  // Executa o sinal NUMA conta (whitelist → claim idempotente por conta → sizing pelo saldo dela →
  // tipo de ordem + SL/TP re-ancorados → placeOrder). Nunca lança (devolve o resultado agregável).
  const executeOnAccount = async (conn: (typeof targets)[number]): Promise<AcctResult> => {
    const label = conn.account_label || (conn.mt5_login_last4 ? `••${conn.mt5_login_last4}` : conn.id.slice(0, 6))
    // QUANTO DEMOROU, por conta. «Tap to Trade sem atrasos» era uma queixa sem número: a ligação
    // MetaApi fria chega a 55 s (CONNECT_TIMEOUT_MS) e não havia como distinguir isso de um
    // mercado lento ou de um erro. Estes dois relógios ficam no registo de cada ordem e é com eles
    // que se mede a passagem para o motor das mestres (que executa com a ligação já quente).
    const t0 = Date.now()
    let tPreparado = 0
    try {
      // Whitelist de símbolos por conta (match por FAMÍLIA — tolera sufixo da corretora).
      if (Array.isArray(conn.symbols_whitelist) && conn.symbols_whitelist.length) {
        const allowed = conn.symbols_whitelist.some((s: unknown) => symbolMatchesCanonical(symU, String(s)))
        if (!allowed) return { account: label, connectionId: conn.id, ok: false, skipped: true, error: `${signal.symbol} fora da whitelist` }
      }
      // Idempotência POR CONTA: (user_id, chat_message_id, connection_id) → cada conta abre 1×.
      const { error: claimErr } = await supabase.from('mtmcopy_signal_log').insert({
        user_id: user.id, connection_id: conn.id, chat_message_id: chatMessageId,
        symbol: signal.symbol, direction: signal.direction, entry: signal.entry, sl: signal.sl,
        tp: signal.tp?.[0] ?? null, lot: null, status: 'pending',
        channel_key: message.channel_slug, telegram_message_id: message.telegram_message_id ?? null,
      })
      if (claimErr) {
        if ((claimErr as { code?: string }).code === '23505') return { account: label, connectionId: conn.id, ok: false, skipped: true, error: 'já aceite' }
        console.error('[tap-to-trade] claim error:', claimErr)
      }
      /**
       * Sizing T2T próprio (não usa o sizing da cópia), e por FONTE quando a há.
       *
       * As fontes não são iguais: um scanner que dá vinte sinais por dia e um desk que dá dois
       * merecem tamanhos diferentes, e um número único fazia com que o risco certo para uma
       * fosse o errado para a outra. Sem entrada para a fonte vale o da conta — o que já era.
       *
       * O motor da estratégia (trailing stop, trailing profit, parciais na fonte) NÃO se mexe
       * daqui: isso é do provedor e administra-se no /admin. Aqui é só quanto ARRISCA o cliente.
       */
      const riscoDaFonte = (conn.t2t_source_risk as Record<string, { riscoPct?: number; riscoMaxPct?: number }> | null)
        ?.[String(message.channel_slug ?? '')]
      const sizingConn = {
        ...conn,
        lot_mode: riscoDaFonte?.riscoPct != null ? 'risk_percent' : (conn.t2t_lot_mode ?? conn.lot_mode),
        lot_value: riscoDaFonte?.riscoPct ?? conn.t2t_lot_value ?? conn.lot_value,
        max_risk_percent: riscoDaFonte?.riscoMaxPct ?? conn.max_risk_percent,
      }
      // TradeLocker: sessão + contexto pela API dela; MT5 continua pela MetaApi, sem mudanças.
      const tl = ehTradeLocker(conn) ? await sessaoDaLigacao(conn) : null
      if (tl && !tl.sessao) {
        await supabase.from('mtmcopy_signal_log').update({ status: 'error', detail: `T2T [TradeLocker]: ${tl.erro}` }).eq('user_id', user.id).eq('chat_message_id', chatMessageId).eq('connection_id', conn.id)
        return { account: label, connectionId: conn.id, ok: false, error: tl.erro ?? 'TradeLocker sem sessão' }
      }
      let tlCtx: ContextoTL | null = null
      if (tl?.sessao) {
        tlCtx = await contextoTL(tl.sessao, sSymbol, sDirection)
        if (!tlCtx.instrumento) {
          const motivo = tlCtx.erro ?? `${sSymbol} indisponível na TradeLocker`
          await supabase.from('mtmcopy_signal_log').update({ status: 'error', detail: `T2T [TradeLocker]: ${motivo}` }).eq('user_id', user.id).eq('chat_message_id', chatMessageId).eq('connection_id', conn.id)
          return { account: label, connectionId: conn.id, ok: false, symbol: sSymbol, error: motivo }
        }
      }
      const ctx = tlCtx
        ? { balance: tlCtx.balance ?? tlCtx.equity, marketPrice: tlCtx.marketPrice }
        : await fetchLotSizingContext(conn.metaapi_account_id!, sSymbol, sDirection)
      const riskSignal = signalForRiskSizing(signal, ctx.marketPrice)
      const lot = tlCtx ? loteTL(sizingConn, riskSignal, tlCtx) : computeLotSize(sizingConn, riskSignal, ctx.balance)
      const skip = getLotSizingSkipReason(sizingConn, signal, ctx.balance, lot, ctx.marketPrice)
      if (skip) {
        await supabase.from('mtmcopy_signal_log').update({ status: 'error', detail: `T2T: ${skip}` }).eq('user_id', user.id).eq('chat_message_id', chatMessageId).eq('connection_id', conn.id)
        return { account: label, connectionId: conn.id, ok: false, error: skip }
      }
      // Contas financiadas: almofada, consistência e drawdown diário decidem ANTES de abrir.
      // A trade é encolhida ao tecto de risco da almofada; se a regra morde, não abre.
      let lotFinal = lot
      // As guardas de prop firm leem o histórico pela MetaApi; numa conta TradeLocker não há como
      // as avaliar, e abrir sem elas numa conta financiada é arriscar a conta. Não abre.
      if (conn.prop_firm_type && tlCtx) {
        const motivo = 'Regras de conta financiada ainda não suportadas em TradeLocker'
        await supabase.from('mtmcopy_signal_log').update({ status: 'skipped', detail: `T2T [TradeLocker]: ${motivo}` }).eq('user_id', user.id).eq('chat_message_id', chatMessageId).eq('connection_id', conn.id)
        return { account: label, connectionId: conn.id, ok: false, skipped: true, error: motivo }
      }
      if (conn.prop_firm_type) {
        const snap = await getAccountSnapshot(conn.metaapi_account_id!)
        const saldo = ctx.balance ?? 0
        const equity = snap?.equity ?? snap?.balance ?? saldo
        const verdict = await evaluatePropFirmGuard({
          accountId: conn.metaapi_account_id!,
          propFirmType: conn.prop_firm_type,
          baseline: conn.baseline_balance ?? saldo,
          equity,
          balance: saldo,
        })
        if (!verdict.allow) {
          const motivo = `${propFirmLabel(conn.prop_firm_type)}: ${verdict.reason}`
          await supabase.from('mtmcopy_signal_log').update({ status: 'skipped', detail: `T2T: ${motivo}` }).eq('user_id', user.id).eq('chat_message_id', chatMessageId).eq('connection_id', conn.id)
          return { account: label, connectionId: conn.id, ok: false, skipped: true, error: motivo }
        }
        // Tecto pela almofada — só faz sentido quando o sizing é por percentagem de risco.
        const modo = sizingConn.lot_mode
        const pct = Number(sizingConn.lot_value ?? 0)
        if (modo === 'risk_percent' && pct > 0 && Number.isFinite(verdict.maxRiskAmount)) {
          const riscoPretendido = (saldo * pct) / 100
          if (riscoPretendido > verdict.maxRiskAmount && riscoPretendido > 0) {
            lotFinal = Math.max(0.01, Number((lot * (verdict.maxRiskAmount / riscoPretendido)).toFixed(2)))
          }
        }
      }

      // Tipo de ordem (market/limit/stop) conforme entry vs preço de mercado DESTA corretora.
      let orderType: 'market' | 'limit' | 'stop' = 'market'
      let openPrice: number | null = null
      if (signal.entry != null && signal.entry > 0) {
        const px = ctx.marketPrice
        if (px && px > 0) {
          const diff = Math.abs(signal.entry - px) / px
          // Preço já dentro da zona: o primeiro nível ficou para trás, entra a mercado. Um limite
          // acima do ask (ou abaixo do bid) é recusado pela corretora, e um stop iria à caça do
          // preço na direcção errada — ficaria à espera de sair da zona em vez de entrar nela.
          const dentroDaZona = signal.zone ? px >= signal.zone[0] && px <= signal.zone[1] : false
          if (diff < 0.0003 || dentroDaZona) orderType = 'market'
          else if (signal.direction === 'buy') { orderType = signal.entry > px ? 'stop' : 'limit'; openPrice = signal.entry }
          else { orderType = signal.entry < px ? 'stop' : 'limit'; openPrice = signal.entry }
        } else { orderType = 'limit'; openPrice = signal.entry }
      }
      // Re-ancorar SL/TP ao lado correto preservando a distância do sinal (+ guarda de sanidade 25%).
      const priceRef = openPrice ?? ctx.marketPrice ?? signal.entry ?? null
      const entryRef = signal.entry && signal.entry > 0 ? signal.entry : priceRef
      // Stop alargado ao mínimo da fonte ANTES de tudo o resto. O MTM Scanner escreve stops de 2
      // a 10 pips — dentro do spread do próprio par — e a trade nascia praticamente no stop.
      // Isto é dinheiro do cliente: nunca APERTA, só alarga o que é curto demais. Ver
      // source-risk-rules; foi a conta-espelho que expôs o problema, a fechar tudo no stop.
      const fonteSinal = t2tSourceKey(message.channel_slug, message.content)
      const slDaFonte = slComMinimo(fonteSinal, signal.symbol!, signal.direction!, signal.entry, signal.sl)
      let orderSl = conn.copy_sl !== false ? (slDaFonte ?? null) : null
      let orderTp = conn.copy_tp !== false ? (signal.tp?.[0] ?? null) : null
      let adjustedStops = false
      const SANE_STOP_FRAC = 0.25
      const isInsaneStop = (v: number | null): boolean => v == null || !(v > 0) || !entryRef || entryRef <= 0 || Math.abs(entryRef - v) / entryRef > SANE_STOP_FRAC
      if (isInsaneStop(orderSl)) orderSl = null
      if (isInsaneStop(orderTp)) orderTp = null
      if (priceRef && priceRef > 0 && entryRef && entryRef > 0) {
        if (orderSl != null && orderSl > 0) { const d = Math.abs(entryRef - orderSl); const fixed = signal.direction === 'buy' ? priceRef - d : priceRef + d; if (d > 0 && Math.abs(fixed - orderSl) > 1e-9) adjustedStops = true; if (d > 0) orderSl = fixed }
        if (orderTp != null && orderTp > 0) { const d = Math.abs(entryRef - orderTp); const fixed = signal.direction === 'buy' ? priceRef + d : priceRef - d; if (d > 0 && Math.abs(fixed - orderTp) > 1e-9) adjustedStops = true; if (d > 0) orderTp = fixed }
      }
      // Gate de horário: não tentar abrir com o mercado fechado (fim de semana / rollover).
      const mh = isMarketOpen(sSymbol)
      if (!mh.open) {
        return { account: label, connectionId: conn.id, ok: false, symbol: sSymbol, error: `mercado fechado (${mh.reason})` }
      }
      const orderReq: OrderRequest = { accountId: conn.metaapi_account_id ?? '', symbol: sSymbol, direction: sDirection, volume: lotFinal, orderType, openPrice, stopLoss: orderSl, takeProfit: orderTp, comment: 'TapToTrade MTM' }
      tPreparado = Date.now() - t0
      const tlResult = tl?.sessao && tlCtx ? await colocarOrdemTL(tl.sessao, orderReq, tlCtx) : null
      const result = tlResult ?? (await placeOrder(orderReq))
      // preparar = whitelist, claim, saldo, spec, sizing, níveis · corretora = a ordem em si
      const tempos = `${(tPreparado / 1000).toFixed(1)}s+${((Date.now() - t0 - tPreparado) / 1000).toFixed(1)}s`
      if (tlResult?.qty) lotFinal = tlResult.qty
      const plataforma = tlResult ? ' [TradeLocker]' : ''
      await supabase.from('mtmcopy_signal_log').update({
        lot: lotFinal,
        status: result.success ? 'open' : 'error',
        // TradeLocker: guarda o positionId (é por ele que a gestão fecha/move SL); sem ele, o orderId.
        broker_position_id: result.success ? ((tlResult?.positionId ?? result.orderId) ?? null) : null,
        detail: result.success
          ? `Tap to Trade${plataforma} · ordem ${orderReq.orderType} · ${result.orderId ?? ''}${adjustedStops ? ' · SL/TP ajustado ao lado correto' : ''} · ${tempos}`.trim()
          : `Tap to Trade${plataforma} falhou: ${result.error ?? 'erro'} · ${tempos}`,
      }).eq('user_id', user.id).eq('chat_message_id', chatMessageId).eq('connection_id', conn.id).then(undefined, (e) => console.error('[tap-to-trade] update log error:', e))
      return { account: label, connectionId: conn.id, ok: result.success, orderId: result.orderId, lot: lotFinal, symbol: result.brokerSymbol ?? sSymbol, sl: orderReq.stopLoss, tp: orderReq.takeProfit, error: result.success ? undefined : (result.error ?? 'erro') }
    } catch (e) {
      return { account: label, connectionId: conn.id, ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // Risco das simuladas = o que o T2T usa na conta real do cliente (fonte → conta), aplicado à
  // equity simulada. Sem conta real: 1%.
  const riscoSimulado = (() => {
    // Sem conta real, vale o risco escolhido na ligação MTM Funded (t2t_lot_value).
    const c = targets[0] ?? (conns ?? []).find((x) => destinoDeExecucao(x) === 'mtmfunded' && fundedLigadas.includes(String(x.funded_account_id)))
    if (!c) return 1
    const daFonte = (c.t2t_source_risk as Record<string, { riscoPct?: number }> | null)?.[String(message.channel_slug ?? '')]?.riscoPct
    const modo = c.t2t_lot_mode ?? c.lot_mode
    const v = Number(daFonte ?? (modo === 'risk_percent' ? (c.t2t_lot_value ?? c.lot_value) : NaN))
    return Number.isFinite(v) && v > 0 ? Math.min(5, Math.max(0.1, v)) : 1
  })()
  const fonteSim = t2tSourceKey(message.channel_slug, message.content)
  const [reais, simuladas] = await Promise.all([
    Promise.all(targets.map(executeOnAccount)),
    temSimuladas
      ? executarT2TSimulado({
          userId: user.id, chatMessageId, fonte: fonteSim,
          sinal: {
            symbol: sSymbol, direction: sDirection, entry: signal.entry ?? null,
            sl: slComMinimo(fonteSim, sSymbol, sDirection, signal.entry, signal.sl) ?? null,
            tp: signal.tp?.[0] ?? null, zone: signal.zone ?? null,
          },
          riscoPct: riscoSimulado,
          contasLigadas: fundedLigadas,
          // Escolheu onde abrir? Então só estas simuladas — as outras ficam de fora como as reais.
          apenas: simuladasPedidas,
        }).catch((e): ResultadoT2TSimulado[] => { console.error('[tap-to-trade] simuladas:', e); return [] })
      : Promise.resolve([] as ResultadoT2TSimulado[]),
  ])
  const results: AcctResult[] = [...resultadosDoMotor, ...reais, ...simuladas.map((r) => ({ ...r, connectionId: r.accountId }))]
  const opened = results.filter((r) => r.ok)
  const realErrors = results.filter((r) => !r.ok && !r.skipped)

  if (!opened.length) {
    // Todas já aceites antes → 409; senão devolve o 1.º erro real.
    if (results.length && results.every((r) => r.skipped && r.error === 'já aceite')) {
      return NextResponse.json({ error: 'Já aceitaste este sinal.', code: 'already_accepted' }, { status: 409 })
    }
    return NextResponse.json({ error: realErrors[0]?.error || 'Falha ao abrir a ordem', accounts: results }, { status: 502 })
  }

  // A escolha só se guarda depois de ter servido para alguma coisa: uma aceitação que falhou
  // toda não é uma preferência. Fire-and-forget — gravar a preferência nunca atrasa nem parte a
  // resposta de uma trade que já está aberta no mercado.
  if (escolha.length) void guardarEscolhaT2T(user.id, escolha.filter((ref) => !recusadas.includes(ref)))

  return NextResponse.json({
    success: true,
    accounts: results,
    opened: opened.length,
    escolhidas: escolha.length ? escolha : undefined,
    recusadas: recusadas.length ? recusadas : undefined,
    total: results.length,
    // Compat com a UI de conta-única: 1.º sucesso no topo.
    orderId: opened[0].orderId,
    symbol: opened[0].symbol,
    direction: signal.direction,
    lot: opened[0].lot,
    sl: opened[0].sl,
    tp: opened[0].tp,
    message: opened.length > 1
      ? `Trade ${signal.direction.toUpperCase()} ${signal.symbol} aberta em ${opened.length} contas`
      : `Trade ${signal.direction.toUpperCase()} ${signal.symbol} aberta · ${opened[0].lot} lote`,
  })
}
