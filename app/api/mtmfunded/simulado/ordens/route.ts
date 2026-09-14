import { NextRequest, NextResponse } from 'next/server'
import {
  ErroOrdem, autorizarConta, exigirNegociavel, estadoCompleto, abrirPosicao, fecharPosicao,
  modificarPosicao, criarPendente, modificarPendente, cancelarPendente, lerConta, num,
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
 * GET ?accountId= → posições abertas, últimas 100 fechadas, pendentes, estado, limites, etiquetas.
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
    return NextResponse.json(await estadoCompleto(conta, modo), { headers: { 'Cache-Control': 'no-store' } })
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
    if (accao === 'abrir' || accao === 'pendente') accountId = String(b.accountId ?? '')
    else if (accao === 'fechar' || accao === 'modificar') accountId = await contaDe('funded_positions', b.positionId)
    else if (accao === 'cancelar' || accao === 'modificar_pendente') accountId = await contaDe('funded_orders', b.orderId)
    else throw new ErroOrdem(400, 'acção desconhecida')

    const { conta, modo } = await autorizarConta(request, accountId)
    exigirNegociavel(conta, modo)

    let resultado: unknown
    switch (accao) {
      case 'abrir':
        resultado = await abrirPosicao(conta, {
          symbol: b.symbol, direcao: b.direcao, volume: Number(b.volume), sl: num(b.sl), tp: num(b.tp),
          origem: b.origem, ideiaRef: b.ideiaRef,
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
        })
        break
      case 'modificar_pendente':
        resultado = await modificarPendente(conta, b.orderId, b.preco, b.sl, b.tp)
        break
      case 'cancelar':
        resultado = await cancelarPendente(conta, b.orderId)
        break
    }
    // O saldo mudou (comissão ou fecho): devolve-se já a conta relida para o ecrã não esperar pelo poll.
    const relida = await lerConta(conta.id)
    return NextResponse.json({ ok: true, accao, ...(resultado as object), saldo: relida?.sim_saldo ?? null })
  } catch (e) {
    return falhou(e)
  }
}
