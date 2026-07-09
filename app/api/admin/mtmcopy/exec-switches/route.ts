import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { getExecSwitches, setExecSwitches, type ExecSwitches } from "@/lib/mtmcopy/exec-switches"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET — estado atual dos interruptores por-execução. */
export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  const switches = await getExecSwitches()
  return NextResponse.json({ success: true, switches })
}

/** POST — liga/desliga uma execução: { sensei?, forex?, premium? } (booleanos). */
export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  let body: Partial<ExecSwitches>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 })
  }
  const patch: Partial<ExecSwitches> = {}
  if (typeof body.sensei === "boolean") patch.sensei = body.sensei
  if (typeof body.forex === "boolean") patch.forex = body.forex
  if (typeof body.premium === "boolean") patch.premium = body.premium
  const switches = await setExecSwitches(patch)
  return NextResponse.json({ success: true, switches })
}
