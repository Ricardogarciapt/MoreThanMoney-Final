/**
 * A VITRINE — o que está à venda, e se esta pessoa já o comprou.
 *
 * GET /api/marketplace/produtos            → a montra toda
 * GET /api/marketplace/produtos?slug=x     → um produto
 *
 * O que NUNCA sai daqui é o `conteudo_url`. A montra mostra o que se compra; a chave entrega-se
 * em /api/marketplace/acesso, e só a quem tem compra. Separar as duas coisas é a correcção da
 * fuga que o cartão de cursos do /live tem: lá, o link da playlist VIP vai para toda a gente e o
 * cadeado é desenhado por cima.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { isIosAppRequest } from '@/lib/is-native-request'
import { produtoNaVitrine, podeComprarAqui, vitrineVisivelNoIos } from '@/lib/marketplace/regras'
import {
  COLUNAS_VITRINE,
  lerDefinicoes,
  mapaDeAutores,
  mapaDeVendedores,
  comprasDoMembro,
  type ProdutoVitrine,
} from '@/lib/marketplace/servidor'
import { sessaoDoMembro } from '@/lib/marketplace/sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const def = await lerDefinicoes()
    const ios = isIosAppRequest(request)

    // A app iOS pode ter a montra escondida por decisão do dono. Devolver uma lista vazia em vez
    // de 403 é de propósito: o ecrã mostra «ainda não há nada aqui» em vez de um erro.
    if (ios && !vitrineVisivelNoIos(def)) {
      return NextResponse.json({ ligado: false, produtos: [], ios: true })
    }

    const sessao = await sessaoDoMembro(request)
    const slug = request.nextUrl.searchParams.get('slug')

    let q = getSupabaseAdmin().from('marketplace_produtos').select(COLUNAS_VITRINE)
    if (slug) q = q.eq('slug', slug)
    const { data } = await q.order('publicado_em', { ascending: false, nullsFirst: false }).limit(200)

    const linhas = (data ?? []) as ProdutoVitrine[]
    const vendedores = await mapaDeVendedores()

    const visiveis = linhas.filter((p) =>
      produtoNaVitrine(p, vendedores.get(p.educator_id), def, sessao?.perfil),
    )

    const autores = await mapaDeAutores(visiveis.map((p) => p.educator_id))
    const compras = sessao ? await comprasDoMembro(sessao.userId) : []
    const compradosIds = new Set(compras.filter((c) => c.estado === 'paga').map((c) => c.produto_id))

    const produtos = visiveis.map((p) => {
      const jaComprou = compradosIds.has(p.id)
      const compra = podeComprarAqui({
        iosNativo: ios,
        def,
        produto: p,
        vendedor: vendedores.get(p.educator_id),
        jaComprou,
      })
      return {
        ...p,
        educador: autores.get(p.educator_id) ?? null,
        jaComprou,
        // O ecrã não volta a decidir isto: recebe a decisão já tomada, com o motivo. É o que
        // garante que o botão da app e o travão da rota dizem sempre a mesma coisa.
        podeComprar: compra.pode,
        motivoSemCompra: compra.motivo ?? null,
      }
    })

    return NextResponse.json(
      { ligado: def.ligado, ios, produtos },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 })
  }
}
