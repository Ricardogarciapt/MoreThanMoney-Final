/**
 * O LIVRO DE COMISSÕES da equipa: ver, aprovar, pagar, cancelar.
 *
 * NUNCA SE PAGA SOZINHO. Esta rota calcula e propõe; passar uma comissão a 'paga' exige
 * `confirmar: true` e uma referência do pagamento, e grava quem o fez e quando
 * (`vendas_comissoes_historico`). Não há aqui nenhum caminho automático — nem «aprovar e pagar de
 * seguida», que é como o MLM antigo dispara transferências Stripe no mesmo pedido em que aprova
 * (`app/api/admin/mlm/commissions/route.ts`).
 *
 * E o que foi devolvido DESCONTA: quem tem uma comissão paga e depois estornada aparece com uma
 * dívida, e o total a pagar da próxima vez já vem líquido. Um livro que só soma acaba a pagar
 * sobre dinheiro que voltou para o cliente.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { centimosEmEuros } from '@/lib/vendas/calculo'

const supabase = getSupabaseAdmin()

const SELECT = `
  id, venda_id, negocio_id, beneficiario_id, papel, regra_id, pct, pct_base,
  rank_min_vendas, vendas_no_mes, numero_pagamento, base_cents, valor_cents, moeda,
  estado, aprovada_em, aprovada_por, paga_em, paga_por, pagamento_ref,
  estornada_em, estorno_motivo, nota, criado_em,
  venda:vendas_vendas!vendas_comissoes_venda_id_fkey(referencia, fonte, pack, tipo, pago_em, estornada_em)
`

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const estado = searchParams.get('estado') ?? 'todas'
  const pessoa = searchParams.get('pessoa')
  const desde = searchParams.get('desde')

  let query = supabase.from('vendas_comissoes').select(SELECT).order('criado_em', { ascending: false }).limit(1000)
  if (estado !== 'todas') query = query.eq('estado', estado)
  if (pessoa) query = query.eq('beneficiario_id', pessoa)
  if (desde) query = query.gte('criado_em', desde)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const comissoes = (data ?? []) as unknown as Array<Record<string, unknown>>

  // Os totais que o dono precisa de ver antes de pagar: o que está por aprovar, o que está
  // aprovado à espera de pagamento, e o que já foi pago mas foi devolvido (a descontar).
  const totais = { pendente: 0, aprovada: 0, paga: 0, estornada: 0, aDescontar: 0 }
  for (const c of comissoes) {
    const valor = Number(c.valor_cents) || 0
    const estadoLinha = String(c.estado)
    if (estadoLinha in totais) (totais as Record<string, number>)[estadoLinha] += valor
    if (c.estornada_em && c.paga_em) totais.aDescontar += valor
  }

  return NextResponse.json({
    comissoes,
    totais,
    totaisLegiveis: Object.fromEntries(Object.entries(totais).map(([k, v]) => [k, centimosEmEuros(v)])),
  })
}

type Accao = 'aprovar' | 'pagar' | 'cancelar'

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const accao = String(body.accao || '') as Accao
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : []

  if (!['aprovar', 'pagar', 'cancelar'].includes(accao)) {
    return NextResponse.json({ error: `Acção desconhecida: ${accao}` }, { status: 400 })
  }
  if (ids.length === 0) return NextResponse.json({ error: 'Falta a lista de comissões' }, { status: 400 })

  const { data: actuais, error: erroLeitura } = await supabase
    .from('vendas_comissoes')
    .select('id, estado, valor_cents, beneficiario_id, estornada_em')
    .in('id', ids)
  if (erroLeitura) return NextResponse.json({ error: erroLeitura.message }, { status: 500 })

  const agora = new Date().toISOString()
  const feitas: string[] = []
  const recusadas: Array<{ id: string; motivo: string }> = []

  for (const c of actuais ?? []) {
    const estado = String(c.estado)

    if (accao === 'aprovar') {
      if (estado !== 'pendente') {
        recusadas.push({ id: String(c.id), motivo: `Só se aprova o que está pendente (está ${estado}).` })
        continue
      }
      if (c.estornada_em) {
        recusadas.push({ id: String(c.id), motivo: 'Foi estornada — o dinheiro desta venda voltou para o cliente.' })
        continue
      }
      await supabase
        .from('vendas_comissoes')
        .update({ estado: 'aprovada', aprovada_em: agora, aprovada_por: auth.userId ?? null })
        .eq('id', c.id)
      await supabase.from('vendas_comissoes_historico').insert({
        comissao_id: c.id,
        de: estado,
        para: 'aprovada',
        por: auth.userId ?? null,
        nota: body.nota ?? null,
      })
      feitas.push(String(c.id))
      continue
    }

    if (accao === 'pagar') {
      // A CONFIRMAÇÃO HUMANA. Sem ela não se paga — e a mensagem diz o total, para ninguém
      // confirmar às cegas.
      if (body.confirmar !== true) {
        const total = (actuais ?? []).reduce((t, x) => t + (Number(x.valor_cents) || 0), 0)
        return NextResponse.json(
          {
            error: 'Pagar exige confirmação explícita.',
            aConfirmar: {
              comissoes: ids.length,
              total: centimosEmEuros(total),
              como: 'Repete o pedido com { "confirmar": true, "pagamento_ref": "…" }.',
            },
          },
          { status: 409 },
        )
      }
      if (estado !== 'aprovada') {
        recusadas.push({ id: String(c.id), motivo: `Só se paga o que está aprovado (está ${estado}).` })
        continue
      }
      const referencia = String(body.pagamento_ref || '').trim()
      if (!referencia) {
        return NextResponse.json(
          { error: 'Falta a referência do pagamento (transferência, MB Way, nota de crédito). É o recibo do acto humano.' },
          { status: 400 },
        )
      }
      await supabase
        .from('vendas_comissoes')
        .update({ estado: 'paga', paga_em: agora, paga_por: auth.userId ?? null, pagamento_ref: referencia })
        .eq('id', c.id)
      await supabase.from('vendas_comissoes_historico').insert({
        comissao_id: c.id,
        de: estado,
        para: 'paga',
        por: auth.userId ?? null,
        nota: `Pago com referência ${referencia}.${body.nota ? ` ${body.nota}` : ''}`,
      })
      feitas.push(String(c.id))
      continue
    }

    // cancelar
    if (estado === 'paga') {
      recusadas.push({
        id: String(c.id),
        motivo: 'Já foi paga: cancelar não devolve dinheiro. Se a venda foi devolvida, estorna-se a VENDA.',
      })
      continue
    }
    await supabase.from('vendas_comissoes').update({ estado: 'cancelada' }).eq('id', c.id)
    await supabase.from('vendas_comissoes_historico').insert({
      comissao_id: c.id,
      de: estado,
      para: 'cancelada',
      por: auth.userId ?? null,
      nota: body.nota ?? null,
    })
    feitas.push(String(c.id))
  }

  return NextResponse.json({ accao, feitas: feitas.length, recusadas })
}
