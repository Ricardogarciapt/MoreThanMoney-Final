import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { CONTRATO_VERSAO, almofadaUsd, levantavelUsd, QUOTA_TRADER } from '@/lib/mtmfunded/contrato'
import { equityParaLevantamento } from '@/lib/mtmfunded/numeros-conta'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * LEVANTAMENTOS.
 *
 * Todos os pagamentos são feitos como DEPÓSITO na conta do trader na corretora parceira
 * (PU Prime), em USDC na rede Solana. Por isso o pedido não pergunta um IBAN: pergunta o UID
 * da conta e pede o comprovativo do menu de depósito, com o endereço e o valor à vista. Um
 * endereço de cripto escrito à mão numa caixa de texto é um erro de um caractere à espera de
 * acontecer, e do outro lado não há devolução possível.
 *
 * DUAS PORTAS, ambas fechadas no servidor:
 *  · contrato de trader financiado assinado, na versão em vigor;
 *  · idade confirmada nessa assinatura.
 * Sem as duas, não há pedido. Verificá-las só no ecrã deixava a rota aberta a quem a
 * chamasse à mão — e o que está do outro lado é dinheiro a sair.
 */
async function utilizador(request: NextRequest) {
  const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!auth) return null
  const { data } = await getSupabaseAdmin().auth.getUser(auth)
  return data?.user ?? null
}

export async function GET(request: NextRequest) {
  const user = await utilizador(request)
  if (!user) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()

  const { data: contrato } = await db
    .from('mtm_funded_contracts')
    .select('id, versao, assinado_em, data_nascimento')
    .eq('user_id', user.id)
    .eq('versao', CONTRATO_VERSAO)
    .maybeSingle()

  const { data: contas } = await db
    .from('mtm_trading_accounts')
    .select('id, tipo, mt5_login, saldo_inicial, estado, metricas, motor, sim_saldo')
    .eq('user_id', user.id)
    .in('estado', ['ativa', 'financiada'])

  const { data: pedidos } = await db
    .from('mtm_funded_withdrawals')
    .select('id, account_id, valor_usd, uid_broker, estado, motivo, criado_em, pago_em')
    .eq('user_id', user.id)
    .order('criado_em', { ascending: false })
    .limit(30)

  // O que já saiu conta para o cálculo do que ainda se pode tirar: sem isso, cada
  // levantamento fazia o lucro «reaparecer» inteiro no pedido seguinte.
  const pagoPorConta = new Map<string, number>()
  for (const p of pedidos ?? []) {
    if (p.estado === 'pago' || p.estado === 'aprovado') {
      pagoPorConta.set(
        p.account_id as string,
        (pagoPorConta.get(p.account_id as string) ?? 0) + Number(p.valor_usd),
      )
    }
  }

  return NextResponse.json({
    contrato: contrato ? { versao: contrato.versao, assinadoEm: contrato.assinado_em } : null,
    quotaTrader: QUOTA_TRADER,
    contas: (contas ?? []).map((c) => {
      // A MESMA equity do pedido (POST) e do admin: numa simulada, o saldo exacto (numeros-conta.ts).
      // Antes lia-se `metricas.equity`, que numa conta simulada pode estar velha ou nem existir.
      const equity = equityParaLevantamento(c as never)
      const jaPago = pagoPorConta.get(c.id as string) ?? 0
      return {
        id: c.id,
        login: c.mt5_login,
        tipo: c.tipo,
        saldoInicial: Number(c.saldo_inicial ?? 0),
        equity,
        almofada: almofadaUsd(Number(c.saldo_inicial ?? 0)),
        jaPago,
        levantavel: levantavelUsd(Number(c.saldo_inicial ?? 0), equity, jaPago),
      }
    }),
    pedidos: pedidos ?? [],
  })
}

export async function POST(request: NextRequest) {
  const user = await utilizador(request)
  if (!user) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()

  // ── porta 1: contrato assinado, na versão em vigor ───────────────────────
  const { data: contrato } = await db
    .from('mtm_funded_contracts')
    .select('id, data_nascimento')
    .eq('user_id', user.id)
    .eq('versao', CONTRATO_VERSAO)
    .maybeSingle()

  if (!contrato) {
    return NextResponse.json(
      { error: 'Assina o contrato de trader financiado antes de pedir um levantamento', contrato: true },
      { status: 403 },
    )
  }

  // ── porta 2: idade confirmada na assinatura ──────────────────────────────
  const anos =
    (Date.now() - new Date(contrato.data_nascimento as string).getTime()) /
    (365.25 * 24 * 3600 * 1000)
  if (!(anos >= 18)) {
    return NextResponse.json({ error: 'É preciso ter 18 anos ou mais' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const contaId = String(body?.contaId ?? '').trim()
  const uid = String(body?.uidBroker ?? '').trim()
  const endereco = String(body?.enderecoCripto ?? '').trim()
  const valor = Number(body?.valorUsd)
  const comprovativos: string[] = Array.isArray(body?.comprovativos)
    ? body.comprovativos.filter((u: unknown) => typeof u === 'string').slice(0, 5)
    : []

  if (!contaId) return NextResponse.json({ error: 'Escolhe a conta' }, { status: 400 })
  if (uid.length < 4) {
    return NextResponse.json({ error: 'Indica o UID da tua conta PU Prime' }, { status: 400 })
  }
  if (!comprovativos.length) {
    return NextResponse.json(
      { error: 'Anexa o print do menu de depósito, com o endereço e o valor visíveis' },
      { status: 400 },
    )
  }

  // A conta tem de ser DESTE utilizador, e procura-se por dono no mesmo select — não se
  // procura pelo id e verifica-se depois, que é onde estas coisas costumam correr mal.
  const { data: conta } = await db
    .from('mtm_trading_accounts')
    .select('id, tipo, saldo_inicial, metricas, estado, motor, metaapi_account_id, sim_saldo, sim_equity')
    .eq('id', contaId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  // ── porta 3: só contas FINANCIADAS e activas ──────────────────────────────
  // Um desafio ou um torneio não se levanta — o que se paga é o desempenho da conta Funded.
  if (!['financiada', 'funded'].includes(String(conta.tipo)) || conta.estado !== 'ativa') {
    return NextResponse.json({ error: 'Só se pode levantar de uma conta Funded activa' }, { status: 403 })
  }

  // ── porta 4: SEM posições abertas nem ordens pendentes ─────────────────────
  //
  // O levantável mede-se sobre a equity; com posições abertas a equity mexe a cada tick, e um
  // pedido feito num pico podia pagar lucro que o mercado devolve cinco minutos depois — com a
  // conta já renovada e a perda sem sítio onde cair. Fecha-se tudo, e o valor fica parado.
  if (conta.motor === 'sim') {
    const [{ count: abertas }, { count: pendentes }] = await Promise.all([
      db.from('funded_positions').select('id', { count: 'exact', head: true }).eq('account_id', contaId).eq('estado', 'aberta'),
      db.from('funded_orders').select('id', { count: 'exact', head: true }).eq('account_id', contaId).eq('estado', 'pendente'),
    ])
    if ((abertas ?? 0) > 0 || (pendentes ?? 0) > 0) {
      return NextResponse.json(
        { error: `Fecha as ${abertas ?? 0} posições abertas e cancela as ${pendentes ?? 0} ordens pendentes antes de pedir o levantamento.` },
        { status: 409 },
      )
    }
  } else if (conta.metaapi_account_id) {
    const { readOpenPositions } = await import('@/lib/mtmcopy/metaapi')
    const posicoes = await readOpenPositions(String(conta.metaapi_account_id)).catch(() => null)
    // Sem resposta da MetaApi não se sabe — e na dúvida não se paga: tenta-se de novo daqui a pouco.
    if (posicoes == null) {
      return NextResponse.json({ error: 'Não consegui confirmar as posições da conta agora. Tenta daqui a um minuto.' }, { status: 503 })
    }
    if (posicoes.length > 0) {
      return NextResponse.json(
        { error: `Fecha as ${posicoes.length} posições abertas antes de pedir o levantamento.` },
        { status: 409 },
      )
    }
  }

  // Um pedido em curso de cada vez, por conta. Dois pedidos ao mesmo tempo sobre o mesmo
  // lucro levantavam o dobro do que existe.
  const { data: emCurso } = await db
    .from('mtm_funded_withdrawals')
    .select('id')
    .eq('account_id', contaId)
    .in('estado', ['pedido', 'em_analise', 'aprovado'])
    .maybeSingle()
  if (emCurso) {
    return NextResponse.json(
      { error: 'Já tens um pedido em curso para esta conta' },
      { status: 409 },
    )
  }

  const { data: anteriores } = await db
    .from('mtm_funded_withdrawals')
    .select('valor_usd, estado')
    .eq('account_id', contaId)
    .in('estado', ['pago', 'aprovado'])
  const jaPago = (anteriores ?? []).reduce((t, p) => t + Number(p.valor_usd), 0)

  // Conta simulada: sem posições abertas, o saldo É a equity — e é o valor exacto, não a última
  // leitura das métricas. Mesma função do GET e do admin.
  const equity = equityParaLevantamento(conta as never)
  const disponivel = levantavelUsd(Number(conta.saldo_inicial ?? 0), equity, jaPago)

  if (!(valor > 0)) return NextResponse.json({ error: 'Indica o valor' }, { status: 400 })
  if (valor > disponivel) {
    return NextResponse.json(
      {
        error:
          disponivel <= 0
            ? 'Ainda não há nada levantável: o lucro tem de passar a almofada de 3%.'
            : `O máximo levantável agora é ${disponivel.toFixed(2)} USD.`,
        disponivel,
      },
      { status: 400 },
    )
  }

  const { data: pedido, error } = await db
    .from('mtm_funded_withdrawals')
    .insert({
      user_id: user.id,
      account_id: contaId,
      contract_id: contrato.id,
      valor_usd: valor,
      uid_broker: uid,
      endereco_cripto: endereco || null,
      rede: 'solana',
      moeda: 'usdc',
      comprovativos,
      estado: 'pedido',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: 'Não foi possível registar o pedido' }, { status: 500 })
  return NextResponse.json({ ok: true, pedidoId: pedido.id })
}
