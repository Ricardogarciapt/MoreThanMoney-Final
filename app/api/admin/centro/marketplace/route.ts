/**
 * O MARKETPLACE VISTO DO LADO DE QUEM RESPONDE POR ELE.
 *
 * GET  → os interruptores, os vendedores, os produtos à espera de revisão, e as vendas.
 * POST → as acções: ligar/desligar, aprovar, recusar, retirar, mudar a partilha.
 *
 * Embrulhado em `soAdmin`, como todas as rotas do Centro — e é o `centro.check.ts` que verifica
 * que continua embrulhado: ele varre `app/api/admin/centro/**` e falha se encontrar um handler
 * exportado sem a guarda.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { PARTILHA_MAX_PCT, PARTILHA_MIN_PCT, extractoDoEducador, partilhaValida } from '@/lib/marketplace/regras'
import { guardarDefinicoes, lerDefinicoes } from '@/lib/marketplace/servidor'

export const dynamic = 'force-dynamic'

export const GET = soAdmin(async () => {
  const db = getSupabaseAdmin()
  const [def, { data: produtos }, { data: vendedores }, { data: educadores }, { data: compras }] = await Promise.all([
    lerDefinicoes(),
    db
      .from('marketplace_produtos')
      .select('id, slug, titulo, tipo, preco_cents, moeda, estado, activo, partilha_pct, stripe_price_id, educator_id, motivo_recusa, publicado_em, created_at')
      .order('created_at', { ascending: false })
      .limit(300),
    db.from('marketplace_educadores').select('educator_id, activo, partilha_pct, stripe_connect_account_id, notas'),
    db.from('lms_educators').select('id, display_name, specialty, is_active').order('created_at'),
    db
      .from('marketplace_compras')
      .select('id, produto_id, educator_id, comprador_id, estado, bruto_cents, parte_educador_cents, parte_casa_cents, moeda, pago_em')
      .order('pago_em', { ascending: false })
      .limit(300),
  ])

  const vendedorPorId = new Map((vendedores ?? []).map((v) => [v.educator_id as string, v]))
  const comprasLista = compras ?? []

  // O quadro que o dono quer de relance: por educador, quanto vendeu e quanto lhe falta pagar.
  const porEducador = (educadores ?? []).map((e) => {
    const minhas = comprasLista.filter((c) => c.educator_id === e.id)
    const v = vendedorPorId.get(e.id as string)
    return {
      educator_id: e.id,
      nome: e.display_name,
      specialty: e.specialty,
      vende: Boolean(v),
      activo: v?.activo === true,
      partilha_pct: v?.partilha_pct ?? null,
      temContaStripe: Boolean(v?.stripe_connect_account_id),
      produtos: (produtos ?? []).filter((p) => p.educator_id === e.id).length,
      ...extractoDoEducador(minhas as unknown as Parameters<typeof extractoDoEducador>[0]),
    }
  })

  const pagas = comprasLista.filter((c) => c.estado === 'paga')
  return NextResponse.json(
    {
      definicoes: def,
      limites: { min: PARTILHA_MIN_PCT, max: PARTILHA_MAX_PCT },
      educadores: porEducador,
      produtos: produtos ?? [],
      // O que espera decisão vem à cabeça: é a fila de trabalho, não uma estatística.
      porRever: (produtos ?? []).filter((p) => p.estado === 'em_revisao'),
      vendas: comprasLista.slice(0, 50),
      totais: {
        vendas: pagas.length,
        brutoCents: pagas.reduce((s, c) => s + (c.bruto_cents || 0), 0),
        paraEducadoresCents: pagas.reduce((s, c) => s + (c.parte_educador_cents || 0), 0),
        paraCasaCents: pagas.reduce((s, c) => s + (c.parte_casa_cents || 0), 0),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})

export const POST = soAdmin(async (adminId: string, request: NextRequest) => {
  const b = await request.json().catch(() => ({}))
  const db = getSupabaseAdmin()
  const accao = String(b.accao ?? '')

  switch (accao) {
    // ── Os interruptores ──────────────────────────────────────────────────────────────────
    case 'definicoes': {
      const patch: Record<string, unknown> = {}
      if ('ligado' in b) patch.ligado = b.ligado === true
      if ('revisaoObrigatoria' in b) patch.revisaoObrigatoria = b.revisaoObrigatoria === true
      if ('iosVitrine' in b) patch.iosVitrine = b.iosVitrine === 'esconder' ? 'esconder' : 'ver_sem_comprar'
      return NextResponse.json({ definicoes: await guardarDefinicoes(patch, adminId) })
    }

    // ── O interruptor de um educador, e o acordo dele ─────────────────────────────────────
    case 'vendedor': {
      const educatorId = String(b.educator_id ?? '')
      if (!educatorId) return NextResponse.json({ error: 'educator_id é obrigatório' }, { status: 400 })
      const linha: Record<string, unknown> = { educator_id: educatorId, updated_at: new Date().toISOString() }
      if ('activo' in b) linha.activo = b.activo === true
      // A partilha é cortada ao TECTO de 90 antes de tocar na base. O número está prometido em
      // público na /criadores: um 50 escrito por engano no painel é um contrato quebrado.
      if ('partilha_pct' in b) linha.partilha_pct = partilhaValida(b.partilha_pct)
      if ('stripe_connect_account_id' in b) linha.stripe_connect_account_id = b.stripe_connect_account_id || null
      if ('notas' in b) linha.notas = b.notas || null
      const { data, error } = await db.from('marketplace_educadores').upsert(linha, { onConflict: 'educator_id' }).select().maybeSingle()
      if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
      return NextResponse.json({ vendedor: data })
    }

    // ── A fila de revisão ─────────────────────────────────────────────────────────────────
    case 'aprovar':
    case 'recusar':
    case 'retirar':
    case 'produto': {
      const id = String(b.id ?? '')
      if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        revisto_por: adminId,
        revisto_em: new Date().toISOString(),
      }
      if (accao === 'aprovar') {
        patch.estado = 'publicado'
        patch.publicado_em = new Date().toISOString()
        patch.motivo_recusa = null
      } else if (accao === 'recusar') {
        // Volta a rascunho COM o motivo escrito. Recusar sem dizer porquê obriga o educador a
        // adivinhar, e ele volta a submeter a mesma coisa.
        patch.estado = 'rascunho'
        patch.motivo_recusa = String(b.motivo ?? '').slice(0, 500) || 'Sem motivo indicado.'
      } else if (accao === 'retirar') {
        patch.estado = 'retirado'
      } else {
        if ('activo' in b) patch.activo = b.activo === true
        if ('partilha_pct' in b) patch.partilha_pct = b.partilha_pct == null ? null : partilhaValida(b.partilha_pct)
        if ('stripe_price_id' in b) patch.stripe_price_id = b.stripe_price_id || null
        if ('apple_product_id' in b) patch.apple_product_id = b.apple_product_id || null
      }
      const { data, error } = await db.from('marketplace_produtos').update(patch).eq('id', id).select().maybeSingle()
      if (error) return NextResponse.json({ error: error.message.slice(0, 300) }, { status: 400 })
      return NextResponse.json({ produto: data })
    }

    default:
      return NextResponse.json({ error: `Acção desconhecida: ${accao}` }, { status: 400 })
  }
})
