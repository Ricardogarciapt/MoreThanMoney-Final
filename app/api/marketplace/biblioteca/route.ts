/**
 * O QUE EU COMPREI — e o link para abrir.
 *
 * GET /api/marketplace/biblioteca
 *
 * ── PORQUE É QUE O LINK SAI DAQUI E NÃO DA VITRINE ────────────────────────────────────────
 *
 * Um produto pago que não abre é pior do que não o ter vendido: o cliente pagou, não recebeu, e
 * quem responde é a casa. Por isso o acesso é uma rota própria, com a decisão tomada no SERVIDOR
 * (`temAcessoAoProduto`), e o `conteudo_url` só é escrito na resposta depois dessa decisão.
 *
 * A alternativa — mandar o link com a lista e esconder no ecrã — é o que o cartão de cursos do
 * /live faz hoje, e é a razão por que o `url` de uma playlist VIP chega a quem não é VIP. Aqui a
 * chave nunca sai da casa sem alguém ter a porta.
 *
 * Um reembolso fecha a porta. Uma conta suspensa fecha a porta. Uma mentoria com prazo fecha-se
 * quando o prazo acaba — e a lista continua a mostrar o produto, com a data, para a pessoa
 * perceber o que aconteceu em vez de o ver desaparecer.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { temAcessoAoProduto } from '@/lib/marketplace/regras'
import { comprasDoMembro, mapaDeAutores } from '@/lib/marketplace/servidor'
import { sessaoDoMembro } from '@/lib/marketplace/sessao'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const sessao = await sessaoDoMembro(request)
    if (!sessao) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })

    const compras = await comprasDoMembro(sessao.userId)
    if (!compras.length) return NextResponse.json({ itens: [] }, { headers: { 'Cache-Control': 'no-store' } })

    const { data: produtos } = await getSupabaseAdmin()
      .from('marketplace_produtos')
      // Aqui SIM vem o conteúdo — mas só é escrito na resposta linha a linha, depois da decisão.
      .select('id, slug, titulo, subtitulo, tipo, imagem_url, educator_id, conteudo_url, conteudo_nota')
      .in('id', Array.from(new Set(compras.map((c) => c.produto_id))))

    const porId = new Map((produtos ?? []).map((p) => [p.id as string, p]))
    const autores = await mapaDeAutores((produtos ?? []).map((p) => p.educator_id as string))
    const agora = new Date().toISOString()

    const itens = compras.map((c) => {
      const p = porId.get(c.produto_id)
      const aberto = Boolean(p) && temAcessoAoProduto(compras, c.produto_id, agora, sessao.perfil)
      return {
        compraId: c.id,
        produtoId: c.produto_id,
        slug: p?.slug ?? null,
        titulo: p?.titulo ?? 'Produto removido',
        subtitulo: p?.subtitulo ?? null,
        tipo: p?.tipo ?? null,
        imagem_url: p?.imagem_url ?? null,
        educador: p ? autores.get(p.educator_id as string) ?? null : null,
        estado: c.estado,
        pago_em: c.pago_em,
        acesso_expira_em: c.acesso_expira_em,
        aberto,
        // A chave, e só quando a porta está aberta.
        conteudo_url: aberto ? p?.conteudo_url ?? null : null,
        conteudo_nota: aberto ? p?.conteudo_nota ?? null : null,
      }
    })

    return NextResponse.json({ itens }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 })
  }
}
