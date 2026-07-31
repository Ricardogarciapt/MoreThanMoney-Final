import Link from "next/link"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { getAssessmentBySlug } from "@/lib/avaliacoes/service"
import { formatPtDate, firstLastName } from "@/lib/avaliacoes/config"
import {
  ShieldCheck,
  ShieldX,
  Download,
  Rocket,
  GraduationCap,
  Award,
  ArrowRight,
  CheckCircle2,
} from "lucide-react"

export const dynamic = "force-dynamic"

const JOURNEY = [
  { icon: Rocket, title: "Fast Start", desc: "As bases do Forex e da gestão de risco — do zero à tua primeira operação com método." },
  { icon: GraduationCap, title: "Bootcamp (30h)", desc: "Análise técnica, scanners MTM, volume e psicologia para operares uma conta a título pessoal." },
  { icon: Award, title: "Junior Trader", desc: "Avaliação final e avaliativa de conceito — o teu passo para negociar a nível profissional." },
]

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
  const displayName = valid ? firstLastName(attempt!.name) || attempt!.name : ""

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Faixa de estado */}
      <section className="relative overflow-hidden border-b border-[#D2A63C]/15">
        <div className={`absolute inset-0 ${valid ? "bg-gradient-to-b from-emerald-500/10" : "bg-gradient-to-b from-red-500/10"} to-transparent`} />
        <div className="relative mx-auto max-w-6xl px-4 py-10 text-center">
          {valid ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> Certificado autêntico e verificado
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-sm font-medium text-red-300">
              <ShieldX className="h-4 w-4" /> Certificado não encontrado
            </span>
          )}
        </div>
      </section>

      {valid ? (
        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[1fr_1.1fr] md:items-start">
          {/* Detalhes */}
          <div>
            <p className="text-sm uppercase tracking-wider text-[#D2A63C]">Certificado emitido a</p>
            <h1 className="mt-1 text-3xl font-bold md:text-4xl">{displayName}</h1>
            <p className="mt-2 text-lg text-gray-300">{assessment?.title}</p>
            {assessment?.subtitle && <p className="text-sm text-[#D2A63C]/80">{assessment.subtitle}</p>}

            <div className="mt-6 space-y-2.5 rounded-xl border border-[#D2A63C]/20 bg-gray-950/50 p-5">
              {gradeLine && (
                <Row label="Classificação final" value={gradeLine} strong />
              )}
              <Row label="Emitido em" value={formatPtDate(new Date(attempt!.created_at))} />
              <Row label="Código de validação" value={clean} mono />
              <div className="flex items-center gap-2 pt-1 text-sm text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Registo confirmado na base de dados MoreThanMoney
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={`/api/avaliacoes/certificado/${clean}?dl=1`}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#D2A63C] to-[#BB8525] px-5 py-2.5 text-sm font-semibold text-black"
              >
                <Download className="h-4 w-4" /> Descarregar certificado
              </a>
              <Link href="/avaliacoes" className="inline-flex items-center gap-2 rounded-lg border border-[#D2A63C]/40 px-5 py-2.5 text-sm font-semibold text-[#D2A63C] hover:bg-[#D2A63C]/10">
                As minhas avaliações <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Preview do PDF */}
          <div className="overflow-hidden rounded-xl border border-[#D2A63C]/20 bg-gray-900 shadow-2xl">
            <object data={`/api/avaliacoes/certificado/${clean}`} type="application/pdf" className="h-[380px] w-full md:h-[440px]">
              <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">
                Pré-visualização indisponível neste dispositivo.{" "}
                <a href={`/api/avaliacoes/certificado/${clean}`} className="text-[#D2A63C] underline">Abrir certificado</a>
              </div>
            </object>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-md px-4 py-14 text-center">
          <p className="text-gray-400">
            O código <span className="font-mono">{clean}</span> não corresponde a nenhum certificado emitido pela
            MoreThanMoney.
          </p>
          <Link href="/avaliacoes/validar" className="mt-4 inline-block text-[#D2A63C] hover:underline">
            Validar outro código
          </Link>
        </section>
      )}

      {/* Landing — a formação MTM */}
      <section className="border-t border-[#D2A63C]/15 bg-gradient-to-b from-[#D2A63C]/5 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold md:text-3xl">A formação MoreThanMoney</h2>
            <p className="mt-3 text-gray-300">
              Não é só teoria — é um percurso prático e avaliado, do primeiro trade à negociação a nível profissional.
              Cada etapa termina com uma avaliação e um certificado oficial que comprova as tuas competências.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {JOURNEY.map((s, i) => {
              const Icon = s.icon
              return (
                <div key={i} className="rounded-2xl border border-[#D2A63C]/20 bg-gray-950/60 p-6">
                  <div className="mb-3 inline-flex rounded-xl bg-[#D2A63C]/15 p-3 ring-1 ring-[#D2A63C]/25">
                    <Icon className="h-6 w-6 text-[#D2A63C]" />
                  </div>
                  <div className="text-xs font-semibold text-gray-500">Etapa {i + 1}</div>
                  <h3 className="text-lg font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-400">{s.desc}</p>
                </div>
              )
            })}
          </div>

          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <p className="text-gray-300">Pronto para começar — ou dar o próximo passo?</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/avaliacoes" className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#D2A63C] to-[#BB8525] px-6 py-3 font-semibold text-black">
                Ver avaliações <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/mtm" className="inline-flex items-center gap-2 rounded-lg border border-[#D2A63C]/40 px-6 py-3 font-semibold text-[#D2A63C] hover:bg-[#D2A63C]/10">
                Conhecer a MoreThanMoney
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm ${mono ? "font-mono" : ""} ${strong ? "font-bold text-[#D2A63C]" : "font-medium text-gray-200"}`}>{value}</span>
    </div>
  )
}
