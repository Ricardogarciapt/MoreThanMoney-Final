import { NextRequest, NextResponse } from "next/server"
import { verifyAdminAccess } from "@/lib/admin-api-helpers"
import { checkRateLimit } from "@/lib/admin-api-helpers"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { executeRemoteCommand, isCommandAllowed } from "@/lib/remote-terminal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const supabase = getSupabaseAdmin()

function trunc(v: string, n = 4000): string {
  const txt = String(v || "")
  return txt.length > n ? `${txt.slice(0, n)}\n...[truncated]` : txt
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdminAccess()
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
    }

    const rate = checkRateLimit(`remote-terminal:${auth.userId || "unknown"}`, 20, 60000)
    if (!rate.allowed) {
      return NextResponse.json({ error: "Demasiados comandos. Tenta novamente." }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const command = String(body?.command || "")
    const allowed = isCommandAllowed(command)
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.reason || "Comando inválido." }, { status: 400 })
    }

    const result = await executeRemoteCommand(command)
    const sourceIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null

    if (auth.userId) {
      try {
        await supabase.from("admin_terminal_logs").insert({
          admin_user_id: auth.userId,
          admin_email: auth.email || null,
          command: trunc(command, 500),
          exit_code: result.code,
          success: result.code === 0,
          stdout: trunc(result.stdout || ""),
          stderr: trunc(result.stderr || ""),
          source_ip: sourceIp,
        })
      } catch (e) {
        console.error("[terminalremoto] falha ao gravar log:", e)
      }
    }

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erro interno." }, { status: 500 })
  }
}
