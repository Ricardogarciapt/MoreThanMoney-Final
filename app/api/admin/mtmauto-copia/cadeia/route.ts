import { NextRequest, NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import {
  carregarCadeia, criarContasDoQuadro, guardarDisposicao, ligarSubscritor, moverSubscritor,
} from '@/lib/copia-contas/servidor/cadeia'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * A CADEIA «quem copia o quê»: fonte de sinais → conta mestre (estratégia) → subscritores.
 *
 *   GET                                              → a árvore inteira (vista simples + quadro)
 *   POST { accao: 'disposicao', nos }                → guarda as posições dos nós (só desenho)
 *   POST { accao: 'ligar'|'desligar', ref, slug }    → o cliente passa (ou deixa) de seguir a estratégia
 *   POST { accao: 'mover', ref, de, para }           → arrastar: liga à nova, desliga da antiga
 *   POST { accao: 'criar-contas', userId, slugs }    → contas simuladas + subscrições (idempotente)
 *
 * Tudo passa pelos serviços que já existem (mtmcopy_connections.strategy_lots /
 * mtmauto_subscriptions / lib/mtmfunded/contas-estrategia) e é RESSINCRONIZADO com
 * lib/mestres/servidor/sincronizar-rotas — nunca se escreve uma rota à mão.
 */
export const GET = soAdmin(async () => NextResponse.json(await carregarCadeia()))

const REF = /^(site|auto|wt|funded|prov):[0-9a-f-]{36}$/i
const SLUG = /^[a-z0-9][a-z0-9._-]{0,60}$/i
const UUID = /^[0-9a-f-]{36}$/i

export const POST = soAdmin(async (adminId: string, req: NextRequest) => {
  const c = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const accao = String(c.accao ?? '')
  const ref = String(c.ref ?? '')
  const slug = String(c.slug ?? '')

  switch (accao) {
    case 'disposicao': {
      const r = await guardarDisposicao(adminId, c.nos)
      return NextResponse.json(r, { status: r.status })
    }
    case 'ligar':
    case 'desligar': {
      if (!REF.test(ref)) return NextResponse.json({ error: 'referência de conta inválida' }, { status: 400 })
      if (!SLUG.test(slug)) return NextResponse.json({ error: 'slug inválido' }, { status: 400 })
      const lote = c.lote == null || c.lote === '' ? null : Number(c.lote)
      if (lote != null && !(lote > 0 && lote <= 100)) return NextResponse.json({ error: 'lote fora de 0–100' }, { status: 400 })
      const r = await ligarSubscritor(adminId, { ref, slug, ligar: accao === 'ligar', lote })
      return NextResponse.json(r, { status: r.status })
    }
    case 'mover': {
      const de = String(c.de ?? '')
      const para = String(c.para ?? '')
      if (!REF.test(ref)) return NextResponse.json({ error: 'referência de conta inválida' }, { status: 400 })
      if (!SLUG.test(de) || !SLUG.test(para)) return NextResponse.json({ error: 'slug inválido' }, { status: 400 })
      if (de.toLowerCase() === para.toLowerCase()) return NextResponse.json({ error: 'a origem e o destino são a mesma estratégia' }, { status: 400 })
      const r = await moverSubscritor(adminId, { ref, de, para })
      return NextResponse.json(r, { status: r.status })
    }
    case 'criar-contas': {
      const userId = String(c.userId ?? '')
      const slugs = Array.isArray(c.slugs) ? c.slugs.map(String).filter((s) => SLUG.test(s)).slice(0, 20) : []
      if (!UUID.test(userId)) return NextResponse.json({ error: 'userId inválido' }, { status: 400 })
      if (!slugs.length) return NextResponse.json({ error: 'escolhe pelo menos uma estratégia' }, { status: 400 })
      const saldo = c.saldo == null ? undefined : Number(c.saldo)
      if (saldo != null && !(saldo >= 100 && saldo <= 1_000_000)) return NextResponse.json({ error: 'saldo fora de 100–1 000 000' }, { status: 400 })
      const r = await criarContasDoQuadro(adminId, { userId, slugs, saldo })
      return NextResponse.json(r, { status: r.status })
    }
    default:
      return NextResponse.json({ error: 'acção inválida' }, { status: 400 })
  }
})
