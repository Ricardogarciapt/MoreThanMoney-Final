import { NextRequest, NextResponse } from 'next/server'
import { excedeLimite, hashIp, validarPedido } from '@/lib/pedido-contacto'
import { avisarDono, contarRecentes, registarPedidoDeContacto } from '@/lib/pedido-contacto-registo'
import { assinarEbook, linkEbook, type SlugEbook } from '@/lib/ebooks/acesso'
import { avaliarCupao, MENSAGEM_RECUSA } from '@/lib/cupoes-codigo'
import { CUPAO_FREEBIE, DIAS_GOLDKILLER_GRATIS, freebieDe } from '@/lib/freebies'
import { sendFreebieEmail } from '@/lib/email-service'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Produto do marketplace a que o cupão FREEBIE tem de estar ligado (GoldKiller semestral). */
const PRODUTO_GOLDKILLER = '45d31152-37db-4a85-a632-f2ee97f4b9e8'
const GUIA: SlugEbook = 'guia-dos-scanners'

/**
 * POST /api/gratis/goldkiller — 30 dias do Scanner GoldKiller + «Guia dos Scanners MTM» em troca
 * do contacto. Tudo pelos circuitos que já existem, nada paralelo:
 *  - cupão FREEBIE validado na mesma porta de todos os cupões (`avaliarCupao`) e o uso registado
 *    em `coupon_usages`;
 *  - lead em `pedidos_contacto` + `captacao_consentimento` + tarefa do setter (`registarPedidoDeContacto`);
 *  - negócio no pipeline (`vendas_negocios`, etiqueta freebie-goldkiller: o executor do pipeline
 *    faz o seguimento até ao plano Membro);
 *  - duas tarefas no backoffice (`aios_tasks`): ativar o convite no TradingView já, e retirar o
 *    acesso + oferecer o Membro ao dia 30;
 *  - aviso ao dono no Telegram e email com o guia (PT/EN/ES) e os passos de ativação.
 */
export async function POST(req: NextRequest) {
  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { return NextResponse.json({ ok: false, erro: 'pedido inválido' }, { status: 400 }) }

  const aceita = corpo.aceito === true
  const v = validarPedido({
    nome: corpo.nome, indicativo: corpo.indicativo, telefone: corpo.telefone, email: corpo.email,
    interesse: 'formacao', melhorHora: 'qualquer',
    consentimentos: { whatsapp: aceita, email: aceita },
    origem: origemDoPedido(corpo.origem), site: corpo.site,
  }, req.headers.get('referer'))
  if (!v.ok && v.descartar) return NextResponse.json({ ok: true, link: null })

  const erros: Record<string, string> = !v.ok ? { ...v.erros } : {}
  if (!String(corpo.email ?? '').trim()) erros.email = 'Escreve o teu email.'
  const tv = String(corpo.tvUsername ?? '').trim().replace(/^@/, '')
  if (!/^[\w.-]{2,40}$/.test(tv)) erros.tvUsername = 'Escreve o teu nome de utilizador do TradingView (sem espaços).'
  if (!aceita) { delete erros.consentimentos; erros.aceito = 'Precisas de aceitar para receberes o acesso.' }

  const db = getSupabaseAdmin()
  const cupao = await avaliarCupao(db, corpo.cupao ?? CUPAO_FREEBIE)
  if (!cupao.ok) erros.cupao = MENSAGEM_RECUSA[cupao.motivo]
  else if (cupao.cupao.marketplace_produto_id !== PRODUTO_GOLDKILLER) erros.cupao = MENSAGEM_RECUSA.plano_errado
  if (Object.keys(erros).length || !v.ok || !cupao.ok) return NextResponse.json({ ok: false, erros }, { status: 400 })

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || ''
  const ipHash = ip ? hashIp(ip, process.env.PEDIDO_CONTACTO_SAL || process.env.CRON_SECRET || '') : null
  const freebie = freebieDe(GUIA)!
  try {
    const recentes = await contarRecentes({ ipHash, telefone: v.pedido.telefone })
    if (!excedeLimite(recentes)) {
      const reg = await registarPedidoDeContacto({ pedido: v.pedido, linhas: v.linhas, fonte: 'site', ipHash })
      if (reg.pedidoId && !reg.duplicado) {
        const id = reg.pedidoId
        await db.from('pedidos_contacto').update({ respostas: { ebook: GUIA, freebie: 'goldkiller', tradingview: tv, cupao: cupao.cupao.code } }).eq('id', id)
        const passos = await Promise.allSettled([
          db.from('vendas_negocios').insert({
            nome: v.pedido.nome, email: v.pedido.email, telefone: v.pedido.telefone,
            origem: v.pedido.origem ?? 'freebie:goldkiller', chave_origem: `freebie:goldkiller:${id}`,
            funil: 'educacao', estado: 'lead', interesse: 'formacao', contactavel: true,
            etiquetas: ['freebie-goldkiller', 'iman-de-leads', 'scanner-goldkiller', `ebook-${GUIA}`],
            nota: `GoldKiller ${DIAS_GOLDKILLER_GRATIS} dias grátis (cupão ${cupao.cupao.code}) · TradingView @${tv}. Próximo passo: Premium 3 dias grátis → plano Membro.`,
          }),
          db.from('coupon_usages').insert({ coupon_id: cupao.cupao.id, user_id: null, context: `freebie:goldkiller:${id}` }),
          db.from('aios_tasks').insert({
            title: `Ativar GoldKiller ${DIAS_GOLDKILLER_GRATIS} dias · TradingView @${tv}`,
            details: `Freebie GoldKiller (cupão ${cupao.cupao.code}) de ${v.pedido.nome} <${v.pedido.email}>. TradingView › script MTM Gold Killer › Gerir acesso › adicionar @${tv} com fim a ${diaMais(DIAS_GOLDKILLER_GRATIS)}. Prometido em até 24 h.`,
            kind: 'task', status: 'open', priority: 'alta', due_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
            chave: `freebie_goldkiller:${id}`, created_by: 'freebie-goldkiller',
            payload: { pedidoId: id, tvUsername: tv, email: v.pedido.email, produto: PRODUTO_GOLDKILLER, dias: DIAS_GOLDKILLER_GRATIS },
          }),
          db.from('aios_tasks').insert({
            title: `Fim do GoldKiller grátis · @${tv} · retirar acesso e oferecer Membro`,
            details: `Os ${DIAS_GOLDKILLER_GRATIS} dias de ${v.pedido.nome} acabam hoje. Retirar @${tv} do script (se o TradingView não o fizer sozinho) e convidar para o plano Membro (/upgrade?plan=app_member_monthly) ou a compra do GoldKiller.`,
            kind: 'task', status: 'open', priority: 'normal', due_at: new Date(Date.now() + DIAS_GOLDKILLER_GRATIS * 86_400_000).toISOString(),
            chave: `freebie_goldkiller_fim:${id}`, created_by: 'freebie-goldkiller',
            payload: { pedidoId: id, tvUsername: tv, email: v.pedido.email },
          }),
          avisarDono(`🎁 GoldKiller grátis pedido\n${v.pedido.nome} · @${tv} no TradingView\nAtivar ${DIAS_GOLDKILLER_GRATIS} dias em até 24 h (tarefa no backoffice).`),
        ])
        for (const p of passos) {
          const erro = p.status === 'rejected' ? p.reason : (p.value as { error?: { message?: string } } | undefined)?.error
          if (erro) console.warn('[freebie-goldkiller] passo falhou:', erro instanceof Error ? erro.message : (erro as { message?: string }).message ?? erro)
        }
      }
    }
    const quem = v.pedido.email || v.pedido.telefone || ''
    const assinado = (s: SlugEbook) => linkEbook(s, assinarEbook(s, 365, quem))
    const link = assinado(GUIA)
    if (v.pedido.email) {
      await sendFreebieEmail({
        to: v.pedido.email, nome: v.pedido.nome, titulo: freebie.titulo,
        links: { pt: link, en: assinado('guia-dos-scanners-en'), es: assinado('guia-dos-scanners-es') },
        goldkiller: { tvUsername: tv, dias: DIAS_GOLDKILLER_GRATIS },
      }).catch((e) => console.warn('[freebie-goldkiller] email não saiu:', e instanceof Error ? e.message : e))
    }
    return NextResponse.json({ ok: true, link })
  } catch (e) {
    console.error('[freebie-goldkiller] erro:', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, erro: 'Não foi possível guardar. Tenta outra vez.' }, { status: 500 })
  }
}

const diaMais = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10)

/** `freebie:goldkiller` com o anúncio que trouxe a pessoa (`?s=&c=&a=`), como as landings /f/*. */
function origemDoPedido(origem: unknown): string {
  const o = String(origem ?? '')
  const q = o.includes('?') ? o.slice(o.indexOf('?')) : ''
  return `freebie:goldkiller${/^\?[\w=&.-]{0,100}$/.test(q) ? q : ''}`.slice(0, 120)
}
