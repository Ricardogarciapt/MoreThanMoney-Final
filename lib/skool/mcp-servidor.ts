import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { FERRAMENTAS_SKOOL, ferramentaSkool } from '@/lib/skool/ferramentas'

/**
 * Servidor MCP do Skool (JSON-RPC sobre HTTP, "streamable HTTP" sem stream — cada pedido tem uma
 * resposta JSON). Mesmo desenho que `/api/mcp`, com chave própria: `SKOOL_MCP_TOKEN`.
 *
 * A chave chega de duas maneiras, porque nem todos os clientes deixam pôr cabeçalhos:
 *  · `Authorization: Bearer <chave>` em /api/mcp/skool (Claude Code, AIOS, scripts);
 *  · no próprio URL, /api/mcp/skool/<chave> (conectores personalizados do claude.ai, que só pedem
 *    um URL). O URL passa a ser o segredo: não se partilha.
 * Sem `SKOOL_MCP_TOKEN` definido, o endpoint fica fechado (503).
 */

const VERSOES = ['2025-06-18', '2025-03-26', '2024-11-05']

function igual(dado: string, esperado: string): boolean {
  const a = Buffer.from(dado)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

function verificar(req: NextRequest, chaveNoUrl?: string): NextResponse | null {
  const esperado = process.env.SKOOL_MCP_TOKEN?.trim()
  if (!esperado) return NextResponse.json({ error: 'SKOOL_MCP_TOKEN não está definido — endpoint fechado' }, { status: 503 })
  const dado = (chaveNoUrl ?? (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')).trim()
  if (!dado || !igual(dado, esperado)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}

interface Pedido {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
}

const ok = (id: Pedido['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result })
const falha = (id: Pedido['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

async function tratar(p: Pedido): Promise<object | null> {
  switch (p.method) {
    case 'initialize': {
      const pedida = String((p.params as { protocolVersion?: string })?.protocolVersion ?? '')
      return ok(p.id, {
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'skool-mtm', version: '1.0.0' },
        instructions:
          'Controla a comunidade Skool da MoreThanMoney. Começa por skool_estado. Acções visíveis para outros (posts, comentários, DMs, membros) só com confirmar=true depois de o Ricardo aprovar o texto. PT-PT, tu.',
      })
    }
    case 'ping':
      return ok(p.id, {})
    case 'tools/list':
      return ok(p.id, { tools: FERRAMENTAS_SKOOL.map((f) => ({ name: f.nome, description: f.descricao, inputSchema: f.esquema })) })
    case 'tools/call': {
      const nome = String((p.params as { name?: string })?.name ?? '')
      const args = ((p.params as { arguments?: Record<string, unknown> })?.arguments ?? {}) as Record<string, unknown>
      const f = ferramentaSkool(nome)
      if (!f) return falha(p.id, -32602, `Ferramenta desconhecida: ${nome}`)
      try {
        const saida = await f.correr(args)
        return ok(p.id, { content: [{ type: 'text', text: JSON.stringify(saida, null, 2) }] })
      } catch (e) {
        return ok(p.id, { content: [{ type: 'text', text: e instanceof Error ? e.message : 'erro' }], isError: true })
      }
    }
    default:
      // Notificações (sem id) não têm resposta.
      if (p.method?.startsWith('notifications/') || p.id === undefined) return null
      return falha(p.id, -32601, `Método não suportado: ${p.method ?? '(nenhum)'}`)
  }
}

export async function postMcpSkool(req: NextRequest, chaveNoUrl?: string) {
  const recusa = verificar(req, chaveNoUrl)
  if (recusa) return recusa
  const corpo = await req.json().catch(() => null)
  if (corpo === null) return NextResponse.json(falha(null, -32700, 'JSON inválido'), { status: 400 })
  if (Array.isArray(corpo)) {
    const respostas = (await Promise.all(corpo.map((p) => tratar(p as Pedido)))).filter(Boolean)
    return respostas.length ? NextResponse.json(respostas) : new NextResponse(null, { status: 202 })
  }
  const r = await tratar(corpo as Pedido)
  return r ? NextResponse.json(r) : new NextResponse(null, { status: 202 })
}

/** GET: sem stream SSE (405 para clientes MCP); com JSON, diz se está de pé. */
export async function getMcpSkool(req: NextRequest, chaveNoUrl?: string) {
  const recusa = verificar(req, chaveNoUrl)
  if (recusa) return recusa
  if ((req.headers.get('accept') ?? '').includes('text/event-stream')) {
    return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
  }
  return NextResponse.json({ ok: true, servidor: 'skool-mtm', ferramentas: FERRAMENTAS_SKOOL.map((f) => f.nome) })
}

export function deleteMcpSkool() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}
