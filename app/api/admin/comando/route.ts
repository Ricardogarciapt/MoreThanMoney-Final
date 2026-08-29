import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { estadoComando } from "@/lib/comando/estado"

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
