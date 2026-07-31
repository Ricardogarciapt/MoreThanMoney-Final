import { NextRequest, NextResponse } from "next/server"
import { regenerateCertificatePdfByCode } from "@/lib/avaliacoes/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/avaliacoes/certificado/[code] — descarrega o certificado em PDF.
// Código não adivinhável (público, para partilha/validação).
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const clean = String(code || "").trim().toUpperCase()
  if (!/^MTM-[A-Z]{2}-[A-Z0-9]{6,10}$/.test(clean)) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 })
  }
  const out = await regenerateCertificatePdfByCode(clean)
  if (!out) return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 })

  const disposition = req.nextUrl.searchParams.get("dl") === "1" ? "attachment" : "inline"
  return new NextResponse(out.pdf as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${out.filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  })
}
