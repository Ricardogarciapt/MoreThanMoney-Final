import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { estadoComando } from "@/lib/comando/estado"
import { acaoPorId } from "@/lib/comando/acoes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/** O estado do negócio inteiro, numa leitura. Ver `lib/comando/estado` para o porquê. */
export async function GET(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda
  try {
    return NextResponse.json({ ok: true, estado: await estadoComando() })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 500 })
  }
}

/**
 * Resolver com um clique.
 *
 * A lista de acções é fechada e vive em `lib/comando/acoes`: só entra o que é reversível com o
 * mesmo gesto e não fala com um cliente nem mexe em dinheiro. Um id que não esteja na lista é
 * recusado — não há caminho para chamar seja o que for por nome.
 */
export async function POST(req: NextRequest) {
  const guarda = await requireAdmin(req)
  if (guarda) return guarda

  const { acao, args } = (await req.json().catch(() => ({}))) as {
    acao?: string
    args?: Record<string, unknown>
  }
  const a = acao ? acaoPorId(acao) : undefined
  if (!a) return NextResponse.json({ ok: false, erro: "Acção desconhecida" }, { status: 400 })

  try {
    const r = await a.correr(args ?? {})
    return NextResponse.json({ ...r, estado: await estadoComando() })
  } catch (e) {
    return NextResponse.json({ ok: false, nota: e instanceof Error ? e.message : "erro" }, { status: 500 })
  }
}
