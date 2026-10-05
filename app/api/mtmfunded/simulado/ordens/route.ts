import { NextRequest, NextResponse } from 'next/server'
import {
  ErroOrdem, autorizarConta, exigirNegociavel, estadoCompleto, abrirPosicao, fecharPosicao,
  modificarPosicao, criarPendente, modificarPendente, cancelarPendente, lerConta, num,
  criarOco, modificarGestao, fecharLote, cancelarTodas, inverterPosicao, type Conta,
} from '@/lib/mtmfunded/simulado/execucao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * AS ORDENS DO WEBTRADER — contas simuladas (motor `sim`).
 *
 * POST { accao, ... }
 *   · abrir     { accountId, symbol, direcao, volume, sl?, tp?, origem?, ideiaRef? }
 *   · fechar    { positionId, volume? }            (sem volume = total)
 *   · modificar { positionId, sl, tp }             (null limpa)
 *   · pendente  { accountId, symbol, direcao, tipo: limit|stop, volume, preco, sl?, tp?, expiraEm? }
 *   · modificar_pendente { orderId, preco?, sl, tp }
 *   · cancelar  { orderId }
 * Ordens avançadas (072) — `gestao` = { trailing_distancia, trailing_ativacao, be_gatilho, be_offset,
 * be_no_tp1, tps: [{preco, pct}] }, distâncias em PREÇO:
 *   · abrir / pendente aceitam `gestao` (bracket = entrada + sl + tp + tps numa ordem)
 *   · oco       { accountId, pernas: [pendente, pendente] }
 *   · gestao    { positionId, gestao }             (muda trailing/BE/TPs de uma posição aberta)
 *   · fechar_lote { accountId, filtro: todas|simbolo|ganhadoras|perdedoras|compras|vendas, symbol? }
 *   · cancelar_todas { accountId, symbol? }
 *   · inverter  { positionId }                     (fecha e abre o lado contrário, mesmo volume)
 * GET ?accountId= → posições abertas, últimas 100 fechadas, pendentes, estado, limites, etiquetas.
 *   &leve=1 → o mesmo sem as fechadas nem o desempenho (`parcial: true`) — a releitura de 4 em 4 s.
 * Cada POST responde com `estado` (a resposta leve do GET, já depois da acção) — o ecrã aplica-a.
 *
 * O site executa a MERCADO contra a última linha de `funded_precos` (≤5 s); o resto — pendentes,
 * SL/TP, stop-out — é do motor no VPS. Toda a decisão vem de lib/mtmfunded/simulado/ordens.
 *
 * Acesso: dono da conta (sessão MTM) → master; ou `x-conta-sessao` (login+password) → o modo dela.
 * Investor nunca escreve.
 */

function falhou(e: unknown) {
  if (e instanceof ErroOrdem) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error('[funded/ordens]', e)
  return NextResponse.json({ error: 'erro interno' }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
    const { conta, modo } = await autorizarConta(request, accountId)
    // ?leve=1 — a releitura periódica do ecrã: sem histórico nem desempenho (ver estadoCompleto).
    const leve = request.nextUrl.searchParams.get('leve') === '1'
    return NextResponse.json(await estadoCompleto(conta, modo, { leve }), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return falhou(e)
  }
}

/** A conta de uma posição/ordem — para as acções que só trazem o id dela. */
async function contaDe(tabela: 'funded_positions' | 'funded_orders', id: unknown): Promise<string> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new ErroOrdem(400, 'id inválido')
  const { data } = await getSupabaseAdmin().from(tabela).select('account_id').eq('id', id).maybeSingle()
  if (!data) throw new ErroOrdem(404, tabela === 'funded_positions' ? 'posição não encontrada' : 'ordem não encontrada')
  return String(data.account_id)
}

export async function POST(request: NextRequest) {
  try {
    const b = await request.json().catch(() => ({})) as Record<string, any>
    const accao = String(b.accao ?? '')

    let accountId: string
    if (['abrir', 'pendente', 'oco', 'fechar_lote', 'cancelar_todas'].includes(accao)) accountId = String(b.accountId ?? '')
    else if (['fechar', 'modificar', 'gestao', 'inverter'].includes(accao)) accountId = await contaDe('funded_positions', b.positionId)
    else if (accao === 'cancelar' || accao === 'modificar_pendente') accountId = await contaDe('funded_orders', b.orderId)
    else throw new ErroOrdem(400, 'acção desconhecida')

    const { conta, modo } = await autorizarConta(request, accountId)
    exigirNegociavel(conta, modo)

    let resultado: unknown
    switch (accao) {
      case 'abrir':
        resultado = await abrirPosicao(conta, {
          symbol: b.symbol, direcao: b.direcao, volume: Number(b.volume), sl: num(b.sl), tp: num(b.tp),
          origem: b.origem, ideiaRef: b.ideiaRef, gestao: b.gestao ?? null,
        })
        break
      case 'fechar':
        resultado = await fecharPosicao(conta, b.positionId, b.volume == null || b.volume === '' ? null : Number(b.volume))
        break
      case 'modificar':
        resultado = await modificarPosicao(conta, b.positionId, b.sl, b.tp)
        break
      case 'pendente':
        resultado = await criarPendente(conta, {
          symbol: b.symbol, direcao: b.direcao, tipo: b.tipo, volume: Number(b.volume), preco: Number(b.preco),
          sl: num(b.sl), tp: num(b.tp), expiraEm: b.expiraEm ?? null, origem: b.origem, ideiaRef: b.ideiaRef,
          gestao: b.gestao ?? null,
        })
        break
      case 'oco':
        resultado = await criarOco(conta, (Array.isArray(b.pernas) ? b.pernas : []).map((x: Record<string, any>) => ({
          symbol: x.symbol, direcao: x.direcao, tipo: x.tipo, volume: Number(x.volume), preco: Number(x.preco),
          sl: num(x.sl), tp: num(x.tp), expiraEm: x.expiraEm ?? null, origem: x.origem, gestao: x.gestao ?? null,
        })))
        break
      case 'gestao':
        resultado = await modificarGestao(conta, b.positionId, b.gestao ?? null)
        break
      case 'fechar_lote':
        resultado = await fecharLote(conta, b.filtro, b.symbol ?? null)
        break
      case 'cancelar_todas':
        resultado = await cancelarTodas(conta, b.symbol ?? null)
        break
      case 'inverter':
        resultado = await inverterPosicao(conta, b.positionId)
        break
      case 'modificar_pendente':
        resultado = await modificarPendente(conta, b.orderId, b.preco, b.sl, b.tp)
        break
      case 'cancelar':
        resultado = await cancelarPendente(conta, b.orderId)
        break
    }
    /**
     * A RESPOSTA TRAZ O ESTADO (leve) — o ecrã aplica-o e não faz o GET inteiro a seguir.
     *
     * Antes: a rota relia a conta (5.ª leitura da mesma linha) só para devolver o saldo, e o cliente
     * fazia logo um GET cheio (mais ~11 consultas, mais uma chamada ao Auth). Agora a linha passa de
     * mão em mão: `abrir` devolve-a como ficou (saldo da função atómica, dia negociado da guarda
     * otimista); as acções que mexem no saldo por função da base sem o devolver (fechos) relêem UMA
     * vez; as restantes não mudam a linha. O histórico e o desempenho não vêm (o cliente mantém os
     * que tinha, e nos fechos pede-os ele — ver funded-trader.tsx).
     */
    const r = (resultado ?? {}) as Record<string, unknown> & { contaDepois?: Conta; regrasLidas?: Record<string, unknown> | null }
    const { contaDepois, regrasLidas, ...resto } = r
    const linha = contaDepois ?? (MUDA_SALDO_NA_BASE.has(accao) ? (await lerConta(conta.id)) ?? conta : conta)
    const estado = await estadoCompleto(linha, modo, { leve: true, regras: regrasLidas })
    return NextResponse.json({ ok: true, accao, ...resto, saldo: estado.estado.saldo, estado })
  } catch (e) {
    return falhou(e)
  }
}

/** Acções em que o saldo muda dentro de uma função da base que não o devolve (funded_fechar_*). */
const MUDA_SALDO_NA_BASE = new Set(['fechar', 'fechar_lote', 'inverter'])
