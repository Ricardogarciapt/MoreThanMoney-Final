import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  CHAVE_TOP, KINDS_PV, RAJADA_S, SLUG_EDGE, chaveDoPedido, dataDoPedido, decidirPedidoPv,
  estrategiaDoTraderPv, lerTopTraders, tradersDaEdge, type KindPv,
} from '@/lib/mestres/edge-pv'

/**
 * pv-relay (VPS) → MTM AUTO EDGE. Volta a executar a 26/10 por decisão do dono: a Edge continua
 * INDIVIDUAL (não é Premium) e abre os sinais dos 2 TOP traders do canal PrimeVerse.
 *
 * (Entre 04/10 e 26/10 esta rota devolvia 410: o relay estava parado e só seguia um trader fixo.)
 *
 * O que chega do relay:
 *  · `kind: 'ranking'` — o top dos traders (pips líquidos na janela móvel) → site_settings.pv_top_traders;
 *  · `setup`     — o sinal pendente: regista-se (é a prova de «visto ao vivo» para o ENTRY HIT);
 *  · `entry_hit` — o preço chegou à entrada: se o trader estiver no top, abre na mestre SIM da Edge
 *                  (`encaminharSinalParaMestre`, fonte `edge`) e nas contas que a seguem;
 *  · `cancel` / `close` / `sl_hit` → fecha as posições dessa entrada; `sl_be` → stop para a entrada;
 *    `tp_hit` → nada (as parciais e o BE já estão gravados na posição pela gestão da estratégia).
 *
 * As regras (frescura, duplicados, top) são puras e estão em lib/mestres/edge-pv.ts. Cada pedido fica
 * em `pv_relay_pedidos` com a decisão. Atrasados, repetidos e ignorados respondem `ok` para o relay
 * avançar; só um erro nosso responde `ok: false` (o relay volta a tentar).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const txt = (v: unknown): string | null => (v == null || String(v).trim() === '' ? null : String(v).trim())

function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  return [process.env.RELAY_SECRET, process.env.CRON_SECRET].some((s) => !!s && auth === `Bearer ${s}`)
}

export async function GET() {
  const db = getSupabaseAdmin()
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_TOP).maybeSingle()
  const top = lerTopTraders(data?.value)
  return NextResponse.json({ ok: true, estrategia: SLUG_EDGE, top, segue: tradersDaEdge(top, new Date()) })
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const db = getSupabaseAdmin()
  const agora = new Date()

  // ── ranking dos traders ────────────────────────────────────────────────────────────────────────
  if (b.kind === 'ranking') {
    const top = lerTopTraders({ ...b, em: b.em ?? agora.toISOString() })
    if (!top) return NextResponse.json({ ok: false, error: 'ranking inválido' }, { status: 400 })
    const { error } = await db.from('site_settings').upsert({ key: CHAVE_TOP, value: top }, { onConflict: 'key' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, segue: tradersDaEdge(top, agora) })
  }

  const kind = (KINDS_PV as readonly string[]).includes(String(b.kind ?? 'entry_hit')) ? (String(b.kind ?? 'entry_hit') as KindPv) : null
  if (!kind) return NextResponse.json({ ok: true, decisao: 'ignorar', motivo: `kind ${String(b.kind)} desconhecido` })

  const symbol = String(b.symbol ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const direcao = String(b.direction ?? b.direcao ?? '').toLowerCase() === 'sell' ? 'sell' : 'buy'
  const entrada = num(b.entry ?? b.entrada)
  const sl = num(b.sl)
  const tps = (Array.isArray(b.tps) ? b.tps : []).map(num).filter((x): x is number => x != null && x > 0)
  const trader = txt(b.trader)?.toLowerCase() ?? null
  const setupMsgId = txt(b.setup_msg_id) ?? (kind === 'setup' ? txt(b.msg_id) : null)
  const msgId = txt(b.msg_id)
  const level = num(b.level)
  const dataMensagem = dataDoPedido(b)
  const chave = chaveDoPedido({ kind, setupMsgId, symbol, direcao, entrada, sl, level })
  if (!symbol) return NextResponse.json({ ok: true, decisao: 'ignorar', motivo: 'sem símbolo' })

  try {
    // ── o que se sabe antes de decidir ──────────────────────────────────────────────────────────
    const desde = new Date(agora.getTime() - RAJADA_S * 1000).toISOString()
    const [{ data: topLinha }, { count: recentes }, repetidoMsg, repetidoChave, setupVisto, entradaFeita] = await Promise.all([
      db.from('site_settings').select('value').eq('key', CHAVE_TOP).maybeSingle(),
      db.from('pv_relay_pedidos').select('id', { count: 'exact', head: true }).gte('recebido_em', desde),
      msgId ? db.from('pv_relay_pedidos').select('id').eq('msg_id', msgId).maybeSingle() : Promise.resolve({ data: null }),
      chave ? db.from('pv_relay_pedidos').select('id').eq('chave', chave).maybeSingle() : Promise.resolve({ data: null }),
      kind === 'entry_hit' && setupMsgId
        ? db.from('pv_relay_pedidos').select('id').eq('kind', 'setup').eq('msg_id', setupMsgId).eq('rajada', false)
          .gte('recebido_em', new Date(agora.getTime() - 48 * 3600_000).toISOString()).maybeSingle()
        : Promise.resolve({ data: null }),
      kind !== 'setup' && kind !== 'entry_hit' && setupMsgId
        ? db.from('pv_relay_pedidos').select('id').eq('chave', `entry:${setupMsgId}`).eq('decisao', 'executado').maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    const top = lerTopTraders(topLinha?.value)
    const rajada = (recentes ?? 0) > 0
    // Setup/ENTRY HIT: a Edge só se o trader estiver no top. Seguimento: só se a entrada abriu.
    const estrategia = kind === 'setup' || kind === 'entry_hit' ? estrategiaDoTraderPv(trader, top, agora) : entradaFeita.data ? SLUG_EDGE : null

    let preco: { valor: number; idadeS: number } | null = null
    if (kind === 'entry_hit' && !dataMensagem && estrategia) {
      const ex = await import('@/lib/mtmfunded/simulado/execucao')
      const { candidatosDeTicker } = await import('@/lib/mtmfunded/simulado/ordens')
      const cand = candidatosDeTicker(symbol)
      const { precos, em } = await ex.carregarPrecos(cand, cand)
      const s = cand.find((c) => precos[c])
      if (s) preco = { valor: (precos[s].bid + precos[s].ask) / 2, idadeS: (agora.getTime() - Date.parse(em[s])) / 1000 }
    }

    const decisao = decidirPedidoPv({
      kind, estrategia, viva: estrategia === SLUG_EDGE, agora, dataMensagem,
      repetido: !!(repetidoMsg.data || repetidoChave.data), rajada,
      setupVistoAoVivo: !!setupVisto.data, entrada, sl, preco,
    })

    // ── o registo ANTES de agir (a chave única trava a corrida de dois pedidos iguais) ─────────
    const { data: linha, error: eIns } = await db.from('pv_relay_pedidos').insert({
      kind, trader, estrategia, symbol, direcao, entrada, sl, tps, setup_msg_id: setupMsgId,
      msg_id: decisao.accao === 'repetido' ? null : msgId, msg_date: dataMensagem?.toISOString() ?? null,
      chave: decisao.accao === 'repetido' || decisao.accao === 'atrasado' || decisao.accao === 'ignorar' ? null : chave,
      rajada, decisao: decisao.accao, detalhe: { motivo: decisao.motivo, top: tradersDaEdge(top, agora) },
    }).select('id').single()
    if (eIns) {
      if (eIns.code === '23505') return NextResponse.json({ ok: true, decisao: 'repetido', motivo: 'corrida — já tratado' })
      throw new Error(eIns.message)
    }
    const marcar = (d: string, detalhe: Record<string, unknown>) =>
      db.from('pv_relay_pedidos').update({ decisao: d, detalhe: { motivo: decisao.motivo, top: tradersDaEdge(top, agora), ...detalhe } }).eq('id', linha.id)

    // ── agir ─────────────────────────────────────────────────────────────────────────────────────
    if (decisao.accao === 'executar') {
      const { encaminharSinalParaMestre } = await import('@/lib/mestres/servidor/sinal-mestre')
      const r = await encaminharSinalParaMestre({ fonte: 'edge', symbol, direcao, entrada, sl, tps, externalRef: setupMsgId ?? msgId ?? '' })
      const abriu = r.modo === 'live' && !r.motivo
      await marcar(abriu ? 'executado' : r.modo === 'sombra' ? 'sombra' : 'nao_executado', {
        modo: r.modo, motivoMestre: r.motivo ?? null,
        contas: (r.contas ?? []).map((c) => ({ conta: c.accountId, estado: c.estado, motivo: c.motivo ?? null })),
      })
      return NextResponse.json({ ok: true, decisao: abriu ? 'executado' : 'nao_executado', modo: r.modo, motivo: r.motivo ?? null, contas: r.contas?.length ?? 0 })
    }

    if (decisao.accao === 'seguir' && setupMsgId) {
      const accao = kind === 'sl_be' ? 'break_even' : kind === 'cancel' ? 'cancelar' : kind === 'close' || kind === 'sl_hit' ? 'fechar' : null
      if (!accao) {
        await marcar('sem_accao', {})
        return NextResponse.json({ ok: true, decisao: 'sem_accao', motivo: `${kind}: a gestão da estratégia já trata disto` })
      }
      if (accao !== 'break_even') {
        const { data: prov } = await db.from('mestres_estrategias').select('provider_id').eq('slug', SLUG_EDGE).maybeSingle()
        const { data: p } = prov ? await db.from('mtmauto_providers').select('*').eq('id', prov.provider_id).maybeSingle() : { data: null }
        const { configDoProvider } = await import('@/lib/mtmfunded/estrategias-sinais/calculo')
        if (p && !configDoProvider(p as Record<string, unknown>).seguirFechosDaFonte && kind !== 'cancel') {
          await marcar('sem_accao', { porque: 'seguirFechosDaFonte=false' })
          return NextResponse.json({ ok: true, decisao: 'sem_accao', motivo: 'a Edge não segue os fechos da fonte' })
        }
      }
      const { chaveDoSinal } = await import('@/lib/mtmfunded/estrategias-sinais/calculo')
      const chaveSinal = chaveDoSinal({ fonte: SLUG_EDGE, msgId: `tg:${setupMsgId}`, symbol, direcao, entrada, sl })
      const { data: pontes } = await db.from('funded_sinal_posicoes').select('id, account_id, funded_position_id, estado')
        .eq('estrategia', SLUG_EDGE).eq('chave', chaveSinal).in('estado', ['a_abrir', 'aberta']).limit(2000)
      const { aplicarNasPontes } = await import('@/lib/mtmfunded/estrategias-sinais/abrir')
      const r = pontes?.length ? await aplicarNasPontes(pontes as Parameters<typeof aplicarNasPontes>[0], accao) : { fechadas: 0, be: 0, erros: [] as string[] }
      await marcar('seguido', { accao, pontes: pontes?.length ?? 0, ...r })
      return NextResponse.json({ ok: true, decisao: 'seguido', accao, pontes: pontes?.length ?? 0, ...r })
    }

    return NextResponse.json({ ok: true, decisao: decisao.accao, motivo: decisao.motivo })
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    console.error('[primeverse-exec]', erro)
    return NextResponse.json({ ok: false, error: erro }, { status: 500 })
  }
}
