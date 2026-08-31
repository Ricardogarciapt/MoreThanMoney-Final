import { NextRequest, NextResponse } from 'next/server'
import { validarLicenca } from '@/lib/licencas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Endpoint público chamado pelo EA (MQL5 `WebRequest`) a cada arranque e uma vez por dia.
 *
 * É público de propósito: o EA corre na máquina do cliente e não tem onde guardar um segredo que
 * não se possa ler com um editor de texto. A prova aqui não é o segredo — é o par chave + número
 * de conta, que a corretora atribui e o cliente não escolhe.
 *
 * Aceita GET (mais fácil de montar no MQL5) e POST. Responde sempre 200 com `ok:false` em vez de
 * um código de erro HTTP: o `WebRequest` do MetaTrader só devolve o corpo em 200, e sem corpo o
 * cliente ficaria com "erro 403" no ecrã em vez da razão.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

async function responder(chave: string, login: string, extra: Record<string, string | null>) {
  try {
    const r = await validarLicenca({
      chave,
      mt5Login: login,
      corretora: extra.corretora,
      servidor: extra.servidor,
      terminal: extra.terminal,
    })
    return NextResponse.json(r, { headers: CORS })
  } catch (e) {
    console.error('[LICENCAS] Erro a validar:', e)
    return NextResponse.json(
      { ok: false, codigo: 'erro', mensagem: 'Erro a validar a licença. Tenta novamente.' },
      { headers: CORS },
    )
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  return responder(q.get('chave') ?? q.get('key') ?? '', q.get('conta') ?? q.get('login') ?? '', {
    corretora: q.get('corretora') ?? q.get('broker'),
    servidor: q.get('servidor') ?? q.get('server'),
    terminal: q.get('terminal'),
  })
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  return responder(String(b.chave ?? b.key ?? ''), String(b.conta ?? b.login ?? ''), {
    corretora: b.corretora ? String(b.corretora) : null,
    servidor: b.servidor ? String(b.servidor) : null,
    terminal: b.terminal ? String(b.terminal) : null,
  })
}
