/**
 * AS VENDAS CONFIRMADAS: ver, lançar à mão, e estornar.
 *
 * Lançar à mão existe porque há dinheiro que não passa pelo Stripe (transferência, MB Way,
 * dinheiro vivo num evento). O que NÃO existe é lançar uma venda sem prova: a referência é
 * obrigatória e única, e sem nota o pedido é recusado — um lançamento manual sem rasto é uma
 * comissão que ninguém consegue explicar seis meses depois.
 *
 * O estorno manual é o mesmo caminho do reembolso do Stripe (`lib/vendas/livro.ts`): reverte as
 * comissões desta venda e, se cair nos primeiros 30 dias do cliente, arrasta as anteriores.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { centimosEmEuros } from '@/lib/vendas/calculo'
import { estornarVenda, registarVendaConfirmada } from '@/lib/vendas/livro'

const supabase = getSupabaseAdmin()

const SELECT =
  'id, fonte, referencia, comprador_id, negocio_id, pack, valor_cents, moeda, tipo, pago_em, estornada_em, estorno_motivo, estorno_cents, nota, criado_em'

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const desde = searchParams.get('desde')
  const pack = searchParams.get('pack')
  const semRegra = searchParams.get('sem_comissao') === '1'

  let query = supabase.from('vendas_vendas').select(SELECT).order('pago_em', { ascending: false }).limit(1000)
  if (desde) query = query.gte('pago_em', desde)
  if (pack) query = query.eq('pack', pack)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let vendas = (data ?? []) as unknown as Array<Record<string, unknown>>

  // AS VENDAS QUE NÃO PAGARAM NADA a ninguém apesar de terem equipa: é a lista de decisões que
  // faltam ao dono (packs sem percentagem definida). Tem de ser fácil de ver, senão a dívida
  // acumula em silêncio.
  if (semRegra && vendas.length) {
    const ids = vendas.map((v) => String(v.id))
    const { data: comissoes } = await supabase.from('vendas_comissoes').select('venda_id').in('venda_id', ids)
    const comComissao = new Set((comissoes ?? []).map((c) => String(c.venda_id)))
    vendas = vendas.filter((v) => !!v.negocio_id && !comComissao.has(String(v.id)))
  }

  const total = vendas.filter((v) => !v.estornada_em).reduce((t, v) => t + (Number(v.valor_cents) || 0), 0)
  return NextResponse.json({ vendas, total, totalLegivel: centimosEmEuros(total) })
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const accao = String(body.accao || 'lancar')

  try {
    if (accao === 'lancar') {
      const referencia = String(body.referencia || '').trim()
      const nota = String(body.nota || '').trim()
      const valorCents = Math.round(Number(body.valor_cents))

      if (!referencia) return NextResponse.json({ error: 'Falta a referência do pagamento.' }, { status: 400 })
      if (!nota) {
        return NextResponse.json(
          { error: 'Um lançamento manual precisa de nota: quem pagou, como, e onde está a prova.' },
          { status: 400 },
        )
      }
      if (!Number.isFinite(valorCents) || valorCents <= 0) {
        return NextResponse.json({ error: 'O valor tem de vir em cêntimos e ser maior que zero.' }, { status: 400 })
      }

      const registo = await registarVendaConfirmada(supabase, {
        fonte: 'manual',
        referencia,
        compradorId: body.comprador_id ?? null,
        negocioId: body.negocio_id ?? null,
        pack: body.pack ?? null,
        valorCents,
        moeda: body.moeda ?? 'EUR',
        tipo: body.tipo === 'renovacao' ? 'renovacao' : 'primeira',
        pagoEm: body.pago_em ?? undefined,
        nota: `${nota} (lançado por ${auth.email ?? auth.userId ?? 'admin'})`,
      })

      return NextResponse.json({
        ...registo,
        totalLegivel: centimosEmEuros(registo.totalCents),
        // O que ficou por pagar sai à vista: é uma decisão que falta, não um erro a esconder.
        faltaDecidir: registo.resultado?.semRegra ?? [],
        avisos: registo.resultado?.avisos ?? (registo.aviso ? [registo.aviso] : []),
      })
    }

    if (accao === 'estornar') {
      const referencia = String(body.referencia || '').trim()
      const motivo = String(body.motivo || '').trim()
      if (!referencia) return NextResponse.json({ error: 'Falta a referência da venda a estornar.' }, { status: 400 })
      if (!motivo) return NextResponse.json({ error: 'Um estorno sem motivo não se consegue explicar a quem perde a comissão.' }, { status: 400 })

      const resultado = await estornarVenda(supabase, {
        fonte: body.fonte === 'stripe' ? 'stripe' : body.fonte === 'apple' ? 'apple' : 'manual',
        referencias: [referencia],
        motivo: `${motivo} (por ${auth.email ?? auth.userId ?? 'admin'})`,
        cents: body.cents ? Math.round(Number(body.cents)) : null,
      })

      return NextResponse.json({
        ...resultado,
        aviso:
          resultado.comissoesPagasMarcadas > 0
            ? `${resultado.comissoesPagasMarcadas} comissão(ões) já tinham sido pagas: ficam marcadas e descontam no próximo pagamento.`
            : undefined,
      })
    }

    return NextResponse.json({ error: `Acção desconhecida: ${accao}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao processar' }, { status: 500 })
  }
}
