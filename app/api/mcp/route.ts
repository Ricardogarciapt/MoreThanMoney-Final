import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { FERRAMENTAS, ferramentaPorNome } from "@/lib/mcp/ferramentas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * O sistema MTM como servidor MCP.
 *
 * Deixa qualquer cliente MCP — o Claude, o AIOS, o que vier — perguntar pelo estado do negócio e
 * agir sobre ele com ferramentas nomeadas, em vez de adivinhar rotas HTTP. É o "tudo num só
 * sítio" do lado das máquinas; o painel é o mesmo do lado das pessoas, e ambos chamam a mesma
 * camada (`lib/mcp/ferramentas`) para não haver duas descrições do negócio a divergir.
 *
 * ── Autenticação ─────────────────────────────────────────────────────────────────────────────
 * Bearer com `MCP_TOKEN`. Sem a variável definida, o endpoint responde 503 e não expõe nada —
 * um servidor que fala do negócio todo e arranca sem chave é pior do que não existir.
 *
 * A comparação é em tempo constante. Comparar segredos com `===` deixa medir o tempo até à
 * primeira letra diferente, e isso chega para os adivinhar byte a byte.
 */

const VERSAO_PROTOCOLO = "2024-11-05"

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.MCP_TOKEN?.trim()
  if (!esperado) return false
  const dado = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
  if (!dado) return false
  const a = Buffer.from(dado)
  const b = Buffer.from(esperado)
  // Tamanhos diferentes falham já; timingSafeEqual exige buffers do mesmo tamanho.
  return a.length === b.length && timingSafeEqual(a, b)
}

interface Pedido {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
}

const resposta = (id: Pedido["id"], result: unknown) =>
  NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result })

const erro = (id: Pedido["id"], code: number, message: string) =>
  NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } })

export async function POST(req: NextRequest) {
  if (!process.env.MCP_TOKEN?.trim()) {
    return NextResponse.json({ error: "MCP_TOKEN não está definido — endpoint fechado" }, { status: 503 })
  }
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const p = (await req.json().catch(() => ({}))) as Pedido

  switch (p.method) {
    case "initialize":
      return resposta(p.id, {
        protocolVersion: VERSAO_PROTOCOLO,
        capabilities: { tools: {} },
        serverInfo: { name: "morethanmoney", version: "1.0.0" },
      })

    // Notificação: o cliente avisa que acabou o arranque e não espera resposta.
    case "notifications/initialized":
      return new NextResponse(null, { status: 204 })

    case "ping":
      return resposta(p.id, {})

    case "tools/list":
      return resposta(p.id, {
        tools: FERRAMENTAS.map((f) => ({
          name: f.nome,
          description: f.descricao,
          inputSchema: f.esquema,
        })),
      })

    case "tools/call": {
      const nome = String((p.params as { name?: string })?.name ?? "")
      const args = ((p.params as { arguments?: Record<string, unknown> })?.arguments ?? {})
      const f = ferramentaPorNome(nome)
      if (!f) return erro(p.id, -32602, `Ferramenta desconhecida: ${nome}`)

      try {
        const saida = await f.correr(args)
        return resposta(p.id, {
          content: [{ type: "text", text: JSON.stringify(saida, null, 2) }],
        })
      } catch (e) {
        // O erro vai como RESULTADO com isError, não como erro de protocolo: assim o modelo
        // lê o que correu mal e pode corrigir, em vez de a chamada rebentar sem explicação.
        return resposta(p.id, {
          content: [{ type: "text", text: e instanceof Error ? e.message : "erro" }],
          isError: true,
        })
      }
    }

    default:
      return erro(p.id, -32601, `Método não suportado: ${p.method ?? "(nenhum)"}`)
  }
}

/** GET serve para ver se está de pé sem precisar de falar JSON-RPC. */
export async function GET(req: NextRequest) {
  if (!process.env.MCP_TOKEN?.trim()) {
    return NextResponse.json({ ok: false, erro: "MCP_TOKEN não está definido" }, { status: 503 })
  }
  if (!autorizado(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({
    ok: true,
    protocolo: VERSAO_PROTOCOLO,
    ferramentas: FERRAMENTAS.map((f) => f.nome),
  })
}
