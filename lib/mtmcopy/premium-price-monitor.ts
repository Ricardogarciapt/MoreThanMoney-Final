/**
 * Monitor de preço Premium — fecha os parciais por PREÇO (não por mensagem Telegram).
 * Uma posição por sinal na conta provider; o CopyFactory replica os fechos aos slaves.
 * Quando o preço toca cada Exit: fecha a % do split (>70% no Exit 1) e, no Exit 1,
 * move o SL para break-even + arranca o trailing ancorado ao risco.
 * Idempotente por `exits_done`. Default DESLIGADO (exec-switch premium_price_monitor).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getExecSwitches } from './exec-switches'
import {
  readOpenPositions,
  closePositionById,
  modifyPositionSlTp,
  type MetaApiPosition,
} from './metaapi'
import {
  premiumTrailingAfterTp1Hit,
  PREMIUM_WIDE_ZONE_SL_PIPS,
  PREMIUM_WIDE_ZONE_TRAIL_ACTIVATION_PIPS,
} from './premium-trade-active'
import { mirrorPremiumExit } from './premium-subscriber-exits'
import { CANONICAL_PREMIUM_ACCOUNT_ID, CONTAS_MOTOR_TEMPO_REAL, ehContaDeMotor } from './provider-constants'
import { pipSizeForSymbol } from './trade-outcome'
import { symbolMatchesCanonical } from './symbol-resolver'
import { adotarManuais } from './adotar-manuais'
import { trailingArrancaPips } from './source-risk-rules'
import { lerPosicoesMotor, precoMotor, sombraSnapshot } from './metaapi-snapshot'
import { podeSaltarLeitura } from './market-hours'

interface ActiveRow {
  id: string
  account_id: string
  symbol: string
  direction: 'buy' | 'sell'
  entry: number | null
  sl: number | null
  tp1: number | null
  tp2: number | null
  tp3: number | null
  exit_pct_tp1: number
  exit_pct_tp2: number
  exit_pct_tp3: number
  original_lot: number
  small_account: boolean
  exits_done: number
  trailing_started: boolean
  early_trail_started: boolean
  peak_profit_pips: number
  profit_locked: boolean
  /**
   * null = Premium normal ·
   * 'trailing' = acompanhamento puro (BE proporcional ao risco + trailing, sem escada de saídas).
   */
  profile: string | null
  /** Mensagem do Telegram que originou a trade — a ponte para o cartão no chat. */
  telegram_message_id: number | null
  /** Mensagem do chat que originou a trade (sinais de webhook não passam pelo Telegram). */
  chat_message_id: string | null
  /** Fonte do sinal — decide as regras de risco (ver source-risk-rules). */
  source_key: string | null
  created_at: string
}

/**
 * Encerra a trade: marca a linha fechada E anuncia o fecho no chat, em thread no sinal.
 *
 * Sem o anúncio a posição desaparecia da conta mestre mas o cartão ficava no Tap to Trade como
 * se ainda desse para entrar — a 2026-08-25 três setups já fechados continuavam a aparecer
 * "vivos" na app, e quem tocasse abria uma trade que o provedor já tinha encerrado. O trader só
 * publica «HIT TP3» quando lhe apetece, e é isso que a app estava a esperar.
 *
 * O anúncio é idempotente (o `announceAndCloseByMessage` não repete o mesmo cartão em thread) e
 * fecha também as ordens de quem aceitou o sinal no T2T.
 */
/**
 * Regista uma SAÍDA — é isto que faz os parciais contarem na prova.
 *
 * Uma posição de 0,03 que fecha 0,01 no TP1, 0,01 no TP2 e 0,01 no stop não é uma perda: é a
 * média ponderada das três saídas. Antes só se guardava `exits_done`, um contador, e quem
 * medisse depois via "Stop loss" e deitava fora o lucro já embolsado. Cada linha aqui tem a
 * fração fechada e os pips DESSA saída; somar fração×pips dá o resultado real da posição.
 *
 * Falhar a gravar nunca trava a gestão da trade — o dinheiro vem primeiro que a estatística.
 */
async function registarSaida(
  admin: ReturnType<typeof getSupabaseAdmin>,
  row: ActiveRow,
  args: { accountId: string; positionId: string; nivel: number; fraccao: number; preco: number; fechouTudo: boolean },
): Promise<void> {
  try {
    const entry = row.entry && row.entry > 0 ? row.entry : null
    const pips =
      entry != null
        ? Math.round(((row.direction === 'buy' ? args.preco - entry : entry - args.preco) / pipSizeForSymbol(row.symbol)) * 10) / 10
        : null
    await admin.from('mtmcopy_trade_exits').upsert(
      {
        account_id: args.accountId,
        position_id: String(args.positionId),
        symbol: row.symbol,
        direction: row.direction,
        source_key: row.source_key ?? null,
        exit_level: args.nivel,
        fraccao: Math.min(Math.max(args.fraccao, 0), 1),
        entry,
        price: args.preco,
        pips,
        fechou_tudo: args.fechouTudo,
      },
      { onConflict: 'position_id,exit_level' },
    )
  } catch {
    /* estatística nunca bloqueia execução */
  }
}

async function encerrarRegisto(
  admin: ReturnType<typeof getSupabaseAdmin>,
  row: ActiveRow,
  /** 'target_final' quando saiu nos alvos; 'closed' quando a posição simplesmente desapareceu. */
  evento: 'target_final' | 'closed',
  extra: Record<string, unknown> = {},
): Promise<void> {
  await admin
    .from('mtmcopy_premium_active')
    .update({ ...extra, status: 'closed', updated_at: new Date().toISOString() })
    .eq('id', row.id)

  // Ponte para o cartão: o id do chat quando o sinal nasceu de webhook, o id do Telegram quando
  // veio de um canal. Sem uma das duas não há onde anunciar.
  if (row.chat_message_id == null && row.telegram_message_id == null) return
  try {
    let msgId = row.chat_message_id
    let slug = PREMIUM_CHAT_SLUG
    if (msgId) {
      const { data: m } = await admin
        .from('chat_messages').select('channel_slug').eq('id', msgId).maybeSingle()
      if (m?.channel_slug) slug = m.channel_slug as string
    } else {
      const { data: msg } = await admin
        .from('chat_messages')
        .select('id')
        .eq('channel_slug', PREMIUM_CHAT_SLUG)
        .eq('telegram_message_id', row.telegram_message_id)
        .maybeSingle()
      msgId = (msg?.id as string) ?? null
    }
    if (!msgId) return
    const { announceAndCloseByMessage } = await import('./t2t-lifecycle')
    await announceAndCloseByMessage({
      chatMessageId: msgId,
      chatSlug: slug,
      symbol: row.symbol,
      direction: row.direction,
      event: evento,
      label: 'MTM Auto Premium',
    })
  } catch (e) {
    console.warn('[premium-monitor] anuncio de fecho falhou:', e instanceof Error ? e.message : String(e))
  }
}

/** BE protetor cedo: move SL→BE quando o lucro ≥ esta FRACÇÃO do risco (|entrada−SL|). Menor = mais
 *  cedo. Como é fracção do risco, entrada FUNDA (risco pequeno) chega a BE mais cedo, na PONTA mais
 *  tarde. Env PREMIUM_EARLY_BE_RATIO (default 0.4). */
const PREMIUM_EARLY_BE_RATIO = (() => {
  const v = Number(process.env.PREMIUM_EARLY_BE_RATIO)
  return Number.isFinite(v) && v > 0 && v <= 2 ? v : 0.4
})()

/** Canal do chat onde vivem os sinais do Premium. */
const PREMIUM_CHAT_SLUG = 'premium-ideas'

/** Quanto tempo depois do sinal uma posição sem comentário ainda conta como sendo dele. */
const JANELA_CASAMENTO_MS = 10 * 60 * 1000

/**
 * NÃO LEVAR STOP DEPOIS DE TER ESTADO EM LUCRO.
 *
 * O BE protetor só dispara a 40% do risco. Entre 0 e esse ponto havia um vazio: a trade corria
 * +20 pips, revertia, e levava o stop inteiro — depois de ter estado a ganhar. Assim que o lucro
 * MÁXIMO visto passa este limiar, o stop vai para a entrada (+buffer) e fica lá.
 *
 * O limiar não é zero de propósito: com spread e comissão, trancar a 1 pip fecha a trade no
 * primeiro tremor. Doze pips de ouro é ~1,2 USD de movimento — o suficiente para o BE ficar
 * acima do custo de entrada e sair.
 */
const PREMIUM_LOCK_PROFIT_PIPS = (() => {
  const v = Number(process.env.PREMIUM_LOCK_PROFIT_PIPS)
  return Number.isFinite(v) && v > 0 ? v : 12
})()

/** BE NÃO fica na entrada seca: fica +N pips A FAVOR (lucro travado), pedido do Ricardo. Aplica-se ao
 *  BE protetor cedo E ao BE do Exit 1. Env PREMIUM_BE_BUFFER_PIPS (default 5). */
const PREMIUM_BE_BUFFER_PIPS = (() => {
  const v = Number(process.env.PREMIUM_BE_BUFFER_PIPS)
  return Number.isFinite(v) && v >= 0 ? v : 5
})()

/** Tamanho de pip — fonte única em trade-outcome.ts (esta cópia não conhecia cripto). */
const pipSizeFor = pipSizeForSymbol

/**
 * Preço de referência da trade: o PREENCHIMENTO REAL, não o nível escrito no sinal.
 *
 * `row.entry` é a ponta da zona («Gold Buy Zone 4620 - 4615» → 4615). Quando o preço já passou a
 * zona a ordem entra a mercado e enche noutro sítio — a 2026-08-25 uma compra registada a 4615
 * encheu a 4622,29. Medir o lucro a partir de 4615 dava a trade como +72 pips no segundo em que
 * abriu: a tranca de lucro disparava logo, o stop ia para 4615,5 (SETE pontos ABAIXO da entrada
 * real, ou seja um stop de perda disfarçado de break-even) e a trade morria em segundos com
 * +10/+30 pips. É por isso que nenhuma trade de hoje chegou ao TP2.
 */
function precoDeReferencia(row: ActiveRow, pos: MetaApiPosition): number {
  const fill = pos.openPrice
  if (Number.isFinite(fill) && fill > 0) return fill
  return row.entry && row.entry > 0 ? row.entry : 0
}

/** Preço-alvo do BE = entrada + buffer a FAVOR (nunca na entrada seca). */
function beTargetPrice(entry: number, direction: 'buy' | 'sell', symbol: string): number {
  const buf = PREMIUM_BE_BUFFER_PIPS * pipSizeFor(symbol)
  return direction === 'buy' ? entry + buf : entry - buf
}

function roundLot(n: number): number {
  return Math.max(0.01, Math.round(n * 100) / 100)
}

function positionDir(p: MetaApiPosition): 'buy' | 'sell' {
  return /buy/i.test(p.type) ? 'buy' : 'sell'
}

/**
 * A posição desta linha na lista da conta. A posição é NOSSA pelo comentário; quando o comentário
 * não vem (contas de trade manual, ordens que a corretora reescreve), vale a coincidência de par,
 * lado e HORA de abertura. Sem isto a trade de 2026-08-25 às 14:20 — aberta sem comentário — ficou
 * invisível ao motor: sem BE, sem trailing, e a linha era dada como fechada com a posição ainda
 * aberta. Comparação CANÓNICA do par: a corretora devolve 'XAUUSD.s', 'XAUUSD-VIP', 'XAUUSD.s'…
 * conforme a conta, e a linha guarda 'XAUUSD'. Com igualdade estrita a posição nunca era
 * encontrada e a linha era encerrada com a trade ainda aberta.
 */
function acharPosicao(positions: MetaApiPosition[], row: ActiveRow): MetaApiPosition | undefined {
  const candidatas = positions.filter(
    (p) => symbolMatchesCanonical(p.symbol, row.symbol) && positionDir(p) === row.direction,
  )
  return (
    candidatas.find((p) => /prem/i.test(p.comment ?? '') || /gold\s*did/i.test(p.comment ?? '')) ??
    candidatas.find((p) => {
      if (!p.time) return false
      const dt = Math.abs(Date.parse(p.time) - Date.parse(row.created_at))
      return Number.isFinite(dt) && dt <= JANELA_CASAMENTO_MS
    })
  )
}

/**
 * O espelhamento de saídas para os subscritores SÓ faz sentido a partir da conta MESTRE.
 * No modo SEMI-AUTOMÁTICO (premium_master_exec=off) cada subscritor tem a SUA linha em
 * mtmcopy_premium_active e é gerido individualmente — espelhar aí fecharia as posições dos OUTROS
 * subscritores em cadeia (dinheiro real). Por isso: espelha só se a linha for do mestre.
 */
function shouldMirrorExits(accountId: string): boolean {
  return accountId === CANONICAL_PREMIUM_ACCOUNT_ID
}

export async function runPremiumPriceMonitor(): Promise<{
  ran: boolean
  checked: number
  actions: number
  detail: string[]
}> {
  const sw = await getExecSwitches()
  if (!sw.premium_price_monitor) return { ran: false, checked: 0, actions: 0, detail: ['monitor desligado'] }
  if (!CONTAS_MOTOR_TEMPO_REAL.length) {
    return { ran: false, checked: 0, actions: 0, detail: ['sem contas de origem configuradas'] }
  }

  const admin = getSupabaseAdmin()

  /**
   * Antes de gerir, ADOPTAR: trades abertas à mão na conta provider e marcadas com "MTM" no
   * comentário passam a ter linha, e a partir daí o motor trata delas como das outras.
   *
   * Vem primeiro de propósito — uma trade adoptada nesta passagem tem de ser gerida NESTA
   * passagem. Adoptar depois de ler as linhas deixava-a um minuto à espera, e um minuto é tempo
   * suficiente para o break-even que se queria proteger deixar de fazer falta.
   */
  const adocao = await adotarManuais()
  if (adocao.notas.length) console.log('[premium-monitor][adopcao]', adocao.notas.join(' · '))

  const { data: rows } = await admin
    .from('mtmcopy_premium_active')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(200)

  const list = (rows ?? []) as ActiveRow[]
  if (!list.length) return { ran: true, checked: 0, actions: 0, detail: ['sem trades ativas'] }

  const detail: string[] = []
  const byAccount = new Map<string, ActiveRow[]>()
  for (const r of list) {
    if (!byAccount.has(r.account_id)) byAccount.set(r.account_id, [])
    byAccount.get(r.account_id)!.push(r)
  }

  /**
   * O motor visita as contas de ORIGEM, não as cópias.
   *
   * Cada conta visitada custa uma leitura de posições à MetaApi por passagem. Com dezenas de
   * contas de clientes, a esmagadora maioria dessas leituras servia para gerir posições que a
   * CopyFactory já gere sozinha: quando o mestre faz o parcial, move o stop para a entrada ou
   * arrasta o trailing, essas alterações são replicadas a quem o copia. Gerir a cópia outra vez,
   * conta a conta, é pagar duas vezes pelo mesmo resultado.
   *
   * As contas que executam por Telegram DIRETO são a exceção que fica: abrem na própria conta,
   * ninguém lhes replica nada, e sem o motor ficavam sem parciais, sem break-even e sem
   * trailing. Essas continuam a ser visitadas — são poucas e são as únicas que precisam.
   */
  const { data: diretas } = await admin
    .from('mtmcopy_connections')
    .select('metaapi_account_id')
    .eq('is_active', true)
    .eq('copy_method', 'telegram_group')
    .not('metaapi_account_id', 'is', null)
  const precisamDoMotor = new Set((diretas ?? []).map((c) => String(c.metaapi_account_id)))

  const saltadas: string[] = []
  for (const accountId of [...byAccount.keys()]) {
    if (ehContaDeMotor(accountId) || precisamDoMotor.has(accountId)) continue
    byAccount.delete(accountId)
    saltadas.push(accountId.slice(0, 8))
  }
  if (saltadas.length) {
    detail.push(`${saltadas.length} contas copiadoras saltadas (a CopyFactory replica os fechos): ${saltadas.join(', ')}`)
  }
  if (adocao.adotadas.length) {
    detail.push(
      `${adocao.adotadas.length} trade(s) manual(is) adoptada(s): ` +
        adocao.adotadas.map((a) => `${a.symbol} ${a.direction}`).join(', '),
    )
  }

  let actions = 0
  let checked = 0

  for (const [accountId, accRows] of byAccount) {
    // MERCADO FECHADO (fim de semana) e nenhuma trade desta conta é cripto: não há ticks nem SL/TP
    // a disparar, ler é gastar créditos. As linhas ficam exactamente como estão (nada se fecha).
    // Interruptor SALTAR_LEITURAS_MERCADO_FECHADO (ver market-hours.ts).
    if (podeSaltarLeitura(accRows.map((r) => r.symbol))) {
      detail.push(`conta ${accountId.slice(0, 8)}: mercado fechado, sem cripto — leitura saltada`)
      continue
    }

    // Leitura ESTRITA. Com o fail-open antigo, uma falha devolvia [] → o find abaixo não
    // encontrava a posição → a linha era marcada 'closed' e a trade deixava de ser gerida,
    // continuando aberta na corretora. Foi assim que 21 dos 37 registos de ouro de uma semana
    // morreram nos primeiros dois minutos.
    //
    // Contas em PREMIUM_STREAMING_CONTAS leem a fotografia do streaming quando é fresca e
    // sincronizada; qualquer outra situação é o RPC de sempre (metaapi-snapshot.ts).
    const leitura = await lerPosicoesMotor(accountId)
    const positions = leitura.posicoes
    if (positions == null) {
      detail.push(`conta ${accountId.slice(0, 8)} ilegível — nada concluído`)
      continue
    }
    /** Confirmação por RPC de uma ausência vista na fotografia (uma por conta e passagem). */
    let confirmacaoRpc: MetaApiPosition[] | null | undefined

    for (const row of accRows) {
      checked++
      let pos = acharPosicao(positions, row)
      if (!pos && leitura.snapshot) {
        // A fotografia pode ter até ~1 s de atraso: uma posição acabada de abrir ainda não está
        // lá. Uma AUSÊNCIA nunca se conclui pela fotografia — confirma-se por RPC. Se o RPC a
        // tiver, gere-se já com a posição do RPC.
        if (confirmacaoRpc === undefined) confirmacaoRpc = await readOpenPositions(accountId)
        if (confirmacaoRpc == null) {
          detail.push(`${row.symbol}: ausente na fotografia e RPC ilegível — nada concluído`)
          continue
        }
        pos = acharPosicao(confirmacaoRpc, row)
        if (pos) detail.push(`${row.symbol}: posição ausente na fotografia, presente no RPC`)
      }
      if (!pos) {
        // Posição já não existe (fechada por trailing/SL/TP) → encerra o registo.
        await encerrarRegisto(admin, row, 'closed')
        continue
      }

      /**
       * O preço que manda no trailing.
       *
       * `pos.currentPrice` vem com o instantâneo da posição e pode ter segundos: a MetaApi
       * devolve o estado da conta, não um tick. Num movimento rápido esses segundos são a
       * diferença entre travar o lucro e devolvê-lo no recuo.
       *
       * Com o interruptor ligado lê-se o preço ao vivo. Custa uma chamada por posição e por
       * passagem — é por isso que é escolha e não comportamento fixo: quem opera swing não ganha
       * nada com ela.
       */
      let price = pos.currentPrice
      if (sw.trailing_tempo_real) {
        const vivo = await precoMotor(accountId, row.symbol, pos.symbol, leitura.snapshot)
        // Falhar a leitura NÃO pára a gestão: cai no instantâneo, que é o que havia antes.
        if (vivo != null && vivo > 0) price = vivo
      }
      if (price == null || !Number.isFinite(price)) continue

      // ── PERFIL TRAILING (Sensei e outras rotas) ───────────────────────────────
      // Gestão de acompanhamento pura, SEM escada de saídas: o alvo é o TP da própria ordem e
      // quem realiza o lucro é o stop que segue o preço. Corre no mesmo ciclo de 1 segundo do
      // Premium, mas em bloco à parte — o Premium não passa por aqui e continua exactamente
      // como estava.
      //
      // Duas diferenças deliberadas face ao Premium:
      //  · o BE é PROPORCIONAL AO RISCO (40% dele), não um número fixo de pips. Numa trade com
      //    115 pips de risco, trancar aos 12 pips de pico punha o stop a +5 e fechava a posição
      //    ao primeiro tremor — o oposto de deixar correr.
      //  · nunca fecha em TP nenhum. Sobe o stop e deixa a trade andar.
      if (row.profile === 'trailing') {
        const ref = precoDeReferencia(row, pos)
        if (ref <= 0 || !row.sl || row.sl <= 0) continue
        const pip = pipSizeFor(row.symbol)
        const riscoPips = Math.max(1, Math.abs(ref - row.sl) / pip)
        const lucroPips = (row.direction === 'buy' ? price - ref : ref - price) / pip

        const pico = Math.max(row.peak_profit_pips ?? 0, lucroPips)
        if (pico > (row.peak_profit_pips ?? 0)) {
          await admin
            .from('mtmcopy_premium_active')
            .update({ peak_profit_pips: pico, updated_at: new Date().toISOString() })
            .eq('id', row.id)
          row.peak_profit_pips = pico
        }

        // Ainda não andou o suficiente para proteger: não mexe no stop do sinal.
        //
        // Por defeito o gatilho é uma FRACÇÃO DO RISCO (40%), que se adapta a stops largos como
        // os do ouro. Mas há fontes com regra própria: o MTM Scanner arranca aos +10 pips fixos,
        // porque com stops de 20 pips os 40% dariam 8 e o trailing prendia-se cedo demais no
        // ruído. Ver source-risk-rules.
        const arranqueDaFonte = trailingArrancaPips(row.source_key)
        const gatilho = arranqueDaFonte ?? PREMIUM_EARLY_BE_RATIO * riscoPips
        if (pico < gatilho) continue

        const spec = premiumTrailingAfterTp1Hit(Math.round(riscoPips))
        const trailPips = spec.mode === 'threshold_pips' ? spec.trailPips : 45
        const piso = beTargetPrice(ref, row.direction, row.symbol)
        const candidato = row.direction === 'buy' ? price - trailPips * pip : price + trailPips * pip
        const novo = row.direction === 'buy' ? Math.max(candidato, piso) : Math.min(candidato, piso)
        const atual = pos.stopLoss ?? null
        const melhora = atual == null
          ? true
          : row.direction === 'buy' ? novo > atual + pip * 0.5 : novo < atual - pip * 0.5
        if (!melhora) continue
        try {
          await modifyPositionSlTp(accountId, pos.id, novo, pos.takeProfit, undefined, row.symbol)
          if (!row.trailing_started || !row.profit_locked) {
            await admin
              .from('mtmcopy_premium_active')
              .update({ trailing_started: true, profit_locked: true, updated_at: new Date().toISOString() })
              .eq('id', row.id)
            row.trailing_started = true
            row.profit_locked = true
          }
          actions++
          detail.push(
            `${row.symbol}: trailing → stop ${novo.toFixed(2)} (${trailPips}p atrás, pico +${pico.toFixed(0)}p de ${riscoPips.toFixed(0)}p de risco)`,
          )
        } catch {
          detail.push(`${row.symbol}: trailing falhou`)
        }
        continue
      }

      // ── TRANCA DE LUCRO ────────────────────────────────────────────────────────────
      // Uma trade que esteve em lucro não acaba em stop. Guarda-se o lucro MÁXIMO visto e,
      // assim que passa o limiar, o stop sobe para a entrada (+buffer) e fica lá. Corre ANTES
      // de tudo o resto e em todos os estados — não interessa se já houve parciais.
      {
        const pip = pipSizeFor(row.symbol)
        const ref = precoDeReferencia(row, pos)
        const lucroPips = ref > 0
          ? (row.direction === 'buy' ? price - ref : ref - price) / pip
          : 0
        const pico = Math.max(row.peak_profit_pips ?? 0, lucroPips)
        if (pico > (row.peak_profit_pips ?? 0)) {
          await admin
            .from('mtmcopy_premium_active')
            .update({ peak_profit_pips: pico, updated_at: new Date().toISOString() })
            .eq('id', row.id)
          row.peak_profit_pips = pico
        }
        if (!row.profit_locked && ref > 0 && pico >= PREMIUM_LOCK_PROFIT_PIPS) {
          try {
            await modifyPositionSlTp(
              accountId, pos.id, beTargetPrice(ref, row.direction, row.symbol),
              undefined, undefined, row.symbol,
            )
            await admin
              .from('mtmcopy_premium_active')
              .update({ profit_locked: true, updated_at: new Date().toISOString() })
              .eq('id', row.id)
            row.profit_locked = true
            actions++
            detail.push(`${row.symbol}: lucro trancado — stop em BE (pico +${pico.toFixed(0)}p)`)
          } catch {
            detail.push(`${row.symbol}: tranca de lucro falhou`)
          }
        }
      }

      // ── TRAILING A PARTIR DO TP1 (ratchet no nosso lado) ───────────────────────────
      // Depois do Exit 1 o stop passa a SEGUIR o preço: em cada passagem sobe para
      // preço − distância (compra) e nunca desce. É isto que transforma o trailing em trailing
      // de LUCRO — num movimento rápido o stop vai atrás do preço e as saídas seguintes ficam
      // protegidas mesmo que o alvo não chegue a ser tocado.
      //
      // Fazemo-lo aqui, e não só pelo trailing da corretora, porque nem todos os brokers o
      // honram e porque o nosso passo é de 1 segundo: seguimos mais de perto do que o servidor
      // deles. O piso é sempre o break-even — o stop nunca volta a ficar abaixo da entrada.
      if ((row.exits_done >= 1 || row.trailing_started) && precoDeReferencia(row, pos) > 0) {
        const pip = pipSizeFor(row.symbol)
        const ref = precoDeReferencia(row, pos)
        const riskPips = row.sl && row.sl > 0
          ? Math.max(1, Math.round(Math.abs(ref - row.sl) / pip))
          : null
        const spec = premiumTrailingAfterTp1Hit(riskPips)
        const trailPips = spec.mode === 'threshold_pips' ? spec.trailPips : 45
        const distancia = trailPips * pip
        const piso = beTargetPrice(ref, row.direction, row.symbol)
        const atual = pos.stopLoss ?? null
        const candidato = row.direction === 'buy' ? price - distancia : price + distancia
        const novo = row.direction === 'buy' ? Math.max(candidato, piso) : Math.min(candidato, piso)
        const melhora = atual == null
          ? true
          : row.direction === 'buy' ? novo > atual + pip * 0.5 : novo < atual - pip * 0.5
        if (melhora) {
          try {
            await modifyPositionSlTp(accountId, pos.id, novo, undefined, undefined, row.symbol)
            actions++
            detail.push(`${row.symbol}: trailing pós-TP1 → stop ${novo.toFixed(2)} (${trailPips}p atrás do preço)`)
          } catch {
            detail.push(`${row.symbol}: trailing pós-TP1 falhou`)
          }
        }
      }

      // ── BE PROTETOR CEDO (price-based) ──────────────────────────────────────────────
      // Assim que a trade está +K×risco em lucro, move o SL para BREAK-EVEN (SL = entrada).
      // K é uma FRACÇÃO do risco (|entrada−SL|), por isso uma entrada FUNDA (risco pequeno,
      // perto do SL) chega a BE MAIS CEDO em pips do que uma entrada na PONTA (risco grande) —
      // que é o pedido do Ricardo. Protege contra reversões que dariam SL numa trade que corria.
      // Não depende de mensagens (evita slippage/atrasos). Marca early_trail_started p/ não repetir.
      if (
        row.exits_done === 0 &&
        !row.trailing_started &&
        !row.early_trail_started &&
        precoDeReferencia(row, pos) > 0 &&
        row.sl && row.sl > 0
      ) {
        const ref = precoDeReferencia(row, pos)
        const riskDist = Math.abs(ref - row.sl)
        const profitDist = row.direction === 'buy' ? price - ref : ref - price
        if (riskDist > 0 && profitDist >= PREMIUM_EARLY_BE_RATIO * riskDist) {
          try {
            await modifyPositionSlTp(accountId, pos.id, beTargetPrice(ref, row.direction, row.symbol), undefined, undefined, row.symbol)
            await admin
              .from('mtmcopy_premium_active')
              .update({ early_trail_started: true, updated_at: new Date().toISOString() })
              .eq('id', row.id)
            actions++
            const pp = pipSizeFor(row.symbol)
            detail.push(
              `${row.symbol}: BE protetor a +${(profitDist / pp).toFixed(0)}p (≥${(PREMIUM_EARLY_BE_RATIO * 100).toFixed(0)}% do risco ${(riskDist / pp).toFixed(0)}p)`,
            )
            continue
          } catch {
            detail.push(`${row.symbol}: BE protetor falhou`)
          }
        }
      }

      // ── Regra ZONA LARGA (SL ~100 pips): arranca trailing a +40.5 pips, ANTES do Exit 1 ──
      // Se a entrada veio da zona mais larga (SL grande) e a trade já tem +40.5 pips de lucro,
      // arma o trailing para proteger o lucro caso o preço reverta sem tocar o TP1. O BE
      // continua a ser colocado no Exit 1 (regras existentes, abaixo).
      if (
        row.exits_done === 0 &&
        !row.trailing_started &&
        !row.early_trail_started &&
        row.entry && row.entry > 0 &&
        row.sl && row.sl > 0
      ) {
        const pipSize = pipSizeFor(row.symbol)
        const riskPips = Math.max(1, Math.round(Math.abs(row.entry - row.sl) / pipSize))
        const isWideZone = riskPips >= PREMIUM_WIDE_ZONE_SL_PIPS - 10 // tolerância: ≥90 conta como ~100
        if (isWideZone) {
          const profitPips = (row.direction === 'buy' ? price - row.entry : row.entry - price) / pipSize
          if (profitPips >= PREMIUM_WIDE_ZONE_TRAIL_ACTIVATION_PIPS) {
            try {
              const trailing = premiumTrailingAfterTp1Hit(riskPips)
              // Mantém o SL original como piso e arma o trailing (aperta à medida que corre).
              await modifyPositionSlTp(accountId, pos.id, row.sl, undefined, trailing, row.symbol)
              await admin
                .from('mtmcopy_premium_active')
                .update({ early_trail_started: true, updated_at: new Date().toISOString() })
                .eq('id', row.id)
              actions++
              detail.push(
                `${row.symbol}: zona larga (${riskPips}p SL) → trailing a +${PREMIUM_WIDE_ZONE_TRAIL_ACTIVATION_PIPS}p (pré-Exit 1)`,
              )
            } catch {
              detail.push(`${row.symbol}: trailing zona larga falhou`)
            }
          }
        }
      }

      // Conta pequena já em trailing: a escada de saídas não se aplica — não há mais nada para
      // partir, e fechar no TP2 seria voltar a cortar o que o trailing está a proteger. Quem
      // decide a saída passa a ser o stop que segue o preço (ou o TP final, como rede).
      if (row.small_account && row.exits_done >= 1) continue

      const nextLevel = row.exits_done + 1
      if (nextLevel > 3) continue
      const tps = [row.tp1, row.tp2, row.tp3]
      const pcts = [row.exit_pct_tp1, row.exit_pct_tp2, row.exit_pct_tp3]
      const tpPrice = tps[nextLevel - 1]
      if (tpPrice == null || tpPrice <= 0) continue

      const hit = row.direction === 'buy' ? price >= tpPrice : price <= tpPrice
      if (!hit) continue

      const currentVol = pos.volume ?? 0
      if (currentVol <= 0) {
        await encerrarRegisto(admin, row, 'closed')
        continue
      }

      // ── CONTA PEQUENA: NÃO FECHA NO EXIT 1 — PASSA A TRAILING ────────────────────
      // Com 0,01 lotes não há parcial possível: a fatia do Exit 1 já é a posição inteira. Fechar
      // tudo ali era desistir no TP1 — foi o que aconteceu o dia todo a 2026-08-25, com trades a
      // morrer em segundos por +10/+30 pips e nenhuma a chegar ao TP2.
      //
      // Quando a conta mestre não consegue partir a posição, quem acompanha a trade é o MOTOR:
      // sobe o stop para break-even e a partir daqui segue o preço a cada passagem (ratchet no
      // bloco de trailing acima). O lucro passa a ser protegido pelo stop em vez de realizado à
      // força, e a trade fica livre para ir ao TP2/TP3.
      if (row.small_account) {
        const ref = precoDeReferencia(row, pos)
        let arrancou = false
        try {
          // O TP final fica como REDE: se o trailing não apanhar um movimento rápido, a posição
          // fecha na mesma no alvo do sinal.
          const tpFinal = (row.tp3 && row.tp3 > 0 ? row.tp3 : null) ?? (row.tp2 && row.tp2 > 0 ? row.tp2 : null) ?? undefined
          await modifyPositionSlTp(
            accountId, pos.id, beTargetPrice(ref, row.direction, row.symbol),
            tpFinal, undefined, row.symbol,
          )
          arrancou = true
          actions++
          detail.push(`${row.symbol}: conta pequena → Exit 1 sem fechar, BE + trailing pelo motor`)
        } catch {
          detail.push(`${row.symbol}: conta pequena → BE do Exit 1 falhou`)
        }
        // Os subscritores COM lote para partir realizam o seu Exit 1 na mesma.
        const pct1 = pcts[0] ?? 33
        const m = shouldMirrorExits(accountId) && await mirrorPremiumExit(row.symbol, row.direction, { kind: 'close_frac', frac: pct1 / 100 })
        if (m && (m.acted || m.skipped)) detail.push(`${row.symbol}: subs Exit 1 → ${m.acted} escalaram, ${m.skipped} seguraram`)
        await admin
          .from('mtmcopy_premium_active')
          .update({
            exits_done: 1,
            trailing_started: arrancou,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
        continue
      }

      const pct = pcts[nextLevel - 1] ?? 0
      const wanted = roundLot(row.original_lot * (pct / 100))
      const closeAll = wanted >= currentVol - 1e-9 || nextLevel === 3
      let ok = false
      if (closeAll) {
        const r = await closePositionById(accountId, pos.id)
        ok = r.success
        if (ok) detail.push(`${row.symbol}: Exit ${nextLevel} → fecha tudo (${currentVol})`)
        // Espelha o fecho total aos subscritores (CopyFactory não replica parciais).
        if (ok) {
          const m = shouldMirrorExits(accountId) && await mirrorPremiumExit(row.symbol, row.direction, { kind: 'close_all' })
          if (m && m.acted) detail.push(`${row.symbol}: Exit ${nextLevel} → ${m.acted} subs fechados`)
        }
      } else {
        const r = await closePositionById(accountId, pos.id, wanted)
        ok = r.success
        if (ok) detail.push(`${row.symbol}: Exit ${nextLevel} → fecha ${pct}% (${wanted})`)
        // Espelha a MESMA fração aos subscritores; cada um escala conforme o seu lote.
        if (ok && currentVol > 0) {
          const m = shouldMirrorExits(accountId) && await mirrorPremiumExit(row.symbol, row.direction, { kind: 'close_frac', frac: wanted / currentVol })
          if (m && (m.acted || m.skipped)) detail.push(`${row.symbol}: Exit ${nextLevel} subs → ${m.acted} escalaram, ${m.skipped} seguraram`)
        }
      }
      if (!ok) {
        detail.push(`${row.symbol}: fecho Exit ${nextLevel} falhou`)
        continue
      }
      actions++
      // A saída fica registada com o seu peso: é o que permite medir a trade pelo que ela deu,
      // e não pelo rótulo do último acontecimento.
      await registarSaida(admin, row, {
        accountId,
        positionId: String(pos.id),
        nivel: nextLevel,
        fraccao: closeAll ? Math.max(0, 1 - (pcts.slice(0, nextLevel - 1).reduce((x, y) => x + y, 0) / 100)) : pct / 100,
        preco: price,
        fechouTudo: closeAll,
      })

      const patch: Record<string, unknown> = { exits_done: nextLevel, updated_at: new Date().toISOString() }
      if (closeAll && nextLevel >= 3) patch.status = 'closed'

      // Exit 1 → break-even + trailing ancorado ao risco (na % que fica a correr)
      if (nextLevel === 1 && !row.trailing_started && row.entry && row.entry > 0 && !closeAll) {
        try {
          const pipSize = pipSizeForSymbol(row.symbol)
          const riskPips =
            row.entry && row.sl && row.sl > 0
              ? Math.max(1, Math.round(Math.abs(row.entry - row.sl) / pipSize))
              : null
          const trailing = premiumTrailingAfterTp1Hit(riskPips)
          // O RUNNER deve ter TP (pedido Ricardo): alvo final do sinal (tp3 → tp2 → tp1) como
          // rede — fecha no alvo mesmo se o trailing não apanhar; o Exit 2 parcial continua antes.
          const runnerTp = (row.tp3 && row.tp3 > 0 ? row.tp3 : null) ?? (row.tp2 && row.tp2 > 0 ? row.tp2 : null) ?? (row.tp1 && row.tp1 > 0 ? row.tp1 : null) ?? undefined
          const beSl = beTargetPrice(row.entry, row.direction, row.symbol) // BE +5 pips a favor (não na entrada seca)
          await modifyPositionSlTp(accountId, pos.id, beSl, runnerTp, trailing, row.symbol)
          patch.trailing_started = true
          detail.push(`${row.symbol}: BE (+${PREMIUM_BE_BUFFER_PIPS}p) + trailing + TP runner (${runnerTp ?? '—'}) após Exit 1`)
          // Espelha BE + trailing aos subscritores (protege o runner deles até Exit 2/3).
          const m = shouldMirrorExits(accountId) && await mirrorPremiumExit(row.symbol, row.direction, { kind: 'be_trailing', beSl, trailing })
          if (m && m.acted) detail.push(`${row.symbol}: BE+trailing em ${m.acted} subs`)
        } catch {
          detail.push(`${row.symbol}: trailing falhou`)
        }
      }

      if (patch.status === 'closed') {
        // Saiu no último alvo: encerra e anuncia, para o cartão sair do Tap to Trade.
        await encerrarRegisto(admin, row, 'target_final', patch)
      } else {
        await admin.from('mtmcopy_premium_active').update(patch).eq('id', row.id)
      }
    }

    // Sombra: com a fotografia em uso, compara-a com o RPC de 30 em 30 s. Depois da gestão, para
    // não atrasar nenhuma decisão; nunca lança nem muda nada.
    if (leitura.snapshot) {
      const simbolos = accRows
        .map((r) => ({ canonico: r.symbol, corretora: acharPosicao(positions, r)?.symbol }))
        .filter((s): s is { canonico: string; corretora: string } => !!s.corretora)
      await sombraSnapshot(accountId, leitura.snapshot, simbolos)
    }
  }

  return { ran: true, checked, actions, detail }
}
