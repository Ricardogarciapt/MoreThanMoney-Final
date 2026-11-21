import { NextRequest, NextResponse } from 'next/server'
import { escolherIdioma } from '@/lib/site-solucoes/i18n/base'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { chamarIAGratis } from '@/lib/ia/chamar'
import { hashIp } from '@/lib/pedido-contacto'
import { avisarDonoSolucoes, escHtml } from '@/lib/site-solucoes/avisar-dono'
import {
  LIMITE_PROTOTIPOS_IP_HORA,
  limparPrototipo,
  novoSlug,
  promptPrototipo,
  prototipoBase,
  validarPedidoPrototipo,
  type EntradaPrototipo,
} from '@/lib/site-solucoes/prototipo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST «Receber o protótipo da minha solução». Público, por isso honeypot, consentimento e 3 por
 * IP por hora. O protótipo base sai sempre; a IA grátis só lhe acrescenta texto (12 s no máximo).
 * Entra no CRM como negócio B2B (sem duplicar por email) e avisa o dono no Telegram.
 */
export async function POST(req: NextRequest) {
  let corpo: EntradaPrototipo & { idioma?: unknown } = {}
  try {
    corpo = (await req.json()) as typeof corpo
  } catch {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 })
  }

  const v = validarPedidoPrototipo(corpo)
  if (!v.ok) {
    if ('descartar' in v && v.descartar) return NextResponse.json({ ok: true, slug: null })
    return NextResponse.json({ ok: false, erros: 'erros' in v ? v.erros : {} }, { status: 400 })
  }
  const pedido = v.pedido

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || ''
  const ipHash = ip ? hashIp(ip, process.env.PEDIDO_CONTACTO_SAL || process.env.CRON_SECRET || '') : null
  const db = getSupabaseAdmin()

  if (ipHash) {
    const desde = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await db.from('prototipos_solucao').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('criado_em', desde)
    if ((count ?? 0) >= LIMITE_PROTOTIPOS_IP_HORA) {
      return NextResponse.json({ ok: false, erro: 'Já preparámos os teus protótipos desta hora. Marca a reunião e falamos.' }, { status: 429 })
    }
  }

  const idioma = escolherIdioma({ pedido: typeof corpo.idioma === 'string' ? corpo.idioma : null })
  const base = prototipoBase(pedido)
  let spec = base
  let fornecedor: string | null = null
  try {
    const { sistema, mensagem } = promptPrototipo(pedido, base, idioma)
    const r = await chamarIAGratis({
      sistema,
      mensagens: [{ role: 'user', content: mensagem }],
      json: true,
      maxTokens: 900,
      temperatura: 0.5,
      tarefa: 'solucoes-prototipo',
      preferencia: 'qualidade',
      timeoutMs: 12_000,
    })
    spec = limparPrototipo(base, r.texto)
    if (spec.ia) fornecedor = r.fornecedor
  } catch (e) {
    console.error('[solucoes/prototipo] IA indisponível, segue o protótipo base:', e instanceof Error ? e.message : e)
  }

  const negocioId = await ligarAoCRM(pedido, spec.solucoes.map((s) => s.nome))

  const slug = novoSlug(pedido.empresa)
  const { error } = await db.from('prototipos_solucao').insert({
    slug,
    nome: pedido.nome,
    email: pedido.email,
    telefone: pedido.telefone,
    empresa: pedido.empresa,
    sector: spec.sector,
    solucoes: pedido.solucoes,
    cor: spec.cor,
    spec,
    ia_fornecedor: fornecedor,
    ip_hash: ipHash,
    proposta: pedido.proposta,
    negocio_id: negocioId,
  })
  if (error) {
    console.error('[solucoes/prototipo] gravar falhou:', error.message)
    return NextResponse.json({ ok: false, erro: 'Não foi possível preparar o protótipo. Tenta outra vez.' }, { status: 500 })
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt'
  await avisarDonoSolucoes(
    [
      '🧪 <b>Protótipo gerado</b> (falta marcar reunião)',
      `${escHtml(pedido.empresa)} · ${escHtml(spec.sector)}${pedido.cidade ? ` · ${escHtml(pedido.cidade)}` : ''}`,
      `${escHtml(pedido.nome)} · ${escHtml(pedido.email)} · ${escHtml(pedido.telefone)}`,
      `Soluções: ${spec.solucoes.map((s) => escHtml(s.nome)).join(', ')}`,
      pedido.dores ? `«${escHtml(pedido.dores.slice(0, 300))}»` : '',
      pedido.proposta ? `Proposta ${escHtml(pedido.proposta)}` : '',
      `IA: ${fornecedor ? escHtml(fornecedor) : 'sem IA (base)'}`,
      `${site}/solucoes/prototipo/${slug}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return NextResponse.json({ ok: true, slug })
}

/** Negócio B2B no CRM. Se o email já lá estiver, junta a etiqueta e a nota, sem criar outro. */
async function ligarAoCRM(p: { nome: string; email: string; telefone: string; empresa: string; proposta: string | null }, solucoes: string[]): Promise<string | null> {
  try {
    const db = getSupabaseAdmin()
    const nota = `Pediu protótipo (${p.empresa}): ${solucoes.join(', ')}.${p.proposta ? ` Proposta ${p.proposta}.` : ''}`
    const { data: existente } = await db.from('vendas_negocios').select('id, etiquetas').ilike('email', p.email).limit(1).maybeSingle()
    if (existente?.id) {
      const etiquetas = [...new Set([...((existente.etiquetas as string[] | null) ?? []), 'b2b', 'prototipo'])]
      await db.from('vendas_negocios').update({ etiquetas, nota, atualizado_em: new Date().toISOString() }).eq('id', existente.id)
      return String(existente.id)
    }
    const { data: novo } = await db
      .from('vendas_negocios')
      .insert({ nome: p.nome.slice(0, 120), email: p.email, telefone: p.telefone, estado: 'qualificado', origem: 'prototipo', chave_origem: `prototipo:${p.email}`, etiquetas: ['b2b', 'prototipo'], nota })
      .select('id')
      .maybeSingle()
    return novo?.id ? String(novo.id) : null
  } catch (e) {
    console.error('[solucoes/prototipo] CRM falhou (o protótipo segue):', e instanceof Error ? e.message : e)
    return null
  }
}
