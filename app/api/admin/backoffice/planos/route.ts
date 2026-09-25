/**
 * O PLANO DE COMISSÃO DE CADA PESSOA — quem mantém os 50 % antigos e quem entra na tabela nova.
 *
 * `vendas_pessoa_plano` está VAZIA de propósito (migração 129): ninguém foi posto no plano legado
 * automaticamente. A razão está escrita na migração e repete-se aqui porque é a parte que se
 * esquece: `mlm_nodes` tem 45 linhas de origens misturadas, com patrocinadores que nunca trouxeram
 * ninguém e com contas duplicadas da mesma pessoa. Atribuir 50 % vitalícios com um
 * `insert ... select` sobre isso era dar rendimento perpétuo a linhas, não a pessoas.
 *
 * Por isso esta rota tem GET e PUT, e não tem «semear». A lista é do Ricardo, pessoa a pessoa, com
 * autor e nota em cada decisão.
 *
 * O QUE O PLANO FAZ: `lib/vendas/calculo.ts` resolve a regra pelo plano da pessoa e cai no `padrao`
 * quando ela não tem plano próprio. Não há data nenhuma escrita no cálculo — mudar a tabela geral
 * não toca em quem tem plano gravado, e é isso que torna a salvaguarda auditável.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { PLANO_PADRAO } from '@/lib/vendas/calculo'
import { definirPlanoDaPessoa } from '@/lib/vendas/regras'

/** Quem tem plano gravado hoje. Quem não estiver aqui está no {@link PLANO_PADRAO}. */
export async function GET() {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('vendas_pessoa_plano')
    .select('pessoa_id, plano, desde, definido_por, nota, atualizado_em')
    .order('atualizado_em', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = [...new Set((data || []).map((l) => l.pessoa_id as string))]
  const perfis = ids.length
    ? (await supabase.from('profiles').select('id, email, username, full_name').in('id', ids)).data || []
    : []
  const nome = new Map(perfis.map((p) => [p.id as string, p]))

  return NextResponse.json({
    plano_padrao: PLANO_PADRAO,
    pessoas: (data || []).map((l) => {
      const p = nome.get(l.pessoa_id as string) as Record<string, unknown> | undefined
      return {
        pessoa_id: l.pessoa_id,
        plano: l.plano,
        desde: l.desde,
        nota: l.nota,
        atualizado_em: l.atualizado_em,
        email: (p?.email as string) ?? null,
        username: (p?.username as string) ?? null,
        full_name: (p?.full_name as string) ?? null,
      }
    }),
  })
}

/**
 * Pôr (ou mudar) uma pessoa num plano.
 *
 * Mexe no rendimento dela: fica com autor (`definido_por`) e com nota. Voltar ao plano geral faz-se
 * com o DELETE — apagar a linha é a forma honesta de dizer «não tem plano próprio», e gravar
 * `plano = 'padrao'` deixava a impressão de uma decisão especial onde não há nenhuma.
 */
export async function PUT(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const pessoaId = typeof body.pessoa_id === 'string' ? body.pessoa_id.trim() : ''
  const plano = typeof body.plano === 'string' ? body.plano.trim() : ''
  const nota = typeof body.nota === 'string' ? body.nota.trim().slice(0, 500) : null

  if (!pessoaId) return NextResponse.json({ error: 'Falta a pessoa' }, { status: 400 })
  if (!plano) return NextResponse.json({ error: 'Falta o plano' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  // A pessoa tem de existir. Sem isto, um id mal copiado gravava um plano órfão que só aparecia
  // quando o painel mostrasse uma linha sem nome nenhum ao lado.
  const { data: pessoa } = await supabase.from('profiles').select('id').eq('id', pessoaId).maybeSingle()
  if (!pessoa) return NextResponse.json({ error: 'Pessoa não encontrada' }, { status: 404 })

  // O plano tem de ter regras, senão a pessoa cai no `padrao` sem ninguém perceber e o painel
  // mostrava-a «no legado» a receber a tabela nova. Avisa-se em vez de recusar: o dono pode estar a
  // preparar um plano antes de lhe definir as percentagens.
  const { data: temRegras } = await supabase
    .from('vendas_regras_comissao')
    .select('id')
    .eq('plano', plano)
    .is('valido_ate', null)
    .limit(1)

  try {
    await definirPlanoDaPessoa(supabase, {
      pessoaId,
      plano,
      definidoPor: auth.userId,
      nota,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falhou a gravação' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    aviso:
      temRegras && temRegras.length > 0
        ? null
        : `O plano "${plano}" ainda não tem nenhuma regra em vigor. Até ter, esta pessoa é paga pela tabela geral.`,
  })
}

/** Voltar ao plano geral: apaga-se a linha. O histórico de quem decidiu vive nos logs da rota. */
export async function DELETE(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  const pessoaId = new URL(request.url).searchParams.get('pessoa_id')?.trim()
  if (!pessoaId) return NextResponse.json({ error: 'Falta a pessoa' }, { status: 400 })

  const { error } = await getSupabaseAdmin().from('vendas_pessoa_plano').delete().eq('pessoa_id', pessoaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
