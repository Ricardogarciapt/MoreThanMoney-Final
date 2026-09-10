import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { censurarEmail } from '@/lib/mtmfunded/acesso'

export const dynamic = 'force-dynamic'

/**
 * A CLASSIFICAÇÃO PÚBLICA.
 *
 * Mostra pessoas reais a competir por prémios reais, por isso o email sai censurado — e sai
 * censurado AQUI, no servidor. Mandá-lo inteiro e esconder no CSS seria publicá-lo: qualquer
 * pessoa abre as ferramentas do browser e lê a lista completa de emails dos participantes.
 *
 * A ordem já vem calculada da leitura de 60 em 60 minutos (`posicao`), e não se recalcula por
 * pedido: dois visitantes a ver ordens diferentes no mesmo minuto é pior do que uma ordem
 * com uma hora.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('torneio')?.trim()
  const db = getSupabaseAdmin()

  const { data: torneio } = await db
    .from('mtm_tournaments')
    .select('id, slug, nome, estado, comeca_em, acaba_em, publicado, saldo_inicial, regras, premios')
    .eq(slug ? 'slug' : 'publicado', slug ?? true)
    .order('comeca_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!torneio || !torneio.publicado) {
    // Um torneio por publicar não existe para o público — nem para dizer que existe.
    return NextResponse.json({ torneio: null, classificacao: [], atualizadoEm: null })
  }

  const { data: linhas } = await db
    .from('mtm_tournament_participants')
    .select('nome_publico, email, estado, posicao, resultado_pct, metricas, updated_at')
    .eq('tournament_id', torneio.id)
    .order('posicao', { ascending: true, nullsFirst: false })
    .limit(500)

  const classificacao = (linhas ?? []).map((p) => {
    const m = (p.metricas ?? {}) as Record<string, unknown>
    return {
      posicao: p.posicao,
      nome: p.nome_publico,
      email: censurarEmail(p.email),
      estado: p.estado,
      resultadoPct: p.resultado_pct == null ? null : Number(p.resultado_pct),
      // Só o que é seguro mostrar. O saldo, o login e o número de trades ficam de fora:
      // são a mão do participante e não são de ninguém a não ser dele.
      elegivel: m.elegivel === true,
      naoElegivelPorque: typeof m.naoElegivelPorque === 'string' ? m.naoElegivelPorque : null,
      drawdownPct: typeof m.drawdownPct === 'number' ? m.drawdownPct : null,
    }
  })

  const atualizadoEm = (linhas ?? [])
    .map((p) => p.updated_at as string | null)
    .filter(Boolean)
    .sort()
    .pop() ?? null

  return NextResponse.json({
    torneio: {
      slug: torneio.slug,
      nome: torneio.nome,
      estado: torneio.estado,
      comecaEm: torneio.comeca_em,
      acabaEm: torneio.acaba_em,
      saldoInicial: Number(torneio.saldo_inicial),
      regras: torneio.regras,
      premios: torneio.premios,
    },
    classificacao,
    participantes: classificacao.length,
    atualizadoEm,
  })
}
