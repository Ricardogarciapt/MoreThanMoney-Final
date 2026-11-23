import { NextRequest, NextResponse } from 'next/server'
import { excedeLimite, hashIp, validarPedido } from '@/lib/pedido-contacto'
import { contarRecentes, registarPedidoDeContacto } from '@/lib/pedido-contacto-registo'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Íman de leads da app «Missão» (landing /ricardogarcia).
 * Nome + email + WhatsApp + objectivo + consentimento → acesso à app.
 * Mesmo circuito do «Quero que me liguem» e do e-book grátis:
 *  · validarPedido (honeypot, telefone, email, caixas EXACTAMENTE true);
 *  · registarPedidoDeContacto (pedidos_contacto, livro de consentimento, tarefa do setter, aviso);
 *  · e uma linha no CRM (vendas_negocios, funil educacao, etiqueta «app-ricardo»).
 * Depois disto o ecrã abre a app com o registo já preenchido; a conta cria-se lá, com palavra-passe.
 */
const ORIGEM = 'app-ricardo'
const OBJECTIVOS: Record<string, string> = {
  corpo: 'Ganhar forma e energia',
  mente: 'Cabeça mais forte e calma',
  digital: 'Aprender IA e negócio digital',
  disciplina: 'Ganhar disciplina e rotina',
}

export async function POST(req: NextRequest) {
  let b: Record<string, unknown> = {}
  try { b = (await req.json()) as Record<string, unknown> } catch {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 })
  }
  const objectivo = String(b.objectivo ?? '')
  if (!b.email) return NextResponse.json({ ok: false, erros: { email: 'Escreve o teu email.' } }, { status: 400 })

  const v = validarPedido({
    nome: b.nome, indicativo: b.indicativo, telefone: b.telefone, email: b.email,
    interesse: 'formacao', melhorHora: 'qualquer',
    consentimentos: (b.consentimentos as { whatsapp?: unknown; email?: unknown } | null) ?? null,
    origem: ORIGEM, site: b.site,
  }, req.headers.get('referer'))
  if (!v.ok) {
    if (v.descartar) return NextResponse.json({ ok: true })
    return NextResponse.json({ ok: false, erros: v.erros }, { status: 400 })
  }
  if (!(objectivo in OBJECTIVOS)) return NextResponse.json({ ok: false, erros: { objectivo: 'Escolhe o teu objectivo.' } }, { status: 400 })

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || ''
  const ipHash = ip ? hashIp(ip, process.env.PEDIDO_CONTACTO_SAL || process.env.CRON_SECRET || '') : null
  const p = v.pedido
  try {
    const recentes = await contarRecentes({ ipHash, telefone: p.telefone })
    // Quem repete o formulário já está registado: deixa-se seguir para a app sem gravar outra vez.
    if (excedeLimite(recentes)) return NextResponse.json({ ok: true, repetido: true })
    const r = await registarPedidoDeContacto({ pedido: p, linhas: v.linhas, fonte: 'site', ipHash })
    if (!r.ok) return NextResponse.json({ ok: false, erro: 'Não foi possível guardar. Tenta outra vez.' }, { status: 500 })
    const respostas = { objectivo: OBJECTIVOS[objectivo] }
    if (r.pedidoId) {
      const { error } = await getSupabaseAdmin().from('pedidos_contacto').update({ respostas }).eq('id', r.pedidoId)
      if (error) console.error('[app-ricardo] íman respostas:', error.message)
    }
    await noCrm({ nome: p.nome, email: p.email!, telefone: p.telefone, objectivo: OBJECTIVOS[objectivo], canais: p.canais, pedidoId: r.pedidoId })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[app-ricardo] íman:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, erro: 'Não foi possível guardar. Tenta outra vez.' }, { status: 500 })
  }
}

async function noCrm(l: { nome: string; email: string; telefone: string; objectivo: string; canais: string[]; pedidoId?: string }) {
  const db = getSupabaseAdmin()
  const nota = `Íman de leads da app «Missão» (landing /ricardogarcia). Objectivo: ${l.objectivo}. Consentiu: ${l.canais.join(', ')}.`
  try {
    const { data: ex } = await db.from('vendas_negocios').select('id, etiquetas, telefone, nota').ilike('email', l.email).limit(1).maybeSingle()
    if (ex?.id) {
      const etiquetas = Array.from(new Set([...((ex.etiquetas as string[]) || []), ORIGEM, 'iman-de-leads']))
      await db.from('vendas_negocios').update({
        etiquetas, telefone: ex.telefone || l.telefone,
        nota: [ex.nota, nota].filter(Boolean).join('\n').slice(0, 4000), atualizado_em: new Date().toISOString(),
      }).eq('id', ex.id)
    } else {
      await db.from('vendas_negocios').insert({
        nome: l.nome.slice(0, 120), email: l.email, telefone: l.telefone, estado: 'lead', funil: 'educacao',
        origem: ORIGEM, interesse: 'formacao', chave_origem: `${ORIGEM}:${l.pedidoId || l.email}`, etiquetas: [ORIGEM, 'iman-de-leads'], nota,
      })
    }
  } catch (e) { console.error('[app-ricardo] íman não ligou ao CRM:', e) }
}
