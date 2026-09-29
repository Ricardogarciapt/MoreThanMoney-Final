/**
 * A VITRINE — o que está à venda, por quanto, e se esta pessoa já o comprou.
 *
 * GET /api/marketplace/produtos            → a montra toda
 * GET /api/marketplace/produtos?slug=x     → um produto (a ficha)
 * GET /api/marketplace/produtos?tipo=curso → a montra filtrada por categoria
 *
 * O que NUNCA sai daqui é o `conteudo_url`. A montra mostra o que se compra; a chave entrega-se
 * em /api/marketplace/biblioteca, e só a quem tem compra. Separar as duas coisas é a correcção da
 * fuga que o cartão de cursos do /live tem: lá, o link da playlist VIP vai para toda a gente e o
 * cadeado é desenhado por cima.
 *
 * ── O PREÇO É CALCULADO AQUI E NÃO NO ECRÃ ────────────────────────────────────────────────
 *
 * A campanha depende do perfil de quem pergunta (um desconto «para membro» não é para todos) e da
 * hora (tem prazo). Deixar essa conta ao browser era deixar o browser decidir o seu próprio
 * desconto — e a rota do checkout, que recalcula a mesma coisa no servidor, recusaria a diferença
 * ou, pior, cobraria outro valor. O ecrã recebe o preço já feito, e é o mesmo que ele vai pagar.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { isIosAppRequest } from '@/lib/is-native-request'
import {
  LOJA_DA_CASA,
  NOME_DA_CASA,
  NOTA_DA_CASA,
  precoEfectivo,
  produtoNaVitrine,
  podeComprarAqui,
  nomeDaCategoria,
  tipoValido,
  vendedorDoProduto,
  vendedoresDaMontra,
  vitrineVisivelNoIos,
} from '@/lib/marketplace/regras'
import {
  COLUNAS_VITRINE,
  lerDefinicoes,
  mapaDeAutores,
  mapaDeVendedores,
  comprasDoMembro,
  type ProdutoVitrine,
} from '@/lib/marketplace/servidor'
import { registarPasso } from '@/lib/marketplace/leads'
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
    const tipo = request.nextUrl.searchParams.get('tipo')
    // A loja de um vendedor: 'casa' ou o uuid de um educador. Filtrado NA QUERY e não no fim, para
    // a loja de um educador não trazer o catálogo inteiro pela rede só para deitar fora 90%.
    const vendedor = request.nextUrl.searchParams.get('vendedor')

    let q = getSupabaseAdmin().from('marketplace_produtos').select(COLUNAS_VITRINE)
    if (slug) q = q.eq('slug', slug)
    if (tipo) q = q.eq('tipo', tipoValido(tipo))
    if (vendedor === LOJA_DA_CASA) q = q.eq('dono', 'casa')
    else if (vendedor) q = q.eq('educator_id', vendedor).eq('dono', 'educador')
    /**
     * A ORDEM DA MONTRA (158). Era só `publicado_em desc` — uma ordem de arquivo, e inútil aqui:
     * os catorze produtos da casa foram publicados no mesmo minuto pela migração 153, por isso a
     * ordem entre eles era, na prática, sorteada a cada leitura.
     *
     * Agora: destacados primeiro, entre eles pela ordem que o dono deu, e o resto pela data. O
     * destaque NÃO torna nada visível — `produtoNaVitrine`, mais abaixo, continua a ser quem decide
     * quem aparece; um produto destacado que esteja retirado continua fora.
     */
    const { data } = await q
      .order('destaque', { ascending: false })
      .order('destaque_ordem', { ascending: true })
      .order('publicado_em', { ascending: false, nullsFirst: false })
      .limit(200)

    const linhas = (data ?? []) as unknown as ProdutoVitrine[]
    const vendedores = await mapaDeVendedores()
    // Um produto da casa não tem vendedor. `undefined` aqui é a resposta certa, e `produtoNaVitrine`
    // já sabe que só a deve exigir a produtos de educador.
    const vendedorDe = (p: ProdutoVitrine) => (p.educator_id ? vendedores.get(p.educator_id) : undefined)

    const visiveis = linhas.filter((p) => produtoNaVitrine(p, vendedorDe(p), def, sessao?.perfil))

    const autores = await mapaDeAutores(visiveis.map((p) => p.educator_id))
    const compras = sessao ? await comprasDoMembro(sessao.userId) : []
    const compradosIds = new Set(compras.filter((c) => c.estado === 'paga').map((c) => c.produto_id))
    const agora = new Date().toISOString()

    const produtos = visiveis.map((p) => {
      const jaComprou = compradosIds.has(p.id)
      const compra = podeComprarAqui({
        iosNativo: ios,
        def,
        produto: p,
        vendedor: vendedorDe(p),
        jaComprou,
      })
      const preco = precoEfectivo(p, agora, sessao?.perfil)
      const educador = p.educator_id ? autores.get(p.educator_id) ?? null : null
      return {
        ...p,
        educador,
        // QUEM VENDE, resolvido no servidor. Um produto da casa não tem educador, e era isso que
        // deixava o cartão sem linha de vendedor nenhuma — numa montra multivendedor, essa linha é
        // o que diz que aqui vende mais do que uma pessoa. Ver `vendedorDoProduto`.
        vendedor: vendedorDoProduto(p, educador),
        categoria: nomeDaCategoria(p.tipo),
        jaComprou,
        preco,
        // O ecrã não volta a decidir isto: recebe a decisão já tomada, com o motivo. É o que
        // garante que o botão da app e o travão da rota dizem sempre a mesma coisa.
        podeComprar: compra.pode,
        motivoSemCompra: compra.motivo ?? null,
      }
    })

    // ── O funil ───────────────────────────────────────────────────────────────────────────
    //
    // Registado DEPOIS de a resposta estar montada, e sem `await` a travar nada que o utilizador
    // esteja à espera: `registarPasso` já engole os próprios erros (ver o cabeçalho de `leads.ts`).
    // Um pedido com `slug` é alguém a abrir uma ficha; sem `slug` é alguém a entrar na montra.
    if (sessao) {
      void registarPasso({
        etapa: slug ? 'viu_ficha' : 'viu_montra',
        produtoId: slug ? produtos[0]?.id ?? null : null,
        userId: sessao.userId,
        email: sessao.email,
        origem: ios ? 'app_ios' : 'web',
        contexto: slug ? { slug } : { quantos: produtos.length, tipo: tipo ?? null },
      })
    }

    // ── A loja do vendedor ────────────────────────────────────────────────────────────────
    //
    // Só quando se pede uma loja. A `bio` é lida AQUI e não vem no mapa de autores: `mapaDeAutores`
    // serve a montra, onde ninguém lê biografias, e trazer um texto longo por produto era pagar
    // isso em todos os cartões. A tabela `lms_educators` tem `password_hash` e chaves de ingestão
    // ao lado — daí o `select` continuar a nomear só o que é público.
    let loja: { id: string; nome: string; nota: string | null; bio: string | null; avatarUrl: string | null; ehACasa: boolean } | null = null
    if (vendedor === LOJA_DA_CASA) {
      loja = {
        id: LOJA_DA_CASA,
        nome: NOME_DA_CASA,
        nota: NOTA_DA_CASA,
        bio: 'Os produtos da casa: as subscrições, os scanners, os robôs e as licenças que a MoreThanMoney vende e mantém.',
        avatarUrl: null,
        ehACasa: true,
      }
    } else if (vendedor) {
      const { data: e } = await getSupabaseAdmin()
        .from('lms_educators')
        .select('id, display_name, avatar_url, specialty, bio, is_active')
        .eq('id', vendedor)
        .maybeSingle()
      // Um educador inactivo não tem loja. Devolver `null` em vez de 404 deixa o ecrã dizer «esta
      // loja não existe» sem tratar o caso como avaria.
      if (e && e.is_active !== false) {
        loja = {
          id: e.id as string,
          nome: e.display_name as string,
          nota: (e.specialty as string | null) ?? null,
          bio: (e.bio as string | null) ?? null,
          avatarUrl: (e.avatar_url as string | null) ?? null,
          ehACasa: false,
        }
      }
    }

    return NextResponse.json(
      {
        ligado: def.ligado,
        ios,
        produtos,
        ...(vendedor ? { loja } : {}),
        // A tira de vendedores no topo da montra. É a assinatura de um multivendedor e serve de
        // navegação: clicar leva à loja da pessoa.
        vendedores: vendedoresDaMontra(produtos),
        // A MONTRA É PÚBLICA, e por isso o ecrã precisa de saber se há sessão.
        //
        // `podeComprar` responde «este produto está à venda», que é outra pergunta. Sem esta, um
        // visitante do Instagram carregava em «Comprar» e recebia «Autenticação necessária» num
        // aviso vermelho — em vez de ser levado ao registo, que é o que ele ia fazer a seguir.
        autenticado: Boolean(sessao),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 })
  }
}
