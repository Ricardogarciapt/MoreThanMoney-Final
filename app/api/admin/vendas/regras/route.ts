/**
 * AS PERCENTAGENS, editáveis pelo dono. Papel × pack × percentagem, os degraus de rank, e o plano
 * de cada pessoa.
 *
 * Três coisas que esta rota nunca faz:
 *  · não inventa percentagens (o que não estiver definido fica por definir, e o livro diz);
 *  · não faz UPDATE destrutivo (mudar fecha a regra anterior e abre outra — o histórico fica);
 *  · não recalcula comissões já criadas. Mudar a tabela hoje vale para as vendas de hoje em
 *    diante. Recalcular o passado seria reescrever o que já foi comunicado a quem recebe.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { PAPEIS_VENDAS, PLANO_PADRAO, type PapelVendas } from '@/lib/vendas/calculo'
import {
  carregarRegras,
  carregarRegrasRank,
  definirDegrauRank,
  definirPlanoDaPessoa,
  definirRegra,
  regrasEmVigor,
  revogarRegra,
} from '@/lib/vendas/regras'

const supabase = getSupabaseAdmin()

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const comHistorico = searchParams.get('historico') === '1'

  try {
    const [emVigor, ranks, historico, planos] = await Promise.all([
      regrasEmVigor(supabase),
      carregarRegrasRank(supabase),
      comHistorico ? carregarRegras(supabase) : Promise.resolve([]),
      supabase.from('vendas_pessoa_plano').select('pessoa_id, plano, desde, nota').then((r) => r.data ?? []),
    ])

    return NextResponse.json({
      emVigor,
      ranks: ranks.filter((r) => r.valido_ate === null),
      ranksHistorico: comHistorico ? ranks : undefined,
      historico: comHistorico ? historico : undefined,
      planos,
      papeis: PAPEIS_VENDAS,
      planoPadrao: PLANO_PADRAO,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao ler as regras' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const accao = String(body.accao || '')

  try {
    if (accao === 'definir') {
      const papel = body.papel as PapelVendas
      const { regra, substituiu } = await definirRegra(supabase, {
        plano: body.plano,
        papel,
        pack: body.pack,
        pct: Number(body.pct),
        aplica_a: body.aplica_a,
        nota: body.nota ?? null,
        criado_por: auth.userId ?? null,
      })
      return NextResponse.json({
        regra,
        substituiu,
        aviso: substituiu
          ? 'A regra anterior foi fechada, não apagada: as comissões que ela fez continuam a apontar para ela.'
          : undefined,
      })
    }

    if (accao === 'revogar') {
      await revogarRegra(supabase, String(body.id))
      return NextResponse.json({
        ok: true,
        aviso: 'A partir de agora este papel deixa de receber neste pack. As vendas anteriores não mudam.',
      })
    }

    if (accao === 'degrau') {
      const degrau = await definirDegrauRank(supabase, {
        papel: body.papel as PapelVendas,
        min_vendas: Number(body.min_vendas),
        pct: Number(body.pct),
        nota: body.nota ?? null,
        criado_por: auth.userId ?? null,
      })
      return NextResponse.json({ degrau })
    }

    if (accao === 'plano_pessoa') {
      // Mover alguém de plano mexe-lhe no rendimento. Tem de ter autor e nota — é isso que
      // distingue uma decisão de um acidente.
      await definirPlanoDaPessoa(supabase, {
        pessoaId: String(body.pessoa_id),
        plano: String(body.plano),
        definidoPor: auth.userId ?? null,
        nota: body.nota ?? null,
      })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: `Acção desconhecida: ${accao}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao gravar' }, { status: 500 })
  }
}
