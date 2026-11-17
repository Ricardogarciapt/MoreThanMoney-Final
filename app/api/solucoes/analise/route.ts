import { escolherIdioma } from '@/lib/site-solucoes/i18n/base'
import { tradutorServidor } from '@/lib/site-solucoes/i18n/servidor'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { chamarIAGratis } from '@/lib/ia/chamar'
import { hashIp } from '@/lib/pedido-contacto'
import {
  LIMITE_ANALISES_IP_HORA,
  limparLeitura,
  promptLeitura,
  relatorioBase,
  validarPedidoAnalise,
  type EntradaAnalise,
} from '@/lib/site-solucoes/analise'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST «Pedir análise ao meu negócio» (/solucoes). Público, por isso:
 *  · honeypot preenchido → 200 sem gravar;
 *  · sem consentimento → 400, nada gravado;
 *  · 3 pedidos por IP por hora → 429.
 * O relatório preliminar é calculado no servidor (não se confia nas contas do browser). A leitura
 * da IA é um extra: se a IA grátis falhar ou demorar, o relatório segue sem ela.
 */
export async function POST(req: NextRequest) {
  let corpo: EntradaAnalise = {}
  try {
    corpo = (await req.json()) as EntradaAnalise
  } catch {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 })
  }

  const v = validarPedidoAnalise(corpo)
  if (!v.ok) {
    if ('descartar' in v && v.descartar) return NextResponse.json({ ok: true })
    return NextResponse.json({ ok: false, erros: 'erros' in v ? v.erros : {} }, { status: 400 })
  }
  const pedido = v.pedido

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || ''
  const ipHash = ip ? hashIp(ip, process.env.PEDIDO_CONTACTO_SAL || process.env.CRON_SECRET || '') : null
  const db = getSupabaseAdmin()

  if (ipHash) {
    const desde = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await db.from('pedidos_analise_negocio').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('criado_em', desde)
    if ((count ?? 0) >= LIMITE_ANALISES_IP_HORA) {
      return NextResponse.json({ ok: false, erro: 'Já recebemos os teus pedidos. Respondemos em breve.' }, { status: 429 })
    }
  }

  const idioma = escolherIdioma({ pedido: typeof (corpo as { idioma?: unknown }).idioma === 'string' ? ((corpo as { idioma?: string }).idioma ?? null) : null })
  const { relatorio } = relatorioBase(pedido, tradutorServidor(idioma))
  let fornecedor: string | null = null
  try {
    const { sistema, mensagem } = promptLeitura(pedido, relatorio, idioma)
    const r = await chamarIAGratis({
      sistema,
      mensagens: [{ role: 'user', content: mensagem }],
      json: true,
      maxTokens: 700,
      temperatura: 0.4,
      tarefa: 'solucoes-analise',
      preferencia: 'qualidade',
      timeoutMs: 12_000,
    })
    const l = limparLeitura(r.texto)
    relatorio.leitura = l.leitura
    relatorio.ideias = l.ideias
    fornecedor = r.fornecedor
  } catch (e) {
    console.error('[solucoes/analise] IA indisponível:', e instanceof Error ? e.message : e)
  }

  const { data, error } = await db
    .from('pedidos_analise_negocio')
    .insert({
      nome: pedido.nome,
      email: pedido.email,
      telefone: pedido.telefone,
      empresa: pedido.empresa,
      site: pedido.site,
      equipa: pedido.equipa,
      dores: pedido.dores,
      sector: pedido.sector,
      horas: pedido.horas,
      custo_hora: pedido.custoHora,
      relatorio,
      ia_fornecedor: fornecedor,
      ip_hash: ipHash,
      origem: (req.headers.get('referer') ?? '').slice(0, 200) || null,
    })
    .select('id')
    .single()
  if (error) {
    console.error('[solucoes/analise] gravar falhou:', error.message)
    return NextResponse.json({ ok: false, erro: 'Não foi possível guardar o pedido. Tenta outra vez.' }, { status: 500 })
  }

  await avisarDono(
    [
      '🧭 <b>Pedido de análise de negócio</b>',
      `${esc(pedido.empresa)} · ${esc(relatorio.sector)} · ${esc(pedido.equipa)}`,
      `${esc(pedido.nome)} · ${esc(pedido.email)}${pedido.telefone ? ` · ${esc(pedido.telefone)}` : ''}`,
      pedido.site ? `Site: ${esc(pedido.site)}` : '',
      `«${esc(pedido.dores.slice(0, 400))}»`,
      `Simulador: ${relatorio.totais.horasSemana} h/semana, ${relatorio.totais.recuperaveisSemana} h recuperáveis`,
      relatorio.oportunidades.length ? `Primeiro: ${relatorio.oportunidades.map((o) => esc(o.area)).join(', ')}` : '',
      `id ${data?.id ?? '?'}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  return NextResponse.json({ ok: true, id: data?.id ?? null, relatorio })
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)

async function avisarDono(texto: string) {
  try {
    const { sendTelegramChannelMessage } = await import('@/lib/mtmcopy/telegram-bot')
    let chat = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || ''
    if (!chat) {
      const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', 'telegram_admin_chat_id').maybeSingle()
      const v = data?.value as { chat_id?: string } | string | null
      chat = typeof v === 'string' ? v : v?.chat_id ? String(v.chat_id) : ''
    }
    if (chat) await sendTelegramChannelMessage(chat, texto, { parseMode: 'HTML' })
  } catch (e) {
    console.error('[solucoes/analise] aviso ao dono falhou:', e instanceof Error ? e.message : e)
  }
}
