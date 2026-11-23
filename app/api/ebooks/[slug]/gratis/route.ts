import { NextRequest, NextResponse } from 'next/server'
import { excedeLimite, hashIp, validarPedido } from '@/lib/pedido-contacto'
import { contarRecentes, registarPedidoDeContacto } from '@/lib/pedido-contacto-registo'
import { assinarEbook, ehEbook, linkEbook, partesEbook, type SlugEbook } from '@/lib/ebooks/acesso'
import { freebieDe } from '@/lib/freebies'
import { sendFreebieEmail } from '@/lib/email-service'
import { EBOOKS_GRATIS, validarRespostas } from '@/lib/ebooks/gratis'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/ebooks/<slug>/gratis — e-book grátis em troca de nome, email, WhatsApp e 4 respostas.
 * Grava o lead no mesmo circuito do «Quero que me liguem» (pedidos_contacto + consentimento +
 * tarefa do setter) e devolve um link assinado de 1 ano. Sem os 7 dias de acompanhamento.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // A versão EN/ES de um livro grátis também é grátis: decide-se pelo livro base.
  const base = partesEbook(slug).base
  if (!ehEbook(slug) || !EBOOKS_GRATIS.has(base)) return NextResponse.json({ ok: false, erro: 'não disponível' }, { status: 404 })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { return NextResponse.json({ ok: false, erro: 'pedido inválido' }, { status: 400 }) }

  const aceita = corpo.aceito === true
  const v = validarPedido({
    nome: corpo.nome, indicativo: corpo.indicativo, telefone: corpo.telefone, email: corpo.email,
    interesse: 'formacao', melhorHora: 'qualquer',
    consentimentos: { whatsapp: aceita, email: aceita },
    origem: origemDoPedido(slug, corpo.origem), site: corpo.site,
  }, req.headers.get('referer'))
  if (!v.ok && v.descartar) return NextResponse.json({ ok: true, link: null })

  const erros: Record<string, string> = !v.ok ? { ...v.erros } : {}
  if (!String(corpo.email ?? '').trim()) erros.email = 'Escreve o teu email.'
  if (!aceita) { delete erros.consentimentos; erros.aceito = 'Precisas de aceitar para receberes o e-book.' }
  const r = validarRespostas(corpo.respostas, slug)
  if (!r.ok) Object.assign(erros, r.erros)
  if (Object.keys(erros).length || !v.ok || !r.ok) return NextResponse.json({ ok: false, erros }, { status: 400 })

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || ''
  const freebie = freebieDe(slug)
  const ipHash = ip ? hashIp(ip, process.env.PEDIDO_CONTACTO_SAL || process.env.CRON_SECRET || '') : null
  try {
    const recentes = await contarRecentes({ ipHash, telefone: v.pedido.telefone })
    if (!excedeLimite(recentes)) {
      const reg = await registarPedidoDeContacto({ pedido: v.pedido, linhas: v.linhas, fonte: 'site', ipHash })
      if (reg.pedidoId) {
        const db = getSupabaseAdmin()
        await db.from('pedidos_contacto').update({ respostas: { ebook: slug, ...r.respostas } }).eq('id', reg.pedidoId)
        // Entra também no pipeline de vendas (CRM do backoffice), como o íman da app do Ricardo.
        const { error: eN } = await db.from('vendas_negocios').insert({
          nome: v.pedido.nome, email: v.pedido.email, telefone: v.pedido.telefone,
          origem: v.pedido.origem ?? `ebook:${slug}`, chave_origem: `ebook:${slug}:${reg.pedidoId}`,
          funil: 'educacao', estado: 'lead', interesse: 'formacao', contactavel: true,
          etiquetas: [`ebook-${base}`, 'iman-de-leads', ...(freebie ? [freebie.etiqueta] : [])],
          nota: `E-book grátis «${slug}». Respostas: ${Object.entries(r.respostas).map(([k, x]) => `${k}=${x}`).join(', ')}` +
            (freebie ? ' · Próximo passo: Premium 3 dias grátis → plano Membro.' : ''),
        })
        if (eN) console.warn('[ebook-gratis] não entrou no pipeline:', eN.message)
      }
    }
    const quem = v.pedido.email || v.pedido.telefone || ''
    const link = linkEbook(slug, assinarEbook(slug, 365, quem))
    // Freebies: o link vai também por email, nas três línguas, com o passo seguinte.
    if (freebie && v.pedido.email) {
      const em = (l: 'en' | 'es'): string | undefined => {
        const s2 = `${base}-${l}`
        return ehEbook(s2) ? linkEbook(s2 as SlugEbook, assinarEbook(s2 as SlugEbook, 365, quem)) : undefined
      }
      const pt = ehEbook(base) ? linkEbook(base as SlugEbook, assinarEbook(base as SlugEbook, 365, quem)) : link
      await sendFreebieEmail({ to: v.pedido.email, nome: v.pedido.nome, titulo: freebie.titulo, links: { pt, en: em('en'), es: em('es') } })
        .catch((e) => console.warn('[ebook-gratis] email não saiu:', e instanceof Error ? e.message : e))
    }
    return NextResponse.json({ ok: true, link })
  } catch (e) {
    console.error('[ebook-gratis] erro:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, erro: 'Não foi possível guardar. Tenta outra vez.' }, { status: 500 })
  }
}

/** `ebook:<slug>` com o anúncio que trouxe a pessoa (`?s=&c=&a=`), como as landings /f/*. */
function origemDoPedido(slug: string, origem: unknown): string {
  const o = String(origem ?? '')
  const q = o.includes('?') ? o.slice(o.indexOf('?')) : ''
  return `ebook:${slug}${/^\?[\w=&.-]{0,100}$/.test(q) ? q : ''}`.slice(0, 120)
}
