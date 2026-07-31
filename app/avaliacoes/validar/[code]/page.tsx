import Link from "next/link"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getAssessmentBySlug } from "@/lib/avaliacoes/service"
import { formatPtDate } from "@/lib/avaliacoes/config"
import { ShieldCheck, ShieldX, Download } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function ValidarCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const clean = decodeURIComponent(code || "").trim().toUpperCase()
  const supabase = getSupabaseAdmin()
  const { data: attempt } = await supabase
    .from("assessment_attempts")
    .select("name, assessment_slug, grade_value, passed, cert_code, created_at")
    .eq("cert_code", clean)
    .maybeSingle()

  const valid = !!attempt && attempt.passed
  const assessment = valid ? await getAssessmentBySlug(attempt!.assessment_slug) : null

  let gradeLine: string | null = null
  if (valid && assessment?.grade_display === "valores20" && typeof attempt!.grade_value === "number") {
    gradeLine = `${Number(attempt!.grade_value).toFixed(1).replace(".", ",")} valores`
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 py-16 text-white">
      <div className="w-full max-w-md rounded-2xl border border-[#D2A63C]/20 bg-gradient-to-br from-gray-950 to-black p-8 text-center">
        {valid ? (
          <>
            <ShieldCheck className="mx-auto h-14 w-14 text-emerald-400" />
            <h1 className="mt-4 text-xl font-bold text-emerald-300">Certificado válido</h1>
            <div className="mt-6 space-y-3 text-left">
              <Row label="Titular" value={attempt!.name} />
              <Row label="Formação" value={assessment?.title || attempt!.assessment_slug} />
              {gradeLine && <Row label="Classificação" value={gradeLine} />}
              <Row label="Emitido em" value={formatPtDate(new Date(attempt!.created_at))} />
              <Row label="Código" value={clean} mono />
            </div>
            <a
              href={`/api/avaliacoes/certificado/${clean}`}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[#D2A63C]/40 px-4 py-2 text-sm font-semibold text-[#D2A63C] hover:bg-[#D2A63C]/10"
            >
              <Download className="h-4 w-4" /> Ver certificado
            </a>
          </>
        ) : (
          <>
            <ShieldX className="mx-auto h-14 w-14 text-red-400" />
            <h1 className="mt-4 text-xl font-bold text-red-300">Certificado não encontrado</h1>
            <p className="mt-2 text-sm text-gray-400">
              O código <span className="font-mono">{clean}</span> não corresponde a nenhum certificado emitido.
            </p>
          </>
        )}
        <div className="mt-8">
          <Link href="/avaliacoes/validar" className="text-sm text-gray-400 hover:text-white">
            ← Validar outro código
          </Link>
        </div>
      </div>
    </main>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm text-gray-200 ${mono ? "font-mono" : "font-medium"}`}>{value}</span>
    </div>
  )
}
