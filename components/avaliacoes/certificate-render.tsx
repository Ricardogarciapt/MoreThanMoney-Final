"use client"

import { Award } from "lucide-react"
import { firstLastName, type CertTemplate } from "@/lib/avaliacoes/config"

// Render/mockup do certificado (desenhado, leve, com a marca MTM) personalizado com o
// nome do aluno. Usado em /avaliacoes em vez da imagem original do certificado.

const LABEL: Record<CertTemplate, string> = {
  "fast-start": "Certificado de Conclusão",
  bootcamp: "Certificado · Bootcamp de Trading",
  "teste-final": "Certificado Final · Junior Trader",
}

export default function CertificateRender({
  template,
  courseTitle,
  name,
  gradeText,
  date,
  className = "",
}: {
  template: CertTemplate
  courseTitle: string
  name: string
  gradeText?: string | null // ex.: "17,2 valores"
  date?: string | null
  className?: string
}) {
  const display = firstLastName(name) || name

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-gradient-to-br from-[#D2A63C] via-[#8a6a1e] to-[#5a4614] p-[2px] shadow-lg ${className}`}
      style={{ containerType: "inline-size" } as React.CSSProperties}
    >
      <div className="relative overflow-hidden rounded-[10px] bg-gradient-to-br from-gray-950 via-black to-gray-950 px-5 py-6 text-center">
        {/* brilho suave no topo */}
        <div className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-[#D2A63C]/10 blur-2xl" />
        {/* cantos decorativos */}
        <span className="pointer-events-none absolute left-2 top-2 h-4 w-4 border-l-2 border-t-2 border-[#D2A63C]/50" />
        <span className="pointer-events-none absolute right-2 top-2 h-4 w-4 border-r-2 border-t-2 border-[#D2A63C]/50" />
        <span className="pointer-events-none absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-[#D2A63C]/50" />
        <span className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-[#D2A63C]/50" />

        <div className="relative">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#F0D488] to-[#BB8525] text-black shadow-md ring-2 ring-[#D2A63C]/30">
            <Award className="h-6 w-6" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D2A63C]">{LABEL[template]}</p>

          <p className="mt-4 text-[11px] uppercase tracking-wider text-gray-500">Atribuído a</p>
          <p
            className="mt-0.5 whitespace-nowrap leading-tight text-[#ecc76b]"
            style={{ fontFamily: "'GreatVibesMTM', cursive", fontSize: "clamp(15px, 11cqw, 34px)" }}
          >
            {display}
          </p>

          <div className="mx-auto my-3 h-px w-28 bg-gradient-to-r from-transparent via-[#D2A63C]/60 to-transparent" />

          <p className="text-sm font-medium text-gray-200">{courseTitle}</p>
          {gradeText && <p className="mt-1 text-sm font-bold text-[#D2A63C]">Classificação: {gradeText}</p>}

          <p className="mt-4 text-[10.5px] text-gray-500">
            Ricardo Garcia · Educador{date ? ` · ${date}` : ""}
          </p>
        </div>
      </div>
    </div>
  )
}
