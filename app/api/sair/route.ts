import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { assinaturaSaida } from '@/lib/vendas/executor-pipeline'

/**
 * SAIR DA LISTA num clique, sem login (10/11/2026) — o link que vai no rodapé de cada email de
 * seguimento. Assinado (HMAC do email) para ninguém tirar outra pessoa da lista.
 *
 * Grava na LISTA DE EXCLUSÃO GLOBAL (`contacto_exclusao`): quem sai, sai de todos os canais, e
 * `decidirContacto` bloqueia antes de qualquer outra regra. Marca também o consentimento retirado.
 */
export const dynamic = 'force-dynamic'

function pagina(titulo: string, texto: string, status = 200) {
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>` +
    `<body style="margin:0;background:#0b0b0c;color:#eee;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh">` +
    `<div style="max-width:420px;padding:24px;text-align:center"><h1 style="color:#D2A63C;font-size:22px">${titulo}</h1><p style="line-height:1.5">${texto}</p>` +
    `<p><a style="color:#E9C46A" href="https://www.morethanmoney.pt">morethanmoney.pt</a></p></div></body></html>`
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function GET(req: NextRequest) {
  const email = String(req.nextUrl.searchParams.get('e') ?? '').trim().toLowerCase()
  const t = String(req.nextUrl.searchParams.get('t') ?? '')
  const certo = email ? assinaturaSaida(email) : ''
  const ok = !!email && t.length === certo.length && timingSafeEqual(Buffer.from(t), Buffer.from(certo))
  if (!ok) return pagina('Link inválido', 'Este link de saída não é válido. Responde ao email e tiramos-te da lista à mão.', 400)

  const db = getSupabaseAdmin()
  const agora = new Date().toISOString()
  const { data: ja } = await db.from('contacto_exclusao').select('identificador').eq('identificador', email).limit(1)
  if (!ja?.length) {
    const { error } = await db.from('contacto_exclusao').insert({ identificador: email, canal_origem: 'email', pedido_em: agora, nota: 'link de saída do email de seguimento' })
    if (error) {
      console.error('[sair] NÃO gravado', email, error.message)
      return pagina('Não foi possível', 'Tenta outra vez daqui a pouco, ou responde ao email a pedir para sair.', 500)
    }
  }
  await db.from('captacao_consentimento').update({ retirado_em: agora, retirado_por: 'link:sair' }).eq('email', email).is('retirado_em', null)
  return pagina('Saíste da lista', 'Não voltas a receber mensagens de seguimento da MoreThanMoney. O acesso ao que compraste não muda.')
}
