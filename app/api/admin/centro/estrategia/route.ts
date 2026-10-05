import { NextRequest, NextResponse } from 'next/server'
import { soQuemDecide } from '@/lib/admin-centro/servidor/quem-decide'
import { carregarFicha, listarEstrategias } from '@/lib/admin-centro/servidor/estrategia-ficha'
import { escreverEstrategia } from '@/lib/admin-centro/servidor/estrategia-escrita'
import { equipaDaVista } from '@/lib/admin-centro/estrategia-escrita-plano'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * A ESTRATÉGIA — o único sítio onde se decide (decisão do dono, 05/10).
 *
 *   GET  ?e=<slug|id>                 → a página: fonte → mestre → rotas → subscritores + contradições
 *   GET  ?lista=1[&equipa=<tenant>]   → as estratégias no âmbito de quem pede (a aba da MTM Auto lê daqui)
 *   POST { accao, providerId|slug, … } → `escreverEstrategia` (guarda de equipa, regra única, auditoria)
 *
 * Quem entra: o admin do site (tudo) ou um admin da MTM Auto pelo Bearer dele — o franchisado vê e
 * escreve SÓ as estratégias da sua equipa e nunca o motor da casa (403).
 */
const semCache = { 'Cache-Control': 'no-store' }

export const GET = soQuemDecide(async (quem, req: NextRequest) => {
  const sp = req.nextUrl.searchParams
  if (sp.get('lista')) {
    const vista = equipaDaVista(quem, sp.get('equipa'))
    return NextResponse.json({ estrategias: await listarEstrategias(quem, vista), superAdmin: quem.tudo, equipa: vista.tenantId }, { headers: semCache })
  }
  const ref = String(sp.get('e') ?? '').trim()
  if (!ref) return NextResponse.json({ error: 'Falta a estratégia (?e=slug).' }, { status: 400 })
  const r = await carregarFicha(quem, ref)
  return r.ok ? NextResponse.json(r.ficha, { headers: semCache }) : NextResponse.json({ error: r.erro }, { status: r.status })
})

export const POST = soQuemDecide(async (quem, req: NextRequest) => {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const r = await escreverEstrategia(quem, { ...corpo, accao: String(corpo.accao ?? '') })
  return NextResponse.json(
    { ok: r.ok, message: r.mensagem, ...(r.dados ?? {}), ...(r.ok ? {} : { error: r.mensagem }) },
    { status: r.status, headers: semCache },
  )
})
