/**
 * OS CÓDIGOS DE DESCONTO DO EDUCADOR — os dele, e só sobre o que é dele.
 *
 * GET    → os meus códigos, com os usos contados
 * POST   → criar um
 * PATCH  → ligar/desligar
 *
 * ── PORQUE É QUE ISTO NÃO É A ROTA DO ADMIN COM UM `if` ───────────────────────────────────
 *
 * `/api/admin/coupons` é `requireAdmin` e cria cupões para a casa toda — packs do site, MTM Funded,
 * parcerias, Apple. Um educador não pode chegar lá, e abrir-lhe uma fresta com um `if` punha do
 * mesmo lado da porta quem pode dar 50% num curso e quem pode dar 50% numa subscrição anual do
 * site. São dois poderes muito diferentes com o mesmo aspecto.
 *
 * Aqui o âmbito NÃO É UM CAMPO DO FORMULÁRIO: é imposto pela sessão. Um educador sai daqui sempre
 * com um cupão preso a ele ou a um produto dele, porque não há caminho neste ficheiro que produza
 * outra coisa. É a mesma doutrina do `educator_id` em `gestao/route.ts` — vem da SESSÃO e nunca do
 * corpo, que é o que impede criar em nome de outra pessoa.
 *
 * ── O QUE NÃO VAI AO STRIPE ───────────────────────────────────────────────────────────────
 *
 * Nenhum código daqui vira *promotion code* no Stripe. Um promotion code é resgatável em QUALQUER
 * sessão de checkout da conta da casa: um código de 50% feito para um curso passaria a ser
 * escrevível na caixa de desconto do checkout dos packs. O checkout do marketplace valida o código
 * contra a nossa tabela e constrói o desconto na sessão, e é só ali que ele vale.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { quemGere } from '@/lib/marketplace/gestao'
import { AMBITO_MARKETPLACE, CUPAO_MAX_PCT, normalizarCodigo } from '@/lib/marketplace/cupoes'

export const dynamic = 'force-dynamic'

const semSessao = () => NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

const COLUNAS =
  'id, code, discount_value, is_active, valid_from, valid_until, max_uses, description, ' +
  'marketplace_produto_id, marketplace_educator_id, criado_por_educador, created_at'

/**
 * A forma da linha, escrita à mão.
 *
 * A lista de colunas é uma string montada com `+` para caber legível, e quando isso acontece o
 * Supabase deixa de inferir o tipo do `select` e devolve `GenericStringError`. É a mesma nota que
 * está no checkout, e declarar a forma é melhor do que um `any`.
 */
type LinhaCupao = {
  id: string
  code: string
  discount_value: number
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  max_uses: number | null
  description: string | null
  marketplace_produto_id: string | null
  marketplace_educator_id: string | null
  criado_por_educador: string | null
  created_at: string
}

// ── GET ───────────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const quem = await quemGere()
  if (!quem) return semSessao()
  // Esta rota é do ESTÚDIO. Um admin tem o painel dele em /admin/coupons, com a loja toda — e duas
  // portas para a mesma tabela com listas diferentes é como se acaba a apagar no sítio errado.
  if (quem.papel !== 'educador') {
    return NextResponse.json({ error: 'Os cupões da casa gerem-se no /admin/coupons.' }, { status: 403 })
  }

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('coupons')
    .select(COLUNAS)
    .eq('criado_por_educador', quem.educatorId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })

  const cupoes = (data ?? []) as unknown as LinhaCupao[]
  // Os usos contam-se em `coupon_usages` e NUNCA em `coupons.used_count`: esse contador nunca foi
  // incrementado desde 25/09, e um número que não sobe lido como «quantos já usaram» faz o educador
  // achar que o código dele não pegou.
  const ids = cupoes.map((c) => c.id as string)
  const contagem = new Map<string, number>()
  if (ids.length > 0) {
    const { data: usos } = await db.from('coupon_usages').select('coupon_id').in('coupon_id', ids)
    for (const u of usos ?? []) {
      const k = String((u as { coupon_id?: unknown }).coupon_id ?? '')
      if (k) contagem.set(k, (contagem.get(k) ?? 0) + 1)
    }
  }

  return NextResponse.json(
    {
      maxPct: CUPAO_MAX_PCT,
      cupoes: cupoes.map((c) => ({ ...c, usos: contagem.get(String(c.id)) ?? 0 })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// ── POST: criar ───────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const quem = await quemGere()
  if (!quem) return semSessao()
  if (quem.papel !== 'educador') {
    return NextResponse.json({ error: 'Os cupões da casa criam-se no /admin/coupons.' }, { status: 403 })
  }

  const b = await request.json().catch(() => ({}))
  const codigo = normalizarCodigo(b.code)
  if (codigo.length < 3) {
    return NextResponse.json({ error: 'O código tem de ter pelo menos 3 letras.' }, { status: 400 })
  }

  const pct = Math.round(Number(b.discount_value) || 0)
  if (!(pct > 0)) return NextResponse.json({ error: 'Indica a percentagem de desconto.' }, { status: 400 })
  if (pct > CUPAO_MAX_PCT) {
    // Cortar em silêncio era prometer 95% a quem escreveu 95 e dar 90. Um limite que não se diz é
    // uma surpresa no extracto.
    return NextResponse.json({ error: `O desconto máximo é ${CUPAO_MAX_PCT}%.` }, { status: 400 })
  }

  const db = getSupabaseAdmin()

  // ── O ÂMBITO, IMPOSTO E NÃO PEDIDO ──────────────────────────────────────────────────────
  //
  // Só há duas hipóteses, e as duas apontam para este educador. Um produto indicado no corpo é
  // CONFIRMADO contra a tabela — sem isto, um id de produto de outra pessoa criava um cupão que
  // descontava a loja dela, e a conta do desconto sai da venda, ou seja, do bolso dela.
  let produtoDoAmbito: string | null = null
  const pedido = String(b.marketplace_produto_id ?? '').trim()
  if (pedido) {
    const { data: meu } = await db
      .from('marketplace_produtos')
      .select('id')
      .eq('id', pedido)
      .eq('educator_id', quem.educatorId)
      .eq('dono', 'educador')
      .maybeSingle()
    if (!meu) return NextResponse.json({ error: 'Esse produto não é teu.' }, { status: 404 })
    produtoDoAmbito = meu.id as string
  }

  const { data: ocupado } = await db.from('coupons').select('id').eq('code', codigo).maybeSingle()
  if (ocupado) {
    return NextResponse.json({ error: `Já existe um código "${codigo}".` }, { status: 409 })
  }

  const { data, error } = await db
    .from('coupons')
    .insert({
      code: codigo,
      type: 'discount_pct',
      discount_value: pct,
      plan_override: AMBITO_MARKETPLACE,
      // Preso ao produto, OU a tudo o que é deste educador. Nunca aos dois, e nunca a nenhum — o
      // `check coupons_educador_tem_ambito` da base recusaria a linha, e aqui nem se chega lá.
      marketplace_produto_id: produtoDoAmbito,
      marketplace_educator_id: produtoDoAmbito ? null : quem.educatorId,
      criado_por_educador: quem.educatorId,
      max_uses: Number(b.max_uses) > 0 ? Math.floor(Number(b.max_uses)) : null,
      used_count: 0,
      valid_from: new Date().toISOString(),
      valid_until: b.valid_until ? new Date(b.valid_until).toISOString() : null,
      description: String(b.description ?? '').slice(0, 300) || null,
      is_active: true,
    })
    .select(COLUNAS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
  return NextResponse.json({ cupao: { ...(data as unknown as LinhaCupao), usos: 0 } })
}

// ── PATCH: ligar/desligar ─────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  const quem = await quemGere()
  if (!quem) return semSessao()
  if (quem.papel !== 'educador') return NextResponse.json({ error: 'Não é daqui.' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  const id = String(b.id ?? '')
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  // O filtro no WHERE e não uma verificação em memória. Cinto e suspensórios, como no UPDATE dos
  // produtos: uma verificação que se contorna reordenando linhas não é uma garantia.
  const { data, error } = await getSupabaseAdmin()
    .from('coupons')
    .update({ is_active: b.is_active === true })
    .eq('id', id)
    .eq('criado_por_educador', quem.educatorId)
    .select(COLUNAS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Código não encontrado' }, { status: 404 })
  return NextResponse.json({ cupao: data })
}
