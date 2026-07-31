"use client"

import { firstLastName, type CertTemplate } from "@/lib/avaliacoes/config"

// Pré-visualização visual do certificado (fundo real do Canva + nome/nota sobrepostos),
// nas mesmas posições do gerador PDF (canvas 1123×794). Responsiva via container queries.

type FieldPct = { left: number; bottom: number; font: number; color: string; prefix?: string; suffix?: string }
type Cfg = { bg: string; name: FieldPct; grade?: FieldPct }

// px→% : left = cx/1123 ; bottom = 100 - baselineY/794 ; font = size/1123 (cqw)
const CFG: Record<CertTemplate, Cfg> = {
  "fast-start": {
    bg: "/certificados/fast-start-bg.png",
    name: { left: 52.54, bottom: 49.37, font: 8.19, color: "#d8a441" },
  },
  bootcamp: {
    bg: "/certificados/bootcamp-bg.png",
    name: { left: 49.87, bottom: 52.39, font: 6.23, color: "#d8a441" },
    grade: { left: 63.76, bottom: 30.98, font: 1.69, color: "#d8a441" },
  },
  "teste-final": {
    bg: "/certificados/teste-final-bg.png",
    name: { left: 51.2, bottom: 51.13, font: 3.83, color: "#a86a22" },
    grade: { left: 51.2, bottom: 20.91, font: 1.51, color: "#1c1206", prefix: "Classificação final: ", suffix: " valores" },
  },
}

export default function CertificatePreview({
  template,
  name,
  gradeText,
  className = "",
}: {
  template: CertTemplate
  name: string
  gradeText?: string | null // ex.: "17,2" — a moldura (prefixo/sufixo) vem do template
  className?: string
}) {
  const cfg = CFG[template]
  if (!cfg) return null
  const display = firstLastName(name) || name

  return (
    <div
      className={`relative w-full overflow-hidden rounded-lg ring-1 ring-[#D2A63C]/25 shadow-lg ${className}`}
      style={{ aspectRatio: "1123 / 794", containerType: "inline-size" } as React.CSSProperties}
    >
      {/* fundo */}
      <img src={cfg.bg} alt="Certificado" className="absolute inset-0 h-full w-full object-cover" draggable={false} />

      {/* nome (script dourado) */}
      <div
        className="absolute -translate-x-1/2 whitespace-nowrap"
        style={{
          left: `${cfg.name.left}%`,
          bottom: `${cfg.name.bottom}%`,
          fontFamily: "'GreatVibesMTM', cursive",
          fontSize: `${cfg.name.font}cqw`,
          lineHeight: 1,
          color: cfg.name.color,
        }}
      >
        {display}
      </div>

      {/* nota */}
      {cfg.grade && gradeText && (
        <div
          className="absolute -translate-x-1/2 whitespace-nowrap font-semibold"
          style={{
            left: `${cfg.grade.left}%`,
            bottom: `${cfg.grade.bottom}%`,
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: `${cfg.grade.font}cqw`,
            lineHeight: 1,
            color: cfg.grade.color,
          }}
        >
          {`${cfg.grade.prefix || ""}${gradeText}${cfg.grade.suffix || ""}`}
        </div>
      )}
    </div>
  )
}
