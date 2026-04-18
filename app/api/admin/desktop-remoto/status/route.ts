import { NextResponse } from "next/server"
import { verifyAdminAccess } from "@/lib/admin-api-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
  }

  const url = (process.env.NEXT_PUBLIC_REMOTE_DESKTOP_URL || "").trim()
  if (!url) {
    return NextResponse.json({ configured: false, reachable: false })
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
    })
    return NextResponse.json({
      configured: true,
      reachable: res.ok,
      status: res.status,
      statusText: res.statusText,
    })
  } catch (error: any) {
    return NextResponse.json({
      configured: true,
      reachable: false,
      error: error?.message || "Falha ao contactar remote desktop",
    })
  }
}
