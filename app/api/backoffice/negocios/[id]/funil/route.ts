/**
 * MUDAR O FUNIL de um negócio (CRM Fase 3). Rota à parte do PATCH geral para não mexer na escrita
 * do estado: o funil diz em que venda o contacto está, não em que ponto dela.
 *
 * Mesma ordem de sempre: capacidade, âmbito, ler o negócio, comparar — e só depois escrever. Quem
 * não participa recebe 404, para não se saber que o negócio existe. Fica registo em
 * `vendas_negocio_eventos` com a nota «funil: X → Y».
 */
import { NextRequest, NextResponse } from 'next/server'
import { exigirCapacidade } from '@/lib/backoffice-sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ambitoDaEquipa } from '@/lib/backoffice-equipas'
import { COLUNAS_DE_PARTICIPACAO, ehUuid } from '@/lib/backoffice-negocios'
import { podeMexerNoNegocio } from '@/lib/backoffice-escrita'
import type { AtribuicoesDoNegocio } from '@/lib/backoffice-escrita'
import { ehFunil, nomeDoFunil } from '@/lib/backoffice-funis'
import { faltaColunaFunil } from '@/lib/backoffice-ficha'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirCapacidade(request, 'bo.pipeline_proprio')
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  if (!ehUuid(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  let body: { funil?: unknown }
  try {
    body = (await request.json()) as { funil?: unknown }
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }
  // `null` limpa (volta a «por classificar»); qualquer outra coisa tem de ser do catálogo.
  const funil = body.funil === null || body.funil === '' ? null : body.funil
  if (funil !== null && !ehFunil(funil)) return NextResponse.json({ error: 'Funil desconhecido' }, { status: 400 })

  const db = getSupabaseAdmin()
  const ambito = await ambitoDaEquipa(db, ctx, 'pipeline')

  const { data, error } = await db
    .from('vendas_negocios')
    .select(`id, estado, funil, ${COLUNAS_DE_PARTICIPACAO.join(', ')}`)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if (faltaColunaFunil(error)) {
      return NextResponse.json({ error: 'Falta aplicar a migração 261 (coluna funil).' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const negocio = (data ?? null) as (AtribuicoesDoNegocio & { id: string; estado: string; funil: string | null }) | null
  if (!negocio || !podeMexerNoNegocio(negocio, ambito)) {
    return NextResponse.json({ error: 'Negócio não encontrado', detalhe: 'Ou não existe, ou não participas nele.' }, { status: 404 })
  }
  if (negocio.funil === funil) return NextResponse.json({ ok: true, funil })

  const { error: erroEscrita } = await db
    .from('vendas_negocios')
    .update({ funil, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (erroEscrita) return NextResponse.json({ error: erroEscrita.message }, { status: 500 })

  // O histórico não pode falhar a escrita que já aconteceu: se não gravar, diz-se e segue.
  const { error: erroEvento } = await db.from('vendas_negocio_eventos').insert({
    negocio_id: id,
    de: negocio.estado,
    para: negocio.estado,
    por: ctx.userId,
    nota: `funil: ${nomeDoFunil(negocio.funil)} → ${nomeDoFunil(funil)}`,
  })

  return NextResponse.json({ ok: true, funil, historico: !erroEvento })
}
