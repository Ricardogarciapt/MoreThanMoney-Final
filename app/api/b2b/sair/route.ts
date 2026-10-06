import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerSaida, segredoSaida } from '@/lib/b2b/sequencias'
import { excluir } from '@/lib/b2b/envio'

/**
 * SAIR da prospeção B2B — o link de cada email. Um clique (GET) ou o «List-Unsubscribe-Post» do
 * cliente de email (POST, RFC 8058). Grava na EXCLUSÃO GLOBAL: a MTM não volta a escrever a este
 * endereço, em canal nenhum. O link é assinado para ninguém tirar da lista o email de outra pessoa.
 */
export const dynamic = 'force-dynamic'

function pagina(titulo: string, texto: string, status = 200) {
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><meta name="robots" content="noindex"></head>
<body style="margin:0;background:#0d0d0d;color:#eee;font-family:Arial,Helvetica,sans-serif"><main style="max-width:520px;margin:12vh auto;padding:0 16px">
<h1 style="color:#D2A63C;font-size:22px">${titulo}</h1><p style="line-height:1.6">${texto}</p>
<p style="color:#888;font-size:13px">More Than Money · www.morethanmoney.pt</p></main></body></html>`
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

async function tratar(req: NextRequest) {
  const u = req.nextUrl
  const email = lerSaida(u.searchParams.get('e'), u.searchParams.get('t'), segredoSaida())
  if (!email) {
    return pagina('Link inválido', 'Não conseguimos confirmar este link. Respondam ao email com a palavra SAIR e retiramos o endereço à mão.', 400)
  }
  const r = await excluir(getSupabaseAdmin(), email, 'email_b2b', 'link de saída B2B')
  if (!r.ok) return pagina('Não ficou gravado', 'Houve um erro do nosso lado. Respondam ao email com SAIR e tratamos disso.', 500)
  return pagina('Feito', `O endereço ${email.replace(/</g, '')} saiu da nossa lista. A MTM não volta a escrever-vos.`)
}

export async function GET(req: NextRequest) {
  return tratar(req)
}
export async function POST(req: NextRequest) {
  return tratar(req)
}
