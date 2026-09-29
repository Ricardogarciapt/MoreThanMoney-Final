/**
 * GERIR PRODUTOS — a mesma rota para o educador e para o admin, com direitos diferentes.
 *
 * GET    → os meus produtos (educador) ou todos (admin) + extracto + definições
 * POST   → criar
 * PATCH  → editar, pedir publicação, retirar, sincronizar o preço no Stripe, pedir à IA
 * DELETE → apagar (só rascunhos)
 *
 * ── PORQUE É QUE É UMA ROTA E NÃO DUAS ────────────────────────────────────────────────────
 *
 * Porque o formulário é o mesmo. Havia duas maneiras de fazer isto: uma rota de educador e uma de
 * admin, cada uma com o seu editor; ou uma rota que sabe QUEM está e o que essa pessoa pode
 * escrever. A primeira parece mais segura e é o contrário: dois editores do mesmo produto divergem,
 * e quando divergem é o do admin que fica com um campo que o do educador não tem — ou, pior, ao
 * contrário. Foi assim que o gating de conteúdo do /live ficou com quatro cópias da mesma regra a
 * discordarem, com o VIP a ver cadeado na web e a não ver na app.
 *
 * A diferença entre os dois papéis não está espalhada por `if`s: está em `camposPermitidos()`, em
 * `lib/marketplace/gestao.ts`, e está testada pelo caso mau em `gestao.check.ts` — um educador a
 * tentar mexer no produto de outro, e um educador a tentar escrever a própria partilha.
 *
 * ── O QUE O EDUCADOR NÃO CONSEGUE FAZER AQUI ──────────────────────────────────────────────
 *
 *   · Ver, editar ou apagar o produto de outra pessoa (`produtoSobGestao` recusa, com 404).
 *   · Escrever a partilha dele, o `dono`, o `activo` do dono, ou um link de checkout para fora.
 *   · Publicar. Pede (`accao: 'publicar'`) e fica `em_revisao`; quem publica é o admin.
 *   · Ver as vendas ou o extracto de outro educador.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  estadoAoPublicar,
  extractoDoEducador,
  podePublicar,
  slugDoTitulo,
  sugestaoDaCategoria,
  tipoValido,
} from '@/lib/marketplace/regras'
import {
  camposPermitidos,
  produtoSobGestao,
  produtosSobGestao,
  quemGere,
  COLUNAS_GESTAO,
  type ProdutoGerido,
  type Quem,
} from '@/lib/marketplace/gestao'
import { garantirVendedor, lerDefinicoes, vendasDoEducador } from '@/lib/marketplace/servidor'
import { sincronizarPrecoNoStripe, lerPrecoDoStripe } from '@/lib/marketplace/stripe-preco'
import { gerarDescricao, gerarImagemDoProduto } from '@/lib/marketplace/ia'

export const dynamic = 'force-dynamic'

const semSessao = () => NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })
/**
 * 404 e não 403 quando o produto não é dele.
 *
 * De propósito: um 403 confirma que o produto existe. Quem andasse a adivinhar ids conseguia
 * enumerar o catálogo dos outros educadores pela diferença entre as duas respostas.
 */
const naoEncontrado = () => NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 })

// ── GET ───────────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const quem = await quemGere()
  if (!quem) return semSessao()

  const [def, produtos] = await Promise.all([lerDefinicoes(), produtosSobGestao(quem)])

  // O vendedor e o extracto só existem para um educador. O admin tem o quadro completo no
  // /admin/centro; trazer-lhe aqui o extracto de todos era uma segunda fonte para a mesma conta.
  const vendedor = quem.papel === 'educador' ? await garantirVendedor(quem.educatorId) : null
  const vendas = quem.papel === 'educador' ? await vendasDoEducador(quem.educatorId) : []

  const porProduto = new Map<string, { vendas: number; aReceberCents: number }>()
  for (const v of vendas) {
    if (v.estado !== 'paga') continue
    const a = porProduto.get(v.produto_id) ?? { vendas: 0, aReceberCents: 0 }
    a.vendas += 1
    a.aReceberCents += v.parte_educador_cents || 0
    porProduto.set(v.produto_id, a)
  }

  return NextResponse.json(
    {
      papel: quem.papel,
      marketplaceLigado: def.ligado,
      revisaoObrigatoria: def.revisaoObrigatoria,
      camposPermitidos: camposPermitidos(quem.papel),
      vendedor: vendedor
        ? { activo: vendedor.activo, partilha_pct: vendedor.partilha_pct, temConta: Boolean(vendedor.stripe_connect_account_id) }
        : null,
      produtos: produtos.map((p) => ({
        ...p,
        desempenho: porProduto.get(p.id) ?? { vendas: 0, aReceberCents: 0 },
      })),
      extracto: extractoDoEducador(vendas as unknown as Parameters<typeof extractoDoEducador>[0]),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// ── POST: criar ───────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const quem = await quemGere()
  if (!quem) return semSessao()

  const b = await request.json().catch(() => ({}))
  const titulo = String(b.titulo ?? '').trim()
  if (titulo.length < 3) return NextResponse.json({ error: 'Dá um título ao produto.' }, { status: 400 })

  const db = getSupabaseAdmin()

  // De quem vai ser. Um educador só cria para si — o `educator_id` vem da SESSÃO e nunca do corpo,
  // que é o que impede criar um produto em nome de outra pessoa.
  let educatorId: string | null = null
  let dono: 'educador' | 'casa' = 'educador'
  if (quem.papel === 'educador') {
    educatorId = quem.educatorId
    await garantirVendedor(educatorId)
  } else if (String(b.dono ?? '') === 'casa') {
    dono = 'casa'
  } else {
    // O admin a criar em nome de um educador tem de dizer qual, e esse educador tem de existir.
    const pedido = String(b.educator_id ?? '').trim()
    if (!pedido) return NextResponse.json({ error: 'Escolhe o educador, ou marca o produto como sendo da casa.' }, { status: 400 })
    const { data: existe } = await db.from('lms_educators').select('id').eq('id', pedido).maybeSingle()
    if (!existe) return NextResponse.json({ error: 'Esse educador não existe.' }, { status: 400 })
    educatorId = pedido
    await garantirVendedor(pedido)
  }

  // O slug é o endereço público e tem de ser único. Um sufixo curto resolve as colisões sem
  // obrigar o autor a inventar um título diferente só porque alguém já usou o dele.
  const base = slugDoTitulo(titulo) || 'produto'
  let slug = base
  for (let i = 0; i < 5; i++) {
    const { data: ocupado } = await db.from('marketplace_produtos').select('id').eq('slug', slug).maybeSingle()
    if (!ocupado) break
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
  }

  const tipo = tipoValido(b.tipo)
  const sug = sugestaoDaCategoria(tipo)

  const { data, error } = await db
    .from('marketplace_produtos')
    .insert({
      educator_id: educatorId,
      dono,
      slug,
      titulo,
      subtitulo: b.subtitulo ?? null,
      descricao: b.descricao ?? null,
      tipo,
      imagem_url: b.imagem_url ?? null,
      preco_cents: Math.max(0, Math.round(Number(b.preco_cents) || 0)),
      // A categoria SUGERE; se o corpo disser outra coisa, vale o corpo. Ver a nota em `regras.ts`.
      recorrente: typeof b.recorrente === 'boolean' ? b.recorrente : sug.recorrente,
      requer_morada: typeof b.requer_morada === 'boolean' ? b.requer_morada : sug.requerMorada,
      conteudo_url: b.conteudo_url ?? null,
      conteudo_nota: b.conteudo_nota ?? null,
      estado: 'rascunho', // nasce sempre em rascunho: publicar é um acto separado.
    })
    .select(COLUNAS_GESTAO)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
  return NextResponse.json({ produto: data })
}

// ── PATCH: editar e as acções ─────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  const quem = await quemGere()
  if (!quem) return semSessao()

  const b = await request.json().catch(() => ({}))
  const id = String(b.id ?? '')
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  // A ÚNICA porta para o produto. Confirma o direito e devolve a linha na mesma chamada — não há
  // caminho aqui que obtenha o produto sem passar por isto.
  const r = await produtoSobGestao(id, quem)
  if (!r.produto) return r.motivo === 'sem_sessao' ? semSessao() : naoEncontrado()
  const actual = r.produto

  const accao = String(b.accao ?? '')

  // ── As acções que não são uma edição de campos ───────────────────────────────────────────

  if (accao === 'ia_descricao') {
    try {
      const g = await gerarDescricao({
        titulo: String(b.titulo ?? actual.titulo),
        tipo: String(b.tipo ?? actual.tipo),
        rascunho: b.descricao ?? actual.descricao,
        notas: b.notas ?? null,
        precoCents: Number(b.preco_cents ?? actual.preco_cents),
        moeda: actual.moeda,
      })
      // Devolve SEM gravar: o texto é uma proposta, e quem decide se fica é quem o leu. Gravar
      // aqui fazia um clique no botão apagar o que a pessoa tinha escrito à mão.
      return NextResponse.json({ sugestao: g })
    } catch (e) {
      return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 502 })
    }
  }

  if (accao === 'ia_imagem') {
    try {
      const img = await gerarImagemDoProduto({
        titulo: String(b.titulo ?? actual.titulo),
        tipo: String(b.tipo ?? actual.tipo),
        descricao: b.descricao ?? actual.descricao,
      })
      // Também não grava: a imagem aparece no modal e a pessoa escolhe se a quer como capa.
      return NextResponse.json({ imagem_url: img.url })
    } catch (e) {
      return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 502 })
    }
  }

  if (accao === 'sincronizar_preco') {
    try {
      const s = await sincronizarPrecoNoStripe(actual)
      return NextResponse.json({ ...s, precoNoStripe: await lerPrecoDoStripe(s.stripePriceId) })
    } catch (e) {
      return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 502 })
    }
  }

  // ── A edição de campos ──────────────────────────────────────────────────────────────────
  //
  // Só o que o PAPEL permite. Um campo fora da lista é ignorado em silêncio e não é erro: o
  // formulário do educador manda o objecto todo, e recusar o pedido porque ele incluiu um campo
  // que não pode mexer transformava uma gravação normal num erro sem explicação.

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const permitidos = camposPermitidos(quem.papel)

  for (const campo of permitidos) {
    if (!(campo in b)) continue
    if (campo === 'tipo') { patch.tipo = tipoValido(b.tipo); continue }
    if (campo === 'preco_cents') { patch.preco_cents = Math.max(0, Math.round(Number(b.preco_cents) || 0)); continue }
    if (campo === 'campanha_pct') {
      // Presa no `check` da coluna também (0–90); aqui é para o número chegar limpo.
      const n = Number(b.campanha_pct)
      patch.campanha_pct = Number.isFinite(n) ? Math.min(90, Math.max(0, n)) : 0
      continue
    }
    if (campo === 'recorrente' || campo === 'requer_morada' || campo === 'activo') {
      patch[campo] = b[campo] === true
      continue
    }
    patch[campo] = b[campo] ?? null
  }

  if (accao === 'publicar') {
    const def = await lerDefinicoes()
    const vendedor = actual.educator_id ? await garantirVendedor(actual.educator_id) : null
    const r2 = podePublicar({ ...actual, ...patch } as Parameters<typeof podePublicar>[0], vendedor, def)
    if (!r2.pode) return NextResponse.json({ error: r2.motivo, code: 'nao_publicavel' }, { status: 400 })

    // O ADMIN publica; o educador PEDE. `estadoAoPublicar` devolve 'em_revisao' quando a revisão é
    // obrigatória, e é isso que vale para o educador mesmo que o interruptor esteja desligado —
    // porque quem responde por um curso mau é a MTM, cuja marca vai em cima do produto.
    patch.estado = quem.papel === 'admin' ? 'publicado' : estadoAoPublicar(def)
    patch.motivo_recusa = null
    if (patch.estado === 'publicado') {
      patch.publicado_em = new Date().toISOString()
      if (quem.papel === 'admin') {
        patch.revisto_por = quem.adminId
        patch.revisto_em = new Date().toISOString()
      }
    }
  } else if (accao === 'retirar') {
    // O educador pode sempre tirar o que é dele de circulação, sem pedir licença a ninguém.
    patch.estado = 'retirado'
  } else if (accao === 'recusar') {
    if (quem.papel !== 'admin') return naoEncontrado()
    patch.estado = 'rascunho'
    patch.motivo_recusa = String(b.motivo ?? '').slice(0, 500) || 'Sem motivo indicado.'
    patch.revisto_por = quem.adminId
    patch.revisto_em = new Date().toISOString()
  }

  const db = getSupabaseAdmin()
  let q = db.from('marketplace_produtos').update(patch).eq('id', id)
  // Cinto E suspensórios. `produtoSobGestao` já confirmou o direito; este filtro garante que, mesmo
  // que alguém reordene o código acima e a verificação se perca, o UPDATE de um educador não
  // alcança a linha de outro. Uma verificação em memória que se pode contornar reordenando linhas
  // não é uma garantia; um filtro no WHERE é.
  if (quem.papel === 'educador') q = q.eq('educator_id', quem.educatorId).eq('dono', 'educador')

  const { data, error } = await q.select(COLUNAS_GESTAO).maybeSingle()
  if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
  if (!data) return naoEncontrado()

  // Se o preço mudou e o produto já tem preço no Stripe, alinha-se. Assim o educador não tem de se
  // lembrar de carregar em «sincronizar» depois de mudar o número — esquecer-se disso era vender
  // pelo preço antigo sem dar por nada.
  const produto = data as unknown as ProdutoGerido
  let avisoStripe: string | null = null
  if ('preco_cents' in patch && produto.stripe_price_id && produto.preco_cents > 0) {
    try {
      await sincronizarPrecoNoStripe(produto)
    } catch (e) {
      avisoStripe = `O produto foi gravado, mas o preço no Stripe não foi actualizado: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  return NextResponse.json({ produto, avisoStripe })
}

// ── DELETE ────────────────────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const quem = await quemGere()
  if (!quem) return semSessao()

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  const r = await produtoSobGestao(id, quem)
  if (!r.produto) return r.motivo === 'sem_sessao' ? semSessao() : naoEncontrado()

  // Só rascunhos se apagam. Um produto que já esteve à venda pode ter compras agarradas a ele, e
  // apagá-lo deixava alguém com um recibo de uma coisa que não existe. Para esses há `retirar`.
  let q = getSupabaseAdmin().from('marketplace_produtos').delete().eq('id', id).eq('estado', 'rascunho')
  if (quem.papel === 'educador') q = q.eq('educator_id', quem.educatorId).eq('dono', 'educador')

  const { data, error } = await q.select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Só se apagam rascunhos. Usa «retirar».' }, { status: 409 })
  return NextResponse.json({ apagado: true })
}
