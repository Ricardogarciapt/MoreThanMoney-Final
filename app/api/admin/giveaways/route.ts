import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * A COMPARAÇÃO DAS TRÊS PORTAS, dia a dia.
 *
 * É para isto que as três campanhas existem. O prémio é igual nas três, por isso a diferença nos
 * números só pode vir da mecânica — e ao fim de duas semanas há uma resposta a sério para «qual
 * delas usamos da próxima vez».
 *
 * Três medidas, porque «melhor» depende do que se procura:
 *
 * · ENTRADAS — quantas pessoas. A porta larga costuma ganhar aqui.
 * · COM EMAIL — quantas dessas ficam contactáveis. É o que transforma alcance em lista.
 * · BILHETES POR ENTRADA — quanto cada pessoa se esforçou. Mede envolvimento, não volume.
 *
 * Uma campanha pode ganhar numa e perder noutra, e é justamente isso que se quer ver.
 */
export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const db = getSupabaseAdmin()

  const { data: campanhas } = await db
    .from('giveaways')
    .select('id, slug, nome, variante, estado, mecanica, comeca_em, acaba_em')
    .order('variante')
  if (!campanhas?.length) return NextResponse.json({ campanhas: [] })

  const ids = campanhas.map((c) => c.id)

  const [{ data: entradas }, { data: accoes }] = await Promise.all([
    db.from('giveaway_entries')
      .select('id, giveaway_id, email, bilhetes, trazida_por, entrou_em')
      .in('giveaway_id', ids).eq('validada', true),
    db.from('giveaway_actions')
      .select('giveaway_id, entry_id, tipo, bilhetes, criado_em').in('giveaway_id', ids),
  ])

  const resumo = campanhas.map((c) => {
    const minhas = (entradas ?? []).filter((e) => e.giveaway_id === c.id)
    const minhasAccoes = (accoes ?? []).filter((a) => a.giveaway_id === c.id)

    const comEmail = minhas.filter((e) => e.email).length
    const trazidas = minhas.filter((e) => e.trazida_por).length
    const bilhetes = minhas.reduce((a, e) => a + Number(e.bilhetes ?? 0), 0)

    // Por dia, para se ver a CURVA e não só o total. Uma campanha que arranca forte e morre é
    // diferente de uma que cresce devagar, e o total esconde as duas.
    const porDia = new Map<string, number>()
    for (const e of minhas) {
      const d = String(e.entrou_em).slice(0, 10)
      porDia.set(d, (porDia.get(d) ?? 0) + 1)
    }

    const porTipo = new Map<string, number>()
    for (const a of minhasAccoes) porTipo.set(a.tipo, (porTipo.get(a.tipo) ?? 0) + 1)

    return {
      slug: c.slug,
      variante: c.variante,
      nome: c.nome,
      estado: c.estado,
      hipotese: (c.mecanica as Record<string, unknown>)?.hipotese ?? null,
      entradas: minhas.length,
      comEmail,
      // Sem entradas, a percentagem é 0 e não «NaN» nem 100.
      pctComEmail: minhas.length ? Math.round((comEmail / minhas.length) * 100) : 0,
      trazidasPorAmigos: trazidas,
      pctTrazidas: minhas.length ? Math.round((trazidas / minhas.length) * 100) : 0,
      bilhetes,
      bilhetesPorEntrada: minhas.length ? Math.round((bilhetes / minhas.length) * 10) / 10 : 0,
      accoesPorTipo: Object.fromEntries(porTipo),
      porDia: [...porDia.entries()].sort().map(([dia, n]) => ({ dia, entradas: n })),
    }
  })

  const totalEntradas = resumo.reduce((a, r) => a + r.entradas, 0)

  return NextResponse.json({
    campanhas: resumo,
    total: {
      entradas: totalEntradas,
      comEmail: resumo.reduce((a, r) => a + r.comEmail, 0),
      bilhetes: resumo.reduce((a, r) => a + r.bilhetes, 0),
    },
    // Quem vai à frente em cada medida. Não há um «vencedor» só: cada medida responde a uma
    // pergunta diferente, e dizer que há um escondia as outras duas.
    lider: {
      volume: [...resumo].sort((a, b) => b.entradas - a.entradas)[0]?.variante ?? null,
      lista: [...resumo].sort((a, b) => b.comEmail - a.comEmail)[0]?.variante ?? null,
      envolvimento:
        [...resumo].sort((a, b) => b.bilhetesPorEntrada - a.bilhetesPorEntrada)[0]?.variante ?? null,
    },
  })
}
