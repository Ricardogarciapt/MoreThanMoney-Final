/**
 * /marketplace/<slug> — a ficha de um produto.
 *
 * O `cancel_url` do checkout aponta para aqui, e esta página NÃO EXISTIA: quem desistisse do
 * pagamento aterrava num 404. Ver o cabeçalho de `components/marketplace/ficha-produto.tsx`.
 *
 * PÚBLICA, como a montra. Um link de produto que só abre a quem já tem conta não serve para ser
 * partilhado — e ser partilhado é metade do que uma ficha faz. O que protege o conteúdo não é
 * esta página: é o `conteudo_url` nunca sair na resposta pública. A razão longa está no cabeçalho
 * de `app/marketplace/page.tsx`.
 *
 * ═══ PORQUE É QUE ISTO DEIXOU DE SER SÓ UM COMPONENTE DE CLIENTE ═══════════════════════════
 *
 * Porque «ser partilhada» não estava a acontecer. A página era `"use client"` e não tinha
 * metadados nenhuns: um link colado no WhatsApp, no Telegram ou no Instagram saía como texto
 * seco, sem imagem, sem título e sem preço. Não dava erro — o link abria bem; só não vendia nada
 * antes de ser aberto.
 *
 * Agora o invólucro é de SERVIDOR e só gera os metadados; a ficha continua a ser o mesmo
 * componente de cliente, com o mesmo comportamento. As decisões do cartão (capa primeiro, sempre
 * em endereço absoluto) vivem em `lib/marketplace/partilha.ts`, com guarda ao lado.
 */
import type { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { cartaoDoProduto } from '@/lib/marketplace/partilha'
import FichaProduto from '@/components/marketplace/ficha-produto'

/** Só o que o cartão precisa. O `conteudo_url` não entra aqui nem por engano. */
const CAMPOS_DO_CARTAO = 'slug, titulo, subtitulo, descricao, imagem_url, imagens, estado, activo'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  try {
    const { data } = await getSupabaseAdmin()
      .from('marketplace_produtos')
      .select(CAMPOS_DO_CARTAO)
      .eq('slug', slug)
      .maybeSingle()

    /**
     * Um produto que não está na montra não ganha cartão. Não é por esconder: é porque um cartão
     * bonito de um produto retirado continua a circular no WhatsApp muito depois de o link deixar
     * de levar a lado nenhum.
     */
    const p = data as { estado?: string; activo?: boolean } | null
    if (!p || p.estado !== 'publicado' || p.activo === false) {
      return { title: 'Marketplace · MoreThanMoney' }
    }

    const cartao = cartaoDoProduto(data as Parameters<typeof cartaoDoProduto>[0])
    return {
      title: cartao.titulo,
      description: cartao.descricao,
      openGraph: {
        type: 'website',
        title: cartao.titulo,
        description: cartao.descricao,
        url: cartao.url,
        siteName: 'MoreThanMoney',
        locale: 'pt_PT',
        images: cartao.imagens.map((url) => ({ url })),
      },
      twitter: {
        // `summary_large_image` e não `summary`: com o cartão pequeno a capa aparece como uma
        // miniatura ao lado do texto, e o que se quer partilhar aqui é a imagem.
        card: 'summary_large_image',
        title: cartao.titulo,
        description: cartao.descricao,
        images: cartao.imagens.slice(0, 1),
      },
      alternates: { canonical: cartao.url },
    }
  } catch {
    // A base em baixo não pode derrubar a página: a ficha lê-se sozinha do lado do cliente, e um
    // cartão em falta é melhor do que um 500 a quem só queria ver o produto.
    return { title: 'Marketplace · MoreThanMoney' }
  }
}

export default async function ProdutoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <FichaProduto slug={slug} />
    </main>
  )
}
