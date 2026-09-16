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
import { mirrorPremiumExit } from './premium-subscriber-exits'
import { CANONICAL_PREMIUM_ACCOUNT_ID } from './provider-constants'
import { contasDoMotorTempoReal, ehContaDeMotorViva, carregarContasDeEstrategia } from './contas-provider-estrategia'
import { pipSizeForSymbol } from './trade-outcome'
import { adotarManuais } from './adotar-manuais'
import { lerPosicoesMotor, precoMotor, sombraSnapshot } from './metaapi-snapshot'
import { podeSaltarLeitura } from './market-hours'
import type { MetaApiSnapshot } from './metaapi-snapshot-regras'
import {
  acharPosicao,
  configPremiumDoAmbiente,
  gerirLinhaPremium,
  type LinhaPremium,
  type OperacoesPremium,
} from '@/lib/gestao-real/premium'
import { contaGeridaPeloMotorReal } from '@/lib/gestao-real/contas-live'

/** Linha de `mtmcopy_premium_active` — o tipo vive com as regras (lib/gestao-real/premium.ts). */
type ActiveRow = LinhaPremium

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
export async function registarSaida(
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

export async function encerrarRegisto(
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

/** Canal do chat onde vivem os sinais do Premium. */
const PREMIUM_CHAT_SLUG = 'premium-ideas'

/**
 * As regras (BE protetor cedo, tranca de lucro, buffer do BE, casamento de posições, referência pelo
 * preenchimento) vivem em `lib/gestao-real/premium.ts` — a mesma fonte que o motor em tempo real
 * do VPS usa. Env: PREMIUM_EARLY_BE_RATIO (0.4), PREMIUM_LOCK_PROFIT_PIPS (12), PREMIUM_BE_BUFFER_PIPS (5).
 */
const CFG_PREMIUM = configPremiumDoAmbiente()

/**
 * O espelhamento de saídas para os subscritores SÓ faz sentido a partir da conta MESTRE.
 * No modo SEMI-AUTOMÁTICO (premium_master_exec=off) cada subscritor tem a SUA linha em
 * mtmcopy_premium_active e é gerido individualmente — espelhar aí fecharia as posições dos OUTROS
 * subscritores em cadeia (dinheiro real). Por isso: espelha só se a linha for do mestre.
 */
function shouldMirrorExits(accountId: string): boolean {
  return accountId === CANONICAL_PREMIUM_ACCOUNT_ID
}

/** As operações reais do monitor — exactamente as chamadas de sempre (RPC MetaApi + Supabase). */
function operacoesDoMonitor(
  admin: ReturnType<typeof getSupabaseAdmin>,
  row: ActiveRow,
  accountId: string,
  pos: MetaApiPosition,
  snapshot: MetaApiSnapshot | null,
): OperacoesPremium {
  return {
    modificar: (sl, tp, trailing) => modifyPositionSlTp(accountId, pos.id, sl, tp, trailing, row.symbol),
    fechar: (volume) => closePositionById(accountId, pos.id, volume),
    espelhar: (acao) => mirrorPremiumExit(row.symbol, row.direction, acao),
    gravar: async (patch) => {
      await admin
        .from('mtmcopy_premium_active')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', row.id)
    },
    encerrar: (evento, patch) => encerrarRegisto(admin, row, evento, patch ?? {}),
    registarSaida: (args) => registarSaida(admin, row, { accountId, ...args }),
    precoVivo: () => precoMotor(accountId, row.symbol, pos.symbol, snapshot),
  }
}


export async function runPremiumPriceMonitor(): Promise<{
  ran: boolean
  checked: number
  actions: number
  detail: string[]
}> {
  const sw = await getExecSwitches()
  if (!sw.premium_price_monitor) return { ran: false, checked: 0, actions: 0, detail: ['monitor desligado'] }
  // As contas mestre vivas vêm da base (contas provider MT5 do VPS) — sem isto o motor só
  // conhecia os ids escritos à mão e as estratégias novas ficavam sem parciais/BE/trailing.
  await carregarContasDeEstrategia().catch(() => undefined)
  if (!contasDoMotorTempoReal().length) {
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
    .neq('mt5_status', 'disconnected')
    .not('metaapi_account_id', 'is', null)
  const precisamDoMotor = new Set((diretas ?? []).map((c) => String(c.metaapi_account_id)))

  const saltadas: string[] = []
  for (const accountId of [...byAccount.keys()]) {
    if (ehContaDeMotorViva(accountId) || precisamDoMotor.has(accountId)) continue
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
    /** Esta conta está em live no motor em tempo real do VPS (e o motor está vivo)? */
    const motorRealGere = await contaGeridaPeloMotorReal(accountId, 'premium')
    if (motorRealGere) detail.push(`conta ${accountId.slice(0, 8)}: gestão por preço no motor em tempo real — aqui só contabilidade`)
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

      // CONTA GERIDA PELO MOTOR EM TEMPO REAL (VPS, live para esta conta): aqui só se faz a
      // contabilidade — a posição desapareceu → encerra (acima). As decisões por preço (BE,
      // trailing, parciais) são dele. Com o motor calado (batimento velho) o guarda devolve false
      // e o monitor volta a gerir sozinho.
      if (motorRealGere) continue

      const n = await gerirLinhaPremium(row, pos, {
        ...CFG_PREMIUM,
        trailingTempoReal: sw.trailing_tempo_real,
        espelhar: shouldMirrorExits(accountId),
      }, operacoesDoMonitor(admin, row, accountId, pos, leitura.snapshot), detail)
      actions += n
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
